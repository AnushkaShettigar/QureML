"""
QRISK-Console ML Pipeline — Step 1: PCA
=========================================
Loads the Wisconsin Diagnostic Breast Cancer (WDBC) dataset, selects the
6 features specified by published feature-importance studies, standardizes
them, and fits PCA down to 4 components (~99% variance retained).

The 6 features, chosen to represent 3 underlying clinical concepts:
  - Nucleus border irregularity: worst concave points, mean concave points
  - Overall tumour size:         worst radius, worst perimeter
  - Internal texture:            mean area, mean texture

Target label convention:
  1 = malignant (higher risk)
  0 = benign    (lower risk)
  — This is the OPPOSITE of sklearn's raw load_breast_cancer encoding
    (where 0 = malignant). We flip it so "1" reads intuitively as
    "higher risk" everywhere else in the codebase / API / UI.

Run:
    pip install -r requirements.txt
    python pca_analysis.py
"""

import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt

RANDOM_SEED = 42

# The 6 features selected from published feature-importance studies on WDBC.
# Maps from our canonical name → column name in the CSV.
SELECTED_FEATURES = [
    "concave points_worst",   # worst concave points
    "concave points_mean",    # mean concave points
    "radius_worst",           # worst radius
    "perimeter_worst",        # worst perimeter
    "area_mean",              # mean area
    "texture_mean",           # mean texture
]

# Human-readable short names (used in SHAP / UI explanations)
FEATURE_DISPLAY_NAMES = [
    "Worst Concave Points",
    "Mean Concave Points",
    "Worst Radius",
    "Worst Perimeter",
    "Mean Area",
    "Mean Texture",
]

CSV_PATH = Path(__file__).parent.parent / "wisconstin.csv"


def _load_breast_cancer() -> tuple[pd.DataFrame, np.ndarray]:
    """
    Load the WDBC dataset from the CSV file, select the 6 target features,
    and return (X_dataframe, y_labels).

    Labels are flipped so 1 = malignant = higher risk.
    """
    df = pd.read_csv(CSV_PATH)

    # Select only the 6 features we need
    X = df[SELECTED_FEATURES].copy()
    X.columns = FEATURE_DISPLAY_NAMES

    # Flip labels: M (malignant) → 1, B (benign) → 0
    y = (df["diagnosis"] == "M").astype(int).values

    return X, y


def _load_diabetes() -> tuple[pd.DataFrame, np.ndarray]:
    url = "https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.data.csv"
    names = ["pregnancies", "glucose", "blood_pressure", "skin_thickness",
             "insulin", "bmi", "diabetes_pedigree", "age", "outcome"]
    df = pd.read_csv(url, names=names)
    
    cols_to_clean = ["glucose", "blood_pressure", "skin_thickness", "insulin", "bmi"]
    df[cols_to_clean] = df[cols_to_clean].replace(0, np.nan)
    
    selected = ["glucose", "bmi", "age", "diabetes_pedigree", "blood_pressure", "insulin"]
    X = df[selected].copy()
    y = df["outcome"].values
    return X, y


def load_dataset(disease_key: str = "breast_cancer") -> tuple[pd.DataFrame, np.ndarray]:
    if disease_key == "diabetes":
        return _load_diabetes()
    return _load_breast_cancer()


def run_pca(X: pd.DataFrame, n_components: int = 4):
    """
    Standardize the 6 features and fit PCA to reduce to n_components (default 4).
    Returns a dict with all the objects the rest of the pipeline needs.
    """
    feature_names = X.columns.tolist()

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X.values)

    pca = PCA(n_components=n_components, random_state=RANDOM_SEED)
    components = pca.fit_transform(X_scaled)
    component_cols = [f"PC{i+1}" for i in range(n_components)]

    return {
        "scaler": scaler,
        "pca": pca,
        "X_scaled": X_scaled,
        "components": components,
        "component_cols": component_cols,
        "feature_names": feature_names,
        "explained_variance_ratio": pca.explained_variance_ratio_,
    }


