"""
ml/test_integration.py
Full end-to-end PostgreSQL integration test for QureML.
Run: python test_integration.py
Requires: API running at http://localhost:8000 and PostgreSQL healthy.
"""
import sys
import json
import time
import random
import string
from datetime import datetime

try:
    import requests
except ImportError:
    print("Installing requests...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

try:
    import sqlalchemy
    from sqlalchemy import create_engine, text
    SQLALCHEMY_AVAILABLE = True
except ImportError:
    SQLALCHEMY_AVAILABLE = False

BASE = "http://localhost:8000"
DB_URL = "postgresql://qureml:qureml_secret@localhost:5432/quremldb"

# ─── Result tracker ───────────────────────────────────────────────────────────
results = {}

def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results[name] = {"status": status, "detail": detail}
    icon = "✅" if passed else "❌"
    print(f"  {icon} [{status}] {name}: {detail}")


def rnd_suffix():
    return "".join(random.choices(string.ascii_lowercase, k=6))


# ─── 1. PostgreSQL direct connectivity ───────────────────────────────────────
print("\n━━━ 1. PostgreSQL Direct Connectivity ━━━")

if SQLALCHEMY_AVAILABLE:
    try:
        engine = create_engine(DB_URL, pool_pre_ping=True)
        with engine.connect() as conn:
            row = conn.execute(text("SELECT 1 AS ok")).fetchone()
        record("PostgreSQL SELECT 1", row[0] == 1, f"returned {row[0]}")
    except Exception as e:
        record("PostgreSQL SELECT 1", False, str(e))

    # Verify tables exist
    try:
        with engine.connect() as conn:
            tables = conn.execute(text("""
                SELECT tablename FROM pg_tables
                WHERE schemaname='public'
                ORDER BY tablename
            """)).fetchall()
            table_names = [r[0] for r in tables]
        required = {"users", "predictions", "prediction_inputs", "shap_explanations", "audit_logs"}
        missing = required - set(table_names)
        record("Tables exist", len(missing) == 0,
               f"found={table_names}" if not missing else f"MISSING: {missing}")
    except Exception as e:
        record("Tables exist", False, str(e))
else:
    record("PostgreSQL SELECT 1", False, "sqlalchemy not installed in test env")
    record("Tables exist", False, "sqlalchemy not installed in test env")


# ─── 2. FastAPI health ────────────────────────────────────────────────────────
print("\n━━━ 2. FastAPI Health ━━━")

try:
    r = requests.get(f"{BASE}/health", timeout=5)
    data = r.json()
    record("FastAPI /health", r.status_code == 200, json.dumps(data))
except Exception as e:
    record("FastAPI /health", False, str(e))
    print("  ⚠️  FastAPI is not running. Start it with: cd ml && uvicorn api:app --reload --port 8000")
    sys.exit(1)


# ─── 3. Auth — User registration & login ─────────────────────────────────────
print("\n━━━ 3. Authentication ━━━")

suffix_a = rnd_suffix()
suffix_b = rnd_suffix()
suffix_adm = rnd_suffix()

USER_A = {"username": f"user_a_{suffix_a}", "email": f"user_a_{suffix_a}@test.local",
          "password": "TestPass123!", "role": "user"}
USER_B = {"username": f"user_b_{suffix_b}", "email": f"user_b_{suffix_b}@test.local",
          "password": "TestPass456!", "role": "user"}
ADMIN_U = {"username": f"admin_{suffix_adm}", "email": f"admin_{suffix_adm}@test.local",
           "password": "AdminPass789!", "role": "admin"}

token_a = token_b = token_admin = None

for label, user_data in [("User A", USER_A), ("User B", USER_B), ("Admin", ADMIN_U)]:
    try:
        r = requests.post(f"{BASE}/auth/register", json=user_data, timeout=5)
        ok = r.status_code == 201
        body = r.json()
        record(f"Register {label}", ok,
               f"account_id={body.get('account_id')} role={body.get('role')}" if ok else str(body))
        if label == "User A" and ok:
            token_a = body["access_token"]
        elif label == "User B" and ok:
            token_b = body["access_token"]
        elif label == "Admin" and ok:
            token_admin = body["access_token"]
    except Exception as e:
        record(f"Register {label}", False, str(e))

# Verify bcrypt hash in DB
if SQLALCHEMY_AVAILABLE:
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT password_hash FROM users WHERE username=:u AND role='user'"),
                {"u": USER_A["username"]}
            ).fetchone()
        if row:
            is_bcrypt = row[0].startswith("$2b$") or row[0].startswith("$2a$")
            record("Password stored as bcrypt", is_bcrypt, f"hash_prefix={row[0][:10]}…")
        else:
            record("Password stored as bcrypt", False, "user not found in DB")
    except Exception as e:
        record("Password stored as bcrypt", False, str(e))

