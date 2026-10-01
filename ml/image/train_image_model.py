"""Local experiment: CNN features -> StandardScaler -> PCA(4) -> QuantumFeatureMap
-> XGBoost, benchmarked against PCA(4) angles -> RBF-SVM (+ a 1280-feature LogReg
reference). Mirrors ml/train_and_save.py conventions so image mode and tabular
mode behave the same way.

Dataset layout (class = folder name, exactly two folders):
    data/xray/NORMAL/*.jpeg
    data/xray/PNEUMONIA/*.jpeg

Run from the ml/ folder:
    python -m image.train_image_model --data ../data/xray --max-per-class 300

Writes ONLY to ml/artifacts/image/ (tabular artifacts are never touched).
"""
import argparse
import json
import pickle
from pathlib import Path

import joblib
import numpy as np
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

from quantum_risk_model import QuantumFeatureMap  # the repo's own circuit, unchanged
from image.cnn_features import IMG_EXT, extract_batch

OUT = Path(__file__).resolve().parents[1] / "artifacts" / "image"
N_COMPONENTS = N_QUBITS = 4
N_LAYERS = 3
QFM_SEED = 42


def load_paths(root, max_per_class):
    classes = sorted(d.name for d in Path(root).iterdir() if d.is_dir())
    assert len(classes) == 2, f"expected exactly 2 class folders, found {classes}"
    paths, labels = [], []
    for label, cls in enumerate(classes):
        files = sorted(p for p in (Path(root) / cls).rglob("*") if p.suffix.lower() in IMG_EXT)
        files = files[:max_per_class]
        paths += files
        labels += [label] * len(files)
        print(f"  label {label} = {cls}: {len(files)} images")
    return paths, np.array(labels), classes


def metrics(y, pred, proba):
    return dict(accuracy=accuracy_score(y, pred),
                precision=precision_score(y, pred, zero_division=0),
                recall=recall_score(y, pred, zero_division=0),
                f1=f1_score(y, pred, zero_division=0),
                roc_auc=roc_auc_score(y, proba))


def show(name, m):
    print(f"{name:<30}" + "  ".join(f"{k}={v:.3f}" for k, v in m.items()))


def main(a):
    OUT.mkdir(parents=True, exist_ok=True)
    cache = OUT / "features.npz"

    print("Dataset:")
    paths, y, classes = load_paths(a.data, a.max_per_class)

    if cache.exists() and np.load(cache)["X"].shape[0] == len(paths):
        X = np.load(cache)["X"]
        print("Loaded cached CNN features:", X.shape)
    else:
        print("Extracting CNN features (one-time, cached afterwards)...")
        X = extract_batch(paths)
        np.savez(cache, X=X, y=y)
        print("Cached:", X.shape)

    # Same split settings as train_and_save.py. Everything below is fit on TRAIN only.
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

    scaler = StandardScaler().fit(Xtr)
    pca = PCA(n_components=N_COMPONENTS, random_state=42).fit(scaler.transform(Xtr))
    Ptr = pca.transform(scaler.transform(Xtr))
    Pte = pca.transform(scaler.transform(Xte))

    # Same angle scaling as the tabular pipeline: max-abs normalise, multiply by pi.
    angle_scale = float(np.abs(Ptr).max() + 1e-9)
    Atr = np.pi * Ptr / angle_scale
    Ate = np.clip(np.pi * Pte / angle_scale, -np.pi, np.pi)  # test can exceed train range
    print(f"PCA: 1280 -> {N_COMPONENTS} comps ({pca.explained_variance_ratio_.sum()*100:.1f}% variance)")

    qfm = QuantumFeatureMap(n_qubits=N_QUBITS, n_layers=N_LAYERS, seed=QFM_SEED)
    print("Quantum transform (train, test)...")
    Qtr, Qte = qfm.transform(Atr), qfm.transform(Ate)

    results = {}

    # reference only: all 1280 CNN features
    lr = LogisticRegression(max_iter=3000).fit(scaler.transform(Xtr), ytr)
    p = lr.predict_proba(scaler.transform(Xte))[:, 1]
    results["cnn1280_logreg_reference"] = metrics(yte, (p > 0.5).astype(int), p)

    # classical baseline: same 4 PCA angle features -> RBF-SVM (no quantum step)
    svm = SVC(kernel="rbf", probability=True, random_state=42).fit(Atr, ytr)
    results["classical"] = metrics(yte, svm.predict(Ate), svm.predict_proba(Ate)[:, 1])

    # hybrid: quantum features -> XGBoost (same hyperparameters as the tabular model)
    xgb = XGBClassifier(n_estimators=150, max_depth=3, learning_rate=0.1,
                        eval_metric="logloss", random_state=42).fit(Qtr, ytr)
    results["hybrid"] = metrics(yte, xgb.predict(Qte), xgb.predict_proba(Qte)[:, 1])

    print()
    show("CNN-1280 + LogReg (ref)", results["cnn1280_logreg_reference"])
    show("PCA4 + RBF-SVM (classical)", results["classical"])
    show("PCA4 + Quantum + XGB (hybrid)", results["hybrid"])

    # artifacts use the same filenames as ml/artifacts/<disease>/
    with open(OUT / "scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    with open(OUT / "pca.pkl", "wb") as f:
        pickle.dump(pca, f)
    joblib.dump(xgb, OUT / "hybrid_model.joblib")
    joblib.dump(svm, OUT / "classical_baseline.joblib")
    with open(OUT / "metrics.json", "w") as f:
        json.dump(results, f, indent=2)
    with open(OUT / "meta.json", "w") as f:
        json.dump(dict(n_qubits=N_QUBITS, n_layers=N_LAYERS, qfm_seed=QFM_SEED,
                       angle_scale=angle_scale, classes=classes,
                       feature_extractor="mobilenet_v2_imagenet_1280",
                       n_train=len(ytr), n_test=len(yte)), f, indent=2)
    print("\nSaved to", OUT)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--max-per-class", type=int, default=300)
    main(ap.parse_args())
