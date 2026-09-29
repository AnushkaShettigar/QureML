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