# Login test
for label, user_data, tok_var in [
    ("User A", USER_A, "a"), ("User B", USER_B, "b"), ("Admin", ADMIN_U, "admin")
]:
    try:
        r = requests.post(f"{BASE}/auth/login",
                          json={"username": user_data["username"],
                                "password": user_data["password"],
                                "role": user_data["role"]}, timeout=5)
        ok = r.status_code == 200
        body = r.json()
        record(f"Login {label}", ok,
               f"token={'present' if body.get('access_token') else 'MISSING'}" if ok else str(body))
        if ok:
            if tok_var == "a":
                token_a = body["access_token"]
            elif tok_var == "b":
                token_b = body["access_token"]
            else:
                token_admin = body["access_token"]
    except Exception as e:
        record(f"Login {label}", False, str(e))

# /auth/me
for label, token, expected_role in [("User A", token_a, "user"), ("Admin", token_admin, "admin")]:
    if not token:
        record(f"/auth/me {label}", False, "no token")
        continue
    try:
        r = requests.get(f"{BASE}/auth/me",
                         headers={"Authorization": f"Bearer {token}"}, timeout=5)
        ok = r.status_code == 200 and r.json().get("role") == expected_role
        record(f"/auth/me {label}", ok, f"role={r.json().get('role')}")
    except Exception as e:
        record(f"/auth/me {label}", False, str(e))


# ─── 4. Prediction save (User A) ─────────────────────────────────────────────
print("\n━━━ 4. Prediction Save ━━━")

PRED_PAYLOAD = {
    "patient_name": "Test Patient Alpha",
    "disease_type": "breast_cancer",
    "hybrid_risk_score": 73,
    "hybrid_probability": 0.7341,
    "hybrid_label": "Malignant",
    "classical_risk_score": 68,
    "classical_probability": 0.6823,
    "classical_label": "Malignant",
    "models_agree": True,
    "priority": "High",
    "survival_rate": "76%",
    "hybrid_test_accuracy": 0.9440,
    "classical_test_accuracy": 0.9230,
    "imputed_features": [],
    "inputs": {
        "worst_concave_points": 0.1471,
        "mean_concave_points": 0.0869,
        "worst_radius": 25.38,
        "worst_perimeter": 184.6,
        "mean_area": 1001.0,
        "mean_texture": 10.38
    },
    "shap_explanation": [
        {"component": "PC1", "impact": 0.2345, "direction": "raises risk",
         "related_features": ["Worst Concave Points", "Worst Radius"]},
        {"component": "PC2", "impact": -0.1234, "direction": "lowers risk",
         "related_features": ["Mean Area", "Mean Texture"]},
        {"component": "PC3", "impact": 0.0987, "direction": "raises risk",
         "related_features": ["Worst Perimeter", "Mean Concave Points"]},
        {"component": "PC4", "impact": -0.0432, "direction": "lowers risk",
         "related_features": ["Worst Concave Points", "Worst Perimeter"]},
    ]
}

pred_id_a = None

