# FIX PROMPT — Replace "Quantum-alone vs Classical-alone" with ONE Hybrid Model

## What's wrong right now

The prototype currently runs **two separate, competing classifiers** and
shows two percentages ("Quantum VQC Risk" / "Classical SVM Risk"). That's
wrong for this PS. The quantum circuit was built to make its **own**
final prediction directly, instead of feeding a classical classifier —
so it became a second rival model instead of part of one hybrid pipeline.

## The fix — quantum becomes a feature-transformer, feeding ONE classifier

Change the pipeline from two parallel models to **one sequential hybrid
pipeline**:

```
BEFORE (wrong):
  PCA features -> Quantum Circuit -> own prediction  ─┐
  PCA features -> Classical SVM   -> own prediction  ─┴─> shown as 2 rival scores

AFTER (correct):
  PCA features -> Quantum Feature Map -> quantum-transformed features
                                              |
                                              v
                                  Classical Classifier (SVM/LogReg)
                                              |
                                              v
                                  ONE final risk score  <-- "Hybrid Model"
```

## Exact changes to make in `app/quantum_model.py`

1. **Remove** the current `QuantumClassifier` class's own prediction logic
   (the `expval(PauliZ(0)) -> sigmoid -> probability` readout that makes
   the circuit output a final answer by itself).

2. **Replace it with a `QuantumFeatureMap` class** that only *transforms*
   data, does not predict:
   - Same circuit structure as before is fine: `qml.AngleEmbedding`
     (rotation="Y") + a couple of `qml.StronglyEntanglingLayers`, on
     `default.qubit`, 4 qubits (matches the 4 PCA components).
   - Use **fixed (untrained) circuit weights** — seeded once, not learned
     via gradient descent. This matches how real quantum feature maps
     (e.g. Qiskit's `ZFeatureMap`) work in the literature — the circuit's
     job is to re-express the data in a new space, not to learn a
     boundary itself.
   - `.transform(X)` method: for each input row, measure
     `expval(qml.PauliZ(i))` on **every qubit `i`** (not just qubit 0),
     returning one new number per qubit. So 4 PCA features in -> 4
     quantum-transformed features out.

3. **In `train.py`**, replace the current quantum-classifier training step
   with:
   ```python
   from xgboost import XGBClassifier

   qfm = QuantumFeatureMap(n_qubits=4)
   X_train_q = qfm.transform(X_train_pca)      # quantum-transformed features
   X_test_q  = qfm.transform(X_test_pca)

   hybrid_model = XGBClassifier(
       n_estimators=150, max_depth=3, learning_rate=0.1,
       eval_metric="logloss", random_state=42
   )
   hybrid_model.fit(X_train_q, y_train)         # THIS is the one hybrid model
   ```
   Evaluate `hybrid_model` the same way as before (accuracy/precision/
   recall/F1/ROC-AUC) and print/save its metrics.

   **Why XGBoost here specifically:** it's the strongest realistic
   classifier for small tabular medical data (see chat history's full
   algorithm ranking) — the hybrid pipeline is the "show your best result"
   side of the comparison, so it should use the best classifier available.

4. **Keep the existing classical-only baseline exactly as-is** — same
   algorithm as before (`SVC(kernel="rbf", probability=True)`), trained
   directly on the PCA features, **no quantum step, and NOT XGBoost.**

   **Why the baseline must stay SVM, not also switch to XGBoost:** the
   baseline's whole purpose is a *controlled, isolated comparison* — same
   classifier algorithm as the quantum path's classical cousin, so the
   only variable that changes between "baseline" and "hybrid" is the
   quantum feature transformation, not also a different algorithm. RBF-SVM
   is specifically the closest classical analog to a Quantum SVM approach.
   If both sides used XGBoost, a difference in scores could partly just be
   "XGBoost strategy" rather than "quantum vs. not" — mixing two variables
   into one comparison, which defeats the point of having a baseline at
   all. Do not "upgrade" the baseline to XGBoost even if it would score
   higher; that is a deliberate, deliberate asymmetry, not an oversight.

## New dependency

Add to `requirements.txt`: `xgboost>=2.0`

## Exact changes to make in `app/api.py`

- Remove the standalone quantum-model loading/prediction code
  (`quantum_weights.json` / `QuantumClassifier.from_params_dict`).
- Load the new hybrid pipeline instead: `qfm` (fixed, no weights file
  needed since it's untrained — just re-instantiate with the same
  seed) + `hybrid_model.joblib` (the trained classical classifier on
  quantum-transformed features).
- `POST /predict` response should now return:
  - `hybrid_risk_score` / `hybrid_label` — **the one combined quantum+ML
    prediction** (replaces `quantum_risk_score`)
  - `classical_baseline_score` / `classical_label` — unchanged, still the
    no-quantum comparison
  - keep `models_agree`, `top_contributions` (SHAP now explains the
    hybrid pipeline instead of the old standalone quantum model), and the
    `note` field, all as before.

## Frontend label changes

- "Quantum VQC Risk" -> **"Hybrid Quantum+ML Risk"**
- "Classical SVM Risk" -> stays as-is ("Classical SVM Risk" / "Classical
  Baseline")
- Remove the fake "Classical ML / Quantum Model / Hybrid Model" 3-box
  accuracy panel entirely (those were hardcoded placeholder numbers) —
  replace with just 2 real numbers pulled from `metrics.json`: Classical
  Baseline accuracy vs. Hybrid Model accuracy.

## Do NOT change

- The 6 input features, PCA-to-4 preprocessing, dataset, sample-patient
  endpoint, SHAP usage, or any other part of the architecture. This is a
  targeted fix to the model layer only — don't restructure anything else.

## Verify when done

- [ ] API returns exactly 2 scores per prediction, not 3, and neither is
      labeled "Quantum" as a standalone rival to "Classical" anymore.
- [ ] The hybrid model is trained with **XGBoost**, and the baseline is
      still trained with **RBF-SVM** — confirm these were not swapped or
      both changed to the same algorithm.
- [ ] `hybrid_model` metrics are real numbers from an actual test-set run,
      printed by `train.py`, not hardcoded anywhere in the frontend.
- [ ] SHAP explanation still runs without errors against the new hybrid
      pipeline function (SHAP's `KernelExplainer` works fine on XGBoost's
      `predict_proba`, no special handling needed).
