import json
import pickle
from pathlib import Path
import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split, StratifiedKFold, RandomizedSearchCV
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.svm import SVC
from sklearn.pipeline import Pipeline
from sklearn.base import BaseEstimator, TransformerMixin
from xgboost import XGBClassifier

from quantum_risk_model import QuantumFeatureMap

N_LAYERS = 3
N_COMPONENTS = 4
N_QUBITS = 4
QFM_SEED = 42

class Imputer(BaseEstimator, TransformerMixin):
    def __init__(self, strategy='median'):
        self.strategy = strategy
        self.medians_ = {}
        
    def fit(self, X, y=None):
        X_df = pd.DataFrame(X)
        self.medians_ = X_df.median().to_dict()
        return self
        
    def transform(self, X):
        X_df = pd.DataFrame(X)
        for col, med in self.medians_.items():
            X_df[col] = X_df[col].fillna(med)
        return X_df.values

class AngleEncoder(BaseEstimator, TransformerMixin):
    def __init__(self):
        self.angle_scale_ = 1.0
        
    def fit(self, X, y=None):
        self.angle_scale_ = float(np.abs(X).max() + 1e-9)
        return self
        
    def transform(self, X):
        return np.pi * (X / self.angle_scale_)

class QuantumTransformer(BaseEstimator, TransformerMixin):
    def __init__(self, n_qubits=4, n_layers=3, seed=42):
        self.n_qubits = n_qubits
        self.n_layers = n_layers
        self.seed = seed
        # We delay QFM initialization until transform to avoid pickling issues 
        # or we can just initialize it here.
        self.qfm_ = None
        
    def fit(self, X, y=None):
        self.qfm_ = QuantumFeatureMap(n_qubits=self.n_qubits, n_layers=self.n_layers, seed=self.seed)
        return self
        
    def transform(self, X):
        if self.qfm_ is None:
            self.qfm_ = QuantumFeatureMap(n_qubits=self.n_qubits, n_layers=self.n_layers, seed=self.seed)
        return self.qfm_.transform(X)

def get_metrics(y_true, y_pred, y_proba):
    return {
        'accuracy': accuracy_score(y_true, y_pred),
        'precision': precision_score(y_true, y_pred, zero_division=0),
        'recall': recall_score(y_true, y_pred, zero_division=0),
        'f1': f1_score(y_true, y_pred, zero_division=0),
        'roc_auc': roc_auc_score(y_true, y_proba)
    }

