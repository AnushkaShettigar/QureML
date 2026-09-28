"""
QRISK-Console ML Pipeline — Step 3: Explainability (SHAP)
============================================================
Needs: pip install shap  (see requirements.txt)

Uses SHAP's model-agnostic KernelExplainer to explain the hybrid pipeline
(Quantum Feature Map + XGBoost). The KernelExplainer wraps the hybrid
pipeline as one black box — it works fine on XGBoost's predict_proba,
no special handling needed.

Output: for each patient, which quantum-transformed PCA components (and
therefore which raw clinical features, via the loadings from pca_analysis.py)
pushed their risk score up or down.
"""

import numpy as np
import shap

from pca_analysis import load_dataset, run_pca
from quantum_risk_model import QuantumFeatureMap
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split


def explain(n_background: int = 25, n_explain: int = 5):
    X_df, y = load_dataset()
    pca_result = run_pca(X_df, n_components=4)
    X = pca_result["components"]
    angle_scale = float(np.abs(X).max() + 1e-9)
    X = np.pi * (X / angle_scale)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    # Quantum feature transformation (fixed weights, same seed as training)
    qfm = QuantumFeatureMap(n_qubits=4, n_layers=3, seed=42)
    X_train_q = qfm.transform(X_train)
    X_test_q = qfm.transform(X_test)

    # Train hybrid model for this standalone run
    hybrid_model = XGBClassifier(
        n_estimators=150, max_depth=3, learning_rate=0.1,
        eval_metric="logloss", random_state=42
    )
    hybrid_model.fit(X_train_q, y_train)

    def predict_fn(X_batch):
        return hybrid_model.predict_proba(X_batch)[:, 1]

    background = X_test_q[np.random.choice(len(X_test_q), size=n_background, replace=False)]
    explainer = shap.KernelExplainer(predict_fn, background)

    sample = X_test_q[:n_explain]
    shap_values = explainer.shap_values(sample, nsamples=100)

    component_names = pca_result["component_cols"]
    print("=== SHAP values (impact of each quantum-transformed component on hybrid risk score) ===")
    for i, row in enumerate(shap_values):
        label_str = "malignant" if y_test[i] == 1 else "benign"
        print(f"\nPatient {i} (actual: {label_str}):")
        for name, val in zip(component_names, row):
            direction = "↑ raises risk" if val > 0 else "↓ lowers risk"
            print(f"  {name}: {val:+.4f}  ({direction})")

    shap.summary_plot(shap_values, sample, feature_names=component_names, show=False)
    import matplotlib.pyplot as plt
    plt.tight_layout()
    plt.savefig("shap_summary.png", dpi=150)
    print("\nSaved: shap_summary.png")


if __name__ == "__main__":
    explain()
