import pandas as pd


def _records(df: pd.DataFrame, max_rows: int = 15) -> list[dict]:
    if df is None or df.empty:
        return []
    safe = df.head(max_rows).copy()
    return safe.where(pd.notna(safe), None).to_dict(orient="records")


def table_spec(title: str, df: pd.DataFrame, columns: list[str] | None = None, max_rows: int = 15) -> dict:
    if df is None or df.empty:
        return {"title": title, "columns": [], "rows": []}
    cols = columns or list(df.columns)
    cols = [c for c in cols if c in df.columns]
    view = df[cols].head(max_rows).copy()
    return {"title": title, "columns": cols, "rows": view.where(pd.notna(view), None).to_dict(orient="records")}


def bar_chart(title: str, df: pd.DataFrame, x_key: str, y_key: str, description: str = "", horizontal: bool = True, max_rows: int = 15) -> dict:
    return {
        "chart_type": "bar",
        "title": title,
        "description": description,
        "x_key": x_key,
        "y_key": y_key,
        "orientation": "horizontal" if horizontal else "vertical",
        "data": _records(df, max_rows),
    }


def scatter_chart(title: str, df: pd.DataFrame, x_key: str, y_key: str, description: str = "", max_rows: int = 20) -> dict:
    return {
        "chart_type": "scatter",
        "title": title,
        "description": description,
        "x_key": x_key,
        "y_key": y_key,
        "orientation": "vertical",
        "data": _records(df, max_rows),
    }