if token_a:
    try:
        r = requests.post(f"{BASE}/predictions",
                          json=PRED_PAYLOAD,
                          headers={"Authorization": f"Bearer {token_a}"},
                          timeout=10)
        ok = r.status_code == 201
        body = r.json() if ok else {}
        pred_id_a = body.get("id")
        record("Save prediction (User A)", ok,
               f"id={pred_id_a} record_id={body.get('record_id')}" if ok else str(r.text))
    except Exception as e:
        record("Save prediction (User A)", False, str(e))
else:
    record("Save prediction (User A)", False, "no token_a")

# Verify prediction_inputs stored
if SQLALCHEMY_AVAILABLE and pred_id_a:
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT feature_name, feature_value FROM prediction_inputs WHERE prediction_id=:pid"),
                {"pid": pred_id_a}
            ).fetchall()
        record("prediction_inputs stored", len(rows) == 6,
               f"{len(rows)} features: {[r[0] for r in rows]}")
    except Exception as e:
        record("prediction_inputs stored", False, str(e))
else:
    record("prediction_inputs stored", False, "no pred_id or sqlalchemy unavailable")

# Verify shap_explanations stored
if SQLALCHEMY_AVAILABLE and pred_id_a:
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT component_name, impact, direction FROM shap_explanations WHERE prediction_id=:pid ORDER BY rank_order"),
                {"pid": pred_id_a}
            ).fetchall()
        record("shap_explanations stored", len(rows) == 4,
               f"{len(rows)} components: {[r[0] for r in rows]}")
    except Exception as e:
        record("shap_explanations stored", False, str(e))
else:
    record("shap_explanations stored", False, "no pred_id or sqlalchemy unavailable")

# Verify user_id FK
if SQLALCHEMY_AVAILABLE and pred_id_a:
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT p.user_id, u.username FROM predictions p JOIN users u ON u.id=p.user_id WHERE p.id=:pid"),
                {"pid": pred_id_a}
            ).fetchone()
        record("Prediction user_id FK correct", row is not None and row[1] == USER_A["username"],
               f"user_id={row[0]} username={row[1]}" if row else "not found")
    except Exception as e:
        record("Prediction user_id FK correct", False, str(e))
else:
    record("Prediction user_id FK correct", False, "no pred_id or sqlalchemy unavailable")

# GET prediction back (no SHAP recompute)
if token_a and pred_id_a:
    try:
        r = requests.get(f"{BASE}/predictions/{pred_id_a}",
                         headers={"Authorization": f"Bearer {token_a}"}, timeout=5)
        ok = r.status_code == 200
        body = r.json() if ok else {}
        has_shap = len(body.get("shap_explanations", [])) == 4
        has_inputs = len(body.get("inputs", [])) == 6
        record("GET prediction from DB (no SHAP recompute)", ok and has_shap and has_inputs,
               f"shap_count={len(body.get('shap_explanations',[]))} inputs={len(body.get('inputs',[]))}" if ok else str(r.text))
    except Exception as e:
        record("GET prediction from DB (no SHAP recompute)", False, str(e))


# ─── 5. User isolation ───────────────────────────────────────────────────────
print("\n━━━ 5. User Isolation ━━━")

# Also save a prediction as User B
pred_id_b = None
PRED_B = {**PRED_PAYLOAD, "patient_name": "Test Patient Beta", "priority": "Low",
           "hybrid_risk_score": 22, "classical_risk_score": 18,
           "hybrid_label": "Benign", "classical_label": "Benign", "models_agree": True}

if token_b:
    try:
        r = requests.post(f"{BASE}/predictions", json=PRED_B,
                          headers={"Authorization": f"Bearer {token_b}"}, timeout=10)
        ok = r.status_code == 201
        pred_id_b = r.json().get("id") if ok else None
        record("Save prediction (User B)", ok, f"id={pred_id_b}")
    except Exception as e:
        record("Save prediction (User B)", False, str(e))

