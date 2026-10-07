"""
ml/routers/history.py
Prediction CRUD endpoints — save, list, get, delete.
User isolation enforced: normal users can only see their own predictions.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas
from routers.auth import get_current_user

router = APIRouter()


@router.post("", response_model=schemas.PredictionOut, status_code=status.HTTP_201_CREATED)
def save_prediction(
    req: schemas.PredictionSaveRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Save a prediction result to PostgreSQL.
    Inserts one row in predictions, N rows in prediction_inputs,
    and M rows in shap_explanations (one per SHAP component).
    Also records an audit log entry.
    """
    pred = crud.create_prediction(db, user_id=current_user.id, req=req)

    crud.create_audit_log(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action=f"Created Patient Screening ({pred.record_id}) — {req.disease_type}",
    )
    return pred


@router.get("", response_model=list[schemas.PredictionListItem])
def list_predictions(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    List predictions.
    - Normal users see only their own.
    - Admins see all users' predictions.
    """
    return crud.get_predictions(
        db,
        user_id=current_user.id,
        role=current_user.role,
        limit=limit,
        offset=offset,
    )


@router.get("/{prediction_id}", response_model=schemas.PredictionOut)
def get_prediction(
    prediction_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Fetch a single prediction with its inputs and SHAP explanation.
    Returns 403 if a non-admin requests another user's prediction.
    """
    pred = crud.get_prediction_by_id(
        db,
        prediction_id=prediction_id,
        user_id=current_user.id,
        role=current_user.role,
    )
    if pred is None:
        # Deliberately return 403 (not 404) so callers cannot enumerate IDs
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied or prediction not found.",
        )
    return pred


@router.delete("/{prediction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prediction(
    prediction_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Delete a prediction. Admin-only or own-record deletion.
    Records an audit log entry.
    """
    # Check the record exists and the caller is allowed to delete it
    pred = crud.get_prediction_by_id(
        db,
        prediction_id=prediction_id,
        user_id=current_user.id,
        role=current_user.role,
    )
    if pred is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied or prediction not found.",
        )

    record_id = pred.record_id
    deleted = crud.delete_prediction(db, prediction_id=prediction_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not found.")

    crud.create_audit_log(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action=f"Deleted Patient Record ({record_id})",
    )
