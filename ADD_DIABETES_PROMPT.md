# EXTENSION PROMPT — Add Diabetes as a Second Disease + Disease Selector

## ⚠️ First, a citation correction

An earlier reference — **"Hybrid Quantum ML for Medical Data Classification,"
arXiv:2109.03131** — could not be verified. That arXiv ID does not resolve
to a paper with that title. **Do not cite this in the deck or code
comments.** If a verified reference is needed for the diabetes work, use:
**"Quantum Machine Learning Applied to the Classification of Diabetes,"
arXiv:2301.00109** (real, verified) — cite it as *relevant literature*,
not as proof that quantum outperforms classical on this dataset. We do
not know that yet; that's what this extension is for finding out honestly.

## Goal

Add a **second disease pipeline (diabetes)** alongside the existing,
working breast-cancer pipeline, with a **disease-type selector** so the
same app supports both — without modifying, breaking, or retraining
anything in the existing breast-cancer code path.

## Dataset

**Pima Indians Diabetes Dataset** — 768 patients, 8 features, binary
outcome (diabetic / not). Chosen deliberately because it's **messier**
than WDBC in a specific, well-documented way: several columns use `0` to
silently mean "missing value" (Glucose, BloodPressure, SkinThickness,
Insulin, BMI physically cannot be zero in a real patient) — this is a
genuine real-world data-quality problem that WDBC doesn't have, making it
a fairer test of whether the quantum feature map helps more when the
input data isn't already clean.

Load it via:
```python
import pandas as pd
url = "https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.data.csv"
names = ["pregnancies", "glucose", "blood_pressure", "skin_thickness",
         "insulin", "bmi", "diabetes_pedigree", "age", "outcome"]
df = pd.read_csv(url, names=names)
```

**Preprocessing note (do this — it's the whole point of picking this
dataset):** before scaling, replace `0` with `NaN` in the columns
`glucose, blood_pressure, skin_thickness, insulin, bmi` (zero is not a
valid physiological value in any of these), then impute with the
**median computed on the training split only** (not the full dataset —
avoids leaking test-set information). Do NOT skip this step; if you skip
it, you've just quietly kept the "messiness" that was the reason to
choose this dataset in the first place, but you also won't be able to
say you correctly handled it.

## Feature selection (pick 6, same reasoning pattern as breast cancer)

Use all 8 features if straightforward, but if trimming to match the
breast-cancer UX pattern (a short form, not all raw columns), a
reasonable 6 based on standard diabetes-risk literature:
`glucose, bmi, age, diabetes_pedigree, blood_pressure, insulin`
(pregnancies and skin_thickness are the two weakest/least standard
predictors here — fine to drop for a shorter form).

## Required structure — DO NOT touch the existing breast_cancer code

```
models/
├── breast_cancer/        <-- existing, UNCHANGED, do not retrain or edit
│   └── ...
└── diabetes/              <-- NEW
    ├── scaler.joblib
    ├── pca.joblib
    ├── classical_baseline.joblib   (RBF-SVM, same role as breast cancer's)
    ├── hybrid_model.joblib          (XGBoost on quantum-transformed features)
    ├── quantum_feature_map.json
    ├── sample_patients.json
    └── metrics.json

app/
├── diseases.py            <-- NEW: a registry, see below
├── pipeline.py             <-- MODIFY: make it take a disease key instead
│                                of being breast-cancer-only (see below)
├── quantum_model.py         <-- UNCHANGED: same QuantumFeatureMap class,
│                                reused as-is for diabetes too
└── api.py                   <-- MODIFY: add disease_type everywhere (see below)
```

### `app/diseases.py` — new file, the registry

```python
DISEASES = {
    "breast_cancer": {
        "label": "Breast Cancer",
        "features": ["worst concave points", "mean concave points", "worst radius",
                     "worst perimeter", "mean area", "mean texture"],
        "n_qubits": 4,
        "models_dir": "models/breast_cancer",
    },
    "diabetes": {
        "label": "Diabetes",
        "features": ["glucose", "bmi", "age", "diabetes_pedigree",
                      "blood_pressure", "insulin"],
        "n_qubits": 4,
        "models_dir": "models/diabetes",
    },
}
```

### `app/pipeline.py` — generalize, don't duplicate

Turn the current breast-cancer-only `load_dataset()` into
`load_dataset(disease_key)` that dispatches to the right loader
(existing WDBC loader for `"breast_cancer"`, the new Pima loader for
`"diabetes"`). The existing breast-cancer loading logic should be moved
into its own function unchanged, just called conditionally now.

### `train.py` — add a `--disease` argument

```
python train.py --disease breast_cancer   # re-runs existing pipeline, unchanged result
python train.py --disease diabetes         # trains the new pipeline
```

Both must print the same honest side-by-side metrics table format as the
existing script. Do not let the diabetes run overwrite or touch anything
under `models/breast_cancer/`.

### `app/api.py` — add `disease_type` everywhere

