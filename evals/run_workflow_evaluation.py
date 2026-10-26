"""Repeatable synthetic evaluation of the governed workflow.

Run from the repository root:
    C:\\Python313\\python.exe evals\\run_workflow_evaluation.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from tempfile import gettempdir

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
os.environ["RAW_DATABASE_PATH"] = str(Path(gettempdir()) / "myridius-evaluation.db")
os.environ["AUTH_MODE"] = "demo"
if "--require-claude" in sys.argv:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise SystemExit("Set ANTHROPIC_API_KEY before running with --require-claude.")
    os.environ["AI_ADAPTER"] = "anthropic-claude"
elif os.getenv("ANTHROPIC_API_KEY") and "AI_ADAPTER" not in os.environ:
    os.environ["AI_ADAPTER"] = "anthropic-claude"
else:
    os.environ.setdefault("AI_ADAPTER", "deterministic-mock-v1")

from fastapi.testclient import TestClient
from app.main import app, case_store


PRODUCT_OWNER_HEADERS = {"X-Actor-Id": "product-owner"}
ANALYST_HEADERS = {"X-Actor-Id": "analyst"}
COMMITTEE_HEADERS = {"X-Actor-Id": "committee"}
AUDITOR_HEADERS = {"X-Actor-Id": "auditor"}


def intake() -> dict[str, object]:
    return json.loads((ROOT / "evals" / "sample_intake.json").read_text(encoding="utf-8"))


def run() -> dict[str, object]:
    case_store.reset()
    client = TestClient(app)
    created = client.post("/api/v1/cases", json=intake(), headers=PRODUCT_OWNER_HEADERS)
    case_id = created.json()["case_id"]
    uploaded_evidence = client.post(
        f"/api/v1/cases/{case_id}/document-evidence/upload",
        data={"title": "Synthetic control test report", "document_type": "control_test", "is_synthetic": "true"},
        files={
            "file": (
                "sample_control_evidence.md",
                (ROOT / "evals" / "sample_control_evidence.md").read_bytes(),
                "text/markdown",
            )
        },
        headers=PRODUCT_OWNER_HEADERS,
    )
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
    if drafted.status_code != 200:
        raise RuntimeError(f"Assessment draft failed ({drafted.status_code}): {drafted.text}")
    draft = drafted.json()["assessment_draft"]
    if "--require-claude" in sys.argv and draft["generator"] != "anthropic-claude":
        raise RuntimeError(f"Expected Claude, but draft used {draft['generator']}.")
    if "--require-claude" in sys.argv and not all(
        draft[field] for field in ("discrepancies", "risk_signals", "research_steps")
    ):
        raise RuntimeError("Claude draft is missing discrepancy, risk-signal, or analyst research guidance for the sample.")
    ai_executions = client.get(f"/api/v1/cases/{case_id}/ai-executions", headers=ANALYST_HEADERS)
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
    evidence_package = client.get(f"/api/v1/cases/{case_id}/evidence-package", headers=AUDITOR_HEADERS)
    unauthorized = client.post(f"/api/v1/cases/{case_id}/risk-assessment", headers=PRODUCT_OWNER_HEADERS, json={})

    package = evidence_package.json()
    result = {
        "case_id": case_id,
        "sample_record": "evals/sample_intake.json",
        "sample_evidence": "evals/sample_control_evidence.md",
        "draft_provider": draft["generator"],
        "draft_summary": draft["summary"],
        "ai_suggested_factor_scores": {
            item["factor"]: item["ai_suggested_score"]
            for item in draft["risk_factor_analysis"]
            if item.get("ai_suggested_score") is not None
        },
        "discrepancies": draft["discrepancies"],
        "risk_signals": draft["risk_signals"],
        "research_steps": draft["research_steps"],
        "evidence_document_count": len(drafted.json().get("document_evidence", [])),
        "workflow_status_codes": [
            created.status_code,
            uploaded_evidence.status_code,
            submitted.status_code,
            assessed.status_code,
            drafted.status_code,
            sent_to_committee.status_code,
            decided.status_code,
            evidence_package.status_code,
        ],
        "residual_risk_floor_respected": assessed.json()["residual_risk"] >= 1,
        "citation_count": len(draft["citations"]),
        "discrepancy_section_present": "discrepancies" in draft,
        "research_steps_present": "research_steps" in draft,
        "ai_execution_recorded": ai_executions.status_code == 200 and len(ai_executions.json()) == 1,
        "estimated_ai_tokens": sum(
            ai_executions.json()[0][field] for field in ("estimated_input_tokens", "estimated_output_tokens")
        ) if ai_executions.status_code == 200 and ai_executions.json() else 0,
        "human_only_decision_authority": draft["decision_authority"] == "human_only",
        "audit_chain_valid": package["audit_verification"]["valid"],
        "unauthorized_transition_status": unauthorized.status_code,
    }
    result["passed"] = (
        result["workflow_status_codes"] == [201, 201, 200, 200, 200, 200, 200, 200]
        and result["residual_risk_floor_respected"]
        and result["citation_count"] >= 1
        and result["evidence_document_count"] == 1
        and result["discrepancy_section_present"]
        and result["research_steps_present"]
        and result["ai_execution_recorded"]
        and result["estimated_ai_tokens"] > 0
        and result["human_only_decision_authority"]
        and result["audit_chain_valid"]
        and result["unauthorized_transition_status"] == 403
    )
    return result


if __name__ == "__main__":
    print(__import__("json").dumps(run(), indent=2))
