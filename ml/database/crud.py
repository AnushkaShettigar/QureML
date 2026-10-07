"""
ml/database/crud.py
Pure database read/write functions — no FastAPI-specific logic here.
"""
import random
from typing import Optional
from sqlalchemy.orm import Session

from database import models
from database.schemas import PredictionSaveRequest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gen_account_id(role: str) -> str:
    prefix = "ADM" if role == "admin" else "USR"
    return f"{prefix}-{random.randint(1000, 9999)}"


def _gen_record_id(disease_type: str) -> str:
    prefix = "BC" if disease_type == "breast_cancer" else "DB"
    return f"{prefix}-{random.randint(1000, 9999)}"


def _gen_log_ref() -> str:
    return f"LOG-{random.randint(100, 999)}"


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def get_user_by_id(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_username(db: Session, username: str, role: str) -> Optional[models.User]:
    return (
        db.query(models.User)
        .filter(
            models.User.username == username,
            models.User.role == role,
        )
        .first()
    )


def get_user_by_account_id(db: Session, account_id: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.account_id == account_id).first()


def create_user(
    db: Session,
    username: str,
    email: str,
    password_hash: str,
    role: str,
) -> models.User:
    account_id = _gen_account_id(role)
    # ensure uniqueness (tiny chance of collision)
    while get_user_by_account_id(db, account_id):
        account_id = _gen_account_id(role)

    user = models.User(
        account_id=account_id,
        username=username,
        email=email,
        password_hash=password_hash,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_all_users(db: Session) -> list[models.User]:
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


# ---------------------------------------------------------------------------
# Predictions
# ---------------------------------------------------------------------------

def create_prediction(
    db: Session,
    user_id: int,
    req: PredictionSaveRequest,
) -> models.Prediction:
    record_id = _gen_record_id(req.disease_type)

    pred = models.Prediction(
        user_id=user_id,
        record_id=record_id,
        patient_name=req.patient_name,
        disease_type=req.disease_type,
        hybrid_risk_score=req.hybrid_risk_score,
        hybrid_probability=req.hybrid_probability,
        hybrid_label=req.hybrid_label,
        classical_risk_score=req.classical_risk_score,
        classical_probability=req.classical_probability,
        classical_label=req.classical_label,
        models_agree=req.models_agree,
        priority=req.priority,
        survival_rate=req.survival_rate,
        hybrid_test_accuracy=req.hybrid_test_accuracy,
        classical_test_accuracy=req.classical_test_accuracy,
        imputed_features=req.imputed_features or [],
    )
    db.add(pred)
    db.flush()  # get pred.id before committing

    # Insert one row per input feature
    for feature_name, feature_value in req.inputs.items():
        inp = models.PredictionInput(
            prediction_id=pred.id,
            feature_name=feature_name,
            feature_value=feature_value,
        )
        db.add(inp)

    # Insert SHAP explanation rows
    for rank, shap_item in enumerate(req.shap_explanation, start=1):
        shap_row = models.ShapExplanation(
            prediction_id=pred.id,
            component_name=shap_item.component,
            impact=shap_item.impact,
            direction=shap_item.direction,
            related_features=shap_item.related_features,
            rank_order=rank,
        )
        db.add(shap_row)

    db.commit()
    db.refresh(pred)
    return pred


def get_predictions(
    db: Session,
    user_id: int,
    role: str,
    limit: int = 100,
    offset: int = 0,
) -> list[models.Prediction]:
    """Admin sees all; normal user sees only their own."""
    q = db.query(models.Prediction)
    if role != "admin":
        q = q.filter(models.Prediction.user_id == user_id)
    return q.order_by(models.Prediction.created_at.desc()).offset(offset).limit(limit).all()


def get_prediction_by_id(
    db: Session,
    prediction_id: int,
    user_id: int,
    role: str,
) -> Optional[models.Prediction]:
    """Returns the prediction only if the requester owns it or is admin."""
    pred = db.query(models.Prediction).filter(models.Prediction.id == prediction_id).first()
    if pred is None:
        return None
    if role != "admin" and pred.user_id != user_id:
        return None   # caller will raise 403
    return pred


def delete_prediction(db: Session, prediction_id: int) -> bool:
    """Hard-delete. Cascade removes prediction_inputs and shap_explanations."""
    pred = db.query(models.Prediction).filter(models.Prediction.id == prediction_id).first()
    if pred is None:
        return False
    db.delete(pred)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Audit Logs
# ---------------------------------------------------------------------------

def create_audit_log(
    db: Session,
    user_id: Optional[int],
    username: Optional[str],
    action: str,
) -> models.AuditLog:
    log = models.AuditLog(
        log_ref=_gen_log_ref(),
        user_id=user_id,
        username_snapshot=username,
        action=action,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_audit_logs(
    db: Session,
    limit: int = 200,
    offset: int = 0,
) -> list[models.AuditLog]:
    return (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Admin Stats
# ---------------------------------------------------------------------------

def get_admin_stats(db: Session) -> dict:
    total_users = db.query(models.User).count()
    total_preds = db.query(models.Prediction).count()
    high  = db.query(models.Prediction).filter(models.Prediction.priority == "High").count()
    mod   = db.query(models.Prediction).filter(models.Prediction.priority == "Moderate").count()
    low   = db.query(models.Prediction).filter(models.Prediction.priority == "Low").count()
    bc    = db.query(models.Prediction).filter(models.Prediction.disease_type == "breast_cancer").count()
    diab  = db.query(models.Prediction).filter(models.Prediction.disease_type == "diabetes").count()
    return {
        "total_users": total_users,
        "total_predictions": total_preds,
        "high_priority": high,
        "moderate_priority": mod,
        "low_priority": low,
        "breast_cancer_count": bc,
        "diabetes_count": diab,
    }
