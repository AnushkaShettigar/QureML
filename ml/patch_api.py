"""One-off patch: lets api.py serve the v2 hybrid (PCA + quantum inputs). Safe to run twice."""
from pathlib import Path

p = Path(__file__).parent / "api.py"
with open(p, encoding="utf-8", newline="") as f:
    src = f.read()
nl = "\r\n" if "\r\n" in src else "\n"

if 'hybrid_input' in src:
    print("api.py already patched, nothing to do")
    raise SystemExit

old1 = "    hybrid_proba = float(hybrid_model.predict_proba(q_features)[0, 1])"
new1 = nl.join([
    "    # v2 hybrid reads PCA angles + quantum outputs; the old one read quantum outputs only",
    '    if meta.get("hybrid_input") == "pca+quantum":',
    "        h_input = np.hstack([angles_2d, q_features])",
    "    else:",
    "        h_input = q_features",
    "    hybrid_proba = float(hybrid_model.predict_proba(h_input)[0, 1])",
])
old2 = "    shap_values = explainer.shap_values(q_features, nsamples=60)[0]"
new2 = nl.join([
    "    shap_values = explainer.shap_values(h_input, nsamples=60)[0]",
    '    n_comp = len(meta["component_cols"])',
    "    if len(shap_values) == 2 * n_comp:",
    "        # fold each PCA angle's SHAP value together with its quantum output's",
    "        shap_values = shap_values[:n_comp] + shap_values[n_comp:]",
])
for old in (old1, old2):
    if src.count(old) != 1:
        raise SystemExit(f"could not find the expected line in api.py:\n{old}")
with open(p, "w", encoding="utf-8", newline="") as f:
    f.write(src.replace(old1, new1).replace(old2, new2))
print("api.py patched")
