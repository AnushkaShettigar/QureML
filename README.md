```markdown
# 🌸 QureML

> **Hybrid Quantum–Classical Clinical Risk Screening**  
> *A production-minded, explainable AI prototype exploring quantum feature representations for clinical risk assessment.*

---

## Overview

**QureML** is a hybrid quantum-classical machine learning screening prototype built to evaluate quantum feature transformations on structured medical data. By pairing a 4-qubit parameterized quantum circuit with classical gradient boosted trees (XGBoost) and SHAP feature attribution, QureML offers an end-to-end clinical workflow complete with transparent benchmarking against a pure classical baseline (RBF-SVM).

The application demonstrates how quantum transformations act as non-linear representation learners prior to classical classification, delivering predictions, feature importance, and model comparisons through an executive React dashboard backed by a FastAPI backend.

> ⚠️ **Clinical Notice**: QureML is a research and clinical screening demonstration tool. It is not a certified medical device and must not be used for primary diagnostic decision-making.

---

## Key Highlights

- **Hybrid Quantum Architecture**: Integrates PennyLane's 4-qubit quantum feature map (`RY` AngleEmbedding, strongly entangling layers) with an XGBoost classifier.
- **Isolated Classical Benchmarking**: Direct performance comparison against an RBF-SVM baseline trained on identical principal component representations.
- **Explainable Predictions**: Explains complex quantum representations using SHAP (KernelExplainer) mapped back to original clinical features.
- **Role-Based Web Dashboards**: Dual-perspective interfaces for Clinician Screening and System Administration (patient queues, audit logs, and threshold tuning).
- **Deterministic & Local**: Fully simulated via PennyLane's `default.qubit` state-vector simulator with fixed circuit weight seeds for zero-hardware reproducibility.

---

## Technical Architecture

```text
                               ┌─────────────────────────┐
                               │   Clinical Input (WDBC) │
                               │   6 Selected Features   │
                               └────────────┬────────────┘
                                            │
                                            ▼
                               ┌─────────────────────────┐
                               │     StandardScaler      │
                               └────────────┬────────────┘
                                            │
                                            ▼
                               ┌─────────────────────────┐
                               │      PCA Reduction      │
                               │    (6 → 4 Components)   │
                               └────────────┬────────────┘
                                            │
                       ┌────────────────────┴────────────────────┐
                       ▼                                         ▼
         ┌───────────────────────────┐             ┌───────────────────────────┐
         │    Quantum Feature Map    │             │    Classical Baseline     │
         │ (4 Qubits / PennyLane RY) │             │         (RBF-SVM)         │
         └─────────────┬─────────────┘             └─────────────┬─────────────┘
                       │                                         │
                       ▼                                         │
         ┌───────────────────────────┐                           │
         │    XGBoost Classifier     │                           │
         └─────────────┬─────────────┘                           │
                       │                                         │
                       └────────────────────┬────────────────────┘
                                            ▼
                               ┌─────────────────────────┐
                               │ Benchmark & ROC Metrics │
                               └────────────┬────────────┘
                                            │
                                            ▼
                               ┌─────────────────────────┐
                               │   SHAP Explainability   │
                               └────────────┬────────────┘
                                            │
                                            ▼
                               ┌─────────────────────────┐
                               │   React + Vite / REST   │
                               └─────────────────────────┘

