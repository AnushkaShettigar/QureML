"""
Second attempt at the diabetes hybrid model.

Changes compared with train_diabetes.py:
  1. XGBoost gets the 4 PCA angles AND the 4 quantum outputs (8 inputs), so the
     circuit adds information instead of replacing it.
  2. The circuit's layer count and seed are picked by cross-validation on the
     training split (the test split is never used for this choice).
  3. The final XGBoost is probability-calibrated (sigmoid), so the hybrid's
     percentages are no longer pushed up by the class weighting.
  4. An ablation line shows XGBoost on PCA only, so you can see whether the
     quantum features help at all.

Run from the ml/ folder, after backing up artifacts/diabetes:
    python -W ignore train_diabetes_v2.py
"""

import json
import pickle

import joblib
import numpy as np
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.decomposition import PCA
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import (RandomizedSearchCV, StratifiedKFold,
                                     cross_val_score, train_test_split)
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

from quantum_risk_model import QuantumFeatureMap
from train_diabetes import FEATURES, N_COMPONENTS, N_QUBITS, OUT, SEED, load_clean, row_keys

LAYER_OPTIONS = [2, 3, 4]
SEED_OPTIONS = [42, 7, 123]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df, audit = load_clean()
    X, y = df[FEATURES], df["Outcome"].values
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=SEED, stratify=y)
    assert len(row_keys(X_tr) & row_keys(X_te)) == 0, "train/test overlap"
    print(f"rows: train={len(X_tr)} test={len(X_te)} overlap=0")

    # preprocessing fitted on the training split only
    medians = X_tr.median()
    X_tr_f, X_te_f = X_tr.fillna(medians), X_te.fillna(medians)
    scaler = StandardScaler().fit(X_tr_f)
    pca = PCA(n_components=N_COMPONENTS, random_state=SEED).fit(scaler.transform(X_tr_f))
    pc_tr, pc_te = (pca.transform(scaler.transform(d)) for d in (X_tr_f, X_te_f))
    angle_scale = float(np.abs(pc_tr).max() + 1e-9)
    A_tr, A_te = np.pi * pc_tr / angle_scale, np.pi * pc_te / angle_scale

    pos_weight = float((y_tr == 0).sum() / (y_tr == 1).sum())
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

    def base_xgb(**kw):
        params = dict(n_estimators=100, max_depth=3, learning_rate=0.05)
        params.update(kw)
        return XGBClassifier(eval_metric="logloss", random_state=SEED,
                             scale_pos_weight=pos_weight, **params)

    # ---- ablation: PCA only, no quantum features ----
    pca_only_auc = cross_val_score(base_xgb(), A_tr, y_tr, cv=cv, scoring="roc_auc").mean()
    print(f"\nXGBoost on PCA only (no circuit): cv auc = {pca_only_auc:.3f}")

    # ---- choose circuit layers / seed by cross-validation ----
    print("\ncircuit search (cv auc on PCA + quantum features):")
    search = []
    cache = {}
    for n_layers in LAYER_OPTIONS:
        for qseed in SEED_OPTIONS:
            qfm = QuantumFeatureMap(n_qubits=N_QUBITS, n_layers=n_layers, seed=qseed)
            Q_tr = qfm.transform(A_tr)
            H_tr = np.hstack([A_tr, Q_tr])
            auc = cross_val_score(base_xgb(), H_tr, y_tr, cv=cv, scoring="roc_auc").mean()
            search.append({"n_layers": n_layers, "seed": qseed, "cv_auc": float(auc)})
            cache[(n_layers, qseed)] = (qfm, Q_tr)
            print(f"  layers={n_layers} seed={qseed:<4d} cv auc = {auc:.3f}")

    best = max(search, key=lambda s: s["cv_auc"])
    print(f"\nchosen circuit: layers={best['n_layers']} seed={best['seed']} (cv auc {best['cv_auc']:.3f})")
    qfm, Q_tr = cache[(best["n_layers"], best["seed"])]
    Q_te = qfm.transform(A_te)
    H_tr, H_te = np.hstack([A_tr, Q_tr]), np.hstack([A_te, Q_te])

    # ---- tune XGBoost on the chosen features, then calibrate ----
    tuned = RandomizedSearchCV(
        base_xgb(),
        {"n_estimators": [50, 100, 150, 200], "max_depth": [2, 3, 4], "learning_rate": [0.01, 0.05, 0.1, 0.2]},
        n_iter=15, cv=cv, scoring="roc_auc", random_state=SEED, n_jobs=-1,
    ).fit(H_tr, y_tr)
    print("tuned params:", tuned.best_params_, f"cv auc={tuned.best_score_:.3f}")
    hybrid = CalibratedClassifierCV(clone(tuned.best_estimator_), method="sigmoid", cv=cv).fit(H_tr, y_tr)

    # ---- classical baseline, unchanged ----
    svm = RandomizedSearchCV(
        SVC(kernel="rbf", probability=True, class_weight="balanced", random_state=SEED),
        {"C": [0.1, 1, 10, 100], "gamma": ["scale", "auto", 0.1, 0.01, 0.001]},
        n_iter=15, cv=cv, scoring="roc_auc", random_state=SEED, n_jobs=-1,
    ).fit(A_tr, y_tr)

    def score(model, Xt):
        p = model.predict_proba(Xt)[:, 1]
        pred = (p > 0.5).astype(int)
        return {
            "accuracy": accuracy_score(y_te, pred),
            "precision": precision_score(y_te, pred, zero_division=0),
            "recall": recall_score(y_te, pred, zero_division=0),
            "f1": f1_score(y_te, pred, zero_division=0),
            "roc_auc": roc_auc_score(y_te, p),
            "brier": brier_score_loss(y_te, p),
        }

    hybrid_m, classical_m = score(hybrid, H_te), score(svm.best_estimator_, A_te)
    keys = ("accuracy", "precision", "recall", "f1", "roc_auc", "brier")
    print(f"\n{'':10s}" + "".join(f"{k[:6]:>8s}" for k in keys) + "   (brier: lower is better)")
    for label, m in (("hybrid v2", hybrid_m), ("classical", classical_m)):
        print(f"{label:10s}" + "".join(f"{m[k]:8.3f}" for k in keys))

    # ---- save, same layout api.py loads ----
    joblib.dump(hybrid, OUT / "hybrid_model.joblib")
    joblib.dump(svm.best_estimator_, OUT / "classical_baseline.joblib")
    with open(OUT / "scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    with open(OUT / "pca.pkl", "wb") as f:
        pickle.dump(pca, f)
    with open(OUT / "train_medians.json", "w") as f:
        json.dump({k: float(v) for k, v in medians.items()}, f, indent=2)
    with open(OUT / "metrics.json", "w") as f:
        json.dump({"hybrid": hybrid_m, "classical": classical_m}, f, indent=2)
    with open(OUT / "hybrid_search.json", "w") as f:
        json.dump({"pca_only_cv_auc": float(pca_only_auc), "circuits": search, "chosen": best}, f, indent=2)

    rng = np.random.default_rng(SEED)
    bg = rng.choice(len(H_tr), size=min(25, len(H_tr)), replace=False)
    np.save(OUT / "background.npy", H_tr[bg])          # 8 columns now: PCA angles + quantum outputs

    top = [[FEATURES[i] for i in np.argsort(-np.abs(row))[:2]] for row in pca.components_]
    meta = {
        "feature_names": FEATURES,
        "component_cols": [f"PC{i + 1}" for i in range(N_COMPONENTS)],
        "component_top_features": top,
        "n_qubits": N_QUBITS,
        "n_layers": best["n_layers"],
        "qfm_seed": best["seed"],
        "angle_scale": angle_scale,
        "hybrid_input": "pca+quantum",
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
