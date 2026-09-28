"""
QRISK Prediction API (Hybrid Pipeline)
=========================================
This is the "messenger" between the React app and the trained Python model.
Run train_and_save.py first (it needs to have produced ./artifacts/), then:

    uvicorn api:app --reload --port 8000

The React app will call http://localhost:8000/predict.

Accepts the 6 WDBC features (worst concave points, mean concave points,
worst radius, worst perimeter, mean area, mean texture) and returns a
hybrid quantum+ML risk score alongside a classical baseline score.

Pipeline:
  PCA features → Quantum Feature Map → quantum-transformed features
                                              ↓
                                   XGBoost (hybrid_model)
                                              ↓
                                   ONE hybrid risk score

Baseline:
  PCA features → RBF SVM (no quantum step) → classical baseline score
"""

import json
import pickle
import joblib
from pathlib import Path
from typing import Optional

import numpy as np
import shap
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from quantum_risk_model import QuantumFeatureMap

ARTIFACT_DIR = Path(__file__).parent / "artifacts"

app = FastAPI(title="QRISK Prediction API")

# Allows the Vite dev server (typically http://localhost:5173) to call this
# API from the browser. Tighten this to your real domain before deploying
# anywhere public.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScreeningInput(BaseModel):
    """
    The 6 WDBC features used by our model. These map directly to columns
    in the Wisconsin Diagnostic Breast Cancer dataset.
    """
    worst_concave_points: float
    mean_concave_points: float
    worst_radius: float
    worst_perimeter: float
    mean_area: float
    mean_texture: float


class ComponentImpact(BaseModel):
    component: str
    impact: float
    direction: str
    related_features: list[str]


class PredictionResult(BaseModel):
    hybridRiskScore: int
    hybridRiskProbability: float
    hybridLabel: str
    classicalRiskScore: int
    classicalRiskProbability: float
    classicalLabel: str
    modelsAgree: bool
    priority: str
    survivalRate: str
    hybridTestAccuracy: float
    classicalTestAccuracy: float
    explanation: list[ComponentImpact]
    note: str


# --- Load everything once at startup, not per-request ---
try:
    with open(ARTIFACT_DIR / "scaler.pkl", "rb") as f:
        scaler = pickle.load(f)
    with open(ARTIFACT_DIR / "pca.pkl", "rb") as f:
        pca = pickle.load(f)
    with open(ARTIFACT_DIR / "meta.json") as f:
        meta = json.load(f)

    # Re-instantiate QuantumFeatureMap with the same seed (no weights file needed)
    qfm = QuantumFeatureMap(
        n_qubits=meta["n_qubits"],
        n_layers=meta["n_layers"],
        seed=meta["qfm_seed"],
    )

    # Load the trained hybrid classifier (XGBoost on quantum-transformed features)
    hybrid_model = joblib.load(ARTIFACT_DIR / "hybrid_model.joblib")

    # Load the classical baseline (RBF SVM on raw PCA features)
    svm_clf = joblib.load(ARTIFACT_DIR / "classical_baseline.joblib")

    background = np.load(ARTIFACT_DIR / "background.npy")

    MODEL_READY = True
    MODEL_LOAD_ERROR = None
except FileNotFoundError as e:
    MODEL_READY = False
    MODEL_LOAD_ERROR = str(e)


def form_to_raw_features(x: ScreeningInput) -> np.ndarray:
    """Map the screening input to the raw feature vector in the exact order
    the model was trained on (meta['feature_names'])."""
    values = {
        "Worst Concave Points": x.worst_concave_points,
        "Mean Concave Points": x.mean_concave_points,
        "Worst Radius": x.worst_radius,
        "Worst Perimeter": x.worst_perimeter,
        "Mean Area": x.mean_area,
        "Mean Texture": x.mean_texture,
    }
    return np.array([values[name] for name in meta["feature_names"]], dtype=float)


def hybrid_predict_fn(X_batch: np.ndarray) -> np.ndarray:
    """Predict function for SHAP — wraps the hybrid pipeline.
    Input is already quantum-transformed features."""
    return hybrid_model.predict_proba(X_batch)[:, 1]