- `GET /diseases` — **new endpoint**, returns the `DISEASES` registry
  (so the frontend can build the dropdown dynamically instead of
  hardcoding disease names).
- `GET /features?disease_type=diabetes` — same endpoint as before, now
  takes a query param.
- `GET /sample-patients?disease_type=diabetes` — same.
- `POST /predict` — request body becomes
  `{"disease_type": "diabetes", "features": {...}}`. Look up the right
  models directory from the registry, load (or use a cached/preloaded)
  scaler/PCA/classical/hybrid model for that disease, and run the exact
  same prediction logic already built for breast cancer — don't write a
  second, separate prediction function; reuse the same one,
  parameterized by disease.

**Loading strategy:** load all diseases' artifacts once at API startup
into a dict keyed by disease name (`{"breast_cancer": {...}, "diabetes":
{...}}`), not per-request — same performance principle as the original
build.

## Frontend changes

- Add a **"Disease Type"** dropdown at the top of the form (Breast Cancer
  / Diabetes), calling `GET /diseases` to populate it.
- Switching it must swap: which 6 fields render (call `GET
  /features?disease_type=...`), which sample-patient list shows, and
  which `disease_type` gets sent on submit.
- Everything else (the Diagnostic Output panel, the pipeline flow
  diagram, the SHAP bar chart) stays the same UI, just re-populated with
  whichever disease's response came back.

## Diabetes form inputs (frontend) and how the API must treat them

Ranges and defaults below were computed from the real dataset (fake zeros
treated as missing). Slider min/max = observed min/max; default = median.

| Field (API key) | Label shown to user | Unit | Range | Default |
|---|---|---|---|---|
| `glucose` | 2-hour glucose (after glucose tolerance test) | mg/dL | 44–199 | 117 |
| `bmi` | BMI | kg/m² | 18–67 | 32.3 |
| `age` | Age | years | 21–81 | 29 |
| `blood_pressure` | Diastolic blood pressure | mmHg | 24–122 | 72 |
| `insulin` | 2-hour serum insulin (optional) | µU/ml | 14–846 | 125 |
| `diabetes_pedigree` | Family history of diabetes | dropdown | see below | 0.37 |

- **Glucose label matters.** The dataset value is 2-hour glucose from an
  oral glucose tolerance test, NOT fasting glucose. Use the label above so
  users don't enter a fasting value (typically 70–100), which would sit at
  the bottom of the training range and skew the result.
- **BMI:** ask for height (cm) and weight (kg) and compute BMI in the
  frontend, then send `bmi`.
- **Insulin is optional.** 49% of training rows had 0 (= missing) for it
  and it is not a routine test. If the user leaves it blank, send `null`
  (or omit it).
- **Family history is a dropdown, not a number.** `diabetes_pedigree` is a
  computed score, not a measurement. Map the choices to real values from
  the data: "No known family history" -> 0.24 (25th percentile),
  "One relative with diabetes" -> 0.37 (median), "Multiple close relatives"
  -> 0.63 (75th percentile). This mapping is our own demo approximation,
  not a clinical scale — say so in a tooltip.
- Add a visible note: this model was trained on female patients aged 21+
  and is not meant for men or children.
- Keep the "Load sample patient" dropdown as the primary demo path.

**API behavior for diabetes (differs from breast cancer):**
- `POST /predict` with `disease_type: "diabetes"` must accept `insulin` as
  `null`/missing and fill it with the **training-set median**. Save that
  median at train time (e.g. `models/diabetes/train_medians.json`) and
  reuse it at inference — do not recompute it per request.
- Every other diabetes feature is still required (422 if missing).
- Add `imputed_features: ["insulin"]` to the response when imputation
  happened, and show "estimated from dataset median" next to that field
  in the UI.
- Breast cancer behavior is unchanged: all 6 features required.

## Explicitly do NOT do

- Do not retrain, re-save, or modify anything under `models/breast_cancer/`.
- Do not change `QuantumFeatureMap`'s circuit structure — reuse it as-is
  for diabetes (same 4-qubit, fixed-weight design).
- Do not claim in any UI text or comments that quantum "wins" on
  diabetes before you've actually run `train.py --disease diabetes` and
  looked at the real printed numbers. Report whatever the real result is,
  same honesty rule as the breast-cancer side.
- Do not cite arXiv:2109.03131 (unverified, see top of this file).

## Verify when done

- [ ] `python train.py --disease breast_cancer` still produces the exact
      same metrics as before (proves nothing broke).
- [ ] `python train.py --disease diabetes` runs end-to-end and prints a
      real side-by-side classical-vs-hybrid table for diabetes.
- [ ] `GET /diseases` returns both entries.
- [ ] Switching the frontend dropdown correctly swaps form fields and
      sample patients for both diseases.
- [ ] `POST /predict` works correctly for both `disease_type` values
      without needing two different endpoints.
- [ ] Diabetes `POST /predict` with `insulin` left out returns a normal
      prediction plus `imputed_features: ["insulin"]`; leaving out any other
      diabetes feature still returns a 422.