# User A lists predictions — should only see their own
if token_a:
    try:
        r = requests.get(f"{BASE}/predictions",
                         headers={"Authorization": f"Bearer {token_a}"}, timeout=5)
        preds = r.json()
        ids = [p["id"] for p in preds]
        sees_only_own = pred_id_b not in ids and (pred_id_a is None or pred_id_a in ids)
        record("User A list — sees only own", sees_only_own,
               f"ids_visible={ids}")
    except Exception as e:
        record("User A list — sees only own", False, str(e))

# User B cannot GET User A's prediction
if token_b and pred_id_a:
    try:
        r = requests.get(f"{BASE}/predictions/{pred_id_a}",
                         headers={"Authorization": f"Bearer {token_b}"}, timeout=5)
        record("User B blocked from User A's prediction", r.status_code == 403,
               f"status={r.status_code}")
    except Exception as e:
        record("User B blocked from User A's prediction", False, str(e))

# Admin sees all predictions
if token_admin:
    try:
        r = requests.get(f"{BASE}/predictions",
                         headers={"Authorization": f"Bearer {token_admin}"}, timeout=5)
        preds = r.json()
        ids = [p["id"] for p in preds]
        sees_a = pred_id_a in ids if pred_id_a else True
        sees_b = pred_id_b in ids if pred_id_b else True
        record("Admin sees all predictions", sees_a and sees_b,
               f"total={len(ids)} ids={ids[-5:]}")
    except Exception as e:
        record("Admin sees all predictions", False, str(e))

# Admin deletes User A's prediction
if token_admin and pred_id_a:
    try:
        r = requests.delete(f"{BASE}/predictions/{pred_id_a}",
                            headers={"Authorization": f"Bearer {token_admin}"}, timeout=5)
        record("Admin can delete prediction", r.status_code == 204,
               f"status={r.status_code}")
        # Verify cascade
        if SQLALCHEMY_AVAILABLE and r.status_code == 204:
            with engine.connect() as conn:
                cnt = conn.execute(
                    text("SELECT COUNT(*) FROM prediction_inputs WHERE prediction_id=:pid"),
                    {"pid": pred_id_a}
                ).scalar()
            record("Cascade delete (prediction_inputs removed)", cnt == 0,
                   f"remaining_inputs={cnt}")
    except Exception as e:
        record("Admin can delete prediction", False, str(e))

# Non-admin cannot use admin endpoint
if token_a:
    try:
        r = requests.get(f"{BASE}/admin/stats",
                         headers={"Authorization": f"Bearer {token_a}"}, timeout=5)
        record("Non-admin blocked from /admin/stats", r.status_code == 403,
               f"status={r.status_code}")
    except Exception as e:
        record("Non-admin blocked from /admin/stats", False, str(e))

# Admin can access /admin/stats
if token_admin:
    try:
        r = requests.get(f"{BASE}/admin/stats",
                         headers={"Authorization": f"Bearer {token_admin}"}, timeout=5)
        ok = r.status_code == 200
        record("Admin /admin/stats", ok, json.dumps(r.json()) if ok else str(r.text))
    except Exception as e:
        record("Admin /admin/stats", False, str(e))


# ─── 6. Audit logs ───────────────────────────────────────────────────────────
print("\n━━━ 6. Audit Logs ━━━")

if token_admin:
    try:
        r = requests.get(f"{BASE}/admin/audit-logs",
                         headers={"Authorization": f"Bearer {token_admin}"}, timeout=5)
        ok = r.status_code == 200
        logs = r.json() if ok else []
        # Should contain login + save + delete events
        actions = [l["action"] for l in logs]
        has_login = any("logged in" in a for a in actions)
        has_save = any("Patient Screening" in a for a in actions)
        has_delete = any("Deleted" in a for a in actions)
        record("Audit logs — login events", has_login, f"count={len(logs)}")
        record("Audit logs — save events", has_save, f"actions_sample={actions[:3]}")
        record("Audit logs — delete events", has_delete, f"delete_found={has_delete}")
    except Exception as e:
        record("Audit logs — login events", False, str(e))
        record("Audit logs — save events", False, str(e))
        record("Audit logs — delete events", False, str(e))