def verify_pca_vs_raw_correlation(result: dict) -> tuple[pd.DataFrame, float]:
    """
    Computes the correlation between each principal component and each
    original (standardized) feature. This is the "verification" step:
    - High |correlation| on a few features per component means that
      component has a clear, interpretable meaning (good).
    - Correlations near 0 across the board would mean the component is
      mostly noise (bad — would flag a data or scaling problem).
    - Components should also be ~uncorrelated with EACH OTHER (PCA
      guarantees this mathematically); we check that too as a sanity test.
    """
    X_scaled = result["X_scaled"]
    components = result["components"]
    feature_names = result["feature_names"]
    component_cols = result["component_cols"]

    corr_matrix = np.zeros((len(component_cols), len(feature_names)))
    for i in range(len(component_cols)):
        for j in range(len(feature_names)):
            corr_matrix[i, j] = np.corrcoef(components[:, i], X_scaled[:, j])[0, 1]

    corr_df = pd.DataFrame(corr_matrix, index=component_cols, columns=feature_names)

    # Sanity check: components should be near-orthogonal (correlation ~0)
    inter_component_corr = np.corrcoef(components.T)
    off_diagonal = inter_component_corr[~np.eye(len(component_cols), dtype=bool)]
    max_inter_component_corr = np.abs(off_diagonal).max() if len(off_diagonal) else 0.0

    return corr_df, max_inter_component_corr


def plot_correlation_heatmap(corr_df: pd.DataFrame, out_path: str):
    fig, ax = plt.subplots(figsize=(9, 4 + 0.3 * len(corr_df)))
    im = ax.imshow(corr_df.values, cmap="RdBu_r", vmin=-1, vmax=1, aspect="auto")
    ax.set_xticks(range(len(corr_df.columns)))
    ax.set_xticklabels(corr_df.columns, rotation=45, ha="right")
    ax.set_yticks(range(len(corr_df.index)))
    ax.set_yticklabels(corr_df.index)
    for i in range(corr_df.shape[0]):
        for j in range(corr_df.shape[1]):
            ax.text(j, i, f"{corr_df.values[i, j]:.2f}", ha="center", va="center",
                     color="black", fontsize=8)
    fig.colorbar(im, ax=ax, label="Correlation")
    ax.set_title("PCA Components vs Raw Features — Correlation (Loadings)")
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
def save_compressed_dataset(result: dict, y: np.ndarray, out_path: str):
    """
    Save the 569 x 4 PCA-compressed dataset to a CSV file.
    Each row = one patient. Columns = PC1, PC2, PC3, PC4, diagnosis.
    This is the file Week 3 (quantum circuit) and Week 4 (569x10 merge)
    will load as their input.
    """
    df = pd.DataFrame(result["components"], columns=result["component_cols"])
    df["diagnosis"] = y
    df.to_csv(out_path, index=False)
    return df

def main():
    X, y = load_dataset()
    result = run_pca(X)

    print(f"Dataset: {len(y)} samples ({y.sum()} malignant, {len(y) - y.sum()} benign)")
    print(f"Features: {result['feature_names']}")
    print(f"\n=== PCA Summary ===")
    print(f"Features in:    {len(result['feature_names'])}")
    print(f"Components out: {len(result['component_cols'])} "
          f"(covers {result['explained_variance_ratio'].sum()*100:.1f}% of variance)")
    for name, var in zip(result["component_cols"], result["explained_variance_ratio"]):
        print(f"  {name}: {var*100:.1f}% of variance")

    corr_df, max_inter = verify_pca_vs_raw_correlation(result)

    print("\n=== Verification: PCA components vs raw features (correlation) ===")
    print(corr_df.round(2).to_string())
    print(f"\nMax correlation BETWEEN components (should be ~0): {max_inter:.4f}")
    if max_inter < 0.05:
        print("PASS — components are effectively uncorrelated, as PCA guarantees.")
    else:
        print("WARNING — components show unexpected correlation; check data/scaling.")

        corr_df.to_csv("pca_vs_raw_correlation.csv")
    plot_correlation_heatmap(corr_df, "pca_vs_raw_correlation.png")
    save_compressed_dataset(result, y, "pca_features.csv")
    print("\nSaved: pca_vs_raw_correlation.csv, pca_vs_raw_correlation.png, pca_features.csv")


if __name__ == "__main__":
    main()
