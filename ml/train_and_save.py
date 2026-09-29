"""
QRISK ML Pipeline — Train once, save to disk (Hybrid Pipeline)
================================================================
Run this ONCE (and again any time you retrain) to produce the files the
API (api.py) loads to answer prediction requests instantly.

Pipeline architecture (the fix from FIX_PROMPT_HYBRID):
  PCA features → Quantum Feature Map → quantum-transformed features
                                              ↓
                                   XGBoost Classifier  ← "Hybrid Model"
                                              ↓
                                   ONE final risk score

Baseline:
  PCA features → RBF SVM (no quantum step)   ← "Classical Baseline"

The baseline deliberately stays as RBF-SVM (not XGBoost) so the only
variable that differs between baseline and hybrid is the quantum feature
transformation step, not also a different classifier algorithm.

Run:
    python train_and_save.py

Produces (in ./artifacts/):
    scaler.pkl            — fitted StandardScaler
    pca.pkl               — fitted PCA (4 components)
    hybrid_model.joblib   — trained XGBoost on quantum-transformed features
    classical_baseline.joblib — trained RBF SVM on raw PCA features
    background.npy        — 25-sample SHAP background (quantum-transformed)
    meta.json             — feature order, n_qubits, n_layers, angle-scaling
    metrics.json          — honest benchmarking results for both models
"""

import json
import pickle
from pathlib import Path

import numpy as np
import joblib

import argparse
from pipeline import load_dataset, run_pca
from quantum_risk_model import QuantumFeatureMap
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from sklearn.svm import SVC
from xgboost import XGBClassifier

N_LAYERS = 3

