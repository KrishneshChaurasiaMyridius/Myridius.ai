from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app, case_store


client = TestClient(app)


def valid_intake() -> dict[str, object]:
    return {
        "title": "Synthetic cross-border payments feature",
        "change_type": "product_feature",
        "business_rationale": "Enable synthetic cross-border payment simulation for the workbench demonstration.",
        "business_owner": "Taylor Product Owner",
        "target_launch_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "jurisdictions": ["GB", "US"],
        "customer_exposure": "moderate",
        "delivery_channels": ["web"],
        "payment_characteristics": ["cross-border"],
        "third_parties": ["Synthetic payment processor"],
        "proposed_controls": ["Sanctions screening", "Transaction monitoring"],
        "attachment_urls": ["https://example.test/synthetic-change-brief.pdf"],
        "is_synthetic": True,
    }


def setup_function() -> None:
    case_store.reset()


def test_create_then_submit_case() -> None:
    created = client.post("/api/v1/cases", json=valid_intake())

    assert created.status_code == 201
    case = created.json()
    assert case["status"] == "draft"
    assert case["version"] == 1

    submitted = client.post(f"/api/v1/cases/{case['case_id']}/submit")

    assert submitted.status_code == 200
    assert submitted.json()["status"] == "intake_review"
    assert submitted.json()["version"] == 2
    assert submitted.json()["submitted_at"] is not None


def test_rejects_non_synthetic_data() -> None:
    intake = valid_intake()
    intake["is_synthetic"] = False

    response = client.post("/api/v1/cases", json=intake)

    assert response.status_code == 422


def test_vendor_requires_third_party() -> None:
    intake = valid_intake()
    intake["change_type"] = "vendor"
    intake["third_parties"] = []

    response = client.post("/api/v1/cases", json=intake)

    assert response.status_code == 422


def test_cannot_submit_twice() -> None:
    created = client.post("/api/v1/cases", json=valid_intake()).json()
    client.post(f"/api/v1/cases/{created['case_id']}/submit")

    response = client.post(f"/api/v1/cases/{created['case_id']}/submit")

    assert response.status_code == 409


def test_case_events_form_a_hash_linked_audit_trail() -> None:
    created = client.post("/api/v1/cases", json=valid_intake()).json()
    client.post(f"/api/v1/cases/{created['case_id']}/submit")

    response = client.get(f"/api/v1/cases/{created['case_id']}/audit-events")

    assert response.status_code == 200
    events = response.json()
    assert [event["action"] for event in events] == ["case_created", "case_submitted"]
    assert events[0]["previous_hash"] is None
    assert events[1]["previous_hash"] == events[0]["event_hash"]

    verification = client.get(f"/api/v1/cases/{created['case_id']}/audit-verification")
    assert verification.status_code == 200
    assert verification.json() == {"case_id": created["case_id"], "event_count": 2, "valid": True}


def risk_assessment() -> dict[str, object]:
    return {
        "customer_risk": 4,
        "product_risk": 5,
        "channel_risk": 3,
        "geography_risk": 4,
        "transaction_risk": 5,
        "third_party_risk": 3,
        "control_effectiveness": 2,
        "analyst": "Alex FCRM Analyst",
    }


def test_deterministic_scoring_and_human_decision_lifecycle() -> None:
    created = client.post("/api/v1/cases", json=valid_intake()).json()
    case_id = created["case_id"]
    client.post(f"/api/v1/cases/{case_id}/submit")

    assessed = client.post(f"/api/v1/cases/{case_id}/risk-assessment", json=risk_assessment())

    assert assessed.status_code == 200
    case = assessed.json()
    assert case["status"] == "analyst_review"
    assert case["inherent_risk"] == 4
    assert case["residual_risk"] == 3
    assert case["risk_assessment"]["rating"] == "moderate"

    override = client.post(
        f"/api/v1/cases/{case_id}/risk-override",
        json={
            "residual_risk": 4,
            "rationale": "Cross-border launch uncertainty warrants a higher residual-risk rating for committee review.",
            "analyst": "Alex FCRM Analyst",
        },
    )
    assert override.status_code == 200
    assert override.json()["analyst_override"]["residual_risk"] == 4

    committee_ready = client.post(f"/api/v1/cases/{case_id}/send-to-committee")
    assert committee_ready.status_code == 200
    assert committee_ready.json()["status"] == "committee_decision"

    decision = client.post(
        f"/api/v1/cases/{case_id}/committee-decision",
        json={
            "decision": "approve_with_conditions",
            "rationale": "Approval is appropriate once the specified control verification is completed.",
            "committee_member": "Morgan Committee Member",
            "conditions": [
                {
                    "description": "Verify sanctions-screening coverage before launch.",
                    "owner": "Taylor Product Owner",
                    "due_date": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
                    "verification_criteria": "Provide a test report demonstrating coverage for GB and US payment routes.",
                }
            ],
        },
    )
    assert decision.status_code == 200
    assert decision.json()["status"] == "decided"
    assert decision.json()["committee_decision"]["decision"] == "approve_with_conditions"
    assert decision.json()["committee_decision"]["conditions"][0]["status"] == "open"

    condition_id = decision.json()["committee_decision"]["conditions"][0]["condition_id"]
    verified = client.post(
        f"/api/v1/cases/{case_id}/conditions/{condition_id}/verify",
        json={
            "verifier": "Alex FCRM Analyst",
            "evidence_summary": "Reviewed the test report confirming sanctions coverage for GB and US payment routes.",
        },
    )
    assert verified.status_code == 200
    assert verified.json()["committee_decision"]["conditions"][0]["status"] == "verified"
    assert verified.json()["committee_decision"]["conditions"][0]["verified_by"] == "Alex FCRM Analyst"

    events = client.get(f"/api/v1/cases/{case_id}/audit-events").json()
    assert [event["action"] for event in events] == [
        "case_created",
        "case_submitted",
        "risk_assessed",
        "risk_overridden",
        "sent_to_committee",
        "committee_decided",
        "committee_condition_verified",
    ]


