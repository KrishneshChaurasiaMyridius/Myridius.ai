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
    case_store._cases.clear()


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