def main():
    # 1. Load Data
    df_merged = pd.read_csv('../diabetes_merged.csv')
    df_old = pd.read_csv('../diabetes.csv')
    df_old.columns = df_old.columns.str.lower().str.strip()
    
    # We need to identify original rows. We'll use a merge to find them.
    # To do this safely, we will add a column 'is_old' to df_merged
    # Let's clean df_old the same way to match exactly for identification
    df_old = df_old.dropna(subset=['outcome'])
    df_old = df_old[df_old['outcome'].isin([0, 1])]
    zero_to_nan_cols = ['glucose', 'bloodpressure', 'skinthickness', 'insulin', 'bmi']
    for col in zero_to_nan_cols:
        df_old[col] = df_old[col].replace(0, np.nan)
    
    # original_cols_map
    original_cols_map = {
        'pregnancies': 'Pregnancies', 'glucose': 'Glucose', 'bloodpressure': 'BloodPressure',
        'skinthickness': 'SkinThickness', 'insulin': 'Insulin', 'bmi': 'BMI',
        'diabetespedigreefunction': 'DiabetesPedigreeFunction', 'age': 'Age', 'outcome': 'Outcome'
    }
    df_old = df_old.rename(columns=original_cols_map)
    
    # We mark old rows
    df_old['is_old'] = True
    df_merged = df_merged.merge(df_old, on=list(original_cols_map.values()), how='left')
    df_merged['is_old'] = df_merged['is_old'].fillna(False)
    
    selected_features = ["Glucose", "BMI", "Age", "DiabetesPedigreeFunction", "BloodPressure", "Insulin"]
    X = df_merged[selected_features]
    y = df_merged["Outcome"].values
    is_old_arr = df_merged["is_old"].astype(bool).values

    # 2. Train-test split (stratified, seed 42)
    X_train, X_test, y_train, y_test, is_old_train, is_old_test = train_test_split(
        X, y, is_old_arr, test_size=0.25, random_state=42, stratify=y
    )
    
    # Class weights for SVM and XGBoost
    minority_ratio = sum(y_train) / len(y_train)
    scale_pos_weight = (len(y_train) - sum(y_train)) / sum(y_train) if minority_ratio < 0.4 else 1.0
    class_weight = 'balanced' if minority_ratio < 0.4 else None

    print(f"Train minority ratio: {minority_ratio:.3f}. Using class weights.")

    # 3. Pipelines
    # Base prep pipeline
    prep_pipeline = Pipeline([
        ('imputer', Imputer(strategy='median')),
        ('scaler', StandardScaler()),
        ('pca', PCA(n_components=N_COMPONENTS, random_state=42)),
        ('angle', AngleEncoder())
    ])
    
    # Fit prep pipeline
    X_train_prep = prep_pipeline.fit_transform(X_train)
    X_test_prep = prep_pipeline.transform(X_test)
    
    # Quantum transform (no need to put in pipeline for grid search if we can precompute to save time)
    qfm = QuantumTransformer(n_qubits=N_QUBITS, n_layers=N_LAYERS, seed=QFM_SEED)
    qfm.fit(X_train_prep)
    print("Transforming train and test via Quantum Feature Map...")
    X_train_q = qfm.transform(X_train_prep)
    X_test_q = qfm.transform(X_test_prep)
    
    # 4. Hyperparameter search
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    # Hybrid Model (XGBoost)
    xgb_params = {
        'n_estimators': [50, 100, 150, 200],
        'max_depth': [2, 3, 4],
        'learning_rate': [0.01, 0.05, 0.1, 0.2]
    }
    xgb_base = XGBClassifier(eval_metric='logloss', random_state=42, scale_pos_weight=scale_pos_weight)
    xgb_search = RandomizedSearchCV(xgb_base, xgb_params, n_iter=10, cv=cv, scoring='roc_auc', random_state=42, n_jobs=-1)
    
    print("Tuning Hybrid Model...")
    xgb_search.fit(X_train_q, y_train)
    hybrid_model = xgb_search.best_estimator_
    print(f"Best Hybrid params: {xgb_search.best_params_}")
    
    # Classical Baseline (SVM)
    svm_params = {
        'C': [0.1, 1, 10, 100],
        'gamma': ['scale', 'auto', 0.1, 0.01, 0.001]
    }
    svm_base = SVC(kernel='rbf', probability=True, random_state=42, class_weight=class_weight)
    svm_search = RandomizedSearchCV(svm_base, svm_params, n_iter=10, cv=cv, scoring='roc_auc', random_state=42, n_jobs=-1)
    
    print("Tuning Classical Model...")
    svm_search.fit(X_train_prep, y_train)
    classical_model = svm_search.best_estimator_
    print(f"Best Classical params: {svm_search.best_params_}")
    
    # 5. Old model comparison
    X_train_old_subset = X_train[is_old_train]
    y_train_old_subset = y_train[is_old_train]
    
    # Re-fit prep pipeline and models on old subset for fair "old model" estimation
    prep_pipeline_old = Pipeline([
        ('imputer', Imputer(strategy='median')),
        ('scaler', StandardScaler()),
        ('pca', PCA(n_components=N_COMPONENTS, random_state=42)),
        ('angle', AngleEncoder())
    ])
    X_train_old_prep = prep_pipeline_old.fit_transform(X_train_old_subset)
    X_test_old_prep = prep_pipeline_old.transform(X_test)
    
    qfm_old = QuantumTransformer(n_qubits=N_QUBITS, n_layers=N_LAYERS, seed=QFM_SEED).fit(X_train_old_prep)
    X_train_old_q = qfm_old.transform(X_train_old_prep)
    X_test_old_q = qfm_old.transform(X_test_old_prep)
    
    old_hybrid = XGBClassifier(**xgb_search.best_params_, eval_metric='logloss', random_state=42, scale_pos_weight=scale_pos_weight)
    old_hybrid.fit(X_train_old_q, y_train_old_subset)
    
    old_classical = SVC(**svm_search.best_params_, kernel='rbf', probability=True, random_state=42, class_weight=class_weight)
    old_classical.fit(X_train_old_prep, y_train_old_subset)
    
    # 6. Evaluation
    def eval_model(model, X_t, y_t):
        preds = model.predict(X_t)
        proba = model.predict_proba(X_t)[:, 1]
        return get_metrics(y_t, preds, proba), confusion_matrix(y_t, preds)
        
    h_metrics, h_cm = eval_model(hybrid_model, X_test_q, y_test)
    c_metrics, c_cm = eval_model(classical_model, X_test_prep, y_test)
    oh_metrics, oh_cm = eval_model(old_hybrid, X_test_old_q, y_test)
    oc_metrics, oc_cm = eval_model(old_classical, X_test_old_prep, y_test)
    
    print("\n--- TEST SET RESULTS ---")
    print("New Hybrid Model:")
    print(h_metrics, h_cm)
    print("New Classical Model:")
    print(c_metrics, c_cm)
    print("Old Hybrid Model (on same test set):")
    print(oh_metrics, oh_cm)
    print("Old Classical Model (on same test set):")
    print(oc_metrics, oc_cm)
    
    # Cross Validation Results
    h_cv_scores = xgb_search.cv_results_
    h_best_index = xgb_search.best_index_
    print("\nHybrid CV ROC-AUC: {:.3f} +/- {:.3f}".format(h_cv_scores['mean_test_score'][h_best_index], h_cv_scores['std_test_score'][h_best_index]))
    
    c_cv_scores = svm_search.cv_results_
    c_best_index = svm_search.best_index_
    print("Classical CV ROC-AUC: {:.3f} +/- {:.3f}".format(c_cv_scores['mean_test_score'][c_best_index], c_cv_scores['std_test_score'][c_best_index]))
    
    # 7. Save artifacts
    artifact_dir = Path(__file__).parent / "artifacts" / "diabetes"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    
    # Same formats as api.py expects:
    # 'scaler', 'pca', 'meta', 'hybrid_model', 'classical_baseline', 'background', 'train_medians'
    
    with open(artifact_dir / "scaler.pkl", "wb") as f:
        pickle.dump(prep_pipeline.named_steps['scaler'], f)
    with open(artifact_dir / "pca.pkl", "wb") as f:
        pickle.dump(prep_pipeline.named_steps['pca'], f)
        
    joblib.dump(hybrid_model, artifact_dir / "hybrid_model.joblib")
    joblib.dump(classical_model, artifact_dir / "classical_baseline.joblib")
    
    # Compute medians for train_medians.json (keys must be feature names)
    train_medians = {selected_features[i]: val for i, val in enumerate(prep_pipeline.named_steps['imputer'].medians_.values())}
    with open(artifact_dir / "train_medians.json", "w") as f:
        json.dump(train_medians, f, indent=2)
        
    # Background
    background_idx = np.random.choice(len(X_train_prep), size=min(25, len(X_train_prep)), replace=False)
    X_background_q = qfm.transform(X_train_prep[background_idx])
    np.save(artifact_dir / "background.npy", X_background_q)
    
    # Meta
    pca_step = prep_pipeline.named_steps['pca']
    loadings = pca_step.components_
    top_features_per_component = []
    for row in loadings:
        top_idx = np.argsort(-np.abs(row))[:2]
        top_features_per_component.append([selected_features[i] for i in top_idx])
        
    meta = {
        "feature_names": [f.lower().replace(" ", "_") for f in selected_features], # keep lower case for frontend
        "component_cols": [f"PC{i+1}" for i in range(N_COMPONENTS)],
        "component_top_features": top_features_per_component,
        "n_qubits": N_QUBITS,
        "n_layers": N_LAYERS,
        "qfm_seed": QFM_SEED,
        "angle_scale": prep_pipeline.named_steps['angle'].angle_scale_,
        "hybrid_accuracy": h_metrics['accuracy'],
        "hybrid_precision": h_metrics['precision'],
        "hybrid_recall": h_metrics['recall'],
        "hybrid_f1": h_metrics['f1'],
        "hybrid_roc_auc": h_metrics['roc_auc'],
        "classical_accuracy": c_metrics['accuracy'],
    }
    # Wait, api.py uses meta["feature_names"] to look up keys, and expects them to match the frontend keys.
    # We should keep feature_names exact. In old pipeline, what were they? 
    # In api.py: fname in train_medians. So train_medians should match meta["feature_names"].
    # Let's set feature_names to exact original names to be safe.
    meta["feature_names"] = selected_features
    
    with open(artifact_dir / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)
        
    print(f"\nArtifacts saved to {artifact_dir}")

if __name__ == '__main__':
    main()
