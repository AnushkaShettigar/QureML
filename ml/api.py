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

from diseases import DISEASES
from quantum_risk_model import QuantumFeatureMap

app = FastAPI(title="QRISK Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictionRequest(BaseModel):
    disease_type: str
    features: dict[str, float | None]


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
    imputed_features: list[str] = []


# --- Load everything once at startup, not per-request ---
DISEASE_MODELS = {}
MODEL_READY = False
MODEL_LOAD_ERROR = None

for d_key, d_info in DISEASES.items():
    a_dir = Path(__file__).parent / d_info["models_dir"]
    try:
        with open(a_dir / "scaler.pkl", "rb") as f:
            scaler = pickle.load(f)
        with open(a_dir / "pca.pkl", "rb") as f:
            pca = pickle.load(f)
        with open(a_dir / "meta.json") as f:
            meta = json.load(f)

        qfm = QuantumFeatureMap(
            n_qubits=meta["n_qubits"],
            n_layers=meta["n_layers"],
            seed=meta["qfm_seed"],
        )
        hybrid_model = joblib.load(a_dir / "hybrid_model.joblib")
        svm_clf = joblib.load(a_dir / "classical_baseline.joblib")
        background = np.load(a_dir / "background.npy")
        
        train_medians = {}
        if (a_dir / "train_medians.json").exists():
            with open(a_dir / "train_medians.json") as f:
                train_medians = json.load(f)

        DISEASE_MODELS[d_key] = {
            "scaler": scaler,
            "pca": pca,
            "meta": meta,
            "qfm": qfm,
            "hybrid_model": hybrid_model,
            "svm_clf": svm_clf,
            "background": background,
            "train_medians": train_medians
        }
        MODEL_READY = True
    except FileNotFoundError as e:
        if not MODEL_READY:
            MODEL_LOAD_ERROR = str(e)
        print(f"Warning: Models for {d_key} not found. Error: {e}")

def hybrid_predict_fn(X_batch: np.ndarray, model) -> np.ndarray:
    """Predict function for SHAP — wraps the hybrid pipeline."""
    return model.predict_proba(X_batch)[:, 1]


@app.get("/diseases")
def get_diseases():
    return DISEASES

@app.get("/health")
def health():
    if not MODEL_READY:
        return {"status": "not_ready", "error": MODEL_LOAD_ERROR}
    return {"status": "ok", "loaded_diseases": list(DISEASE_MODELS.keys())}


@app.get("/features")
def features(disease_type: str = "breast_cancer"):
    if disease_type not in DISEASE_MODELS:
        raise HTTPException(status_code=404, detail="Disease model not ready")
    meta = DISEASE_MODELS[disease_type]["meta"]
    return {
        "feature_names": meta["feature_names"],
        "n_qubits": meta["n_qubits"],
        "n_layers": meta["n_layers"],
    }


@app.get("/sample-patients")
def sample_patients(disease_type: str = "breast_cancer"):
    if disease_type not in DISEASES:
        raise HTTPException(status_code=404, detail="Disease not found")
    
    sample_path = Path(__file__).parent / DISEASES[disease_type]["models_dir"] / "sample_patients.json"
    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Sample patients not found.")
    with open(sample_path) as f:
        return json.load(f)


@app.post("/predict", response_model=PredictionResult)
def predict(req: PredictionRequest):
    if req.disease_type not in DISEASE_MODELS:
        raise HTTPException(status_code=404, detail=f"Model for {req.disease_type} not found.")

    model_data = DISEASE_MODELS[req.disease_type]
    meta = model_data["meta"]
    scaler = model_data["scaler"]
    pca = model_data["pca"]
    qfm = model_data["qfm"]
    hybrid_model = model_data["hybrid_model"]
    svm_clf = model_data["svm_clf"]
    background = model_data["background"]
    train_medians = model_data.get("train_medians", {})

    imputed_features = []
    raw_features = []

    # Map form keys like worst_concave_points to "Worst Concave Points" if needed, 
    # but the frontend for diabetes sends lowercase keys like "insulin" which match the meta["feature_names"].
    # Wait, for breast_cancer, the frontend sends `worst_concave_points`, but meta expects `Worst Concave Points`.
    # Let's handle mapping gracefully.
    
    # Simple mapping logic for frontend keys to meta names
    def normalize_key(k: str) -> str:
        return k.lower().replace(" ", "_")

    input_map = {normalize_key(k): v for k, v in req.features.items()}

    for fname in meta["feature_names"]:
        norm_fname = normalize_key(fname)
        val = input_map.get(norm_fname)
        
        if val is None:
            if fname in train_medians:
                val = train_medians[fname]
                imputed_features.append(fname)
            else:
                raise HTTPException(status_code=422, detail=f"Missing required feature: {fname}")
        
        raw_features.append(val)

    raw = np.array(raw_features, dtype=float).reshape(1, -1)
    scaled = scaler.transform(raw)
    pca_components = pca.transform(scaled)[0]
    angles = np.pi * (pca_components / meta["angle_scale"])

    # --- Hybrid prediction: quantum transform → XGBoost ---
    angles_2d = angles.reshape(1, -1)
    q_features = qfm.transform(angles_2d)
    hybrid_proba = float(hybrid_model.predict_proba(q_features)[0, 1])
    hybrid_risk_score = int(np.clip(round(hybrid_proba * 100), 1, 99))
    
    # Diabetes specific logic for labelling: if proba > 0.5 then Diabetic, else Non-Diabetic
    if req.disease_type == "diabetes":
        hybrid_label = "Diabetic" if hybrid_proba > 0.5 else "Non-Diabetic"
    else:
        hybrid_label = "Malignant" if hybrid_proba > 0.5 else "Benign"

    # --- Classical baseline: raw PCA → SVM (no quantum step) ---
    c_proba = float(svm_clf.predict_proba(angles_2d)[0, 1])
    classical_risk_score = int(np.clip(round(c_proba * 100), 1, 99))
    if req.disease_type == "diabetes":
        classical_label = "Diabetic" if c_proba > 0.5 else "Non-Diabetic"
    else:
        classical_label = "Malignant" if c_proba > 0.5 else "Benign"

    models_agree = hybrid_label == classical_label
    priority = "High" if hybrid_risk_score > 70 else "Moderate" if hybrid_risk_score > 40 else "Low"
    survival_rate = f"{max(60, 100 - round(hybrid_risk_score * 0.4))}%"

    def bound_predict_fn(X_batch):
        return hybrid_predict_fn(X_batch, hybrid_model)

    explainer = shap.KernelExplainer(bound_predict_fn, background)
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
        explanation=explanation[:3],
        note="Hybrid = Quantum Feature Map + XGBoost. Baseline = RBF SVM (no quantum).",
        imputed_features=imputed_features
    )
