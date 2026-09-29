# QureML: Hybrid Quantum–Classical Clinical Risk Screening

> **Quantum-enhanced representations. Classical intelligence. Human-readable explanations.**

QureML is a hybrid quantum-classical machine learning prototype designed for clinical risk screening. It integrates classical data preprocessing, a fixed quantum feature map, classical machine learning classification, and SHAP-based explainability into a complete, clinician-facing web application.

This project demonstrates how a small quantum circuit can serve as a feature transformer before a classical classifier, while strictly maintaining a classical baseline for transparent, one-to-one benchmarking.

**Disclaimer:** *QureML is a demonstration and screening-support prototype, not an FDA-approved medical diagnostic system. Predictions and risk scores should never be used as a substitute for qualified clinical assessment.*

---

## 📑 Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [How the Pipeline Works](#how-the-pipeline-works)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Model Evaluation & Limitations](#model-evaluation--limitations)
- [Future Scope](#future-scope)

---

## 🔍 Overview

Clinical datasets often contain highly correlated measurements, making it challenging to extract useful patterns while keeping a model interpretable. QureML explores a hybrid pipeline approach:

`Clinical Input → Preprocessing → PCA → Quantum Feature Map → XGBoost → Risk Score + SHAP Explanation`

To ensure honest benchmarking, a classical RBF-SVM baseline processes the exact same PCA representation without the quantum transformation. This isolates the effect of the quantum feature map, allowing for direct comparison between the hybrid and classical models.

## ✨ Key Features

* **Clinical Risk Screening:** Evaluates patient risk using selected features from the Wisconsin Diagnostic Breast Cancer (WDBC) dataset.
* **Hybrid Quantum-Classical ML:** Utilizes a 4-qubit quantum feature map (via PennyLane) with Angle Encoding and RY rotations.
* **Honest Benchmarking:** Compares the XGBoost hybrid classifier against an RBF-SVM classical baseline.
* **SHAP Explainability:** Translates quantum-transformed feature impacts back to original clinical inputs for human-readable transparency.
* **Dual-View Dashboard:** 
  * *Clinician View:* Patient screening form, risk scores, model agreement indicators, and visual SHAP explanations.
  * *Admin View:* Patient queues, threshold configurations, and audit-style activity logs.
* **Accessible Execution:** Runs entirely on a local quantum simulator (`default.qubit`), requiring no dedicated quantum hardware to test.

---

## 🏗️ System Architecture

```text
                    ┌───────────────────────┐
                    │   Clinical Input      │
                    │   6 WDBC Features     │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ StandardScaler        │
                    │ Normalization         │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ PCA                   │
                    │ 6 → 4 Components      │
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌─────────────────────┐   ┌─────────────────────┐
        │ Quantum Feature Map │   │ Classical Baseline  │
        │ 4 Qubits            │   │ RBF-SVM             │
        │ PennyLane Simulator │   │ No Quantum Step     │
        └──────────┬──────────┘   └──────────┬──────────┘
                   │                         │
                   ▼                         │
        ┌─────────────────────┐              │
        │ XGBoost             │              │
        │ Hybrid Classifier   │              │
        └──────────┬──────────┘              │
                   │                         │
                   └────────────┬────────────┘
                                ▼
                    ┌───────────────────────┐
                    │ Comparison + Metrics  │
                    │ Hybrid vs Classical   │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ SHAP Explainability   │
                    │ Top Feature Drivers   │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ React / Vite UI       │
                    │ Risk + Explanation    │
                    └───────────────────────┘


---

## 🧠 How the Pipeline Works

1. **Clinical Input:** Accepts six selected features from the WDBC dataset (Worst Concave Points, Mean Concave Points, Worst Radius, Worst Perimeter, Mean Area, Mean Texture).
2. **Classical Preprocessing:** Inputs are standardized using `StandardScaler` and reduced to 4 principal components via PCA to map naturally to our 4-qubit circuit.
3. **Quantum Feature Transformation:** The PCA components are converted into rotation angles and encoded using `AngleEmbedding` with RY rotations. The circuit uses 4 qubits, 3 strongly entangling layers, fixed weights (Seed 42), and Pauli-Z expectation values.
4. **Hybrid Classification:** The quantum-transformed features are passed to an XGBoost classifier, generating a probability converted into a clinical risk score.
5. **Classical Baseline:** The same PCA representation bypasses the quantum circuit and is fed into an RBF-SVM to establish a classical performance baseline.
6. **Explainability:** SHAP's `KernelExplainer` identifies which quantum-transformed components drove the prediction, tracing them back to the original clinical features for the frontend dashboard.

---

## 🧰 Technology Stack

**Frontend**

* React 18 & Vite
* JavaScript, HTML/CSS

**Backend & ML API**

* Python 3
* FastAPI & Uvicorn
* Pydantic

**Machine Learning & Data**

* Scikit-learn, XGBoost
* NumPy, Pandas
* SHAP (KernelExplainer)

**Quantum Computing**

* PennyLane (using `default.qubit` simulator)

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone [https://github.com/AnushkaShettigar/QureML.git](https://github.com/AnushkaShettigar/QureML.git)
cd QureML

```

### 2. Install Frontend Dependencies

```bash
npm install

```

### 3. Setup Python Backend Environment

It is recommended to use a virtual environment.

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate

# Install dependencies
pip install numpy pandas scikit-learn xgboost pennylane shap fastapi uvicorn joblib

```

### 4. Train the ML Pipeline

Generate the model artifacts required by the API.

```bash
cd ml
python train_and_save.py

```

### 5. Start the Backend API

From the `ml` directory, start the FastAPI server:

```bash
uvicorn api:app --reload --port 8000

```

*The API will be available locally at `http://localhost:8000*`

### 6. Start the Frontend

Open a new terminal session in the project root:

```bash
npm run dev

```

*Vite will output the local development URL for the React application.*

---

## 📁 Project Structure

```text
QureML/
├── ml/
│   ├── api.py                  # FastAPI backend
│   ├── train_and_save.py       # Model training pipeline
│   ├── quantum_risk_model.py   # PennyLane quantum circuit definitions
│   ├── pca_analysis.py
│   └── artifacts/              # Generated models and scalers
├── src/
│   └── App.jsx                 # Main React frontend
├── public/
├── ARCHITECTURE.md
├── package.json
└── README.md

```

---

## 🔬 Model Evaluation & Limitations

The training pipeline performs an explicit comparison between the **Hybrid Model** (PCA → Quantum → XGBoost) and the **Classical Model** (PCA → RBF-SVM) using standard metrics (Accuracy, Precision, Recall, F1 Score, ROC-AUC).

This project treats quantum computing as an experimental representation-learning component, objectively benchmarking it against classical methods rather than assuming quantum superiority by default.

### Known Limitations

* **Simulated Environment:** Runs on PennyLane's `default.qubit` rather than physical quantum hardware.
* **Fixed Quantum State:** Uses fixed quantum weights as a feature transformation rather than training a fully variational quantum classifier, prioritizing stability and manageable scope.
* **Dataset Scope:** Tested on a small, public benchmark dataset (WDBC). Proper clinical application requires substantially larger, multi-modal datasets.

---

## 🌱 Future Scope

* Deployment and execution on actual quantum hardware.
* Exploration of alternative quantum feature maps and embeddings.
* Integration of larger, more diverse clinical datasets with robust cross-validation.
* Calibration of predicted probabilities for strict clinical standards.
* Transition to robust, secure server-side authentication (replacing current demo-level auth).

```

```
