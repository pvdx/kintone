"""
Build JS config (flow_config.js) from a single-sheet Excel file.

Excel format (single sheet):
  Columns: flow, status, role, past, future
  - flow   : flow name (e.g., "main", "side"...)
  - status : status label (string)
  - role   : role/department for this step (optional)
  - past   : action labels for moving to the *previous* step (comma-separated or JSON array)
  - future : action labels for moving to the *next* step     (comma-separated or JSON array)

Flow selection rule at runtime (in generated JS):
  - Given the record's current status, we first look for any NON-"main" flow that contains that status.
    If found, that flow is used.
  - Otherwise, "main" is used.

Usage:
  python build_flow_js_single.py flow_steps.xlsx -o flow_config.js
"""
from pathlib import Path
import sys, json
import pandas as pd

def parse_actions(val):
    if val is None:
        return []
    s = str(val).strip()
    if not s:
        return []
    # Try JSON array first
    try:
        arr = json.loads(s)
        if isinstance(arr, list):
            return [str(x).strip() for x in arr if str(x).strip()]  # keep non-empty strings
    except Exception:
        pass
    # Fallback: split on common delimiters (comma, Japanese comma, pipe, newline, slash)
    delims = [',', '、', '|', '\n', '／', '/']
    parts = [s]
    for d in delims:
        if d in s:
            parts = [p.strip() for p in s.split(d)]
            break
    return [p for p in parts if p]

def to_js_string(s: str) -> str:
    """Escape backslashes and backticks for use inside JS template literals."""
    return s.replace('\\', '\\\\').replace('`', '\\`')

def build_js_from_excel(xlsx_path: Path) -> str:
    df = pd.read_excel(xlsx_path, sheet_name=0).fillna("")
    # Normalize columns (case-insensitive)
    cols = {c.lower().strip(): c for c in df.columns}
    required = ["flow","status"]
    for k in required:
        if k not in cols:
            raise ValueError(f"Missing required column: {k}")
    flow_col   = cols["flow"]
    status_col = cols["status"]
    role_col   = cols.get("role")
    past_col   = cols.get("past")
    future_col = cols.get("future")

    # Build flows dict, preserving row order within each flow
    flows = {}
    for _, row in df.iterrows():
        flow   = str(row[flow_col]).strip() or "main"
        status = str(row[status_col]).strip()
        if not status:
            continue
        role   = str(row[role_col]).strip() if role_col else ""
        past   = parse_actions(row[past_col])   if past_col   else []
        future = parse_actions(row[future_col]) if future_col else []
        flows.setdefault(flow, []).append({
            "status": status,
            "role": role,
            "past": past,
            "future": future,
        })

    # Build JS lines
    lines = []
    lines.append("const FLOW_DATA = {")
    lines.append("  flows: {")
    for flow_name, steps in flows.items():
        lines.append(f"    `{to_js_string(flow_name)}`: [")
        for step in steps:
            status_js = to_js_string(step["status"])
            role_js   = to_js_string(step.get("role",""))
            # Arrays
            past_arr   = ", ".join([f"`{to_js_string(x)}`" for x in step.get("past",[])])
            future_arr = ", ".join([f"`{to_js_string(x)}`" for x in step.get("future",[])])
            lines.append(f"      {{ status: `{status_js}`, role: `{role_js}`, past: [{past_arr}], future: [{future_arr}] }}," )
        lines.append("    ],")
    lines.append("  },")
    lines.append("};")
    lines.append("")
    return "".join(lines)

def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('xlsx', help='Path to Excel file with columns: flow, status, role, past, future')
    p.add_argument('-o', '--out', default='flow_config.js', help='Output JS file path')
    args = p.parse_args()

    js = build_js_from_excel(Path(args.xlsx))
    Path(args.out).write_text(js, encoding='utf-8')
    print(f"Wrote {args.out}")

if __name__ == '__main__':
    main()
