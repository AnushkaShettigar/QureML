import pandas as pd
import numpy as np

def main():
    # 1. Load datasets
    df1 = pd.read_csv('../diabetes.csv')
    df2 = pd.read_csv('../diabetes_2000.csv')
    
    expected_cols = [
        'pregnancies', 'glucose', 'bloodpressure', 'skinthickness', 
        'insulin', 'bmi', 'diabetespedigreefunction', 'age', 'outcome'
    ]
    
    # Normalize column names
    df1.columns = df1.columns.str.lower().str.strip()
    df2.columns = df2.columns.str.lower().str.strip()
    
    for col in expected_cols:
        if col not in df1.columns:
            raise ValueError(f"Missing column {col} in diabetes.csv")
        if col not in df2.columns:
            raise ValueError(f"Missing column {col} in diabetes_2000.csv")
            
    df1 = df1[expected_cols]
    df2 = df2[expected_cols]
    
    # 2. Concatenate and drop duplicates
    print(f"Rows in diabetes.csv: {len(df1)}")
    print(f"Rows in diabetes_2000.csv: {len(df2)}")
    df_merged = pd.concat([df1, df2], ignore_index=True)
    print(f"Rows after concatenation: {len(df_merged)}")
    
    df_merged = df_merged.drop_duplicates()
    print(f"Rows after dropping exact duplicates: {len(df_merged)}")
    
    # 3. Coerce to numeric, drop invalid Outcome and physically impossible rows
    for col in df_merged.columns:
        df_merged[col] = pd.to_numeric(df_merged[col], errors='coerce')
        
    df_merged = df_merged.dropna(subset=['outcome'])
    df_merged = df_merged[df_merged['outcome'].isin([0, 1])]
    
    df_merged = df_merged[
        (df_merged['age'] > 0) & 
        (df_merged['age'] < 120) & 
        (df_merged['pregnancies'] >= 0)
    ]
    print(f"Rows after removing invalid rows: {len(df_merged)}")
    
    # 4. Treat zeros as NaN for specific columns
    zero_to_nan_cols = ['glucose', 'bloodpressure', 'skinthickness', 'insulin', 'bmi']
    for col in zero_to_nan_cols:
        df_merged[col] = df_merged[col].replace(0, np.nan)
        
    # Restore original capitalization for saving to match existing pipeline
    original_cols_map = {
        'pregnancies': 'Pregnancies',
        'glucose': 'Glucose',
        'bloodpressure': 'BloodPressure',
        'skinthickness': 'SkinThickness',
        'insulin': 'Insulin',
        'bmi': 'BMI',
        'diabetespedigreefunction': 'DiabetesPedigreeFunction',
        'age': 'Age',
        'outcome': 'Outcome'
    }
    df_merged = df_merged.rename(columns=original_cols_map)
    
    # 5. Save as diabetes_merged.csv
    df_merged.to_csv('../diabetes_merged.csv', index=False)
    print(f"Saved merged dataset to diabetes_merged.csv")
    
    # 6. Print final row count, class balance and missing values per column
    print(f"\nFinal row count: {len(df_merged)}")
    print(f"Class balance:\n{df_merged['Outcome'].value_counts(normalize=True) * 100}")
    print(f"\nMissing values per column:\n{df_merged.isnull().sum()}")

if __name__ == '__main__':
    main()
