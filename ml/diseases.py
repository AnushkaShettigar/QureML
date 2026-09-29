DISEASES = {
    "breast_cancer": {
        "label": "Breast Cancer",
        "features": ["worst concave points", "mean concave points", "worst radius",
                     "worst perimeter", "mean area", "mean texture"],
        "n_qubits": 4,
        "models_dir": "artifacts/breast_cancer",
    },
    "diabetes": {
        "label": "Diabetes",
        "features": ["glucose", "bmi", "age", "diabetes_pedigree",
                      "blood_pressure", "insulin"],
        "n_qubits": 4,
        "models_dir": "artifacts/diabetes",
    },
}
