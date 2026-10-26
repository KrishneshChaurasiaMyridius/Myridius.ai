"""Create a synthetic sample case in a running local demo API.

Run from the repository root after starting the API:
    C:\\Python313\\python.exe evals\\load_sample_case.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
API_URL = os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:8000").rstrip("/")
HEADERS = {"X-Actor-Id": "product-owner"}


def main() -> None:
    intake = json.loads((ROOT / "evals" / "sample_intake.json").read_text(encoding="utf-8"))
    evidence_path = ROOT / "evals" / "sample_control_evidence.md"

    with httpx.Client(base_url=API_URL, timeout=30) as client:
        created = client.post("/api/v1/cases", json=intake, headers=HEADERS)
        created.raise_for_status()
        case = created.json()

        uploaded = client.post(
            f"/api/v1/cases/{case['case_id']}/document-evidence/upload",
            data={
                "title": "Synthetic control test report",
                "document_type": "control_test",
                "is_synthetic": "true",
            },
            files={
                "file": (
                    evidence_path.name,
                    evidence_path.read_bytes(),
                    "text/markdown",
                )
            },
            headers=HEADERS,
        )
        uploaded.raise_for_status()

    print(f"Created sample case: {case['case_id']} - {case['title']}")
    print(f"Evidence uploaded: {uploaded.json()['original_filename']}")
    print("The case is still a draft. Open the workbench and continue the workflow there.")
    print(f"Workbench API: {API_URL}")


if __name__ == "__main__":
    main()
