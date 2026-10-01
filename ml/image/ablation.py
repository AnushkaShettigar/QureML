"""Ablation + 5-fold CV on the CACHED CNN features (no images re-processed).

Answers: is the hybrid's drop caused by the quantum map, or by XGBoost / one lucky split?

Run from the ml/ folder, after train_image_model.py has created artifacts/image/features.npz:
    python -m image.ablation
Takes a few minutes (quantum circuits run once per sample per fold).
Writes artifacts/image/ablation_results.json. Touches nothing else.
"""
import json
import time
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

from quantum_risk_model import QuantumFeatureMap

OUT = Path(__file__).resolve().parents[1] / "artifacts" / "image"
N_Q = 4
LAYERS = (1, 2, 3)
SEEDS = (42, 7, 123)


def make_xgb():
    return XGBClassifier(n_estimators=150, max_depth=3, learning_rate=0.1,
                         eval_metric="logloss", random_state=42)


def make_svm():
    return SVC(kernel="rbf", random_state=42)


def fit_eval(model, Ftr, ytr, Fte, yte):
    model.fit(Ftr, ytr)
    score = (model.predict_proba(Fte)[:, 1] if isinstance(model, XGBClassifier)
             else model.decision_function(Fte))
    pred = model.predict(Fte)
    return accuracy_score(yte, pred), f1_score(yte, pred), roc_auc_score(yte, score)


def main():
    d = np.load(OUT / "features.npz")
    X, y = d["X"], d["y"]
    print(f"features: {X.shape}, classes: {np.bincount(y)}")

    qfms = {(L, s): QuantumFeatureMap(n_qubits=N_Q, n_layers=L, seed=s)
            for L in LAYERS for s in SEEDS}

    results = {}  # name -> list of (acc, f1, auc), one per fold

    def add(name, res):
        results.setdefault(name, []).append(res)

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    t0 = time.time()
    for k, (tr, te) in enumerate(skf.split(X, y), 1):
        print(f"fold {k}/5 ...  ({time.time() - t0:.0f}s elapsed)")
        sc = StandardScaler().fit(X[tr])
        pca = PCA(n_components=N_Q, random_state=42).fit(sc.transform(X[tr]))
        Ptr, Pte = (pca.transform(sc.transform(X[i])) for i in (tr, te))
        scale = np.abs(Ptr).max() + 1e-9
        Atr = np.pi * Ptr / scale
        Ate = np.clip(np.pi * Pte / scale, -np.pi, np.pi)
        ytr, yte = y[tr], y[te]

        add("1. SVM  on PCA angles  (classical baseline)", fit_eval(make_svm(), Atr, ytr, Ate, yte))
        add("2. XGB  on PCA angles  (no quantum)", fit_eval(make_xgb(), Atr, ytr, Ate, yte))

        for (L, s), qfm in qfms.items():
            Qtr, Qte = qfm.transform(Atr), qfm.transform(Ate)
            add(f"3. XGB  on quantum  L={L} seed={s}", fit_eval(make_xgb(), Qtr, ytr, Qte, yte))
            if (L, s) == (3, 42):  # the repo's default circuit
                add("4. SVM  on quantum  L=3 seed=42", fit_eval(make_svm(), Qtr, ytr, Qte, yte))
                add("5. XGB  on PCA+quantum (8 feats) L=3 seed=42",
                    fit_eval(make_xgb(), np.hstack([Atr, Qtr]), ytr, np.hstack([Ate, Qte]), yte))

    print("\n5-fold CV, mean ± std   (acc / f1 / roc_auc)\n" + "-" * 86)
    summary = {}
    for name in sorted(results):
        a = np.array(results[name])
        m, s = a.mean(0), a.std(0)
        summary[name] = dict(acc=[m[0], s[0]], f1=[m[1], s[1]], auc=[m[2], s[2]])
        print(f"{name:<50} {m[0]:.3f}±{s[0]:.3f}  {m[1]:.3f}±{s[1]:.3f}  {m[2]:.3f}±{s[2]:.3f}")

    with open(OUT / "ablation_results.json", "w") as f:
        json.dump(summary, f, indent=2)
    print("\nSaved:", OUT / "ablation_results.json", f"({time.time() - t0:.0f}s total)")


if __name__ == "__main__":
    main()
