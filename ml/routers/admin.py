"""
ml/routers/admin.py
Admin-only endpoints: stats overview, audit log viewer, user list.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas
from routers.auth import require_admin

router = APIRouter()


@router.get("/stats", response_model=schemas.AdminStats)
def admin_stats(
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Dashboard stats for the Doctor/Admin view."""
    return crud.get_admin_stats(db)


@router.get("/audit-logs", response_model=list[schemas.AuditLogOut])
def audit_logs(
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Full audit log — admin only."""
    return crud.get_audit_logs(db, limit=limit, offset=offset)


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """List all registered accounts — admin only."""
    return crud.get_all_users(db)
