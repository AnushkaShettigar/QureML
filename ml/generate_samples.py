import argparse
import pandas as pd
import json
from pathlib import Path
from pipeline import load_dataset
import numpy as np

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--disease", type=str, default="breast_cancer")
    args = parser.parse_args()
    disease = args.disease

    artifact_dir = Path(__file__).parent / "artifacts" / disease
    artifact_dir.mkdir(parents=True, exist_ok=True)

    # Load full dataset
    X_df, y = load_dataset(disease)

    # Pick 10 interesting cases: 5 malignant/positive (1), 5 benign/negative (0)
    m_idx = np.where(y == 1)[0][:5]
    b_idx = np.where(y == 0)[0][:5]
    selected_idx = list(m_idx) + list(b_idx)

    samples = []
    for i, idx in enumerate(selected_idx):
        row = X_df.iloc[idx]
        if disease == "diabetes":
            label = "Diabetic" if y[idx] == 1 else "Non-Diabetic"
        else:
            label = "Malignant" if y[idx] == 1 else "Benign"

        sample = {
            "id": f"Patient-{idx}",
            "name": f"Sample {label} {i+1}",
            "label": label,
        }
        
        # Add all features as lower_case with underscores for the frontend
        # Wait, for breast_cancer the frontend expects worst_concave_points, etc.
        for col in X_df.columns:
            k = col.lower().replace(" ", "_")
            val = float(row[col]) if not np.isnan(row[col]) else None
            sample[k] = val
            
        samples.append(sample)

    with open(artifact_dir / "sample_patients.json", "w") as f:
        json.dump(samples, f, indent=2)

    print(f"Generated {artifact_dir}/sample_patients.json")

if __name__ == "__main__":
    main()
