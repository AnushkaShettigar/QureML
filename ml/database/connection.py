"""
ml/database/connection.py
SQLAlchemy engine, session factory, and dependency for FastAPI.
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://qureml:qureml_secret@localhost:5432/quremldb"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,        # detect stale connections automatically
    pool_size=5,
    max_overflow=10,
    echo=False,                # set True for SQL debug output
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a DB session and ensures it is closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_connection() -> bool:
    """Run SELECT 1 to confirm the DB is reachable. Returns True/False."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        print(f"[DB] Connection verification failed: {exc}")
        return False
