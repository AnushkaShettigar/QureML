# Diabetes Retrain Report

## Dataset Counts
- **Original rows (`diabetes.csv`)**: 768
- **Extra rows (`diabetes_2000.csv`)**: 2000
- **Total after concatenation**: 2768
- **Final rows after cleaning & deduplication**: 778
- **Class balance**: 65.04% Non-Diabetic (0), 34.96% Diabetic (1)

*Note: The 2,000-row dataset only contributed 10 new unique valid rows after duplicates were dropped.*

## Cleaning Steps Applied
1. Normalized all column names to standard lowercase/spacing for matching.
2. Dropped all exact duplicate rows.
3. Coerced all columns to numeric types.
4. Dropped rows with invalid `Outcome` values (must be strictly 0 or 1).
5. Removed physically impossible rows (e.g., `Age` <= 0, `Age` >= 120, negative `Pregnancies`).
6. Treated zeros in `Glucose`, `BloodPressure`, `SkinThickness`, `Insulin`, and `BMI` as `NaN` (missing values), as zero is biologically impossible for these measurements. Imputation (median) was performed strictly on the training folds/set to prevent data leakage.

## Hyperparameters Chosen
A randomized search with 5-fold cross-validation was used.
- **Hybrid Model (XGBoost):** `n_estimators=200`, `max_depth=3`, `learning_rate=0.05`, `scale_pos_weight=1.857`
- **Classical Baseline (RBF-SVM):** `C=100`, `gamma=0.01`, `class_weight='balanced'`

## Metrics Comparison

### Cross-Validation (Training Set)
| Model | CV ROC-AUC (Mean ± SD) |
|---|---|
| **Hybrid (Quantum + XGBoost)** | 0.773 ± 0.042 |
| **Classical (RBF SVM)** | 0.821 ± 0.048 |

### Test Set Evaluation
Evaluated on a completely held-out 25% stratified test set. To ensure a fair comparison, the "Old" models were trained only on the subset of training rows that originated from the original 768-row dataset, then evaluated on the exact same test set.

| Model | Accuracy | Precision | Recall | F1 Score | ROC-AUC |
|---|---|---|---|---|---|
| **Old Hybrid (Original Data)** | 0.708 | 0.570 | 0.662 | 0.612 | 0.765 |
| **New Hybrid (Merged Data)** | 0.723 | 0.588 | 0.691 | 0.635 | 0.782 |
| **Old Classical (Original Data)** | 0.713 | 0.567 | 0.750 | 0.646 | 0.801 |
| **New Classical (Merged Data)** | 0.723 | 0.578 | 0.765 | 0.658 | 0.801 |

## Conclusion
1. **Did the extra data help?** Slightly. The additional 10 unique rows from the merged dataset slightly improved the Hybrid model's Recall (0.662 → 0.691) and ROC-AUC (0.765 → 0.782). The Classical model also saw a marginal F1 improvement.
2. **Did the quantum step help?** **No.** The Classical Baseline (RBF SVM) consistently outperforms the Hybrid (Quantum + XGBoost) model across the board. The SVM achieves a higher ROC-AUC (0.801 vs 0.782) and significantly better Recall (0.765 vs 0.691), which is the most critical metric for a clinical screening tool. The quantum step appears to be adding noise or reducing the separability of the PCA features rather than finding a more useful representation.

## Known Limitations
- **Data Quality:** The `diabetes_2000.csv` file was heavily duplicated and yielded almost no new valid samples, suggesting it was largely synthetic or a resampled version of the original dataset.
- **Population Bias:** The Pima Indians dataset represents a highly specific demographic and genetic population, meaning these models are unlikely to generalize well to the broader global population.
- **Sample Size:** 778 rows is a very small dataset for robust machine learning, and certainly too small to demonstrate any hypothetical quantum advantage.