```

---

## System Pipeline & Mathematical Framing

1. **Dimensionality Alignment**: Accepts 6 core features from the Wisconsin Diagnostic Breast Cancer (WDBC) dataset: *Worst Concave Points, Mean Concave Points, Worst Radius, Worst Perimeter, Mean Area,* and *Mean Texture*. Inputs are standardized ($\mu=0, \sigma=1$) and projected via PCA from $\mathbb{R}^6 \to \mathbb{R}^4$.
2. **Quantum Feature Transformation**:
* Component values map to rotation angles $\theta \in \mathbb{R}^4$ using `qml.AngleEmbedding` with $RY$ gates.
* Entanglement is applied via 3 `StronglyEntanglingLayers`.
* Feature outputs are generated by measuring Pauli-$Z$ expectation values $\langle Z_i \rangle$ across each qubit:

$$\mathbf{x}_{\text{quantum}} = \left[ \langle Z_0 \rangle, \langle Z_1 \rangle, \langle Z_2 \rangle, \langle Z_3 \rangle \right]$$




3. **Classification & Benchmarking**:
* **Hybrid Path**: $\mathbf{x}_{\text{quantum}} \to \text{XGBoost} \to P(\text{Malignant})$
* **Classical Path**: $\mathbf{x}_{\text{PCA}} \to \text{RBF-SVM} \to P(\text{Malignant})$


4. **SHAP Attribution**: Computes Shapley additive explanations over the quantum embedding space, projecting attribution weight back onto original clinical inputs for human readability.

---

## Stack & Artifacts

| Domain | Technologies |
| --- | --- |
| **Frontend** | React 18, Vite, JavaScript, Responsive UI (Light/Dark support) |
| **Backend** | Python 3.10+, FastAPI, Uvicorn, Pydantic |
| **ML & Quantum** | PennyLane, Scikit-learn, XGBoost, SHAP, NumPy, Pandas |
| **Storage / Artifacts** | Joblib (`.joblib`), Pickle (`.pkl`), NumPy matrices (`.npy`), JSON |

---

## Project Structure

```text
QureML/
├── ml/
│   ├── api.py                   # FastAPI application & REST endpoints
│   ├── train_and_save.py        # Model training, PCA fitting, & artifact exporter
│   ├── quantum_risk_model.py    # PennyLane 4-qubit circuit implementation
│   ├── pca_analysis.py          # Dimensionality reduction pipeline
│   └── artifacts/               # Serialized models, scalers, and metrics
│       ├── scaler.pkl
│       ├── pca.pkl
│       ├── hybrid_model.joblib
│       ├── classical_baseline.joblib
│       ├── background.npy
│       ├── meta.json
│       └── metrics.json
├── src/                         # React UI components & views
├── public/                      # Static assets
├── ARCHITECTURE.md              # Detailed architecture documentation
├── package.json
└── README.md

```

---

## Local Development & Deployment Guide

### Prerequisites

* **Node.js** v18+ and **npm**
* **Python** 3.10+ and **pip**

### Step 1: Clone Repository

```bash
git clone [https://github.com/AnushkaShettigar/QureML.git](https://github.com/AnushkaShettigar/QureML.git)
cd QureML

```

### Step 2: Set Up Python Backend & Train Artifacts

```bash
# Create and activate virtual environment
python -m venv .venv
# On Windows: .venv\Scripts\activate
# On Linux/macOS: source .venv/bin/activate

# Install requirements
pip install numpy pandas scikit-learn xgboost pennylane shap fastapi uvicorn joblib

# Execute model training & save artifact state
cd ml
python train_and_save.py

```

### Step 3: Run FastAPI Backend

```bash
# From the /ml directory
uvicorn api:app --reload --host 0.0.0.0 --port 8000

```

*API docs will be available at `http://localhost:8000/docs`.*

### Step 4: Launch Frontend

```bash
# In a new terminal window at project root
npm install
npm run dev

```

*Access the clinical dashboard interface at `http://localhost:5173`.*

---

## API Reference

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | `GET` | Health check and pipeline status verification. |
| `/features` | `GET` | Returns list of required WDBC clinical input features. |
| `/sample-patients` | `GET` | Fetches pre-configured test cases for immediate demo screening. |
| `/predict` | `POST` | Accepts 6 feature payload; returns hybrid risk score, baseline score, and SHAP attribution. |

---

## Model Evaluation Summary

The pipeline isolates the quantum stage by evaluating both models on an identical stratified test partition:

| Model | Pipeline Architecture | Tracked Metrics |
| --- | --- | --- |
| **Hybrid** | $\text{Input} \to \text{Scaler} \to \text{PCA} \to \text{Quantum Map} \to \text{XGBoost}$ | Accuracy, Precision, Recall, F1, ROC-AUC |
| **Classical** | $\text{Input} \to \text{Scaler} \to \text{PCA} \to \text{RBF-SVM}$ | Accuracy, Precision, Recall, F1, ROC-AUC |

*Metrics are auto-compiled to `ml/artifacts/metrics.json` upon running `train_and_save.py`.*

```

```
