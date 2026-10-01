"""FastAPI router: X-ray image screening.

    image -> frozen MobileNetV2 (1280-d) -> StandardScaler -> PCA(4)
          -> QuantumFeatureMap -> XGBoost (hybrid)   |   PCA(4) -> RBF-SVM (classical)

Mounted from api.py under the /image prefix. Models are loaded once at import.
If artifacts/image/ is missing (or torch isn't installed), the import raises and
api.py's try/except simply leaves the image routes switched off.
"""
import json
import pickle
from io import BytesIO
from pathlib import Path

import joblib
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from image.cnn_features import extract_one
from quantum_risk_model import QuantumFeatureMap

router = APIRouter(tags=["image-screening"])

ART = Path(__file__).resolve().parents[1] / "artifacts" / "image"
MAX_BYTES = 10 * 1024 * 1024  # 10 MB upload cap

# ---- load once at startup (same pattern as api.py) --------------------------
with open(ART / "scaler.pkl", "rb") as f:
    scaler = pickle.load(f)
with open(ART / "pca.pkl", "rb") as f:
    pca = pickle.load(f)
with open(ART / "meta.json") as f:
    meta = json.load(f)
hybrid_model = joblib.load(ART / "hybrid_model.joblib")
svm_clf = joblib.load(ART / "classical_baseline.joblib")
qfm = QuantumFeatureMap(n_qubits=meta["n_qubits"], n_layers=meta["n_layers"],
                        seed=meta["qfm_seed"])

CLASSES = meta["classes"]            # label 0 = CLASSES[0], label 1 = CLASSES[1]
NEG, POS = CLASSES[0], CLASSES[1]

cv_summary = {}
if (ART / "ablation_results.json").exists():
    with open(ART / "ablation_results.json") as f:
        cv_summary = json.load(f)

CV_ROWS = [
    ("1.", "Classical baseline (PCA -> SVM)"),
    ("2.", "XGBoost on PCA, no quantum"),
    ("3. XGB  on quantum  L=3 seed=42", "Hybrid (PCA -> quantum -> XGBoost)"),
    ("5.", "PCA + quantum features combined"),
]


def _score(p: float) -> int:
    return int(np.clip(round(p * 100), 1, 99))


def _label(p: float) -> str:
    return f"{POS} likely" if p >= 0.5 else f"{NEG} likely"


@router.get("/info")
def info():
    """Model facts + 5-fold cross-validated results (read from ablation_results.json)."""
    cv = []
    for prefix, nice in CV_ROWS:
        for name, v in cv_summary.items():
            if name.startswith(prefix):
                cv.append({"label": nice, "accuracy": v["acc"][0], "accuracyStd": v["acc"][1],
                           "auc": v["auc"][0]})
                break
    return {"classes": CLASSES, "nTrain": meta["n_train"], "nTest": meta["n_test"],
            "featureExtractor": meta["feature_extractor"], "cv": cv}


@router.post("/predict-image")
def predict_image(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Please upload an image file (JPG or PNG).")
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image too large (max 10 MB).")
    try:
        img = Image.open(BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Could not read that file as an image.")

    feats = extract_one(img).reshape(1, -1)                     # (1, 1280)
    comps = pca.transform(scaler.transform(feats))[0]           # (4,)
    angles = np.clip(np.pi * comps / meta["angle_scale"], -np.pi, np.pi).reshape(1, -1)

    q = qfm.transform(angles)
    p_hybrid = float(hybrid_model.predict_proba(q)[0, 1])
    p_classical = float(svm_clf.predict_proba(angles)[0, 1])

    return {
        "hybridRiskScore": _score(p_hybrid),
        "hybridRiskProbability": p_hybrid,
        "hybridLabel": _label(p_hybrid),
        "classicalRiskScore": _score(p_classical),
        "classicalRiskProbability": p_classical,
        "classicalLabel": _label(p_classical),
        "modelsAgree": (p_hybrid >= 0.5) == (p_classical >= 0.5),
        "positiveClass": POS,
        "note": "Research prototype trained on a public pneumonia chest X-ray dataset. "
                "Not a medical diagnosis.",
    }