def test_controls_cannot_eliminate_residual_risk() -> None:
    created = client.post("/api/v1/cases", json=valid_intake()).json()
    case_id = created["case_id"]
    client.post(f"/api/v1/cases/{case_id}/submit")
    assessment = risk_assessment()
    assessment.update(
        {
            "customer_risk": 1,
            "product_risk": 1,
            "channel_risk": 1,
            "geography_risk": 1,
            "transaction_risk": 1,
            "third_party_risk": 1,
            "control_effectiveness": 4,
        }
    )

    response = client.post(f"/api/v1/cases/{case_id}/risk-assessment", json=assessment)

    assert response.status_code == 200
    assert response.json()["residual_risk"] == 1


def test_assessment_draft_is_cited_and_does_not_make_a_decision() -> None:
    created = client.post("/api/v1/cases", json=valid_intake()).json()
    case_id = created["case_id"]
    client.post(f"/api/v1/cases/{case_id}/submit")
    client.post(f"/api/v1/cases/{case_id}/risk-assessment", json=risk_assessment())

    response = client.post(f"/api/v1/cases/{case_id}/assessment-draft")

    assert response.status_code == 200
    case = response.json()
    assert case["status"] == "analyst_review"
    assert case["assessment_draft"]["decision_authority"] == "human_only"
    assert len(case["assessment_draft"]["citations"]) == 2
    assert case["committee_decision"] is None


def test_committee_cannot_decide_before_analyst_review() -> None:
    created = client.post("/api/v1/cases", json=valid_intake()).json()

    response = client.post(
        f"/api/v1/cases/{created['case_id']}/committee-decision",
        json={
            "decision": "approve",
            "rationale": "This rationale is long enough but must not be accepted before review.",
            "committee_member": "Morgan Committee Member",
            "conditions": [],
        },
    )

    assert response.status_code == 409


def test_evidence_package_contains_case_and_verified_audit_trail() -> None:
    created = client.post("/api/v1/cases", json=valid_intake()).json()
    case_id = created["case_id"]
    client.post(f"/api/v1/cases/{case_id}/submit")
    client.post(f"/api/v1/cases/{case_id}/risk-assessment", json=risk_assessment())
    client.post(f"/api/v1/cases/{case_id}/assessment-draft")
    client.post(f"/api/v1/cases/{case_id}/send-to-committee")
    client.post(
        f"/api/v1/cases/{case_id}/committee-decision",
        json={
            "decision": "approve_with_conditions",
            "rationale": "Approval is appropriate once the specified control verification is completed.",
            "committee_member": "Morgan Committee Member",
            "conditions": [
                {
                    "description": "Verify sanctions-screening coverage before launch.",
                    "owner": "Taylor Product Owner",
                    "due_date": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
                    "verification_criteria": "Provide a test report demonstrating coverage for GB and US payment routes.",
                }
            ],
        },
    )

    response = client.get(f"/api/v1/cases/{case_id}/evidence-package?requested_by=Examiner")

    assert response.status_code == 200
    package = response.json()
    assert package["synthetic_data"] is True
    assert package["case"]["committee_decision"]["decision"] == "approve_with_conditions"
    assert package["audit_verification"]["valid"] is True
    assert package["audit_events"][-1]["action"] == "evidence_exported"