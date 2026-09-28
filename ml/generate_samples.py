import pandas as pd
import json
from pathlib import Path
from pca_analysis import load_dataset, FEATURE_DISPLAY_NAMES, SELECTED_FEATURES

ARTIFACT_DIR = Path("c:/quantum/FAAHHH/ml/artifacts")
ARTIFACT_DIR.mkdir(exist_ok=True)

# Load full dataset
X_df, y = load_dataset()

import numpy as np

# Pick 10 interesting cases: 5 malignant (1), 5 benign (0)
m_idx = np.where(y == 1)[0][:5]
b_idx = np.where(y == 0)[0][:5]
selected_idx = list(m_idx) + list(b_idx)

samples = []
for i, idx in enumerate(selected_idx):
    row = X_df.iloc[idx]
    label = "Malignant" if y[idx] == 1 else "Benign"
    samples.append({
        "id": f"Patient-{idx}",
        "name": f"Sample {label} {i+1}",
        "label": label,
        "worst_concave_points": float(row["Worst Concave Points"]),
        "mean_concave_points": float(row["Mean Concave Points"]),
        "worst_radius": float(row["Worst Radius"]),
        "worst_perimeter": float(row["Worst Perimeter"]),
        "mean_area": float(row["Mean Area"]),
        "mean_texture": float(row["Mean Texture"])
    })

with open(ARTIFACT_DIR / "sample_patients.json", "w") as f:
    json.dump(samples, f, indent=2)

print("Generated sample_patients.json")
