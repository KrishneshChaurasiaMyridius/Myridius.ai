"""Repeatable synthetic evaluation of the governed workflow.

Run from the repository root:
    C:\\Python313\\python.exe evals\\run_workflow_evaluation.py
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys
from tempfile import gettempdir

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
os.environ["RAW_DATABASE_PATH"] = str(Path(gettempdir()) / "myridius-evaluation.db")

from fastapi.testclient import TestClient
from app.main import app, case_store


PRODUCT_OWNER_HEADERS = {"X-Actor-Id": "product-owner"}
ANALYST_HEADERS = {"X-Actor-Id": "analyst"}
COMMITTEE_HEADERS = {"X-Actor-Id": "committee"}
AUDITOR_HEADERS = {"X-Actor-Id": "auditor"}


def intake() -> dict[str, object]:
    return {
        "title": "Synthetic evaluation cross-border payments feature",
        "change_type": "product_feature",
        "business_rationale": "Evaluate deterministic governance behavior with synthetic cross-border payment data.",
        "business_owner": "Taylor Product Owner",
        "target_launch_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "jurisdictions": ["GB", "US"],
        "customer_exposure": "moderate",
        "delivery_channels": ["web"],
        "payment_characteristics": ["cross-border"],
        "third_parties": ["Synthetic payment processor"],
        "proposed_controls": ["Sanctions screening", "Transaction monitoring"],
        "attachment_urls": ["https://example.test/synthetic-evaluation-brief.pdf"],
        "is_synthetic": True,
    }


def run() -> dict[str, object]:
    case_store.reset()
    client = TestClient(app)
    created = client.post("/api/v1/cases", json=intake(), headers=PRODUCT_OWNER_HEADERS)
    case_id = created.json()["case_id"]
    submitted = client.post(f"/api/v1/cases/{case_id}/submit", headers=PRODUCT_OWNER_HEADERS)
    assessed = client.post(
        f"/api/v1/cases/{case_id}/risk-assessment",
        headers=ANALYST_HEADERS,
        json={
            "customer_risk": 4,
            "product_risk": 5,
            "channel_risk": 3,
            "geography_risk": 4,
            "transaction_risk": 5,
            "third_party_risk": 3,
            "control_effectiveness": 2,
            "analyst": "Ignored client actor",
        },
    )
    drafted = client.post(f"/api/v1/cases/{case_id}/assessment-draft", headers=ANALYST_HEADERS)
    sent_to_committee = client.post(f"/api/v1/cases/{case_id}/send-to-committee", headers=ANALYST_HEADERS)
    decided = client.post(
        f"/api/v1/cases/{case_id}/committee-decision",
        headers=COMMITTEE_HEADERS,
        json={
            "decision": "approve",
            "rationale": "Synthetic evaluation confirms a human committee decision after analyst assessment.",
            "committee_member": "Ignored client actor",
            "conditions": [],
        },
    )
    evidence = client.get(f"/api/v1/cases/{case_id}/evidence-package", headers=AUDITOR_HEADERS)
    unauthorized = client.post(f"/api/v1/cases/{case_id}/risk-assessment", headers=PRODUCT_OWNER_HEADERS, json={})

    package = evidence.json()
    result = {
        "case_id": case_id,
        "workflow_status_codes": [
            created.status_code,
            submitted.status_code,
            assessed.status_code,
            drafted.status_code,
            sent_to_committee.status_code,
            decided.status_code,
            evidence.status_code,
        ],
        "residual_risk_floor_respected": assessed.json()["residual_risk"] >= 1,
        "citation_count": len(drafted.json()["assessment_draft"]["citations"]),
        "human_only_decision_authority": drafted.json()["assessment_draft"]["decision_authority"] == "human_only",
        "audit_chain_valid": package["audit_verification"]["valid"],
        "unauthorized_transition_status": unauthorized.status_code,
    }
    result["passed"] = (
        result["workflow_status_codes"] == [201, 200, 200, 200, 200, 200, 200]
        and result["residual_risk_floor_respected"]
        and result["citation_count"] >= 1
        and result["human_only_decision_authority"]
        and result["audit_chain_valid"]
        and result["unauthorized_transition_status"] == 403
    )
    return result


if __name__ == "__main__":
    print(__import__("json").dumps(run(), indent=2))
