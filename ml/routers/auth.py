"""
ml/routers/auth.py
Authentication endpoints: register, login, me.
Replaces the localStorage-based auth in App.jsx with real bcrypt + JWT.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database.connection import get_db
from database import crud, schemas

router = APIRouter()

# ---------------------------------------------------------------------------
# Security config
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv("SECRET_KEY", "qureml-dev-secret-key-change-in-prod-32chars")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt verification."""
    try:
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """bcrypt hash with work factor 12."""
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt(rounds=12)).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    FastAPI dependency — decodes JWT, fetches user from DB.
    Raises 401 on any failure (missing, expired, tampered, unknown user).
    """
    creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise creds_exc
    except JWTError:
        raise creds_exc

    user = crud.get_user_by_id(db, user_id=int(user_id))
    if user is None:
        raise creds_exc
    return user


def require_admin(current_user=Depends(get_current_user)):
    """Dependency that raises 403 if the caller is not an admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def register(req: schemas.UserRegister, db: Session = Depends(get_db)):
    """Register a new account. Returns a JWT immediately so the UI can log in."""
    # Check for duplicate username within the same role
    existing = crud.get_user_by_username(db, username=req.username, role=req.role)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{req.username}' is already registered in the {req.role} portal.",
        )

    hashed = get_password_hash(req.password)
    user = crud.create_user(
        db,
        username=req.username,
        email=req.email,
        password_hash=hashed,
        role=req.role,
    )

    # Log the registration event
    crud.create_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action=f"Account registered ({user.account_id})",
    )

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return schemas.Token(
        access_token=token,
        token_type="bearer",
        account_id=user.account_id,
        username=user.username,
        role=user.role,
    )


@router.post("/login", response_model=schemas.Token)
def login(req: schemas.UserLogin, db: Session = Depends(get_db)):
    """Login with username + password + role. Returns a signed JWT."""
    user = crud.get_user_by_username(db, username=req.username, role=req.role)
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Audit log for login
    crud.create_audit_log(
        db,
        user_id=user.id,
        username=user.username,
        action=f"User logged in ({user.role} portal)",
    )

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return schemas.Token(
        access_token=token,
        token_type="bearer",
        account_id=user.account_id,
        username=user.username,
        role=user.role,
    )


@router.get("/me", response_model=schemas.UserOut)
def me(current_user=Depends(get_current_user)):
    """Returns the profile of the currently authenticated user."""
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    req: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Change the current user's password.
    Requires the current (migration) password for verification before setting a new one.
    This is how migrated accounts move from their one-time migration credential
    to a personal password without any plaintext being stored or logged.
    """
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )
    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be at least 8 characters.",
        )
    new_hash = get_password_hash(req.new_password)
    current_user.password_hash = new_hash
    db.add(current_user)
    db.commit()

    crud.create_audit_log(
        db,
        user_id=current_user.id,
        username=current_user.username,
        action="Password changed",
    )