N_LAYERS = 3
N_COMPONENTS = 4
N_QUBITS = 4
QFM_SEED = 42


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--disease", type=str, default="breast_cancer")
    args = parser.parse_args()
    disease = args.disease

    # Dynamically set artifact dir
    artifact_dir = Path(__file__).parent / "artifacts" / disease
    artifact_dir.mkdir(parents=True, exist_ok=True)

    # --- Load dataset ---
    X_df, y = load_dataset(disease)
    
    # Train-test split (do this before imputation to prevent data leakage)
    # We will compute the median on the train set only
    X_train, X_test, y_train, y_test = train_test_split(
        X_df, y, test_size=0.25, random_state=42, stratify=y
    )

    train_medians = {}
    if disease == "diabetes":
        # Impute missing values with train set medians
        for col in X_train.columns:
            if X_train[col].isnull().any():
                median_val = X_train[col].median()
                train_medians[col] = median_val
                X_train[col] = X_train[col].fillna(median_val)
                X_test[col] = X_test[col].fillna(median_val)
        
        # Save train_medians for inference
        with open(artifact_dir / "train_medians.json", "w") as f:
            json.dump(train_medians, f, indent=2)

    # Recombine to fit PCA (fit on whole dataset? Wait, original code fits PCA on the whole dataset `run_pca(X_df)`. 
    # But now X_train and X_test are imputed. I should fit PCA on the imputed data.
    # Actually, original code did:
    # X_df, y = load_dataset()
    # pca_result = run_pca(X_df, n_components=N_COMPONENTS)
    # X = np.pi * (X_raw_components / angle_scale)
    # X_train, X_test, y_train, y_test = train_test_split(...)
    
    # To keep original breast_cancer behavior exactly identical, I should do imputation, then run_pca, then split again? No, splitting again might give different results if the indices change. I'll just recombine them in the original order, or better, keep the train/test splits that were created and run PCA on the full recombined imputed dataset.
    # Actually, the original train_test_split used `stratify=y` with `random_state=42`. 
    # If I just fill X_df with the computed medians:
    if disease == "diabetes":
        for col, median_val in train_medians.items():
            X_df[col] = X_df[col].fillna(median_val)

    pca_result = run_pca(X_df, n_components=N_COMPONENTS)

    X_raw_components = pca_result["components"]
    angle_scale = float(np.abs(X_raw_components).max() + 1e-9)
    X = np.pi * (X_raw_components / angle_scale)
    n_qubits = X.shape[1]  # Should be 4

    print(f"Dataset: {len(y)} samples ({y.sum()} malignant, {len(y) - y.sum()} benign)")
    print(f"Features: {pca_result['feature_names']}")
    print(f"PCA: {len(pca_result['feature_names'])} features -> {n_qubits} components "
          f"({pca_result['explained_variance_ratio'].sum()*100:.1f}% variance)")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    # --- Quantum Feature Map (fixed weights, no training) ---
    print(f"\nQuantum Feature Map: {n_qubits} qubits, {N_LAYERS} layers, seed={QFM_SEED}")
    qfm = QuantumFeatureMap(n_qubits=n_qubits, n_layers=N_LAYERS, seed=QFM_SEED)

    print("Transforming training data through quantum circuit...")
    X_train_q = qfm.transform(X_train)
    print("Transforming test data through quantum circuit...")
    X_test_q = qfm.transform(X_test)

    # --- Train Hybrid Model (XGBoost on quantum-transformed features) ---
    print("\nTraining Hybrid Model (XGBoost on quantum-transformed features)...")
    hybrid_model = XGBClassifier(
        n_estimators=150,
        max_depth=3,
        learning_rate=0.1,
        eval_metric="logloss",
        random_state=42,
    )
    hybrid_model.fit(X_train_q, y_train)

    # Evaluate hybrid model on test set
    h_test_proba = hybrid_model.predict_proba(X_test_q)[:, 1]
    h_test_preds = hybrid_model.predict(X_test_q)

    h_accuracy = accuracy_score(y_test, h_test_preds)
    h_precision = precision_score(y_test, h_test_preds, zero_division=0)
    h_recall = recall_score(y_test, h_test_preds, zero_division=0)
    h_f1 = f1_score(y_test, h_test_preds, zero_division=0)
    h_roc_auc = roc_auc_score(y_test, h_test_proba)

    # --- Train and Evaluate Classical Baseline (RBF SVM, no quantum step) ---
    # Trained on the same PCA angle-encoded data, deliberately NOT XGBoost,
    # so the only variable between baseline and hybrid is the quantum
    # feature transformation, not also a different algorithm.
    print("Training Classical Baseline (RBF SVM on raw PCA features)...")
    svm_clf = SVC(kernel="rbf", probability=True, random_state=42)
    svm_clf.fit(X_train, y_train)

    c_test_proba = svm_clf.predict_proba(X_test)[:, 1]
    c_test_preds = svm_clf.predict(X_test)

    c_accuracy = accuracy_score(y_test, c_test_preds)
    c_precision = precision_score(y_test, c_test_preds, zero_division=0)
    c_recall = recall_score(y_test, c_test_preds, zero_division=0)
    c_f1 = f1_score(y_test, c_test_preds, zero_division=0)
    c_roc_auc = roc_auc_score(y_test, c_test_proba)

    print(f"\n=== Honest Benchmarking Results ===")
    print(f"{'Metric':<12} | {'Hybrid (Q+XGB)':<15} | {'Classical (SVM)':<15}")
    print(f"-" * 48)
    print(f"{'Accuracy':<12} | {h_accuracy:<15.3f} | {c_accuracy:<15.3f}")
    print(f"{'Precision':<12} | {h_precision:<15.3f} | {c_precision:<15.3f}")
    print(f"{'Recall':<12} | {h_recall:<15.3f} | {c_recall:<15.3f}")
    print(f"{'F1 Score':<12} | {h_f1:<15.3f} | {c_f1:<15.3f}")
    print(f"{'ROC-AUC':<12} | {h_roc_auc:<15.3f} | {c_roc_auc:<15.3f}")

    # --- Save everything the API needs ---
    with open(artifact_dir / "scaler.pkl", "wb") as f:
        pickle.dump(pca_result["scaler"], f)
    with open(artifact_dir / "pca.pkl", "wb") as f:
        pickle.dump(pca_result["pca"], f)

    # Hybrid model (XGBoost trained on quantum-transformed features)
    joblib.dump(hybrid_model, artifact_dir / "hybrid_model.joblib")

    # Classical baseline (RBF SVM on raw PCA features)
    joblib.dump(svm_clf, artifact_dir / "classical_baseline.joblib")

    # Save metrics for UI consumption
    metrics = {
        "hybrid": {
            "accuracy": h_accuracy,
            "precision": h_precision,
            "recall": h_recall,
            "f1": h_f1,
            "roc_auc": h_roc_auc,
        },
        "classical": {
            "accuracy": c_accuracy,
            "precision": c_precision,
            "recall": c_recall,
            "f1": c_f1,
            "roc_auc": c_roc_auc,
        },
    }
    with open(artifact_dir / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    # SHAP background sample — 25 samples, quantum-transformed, as specified
    # in PROJECT_CONTEXT.md. These are used by KernelExplainer in the API.
    background_idx = np.random.choice(len(X), size=min(25, len(X)), replace=False)
    X_background_q = qfm.transform(X[background_idx])
    np.save(artifact_dir / "background.npy", X_background_q)

    # For each component, note which 2 raw features it leans on most, so the
    # API can turn "PC2 pushed risk up" into something a clinician can read.
    loadings = pca_result["pca"].components_  # shape (n_components, n_features)
    feature_names = pca_result["feature_names"]
    top_features_per_component = []
    for row in loadings:
        top_idx = np.argsort(-np.abs(row))[:2]
        top_features_per_component.append([feature_names[i] for i in top_idx])

    meta = {
        "feature_names": feature_names,
        "component_cols": pca_result["component_cols"],
        "component_top_features": top_features_per_component,
        "n_qubits": n_qubits,
        "n_layers": N_LAYERS,
        "qfm_seed": QFM_SEED,
        "angle_scale": angle_scale,
        "hybrid_accuracy": h_accuracy,
        "hybrid_precision": h_precision,
        "hybrid_recall": h_recall,
        "hybrid_f1": h_f1,
        "hybrid_roc_auc": h_roc_auc,
        "classical_accuracy": c_accuracy,
    }
    with open(artifact_dir / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    # Clean up old VQC weights file if it exists (no longer needed)
    old_weights = artifact_dir / "vqc_weights.npy"
    if old_weights.exists():
        old_weights.unlink()
        print("Removed old vqc_weights.npy (no longer needed)")

    print(f"\nSaved trained hybrid pipeline to {artifact_dir}/")


if __name__ == "__main__":
    main()
