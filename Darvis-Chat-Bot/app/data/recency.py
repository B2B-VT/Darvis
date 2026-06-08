import re
import pandas as pd


def extract_end_year(value) -> int | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    match = re.search(r"(\d{4})\D+(\d{2})", text)
    if match:
        start_year = int(match.group(1))
        end_two = int(match.group(2))
        century = (start_year // 100) * 100
        end_year = century + end_two
        if end_year < start_year:
            end_year += 100
        return end_year
    match = re.search(r"\d{4}", text)
    return int(match.group(0)) if match else None


def add_recency_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "Academic Year" not in out.columns:
        out["End Year"] = None
        out["Years Ago"] = None
        out["Recency Weight"] = 1.0
        return out

    out["End Year"] = out["Academic Year"].apply(extract_end_year)
    max_year = out["End Year"].max()
    if pd.isna(max_year):
        out["Years Ago"] = None
        out["Recency Weight"] = 1.0
        return out

    out["Years Ago"] = max_year - out["End Year"]
    out["Recency Weight"] = (0.85 ** out["Years Ago"]).fillna(0.5)
    return out


def weighted_average(group: pd.DataFrame, value_col: str, enrollment_col: str, use_recency: bool = True) -> float | None:
    valid = group.dropna(subset=[value_col, enrollment_col]).copy()
    if valid.empty:
        return None
    if use_recency and "Recency Weight" in valid.columns:
        valid["Final Weight"] = valid[enrollment_col] * valid["Recency Weight"]
    else:
        valid["Final Weight"] = valid[enrollment_col]
    total_weight = valid["Final Weight"].sum()
    if total_weight == 0:
        return None
    return float((valid[value_col] * valid["Final Weight"]).sum() / total_weight)