# ─── 7. Error handling ───────────────────────────────────────────────────────
print("\n━━━ 7. Error Handling ━━━")

# Invalid JWT
try:
    r = requests.get(f"{BASE}/predictions",
                     headers={"Authorization": "Bearer invalid.jwt.token"}, timeout=5)
    record("Invalid JWT → 401", r.status_code == 401, f"status={r.status_code}")
except Exception as e:
    record("Invalid JWT → 401", False, str(e))

# Expired JWT (manually crafted with exp=1)
try:
    from jose import jwt as jose_jwt
    expired_token = jose_jwt.encode(
        {"sub": "1", "role": "user", "exp": 1},  # exp=1 = already expired
        "qureml-dev-secret-key-change-in-prod-32chars",
        algorithm="HS256"
    )
    r = requests.get(f"{BASE}/predictions",
                     headers={"Authorization": f"Bearer {expired_token}"}, timeout=5)
    record("Expired JWT → 401", r.status_code == 401, f"status={r.status_code}")
except Exception as e:
    record("Expired JWT → 401", False, str(e))

# Wrong password → 401
try:
    r = requests.post(f"{BASE}/auth/login",
                      json={"username": USER_A["username"], "password": "WRONG", "role": "user"},
                      timeout=5)
    record("Wrong password → 401", r.status_code == 401, f"status={r.status_code}")
except Exception as e:
    record("Wrong password → 401", False, str(e))

# Duplicate registration → 409
try:
    r = requests.post(f"{BASE}/auth/register", json=USER_A, timeout=5)
    record("Duplicate register → 409", r.status_code == 409, f"status={r.status_code}")
except Exception as e:
    record("Duplicate register → 409", False, str(e))

# No token → 401
try:
    r = requests.get(f"{BASE}/predictions", timeout=5)
    record("No token → 401", r.status_code == 401, f"status={r.status_code}")
except Exception as e:
    record("No token → 401", False, str(e))


# ─── 8. /predict endpoint still works (ML pipeline unchanged) ────────────────
print("\n━━━ 8. Existing /predict endpoint ━━━")

try:
    r = requests.post(f"{BASE}/predict", json={
        "disease_type": "breast_cancer",
        "features": {
            "worst_concave_points": 0.1471,
            "mean_concave_points": 0.0869,
            "worst_radius": 25.38,
            "worst_perimeter": 184.6,
            "mean_area": 1001.0,
            "mean_texture": 10.38
        }
    }, timeout=30)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    has_score = "hybridRiskScore" in body
    has_shap  = "explanation" in body
    record("/predict still works (no auth required)", ok and has_score and has_shap,
           f"hybridScore={body.get('hybridRiskScore')} shap_len={len(body.get('explanation',[]))}" if ok else str(r.text))
except Exception as e:
    record("/predict still works (no auth required)", False, str(e))


# ─── Final Report ─────────────────────────────────────────────────────────────
print("\n" + "═" * 65)
print("  VERIFICATION REPORT")
print("═" * 65)
print(f"  {'Test':<45} {'Status':<6}  Details")
print("─" * 65)

passed = 0
failed = 0
for name, info in results.items():
    icon = "✅" if info["status"] == "PASS" else "❌"
    detail = info["detail"][:40] if len(info["detail"]) > 40 else info["detail"]
    print(f"  {icon} {name:<43} {info['status']:<6}  {detail}")
    if info["status"] == "PASS":
        passed += 1
    else:
        failed += 1

print("─" * 65)
print(f"  Total: {passed + failed}  ✅ PASS: {passed}  ❌ FAIL: {failed}")
print("═" * 65)

sys.exit(0 if failed == 0 else 1)
