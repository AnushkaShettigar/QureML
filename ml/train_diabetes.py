"""
Train the diabetes models (quantum-hybrid XGBoost + RBF-SVM baseline) on
diabetes.csv + diabetes_2000.csv without letting test rows leak into training.

What this does differently from train_and_save.py --disease diabetes:
  * reads the local CSVs instead of downloading the Pima file from GitHub
  * cleans + de-duplicates BEFORE splitting, then asserts train/test share no rows
  * imputer, scaler, PCA and angle scale are fitted on the training split only
  * writes metrics.json and meta.json from the same run, so they always agree

Run from the ml/ folder:
    python train_diabetes.py --audit-only     # just check the data, no training
    python train_diabetes.py                  # audit + train + save artifacts
"""

import argparse
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "artifacts" / "diabetes"

SOURCES = ["diabetes.csv", "diabetes_2000.csv"]
FEATURES = ["Glucose", "BMI", "Age", "DiabetesPedigreeFunction", "BloodPressure", "Insulin"]
ZERO_IS_MISSING = ["Glucose", "BloodPressure", "Insulin", "BMI"]
N_QUBITS = N_COMPONENTS = 4
N_LAYERS = 3
QFM_SEED = 42
SEED = 42


def load_clean():
    """Load every source file, clean it, drop duplicates / conflicting rows. Returns (df, audit)."""
    frames = []
    audit = {"sources": {}}
    for name in SOURCES:
        df = pd.read_csv(ROOT / name)
        df.columns = [c.strip() for c in df.columns]
        missing = [c for c in FEATURES + ["Outcome"] if c not in df.columns]
        if missing:
            raise ValueError(f"{name} is missing columns: {missing}")
        audit["sources"][name] = {"rows": len(df), "exact_duplicates_inside_file": int(df.duplicated().sum())}
        frames.append(df[FEATURES + ["Outcome"]].assign(_src=name))

    df = pd.concat(frames, ignore_index=True)
    audit["rows_after_concat"] = len(df)

    for c in FEATURES + ["Outcome"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df[df["Outcome"].isin([0, 1])]
    df = df[(df["Age"] > 0) & (df["Age"] < 120)]
    df[ZERO_IS_MISSING] = df[ZERO_IS_MISSING].replace(0, np.nan)
    audit["rows_after_validity_filter"] = len(df)

    # same measurements with different labels = unusable, drop every copy
    grp = df.fillna(-1).groupby(FEATURES)["Outcome"].transform("nunique")
    n_conflict = int((grp > 1).sum())
    df = df[grp.values == 1]
    audit["rows_dropped_conflicting_label"] = n_conflict

    # duplicates on the columns the model actually sees (not just the full row)
    before = len(df)
    df = df.drop_duplicates(subset=FEATURES + ["Outcome"], keep="first").reset_index(drop=True)
    audit["rows_dropped_duplicate"] = before - len(df)
    audit["final_rows"] = len(df)
    audit["class_balance"] = {str(k): int(v) for k, v in df["Outcome"].value_counts().items()}
    audit["rows_contributed_by_file"] = {k: int(v) for k, v in df["_src"].value_counts().items()}
    return df.drop(columns="_src"), audit


def row_keys(X):
    return set(map(tuple, X.fillna(-999).round(6).values))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit-only", action="store_true")
    args = ap.parse_args()

    from sklearn.model_selection import train_test_split

    df, audit = load_clean()
    X, y = df[FEATURES], df["Outcome"].values
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=SEED, stratify=y)

    overlap = len(row_keys(X_tr) & row_keys(X_te))
    audit["train_rows"], audit["test_rows"], audit["train_test_overlap"] = len(X_tr), len(X_te), overlap
    print(json.dumps(audit, indent=2))
    assert overlap == 0, f"{overlap} test rows also appear in the training set"

    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "data_audit.json", "w") as f:
        json.dump(audit, f, indent=2)
    if args.audit_only:
        return

    # heavy imports only when actually training
    import joblib
    from sklearn.decomposition import PCA
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
    from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold
    from sklearn.preprocessing import StandardScaler
    from sklearn.svm import SVC
    from xgboost import XGBClassifier
    from quantum_risk_model import QuantumFeatureMap

    # everything below is fitted on the training split only
    medians = X_tr.median()
    X_tr_f, X_te_f = X_tr.fillna(medians), X_te.fillna(medians)
    scaler = StandardScaler().fit(X_tr_f)
    pca = PCA(n_components=N_COMPONENTS, random_state=SEED).fit(scaler.transform(X_tr_f))
    pc_tr, pc_te = (pca.transform(scaler.transform(d)) for d in (X_tr_f, X_te_f))
    angle_scale = float(np.abs(pc_tr).max() + 1e-9)
    A_tr, A_te = np.pi * pc_tr / angle_scale, np.pi * pc_te / angle_scale

    qfm = QuantumFeatureMap(n_qubits=N_QUBITS, n_layers=N_LAYERS, seed=QFM_SEED)
    Q_tr, Q_te = qfm.transform(A_tr), qfm.transform(A_te)

    pos_weight = float((y_tr == 0).sum() / (y_tr == 1).sum())
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

    xgb = RandomizedSearchCV(
        XGBClassifier(eval_metric="logloss", random_state=SEED, scale_pos_weight=pos_weight),
        {"n_estimators": [50, 100, 150, 200], "max_depth": [2, 3, 4], "learning_rate": [0.01, 0.05, 0.1, 0.2]},
        n_iter=15, cv=cv, scoring="roc_auc", random_state=SEED, n_jobs=-1,
    ).fit(Q_tr, y_tr)

    svm = RandomizedSearchCV(
        SVC(kernel="rbf", probability=True, class_weight="balanced", random_state=SEED),
        {"C": [0.1, 1, 10, 100], "gamma": ["scale", "auto", 0.1, 0.01, 0.001]},
        n_iter=15, cv=cv, scoring="roc_auc", random_state=SEED, n_jobs=-1,
    ).fit(A_tr, y_tr)

    def score(model, Xt):
        p = model.predict_proba(Xt)[:, 1]
        pred = model.predict(Xt)
        return {
            "accuracy": accuracy_score(y_te, pred),
            "precision": precision_score(y_te, pred, zero_division=0),
            "recall": recall_score(y_te, pred, zero_division=0),
            "f1": f1_score(y_te, pred, zero_division=0),
            "roc_auc": roc_auc_score(y_te, p),
        }

    hybrid_m, classical_m = score(xgb.best_estimator_, Q_te), score(svm.best_estimator_, A_te)
    print("\nbest hybrid params   :", xgb.best_params_, f"cv auc={xgb.best_score_:.3f}")
    print("best classical params:", svm.best_params_, f"cv auc={svm.best_score_:.3f}")
    print(f"\n{'':10s}{'acc':>8s}{'prec':>8s}{'recall':>8s}{'f1':>8s}{'auc':>8s}")
    for label, m in (("hybrid", hybrid_m), ("classical", classical_m)):
        print(f"{label:10s}" + "".join(f"{m[k]:8.3f}" for k in ("accuracy", "precision", "recall", "f1", "roc_auc")))

    # ---- save, same file layout api.py already loads ----
    joblib.dump(xgb.best_estimator_, OUT / "hybrid_model.joblib")
    joblib.dump(svm.best_estimator_, OUT / "classical_baseline.joblib")
    with open(OUT / "scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    with open(OUT / "pca.pkl", "wb") as f:
        pickle.dump(pca, f)
    with open(OUT / "train_medians.json", "w") as f:
        json.dump({k: float(v) for k, v in medians.items()}, f, indent=2)
    with open(OUT / "metrics.json", "w") as f:
        json.dump({"hybrid": hybrid_m, "classical": classical_m}, f, indent=2)

    rng = np.random.default_rng(SEED)
    bg = rng.choice(len(A_tr), size=min(25, len(A_tr)), replace=False)
    np.save(OUT / "background.npy", Q_tr[bg])

    top = []
    for row in pca.components_:
        idx = np.argsort(-np.abs(row))[:2]
        top.append([FEATURES[i] for i in idx])
    meta = {
        "feature_names": FEATURES,
        "component_cols": [f"PC{i + 1}" for i in range(N_COMPONENTS)],
        "component_top_features": top,
        "n_qubits": N_QUBITS,
        "n_layers": N_LAYERS,
        "qfm_seed": QFM_SEED,
        "angle_scale": angle_scale,
        "hybrid_accuracy": hybrid_m["accuracy"],
        "hybrid_precision": hybrid_m["precision"],
        "hybrid_recall": hybrid_m["recall"],
        "hybrid_f1": hybrid_m["f1"],
        "hybrid_roc_auc": hybrid_m["roc_auc"],
        "classical_accuracy": classical_m["accuracy"],
    }
    with open(OUT / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\nSaved to {OUT}")


if __name__ == "__main__":
    main()