@app.get("/health")
def health():
    if not MODEL_READY:
        return {"status": "not_ready", "error": MODEL_LOAD_ERROR}
    return {
        "status": "ok",
        "hybrid_accuracy": meta.get("hybrid_accuracy", 0.0),
        "classical_accuracy": meta.get("classical_accuracy", 0.0),
        "hybrid_f1": meta.get("hybrid_f1"),
        "hybrid_roc_auc": meta.get("hybrid_roc_auc"),
    }


@app.get("/features")
def features():
    """Return the list of feature names and display info the frontend needs."""
    if not MODEL_READY:
        raise HTTPException(status_code=503, detail="Model not ready")
    return {
        "feature_names": meta["feature_names"],
        "n_qubits": meta["n_qubits"],
        "n_layers": meta["n_layers"],
    }


@app.get("/sample-patients")
def sample_patients():
    """Return a list of pre-selected patients from the WDBC dataset."""
    sample_path = ARTIFACT_DIR / "sample_patients.json"
    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Sample patients not found. Run generate_samples.py first.")
    with open(sample_path) as f:
        return json.load(f)


@app.post("/predict", response_model=PredictionResult)
def predict(x: ScreeningInput):
    if not MODEL_READY:
        raise HTTPException(
            status_code=503,
            detail=f"Model artifacts not found ({MODEL_LOAD_ERROR}). Run train_and_save.py first.",
        )

    raw = form_to_raw_features(x).reshape(1, -1)
    scaled = scaler.transform(raw)
    pca_components = pca.transform(scaled)[0]
    angles = np.pi * (pca_components / meta["angle_scale"])

    # --- Hybrid prediction: quantum transform → XGBoost ---
    angles_2d = angles.reshape(1, -1)
    q_features = qfm.transform(angles_2d)
    hybrid_proba = float(hybrid_model.predict_proba(q_features)[0, 1])
    hybrid_risk_score = int(np.clip(round(hybrid_proba * 100), 1, 99))
    hybrid_label = "Malignant" if hybrid_proba > 0.5 else "Benign"

    # --- Classical baseline: raw PCA → SVM (no quantum step) ---
    c_proba = float(svm_clf.predict_proba(angles_2d)[0, 1])
    classical_risk_score = int(np.clip(round(c_proba * 100), 1, 99))
    classical_label = "Malignant" if c_proba > 0.5 else "Benign"

    # Agreement check
    models_agree = hybrid_label == classical_label

    priority = "High" if hybrid_risk_score > 70 else "Moderate" if hybrid_risk_score > 40 else "Low"
    survival_rate = f"{max(60, 100 - round(hybrid_risk_score * 0.4))}%"

    # SHAP explanation: which quantum-transformed components drove the hybrid
    # score, and which raw clinical features those components trace back to.
    explainer = shap.KernelExplainer(hybrid_predict_fn, background)
    shap_values = explainer.shap_values(q_features, nsamples=60)[0]

    explanation = []
    for comp_name, impact, top_feats in zip(
        meta["component_cols"], shap_values, meta["component_top_features"]
    ):
        explanation.append(ComponentImpact(
            component=comp_name,
            impact=float(impact),
            direction="raises risk" if impact > 0 else "lowers risk",
            related_features=top_feats,
        ))
    explanation.sort(key=lambda e: abs(e.impact), reverse=True)

    return PredictionResult(
        hybridRiskScore=hybrid_risk_score,
        hybridRiskProbability=hybrid_proba,
        hybridLabel=hybrid_label,
        classicalRiskScore=classical_risk_score,
        classicalRiskProbability=c_proba,
        classicalLabel=classical_label,
        modelsAgree=models_agree,
        priority=priority,
        survivalRate=survival_rate,
        hybridTestAccuracy=meta.get("hybrid_accuracy", 0.0),
        classicalTestAccuracy=meta.get("classical_accuracy", 0.0),
        explanation=explanation[:3],  # top 3 drivers is plenty for the UI
        note="Hybrid = Quantum Feature Map + XGBoost. Baseline = RBF SVM (no quantum).",
    )
