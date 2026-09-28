# QRISK Machine Learning Pipeline

This folder contains the hybrid quantum-classical machine learning pipeline used by the QRISK-Console application.

## Pipeline Overview

1. **Dataset**: Uses the [Wisconsin Diagnostic Breast Cancer (WDBC)](https://archive.ics.uci.edu/dataset/17/breast+cancer+wisconsin+diagnostic) dataset.
2. **Feature Engineering**: Selects 6 critical clinical features (`Worst Concave Points`, `Mean Concave Points`, `Worst Radius`, `Worst Perimeter`, `Mean Area`, `Mean Texture`).
3. **Dimensionality Reduction**: Projects the 6 scaled features down to 4 Principal Components (PCA).
4. **Quantum VQC**:
    - **Encoding**: 4 PCA components are scaled and encoded via `AngleEmbedding(rotation="Y")` into 4 qubits.
    - **Ansatz**: Uses PennyLane's `StronglyEntanglingLayers` (3 layers).
    - **Measurement**: Expected value of `PauliZ` on wire 0, mapped via sigmoid to a probability.
5. **Classical Baseline**: Trains an `SVC(kernel="rbf")` on the exact same 4 PCA components for honest side-by-side benchmarking.
6. **Explainability**: Computes top clinical drivers using `shap.KernelExplainer`.

## Running the Pipeline

Before starting the backend API, you must train the model once to generate the required artifacts.

```bash
cd ml
pip install -r requirements.txt
python train_and_save.py
python generate_samples.py
```

This will produce the `artifacts/` folder, which contains:
- `vqc_weights.npy`: Optimized parameters for the quantum circuit.
- `classical_baseline.joblib`: The SVM baseline model.
- `pca.pkl` / `scaler.pkl`: Preprocessing state.
- `background.npy`: Representative sample for SHAP.
- `sample_patients.json`: Pre-selected patient samples for the frontend demo.

## Starting the API

Once artifacts are generated, run the FastAPI server:

```bash
uvicorn api:app --reload
```
