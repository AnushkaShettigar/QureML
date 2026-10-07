"""
ml/database/schemas.py
Pydantic v2 request/response schemas for auth, predictions, and audit logs.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"

    @field_validator("role")
    @classmethod
    def role_must_be_valid(cls, v):
        if v not in ("user", "admin"):
            raise ValueError("role must be 'user' or 'admin'")
        return v


class UserLogin(BaseModel):
    username: str
    password: str
    role: str = "user"

    @field_validator("role")
    @classmethod
    def role_must_be_valid(cls, v):
        if v not in ("user", "admin"):
            raise ValueError("role must be 'user' or 'admin'")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    account_id: str
    username: str
    role: str


class UserOut(BaseModel):
    id: int
    account_id: str
    username: str
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Predictions
# ---------------------------------------------------------------------------

class ShapComponentIn(BaseModel):
    """Matches ComponentImpact from api.py exactly."""
    component: str
    impact: float
    direction: str
    related_features: list[str]


class PredictionSaveRequest(BaseModel):
    """
    Posted by the frontend after a successful /predict call.
    patient_name + disease_type + all result fields + inputs dict + shap list.
    """
    patient_name: str
    disease_type: str
    hybrid_risk_score: int
    hybrid_probability: float
    hybrid_label: str
    classical_risk_score: int
    classical_probability: float
    classical_label: str
    models_agree: bool
    priority: str
    survival_rate: Optional[str] = None
    hybrid_test_accuracy: Optional[float] = None
    classical_test_accuracy: Optional[float] = None
    imputed_features: list[str] = []
    inputs: dict[str, Optional[float]]           # feature_name → value
    shap_explanation: list[ShapComponentIn] = []


class ShapComponentOut(BaseModel):
    component_name: str
    impact: float
    direction: str
    related_features: list[str]
    rank_order: int

    model_config = {"from_attributes": True}


class PredictionInputOut(BaseModel):
    feature_name: str
    feature_value: Optional[float]

    model_config = {"from_attributes": True}


class PredictionOut(BaseModel):
    id: int
    record_id: str
    patient_name: str
    disease_type: str
    hybrid_risk_score: int
    hybrid_probability: float
    hybrid_label: str
    classical_risk_score: int
    classical_probability: float
    classical_label: str
    models_agree: bool
    priority: str
    survival_rate: Optional[str]
    hybrid_test_accuracy: Optional[float]
    classical_test_accuracy: Optional[float]
    imputed_features: list[str]
    created_at: datetime
    inputs: list[PredictionInputOut] = []
    shap_explanations: list[ShapComponentOut] = []
    user_id: int

    model_config = {"from_attributes": True}


class PredictionListItem(BaseModel):
    """Lightweight version for list views (no inputs/SHAP)."""
    id: int
    record_id: str
    patient_name: str
    disease_type: str
    hybrid_risk_score: int
    hybrid_label: str
    priority: str
    created_at: datetime
    user_id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Audit Logs
# ---------------------------------------------------------------------------

class AuditLogOut(BaseModel):
    id: int
    log_ref: Optional[str]
    user_id: Optional[int]
    username_snapshot: Optional[str]
    action: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Admin Stats
# ---------------------------------------------------------------------------

class AdminStats(BaseModel):
    total_users: int
    total_predictions: int
    high_priority: int
    moderate_priority: int
    low_priority: int
    breast_cancer_count: int
    diabetes_count: int
