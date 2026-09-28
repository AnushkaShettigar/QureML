# QRISK-Console Architecture

QRISK-Console is a hybrid quantum-classical web application designed to demonstrate the feasibility of Variational Quantum Classifiers (VQC) in clinical diagnostic contexts, specifically for breast cancer screening using the WDBC dataset.

## System Components

1.  **Frontend (React/Vite)**
    *   `src/App.jsx`: The main user interface. Provides patient screening, clinical dashboard, and patient history views.
    *   Fetches real-time prediction scores, top clinical drivers (via SHAP), and classical baseline comparisons from the backend.
    *   Allows loading pre-selected WDBC patient samples to test the model dynamically.

2.  **Backend API (FastAPI)**
    *   `ml/api.py`: A lightweight Python web server exposing `/predict`, `/features`, and `/sample-patients` endpoints.
    *   On startup, loads pre-trained artifacts (PCA, standard scaler, VQC weights, classical baseline, and SHAP background data) so inference is near-instant.
    *   Calculates SHAP values dynamically via KernelExplainer.

3.  **Machine Learning Pipeline (PennyLane + Scikit-Learn)**
    *   **Data Preparation (`pca_analysis.py`)**: Selects 6 critical features from the WDBC dataset based on variance and diagnostic relevance. Reduces the dimensionality from 6 to 4 components using Principal Component Analysis (PCA) to map directly onto a 4-qubit quantum circuit.
    *   **Quantum Model (`quantum_risk_model.py`)**: 
        *   Implements an `AngleEmbedding` using $R_y$ rotations to encode the 4 PCA components into 4 qubits.
        *   Uses PennyLane's `StronglyEntanglingLayers` (3 layers) as the parameterized quantum circuit (ansatz).
        *   Measures the expectation value of `PauliZ` on the first wire, applying a numerically stable sigmoid to produce a binary classification probability.
    *   **Training & Execution (`train_and_save.py`)**: Trains both the VQC (using Mini-batch Adam) and a classical `SVC` (Radial Basis Function kernel) baseline on the identical PCA-encoded data.
    *   **Honest Benchmarking**: Both the quantum model and the classical baseline output probabilities for each patient, presented side-by-side on the frontend to allow clinicians to transparently compare hybrid quantum performance to traditional ML approaches.

## Data Flow

1. User enters 6 clinical biomarkers (or selects a sample patient).
2. Frontend sends JSON payload to `POST /predict`.
3. Backend scales the 6 features using the saved `StandardScaler` and projects to 4 dimensions via the saved `PCA`.
4. The 4 components are scaled by $\pi$ to serve as angles.
5. VQC predicts risk score via PennyLane's `default.qubit` simulator.
6. SVM predicts baseline score.
7. SHAP explains the VQC decision.
8. API returns both scores, accuracy metrics, and top SHAP drivers to the frontend.
