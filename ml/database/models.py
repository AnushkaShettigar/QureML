"""
ml/database/models.py
SQLAlchemy ORM models — maps directly to the PostgreSQL schema.
"""
from sqlalchemy import (
    Boolean, CheckConstraint, Column, ForeignKey,
    Integer, Numeric, SmallInteger, String, Text,
    ARRAY, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database.connection import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", "role", name="uq_username_role"),
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
    )

    id            = Column(Integer, primary_key=True, index=True)
    account_id    = Column(String(12), unique=True, nullable=False, index=True)
    username      = Column(String(100), nullable=False, index=True)
    email         = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(10), nullable=False)
    created_at    = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at    = Column(TIMESTAMP(timezone=True), server_default=func.now(),
                           onupdate=func.now(), nullable=False)

    predictions = relationship("Prediction", back_populates="user")
    audit_logs  = relationship("AuditLog", back_populates="user")


class Prediction(Base):
    __tablename__ = "predictions"
    __table_args__ = (
        CheckConstraint("hybrid_risk_score BETWEEN 1 AND 99",    name="ck_pred_hybrid_score"),
        CheckConstraint("classical_risk_score BETWEEN 1 AND 99", name="ck_pred_classical_score"),
        CheckConstraint("priority IN ('High','Moderate','Low')", name="ck_pred_priority"),
    )

    id                      = Column(Integer, primary_key=True, index=True)
    user_id                 = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"),
                                     nullable=False, index=True)
    record_id               = Column(String(10), nullable=False)
    patient_name            = Column(String(255), nullable=False)
    disease_type            = Column(String(50), nullable=False, index=True)
    hybrid_risk_score       = Column(SmallInteger, nullable=False)
    hybrid_probability      = Column(Numeric(6, 5), nullable=False)
    hybrid_label            = Column(String(20), nullable=False)
    classical_risk_score    = Column(SmallInteger, nullable=False)
    classical_probability   = Column(Numeric(6, 5), nullable=False)
    classical_label         = Column(String(20), nullable=False)
    models_agree            = Column(Boolean, nullable=False)
    priority                = Column(String(10), nullable=False, index=True)
    survival_rate           = Column(String(10))
    hybrid_test_accuracy    = Column(Numeric(5, 4))
    classical_test_accuracy = Column(Numeric(5, 4))
    imputed_features        = Column(ARRAY(Text), default=[])
    created_at              = Column(TIMESTAMP(timezone=True), server_default=func.now(),
                                     nullable=False, index=True)

    user              = relationship("User", back_populates="predictions")
    inputs            = relationship("PredictionInput", back_populates="prediction",
                                     cascade="all, delete-orphan")
    shap_explanations = relationship("ShapExplanation", back_populates="prediction",
                                     cascade="all, delete-orphan")


class PredictionInput(Base):
    __tablename__ = "prediction_inputs"

    id            = Column(Integer, primary_key=True)
    prediction_id = Column(Integer, ForeignKey("predictions.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    feature_name  = Column(String(100), nullable=False)
    feature_value = Column(Numeric(12, 6))  # nullable — e.g. insulin is optional

    prediction = relationship("Prediction", back_populates="inputs")


class ShapExplanation(Base):
    __tablename__ = "shap_explanations"
    __table_args__ = (
        CheckConstraint(
            "direction IN ('raises risk', 'lowers risk')",
            name="ck_shap_direction"
        ),
    )

    id               = Column(Integer, primary_key=True)
    prediction_id    = Column(Integer, ForeignKey("predictions.id", ondelete="CASCADE"),
                              nullable=False, index=True)
    component_name   = Column(String(20), nullable=False)   # PC1, PC2, ...
    impact           = Column(Numeric(10, 6), nullable=False)
    direction        = Column(String(15), nullable=False)
    related_features = Column(ARRAY(Text), nullable=False, default=[])
    rank_order       = Column(SmallInteger, nullable=False)  # 1 = highest |impact|

    prediction = relationship("Prediction", back_populates="shap_explanations")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id                = Column(Integer, primary_key=True)
    log_ref           = Column(String(12))
    user_id           = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                               nullable=True, index=True)
    username_snapshot = Column(String(100))   # kept even if user is deleted
    action            = Column(Text, nullable=False)
    created_at        = Column(TIMESTAMP(timezone=True), server_default=func.now(),
                               nullable=False, index=True)

    user = relationship("User", back_populates="audit_logs")
