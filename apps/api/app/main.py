from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
import hashlib
import json
import math
import sqlite3
from typing import Any, Literal, Sequence
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, HttpUrl, ValidationInfo, field_validator, model_validator


class CaseStatus(StrEnum):
    DRAFT = "draft"
    INTAKE_REVIEW = "intake_review"
    ANALYST_REVIEW = "analyst_review"
    COMMITTEE_DECISION = "committee_decision"
    DECIDED = "decided"


class ChangeType(StrEnum):
    PRODUCT = "product"
    PRODUCT_FEATURE = "product_feature"
    PROCESS = "process"
    VENDOR = "vendor"
    GEOGRAPHY = "geography"
    CUSTOMER_SEGMENT = "customer_segment"


class RiskLevel(StrEnum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class CommitteeDecisionType(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    DEFER = "defer"
    APPROVE_WITH_CONDITIONS = "approve_with_conditions"


class ConditionStatus(StrEnum):
    OPEN = "open"
    VERIFIED = "verified"


class IntakeRequest(BaseModel):
    title: str = Field(min_length=8, max_length=160)
    change_type: ChangeType
    business_rationale: str = Field(min_length=20, max_length=2_000)
    business_owner: str = Field(min_length=3, max_length=120)
    target_launch_date: datetime
    jurisdictions: list[str] = Field(min_length=1, max_length=20)
    customer_exposure: RiskLevel
    delivery_channels: list[str] = Field(min_length=1, max_length=10)
    payment_characteristics: list[str] = Field(min_length=1, max_length=10)
    third_parties: list[str] = Field(default_factory=list, max_length=20)
    proposed_controls: list[str] = Field(min_length=1, max_length=20)
    attachment_urls: list[HttpUrl] = Field(default_factory=list, max_length=10)
    is_synthetic: Literal[True]

    @model_validator(mode="after")
    def validate_vendor_context(self) -> "IntakeRequest":
        if self.change_type is ChangeType.VENDOR and not self.third_parties:
            raise ValueError("Vendor changes require at least one third party.")
        return self


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "risk-assessment-api"
    timestamp: datetime


class CaseSummary(BaseModel):
    case_id: str
    title: str
    change_type: str
    status: CaseStatus
    inherent_risk: int = Field(ge=1, le=5)
    residual_risk: int = Field(ge=1, le=5)


class CaseDetail(CaseSummary):
    version: int
    submitted_at: datetime | None
    intake: IntakeRequest
    risk_assessment: Any | None = None
    assessment_draft: Any | None = None
    analyst_override: Any | None = None
    committee_decision: Any | None = None


class RiskAssessmentRequest(BaseModel):
    customer_risk: int = Field(ge=1, le=5)
    product_risk: int = Field(ge=1, le=5)
    channel_risk: int = Field(ge=1, le=5)
    geography_risk: int = Field(ge=1, le=5)
    transaction_risk: int = Field(ge=1, le=5)
    third_party_risk: int = Field(ge=1, le=5)
    control_effectiveness: int = Field(ge=0, le=4)
    analyst: str = Field(min_length=3, max_length=120)


class RiskAssessment(BaseModel):
    factor_scores: dict[str, int]
    inherent_risk: int = Field(ge=1, le=5)
    control_effectiveness: int = Field(ge=0, le=4)
    residual_risk: int = Field(ge=1, le=5)
    rating: RiskLevel
    configuration_version: str = "risk-config-v1"
    algorithm_version: str = "deterministic-v1"
    assessed_at: datetime
    assessed_by: str


class AnalystOverrideRequest(BaseModel):
    residual_risk: int = Field(ge=1, le=5)
    rationale: str = Field(min_length=20, max_length=2_000)
    analyst: str = Field(min_length=3, max_length=120)


class PolicyCitation(BaseModel):
    source_id: str
    title: str
    excerpt: str
    topic: str


class AssessmentDraft(BaseModel):
    summary: str
    analyst_questions: list[str]
    citations: list[PolicyCitation]
    prepared_at: datetime
    generator: str = "deterministic-mock-v1"
    decision_authority: Literal["human_only"] = "human_only"


class AnalystOverride(BaseModel):
    previous_residual_risk: int = Field(ge=1, le=5)
    residual_risk: int = Field(ge=1, le=5)
    rationale: str
    analyst: str
    overridden_at: datetime


class CommitteeConditionRequest(BaseModel):
    description: str = Field(min_length=10, max_length=500)
    owner: str = Field(min_length=3, max_length=120)
    due_date: datetime
    verification_criteria: str = Field(min_length=10, max_length=1_000)


class CommitteeCondition(CommitteeConditionRequest):
    condition_id: str = Field(default_factory=lambda: str(uuid4()))
    status: ConditionStatus = ConditionStatus.OPEN
    verified_by: str | None = None
    verified_at: datetime | None = None


class ConditionVerificationRequest(BaseModel):
    verifier: str = Field(min_length=3, max_length=120)
    evidence_summary: str = Field(min_length=20, max_length=2_000)


class CommitteeDecisionRequest(BaseModel):
    decision: CommitteeDecisionType
    rationale: str = Field(min_length=20, max_length=2_000)
    committee_member: str = Field(min_length=3, max_length=120)
    conditions: list[CommitteeConditionRequest] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def validate_conditions(self) -> "CommitteeDecisionRequest":
        if self.decision is CommitteeDecisionType.APPROVE_WITH_CONDITIONS and not self.conditions:
            raise ValueError("Conditional approval requires at least one condition.")
        if self.decision is not CommitteeDecisionType.APPROVE_WITH_CONDITIONS and self.conditions:
            raise ValueError("Conditions are only valid for conditional approval.")
        return self


class CommitteeDecision(BaseModel):
    decision: CommitteeDecisionType
    rationale: str
    committee_member: str
    decided_at: datetime
    conditions: list[CommitteeCondition] = Field(default_factory=list)

    @field_validator("conditions", mode="before")
    @classmethod
    def normalize_legacy_conditions(
        cls, conditions: object, info: ValidationInfo
    ) -> object:
        if not isinstance(conditions, list):
            return conditions
        decided_at = info.data.get("decided_at", datetime.now(timezone.utc))
        return [
            {
                "description": condition,
                "owner": "Unassigned",
                "due_date": decided_at,
                "verification_criteria": "Legacy condition requires manual verification.",
                "status": ConditionStatus.OPEN,
            }
            if isinstance(condition, str)
            else condition
            for condition in conditions
        ]


class AuditEvent(BaseModel):
    event_id: str
    case_id: str
    action: str
    actor: str
    occurred_at: datetime
    payload: dict[str, object]
    previous_hash: str | None
    event_hash: str


class AuditVerification(BaseModel):
    case_id: str
    event_count: int
    valid: bool


class EvidencePackage(BaseModel):
    package_version: str = "evidence-package-v1"
    generated_at: datetime
    synthetic_data: Literal[True] = True
    case: CaseDetail
    audit_events: list[AuditEvent]
    audit_verification: AuditVerification


class CaseStore:
    """SQLite-backed local demo store with append-only audit events."""

    def __init__(self, database_path: str = "raw.db") -> None:
        self.database_path = database_path
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS cases (
                    case_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    change_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    inherent_risk INTEGER NOT NULL,
                    residual_risk INTEGER NOT NULL,
                    version INTEGER NOT NULL,
                    submitted_at TEXT,
                    intake_json TEXT NOT NULL,
                    risk_assessment_json TEXT,
                    assessment_draft_json TEXT,
                    analyst_override_json TEXT,
                    committee_decision_json TEXT
                )
                """
            )
            existing_columns = {row["name"] for row in connection.execute("PRAGMA table_info(cases)")}
            for column in ("risk_assessment_json", "assessment_draft_json", "analyst_override_json", "committee_decision_json"):
                if column not in existing_columns:
                    connection.execute(f"ALTER TABLE cases ADD COLUMN {column} TEXT")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_events (
                    event_id TEXT PRIMARY KEY,
                    case_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    previous_hash TEXT,
                    event_hash TEXT NOT NULL UNIQUE
                )
                """
            )

    def reset(self) -> None:
        """Test helper; production code has no deletion endpoint for audit evidence."""
        with self._connect() as connection:
            connection.execute("DELETE FROM audit_events")
            connection.execute("DELETE FROM cases")

    @staticmethod
    def _serialize_intake(intake: IntakeRequest) -> str:
        return intake.model_dump_json()

    @staticmethod
    def _row_to_case(row: sqlite3.Row) -> CaseDetail:
        return CaseDetail(
            case_id=row["case_id"],
            title=row["title"],
            change_type=row["change_type"],
            status=row["status"],
            inherent_risk=row["inherent_risk"],
            residual_risk=row["residual_risk"],
            version=row["version"],
            submitted_at=row["submitted_at"],
            intake=IntakeRequest.model_validate_json(row["intake_json"]),
            risk_assessment=(
                RiskAssessment.model_validate_json(row["risk_assessment_json"])
                if row["risk_assessment_json"]
                else None
            ),
            assessment_draft=(
                AssessmentDraft.model_validate_json(row["assessment_draft_json"])
                if row["assessment_draft_json"]
                else None
            ),
            analyst_override=(
                AnalystOverride.model_validate_json(row["analyst_override_json"])
                if row["analyst_override_json"]
                else None
            ),
            committee_decision=(
                CommitteeDecision.model_validate_json(row["committee_decision_json"])
                if row["committee_decision_json"]
                else None
            ),
        )

    @staticmethod
    def _hash_event(
        previous_hash: str | None,
        case_id: str,
        action: str,
        occurred_at: datetime,
        payload: dict[str, object],
    ) -> str:
        material = json.dumps(
            {
                "previous_hash": previous_hash,
                "case_id": case_id,
                "action": action,
                "occurred_at": occurred_at.isoformat(),
                "payload": payload,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def _append_audit_event(
        self,
        connection: sqlite3.Connection,
        case_id: str,
        action: str,
        payload: dict[str, object],
        actor: str = "system",
    ) -> None:
        last_event = connection.execute(
            "SELECT event_hash FROM audit_events WHERE case_id = ? ORDER BY occurred_at DESC, event_id DESC LIMIT 1",
            (case_id,),
        ).fetchone()
        previous_hash = last_event["event_hash"] if last_event else None
        occurred_at = datetime.now(timezone.utc)
        event_hash = self._hash_event(previous_hash, case_id, action, occurred_at, payload)
        connection.execute(
            """
            INSERT INTO audit_events (
                event_id, case_id, action, actor, occurred_at, payload_json, previous_hash, event_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                case_id,
                action,
                actor,
                occurred_at.isoformat(),
                json.dumps(payload, sort_keys=True),
                previous_hash,
                event_hash,
            ),
        )

    def list(self) -> list[CaseSummary]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM cases ORDER BY rowid DESC").fetchall()
        return [CaseSummary.model_validate(dict(row)) for row in rows]

    def create(self, intake: IntakeRequest) -> CaseDetail:
        case_id = f"RAW-{uuid4().hex[:8].upper()}"
        case = CaseDetail(
            case_id=case_id,
            title=intake.title,
            change_type=intake.change_type,
            status=CaseStatus.DRAFT,
            inherent_risk=1,
            residual_risk=1,
            version=1,
            submitted_at=None,
            intake=intake,
        )
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO cases (
                    case_id, title, change_type, status, inherent_risk, residual_risk, version, submitted_at, intake_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case.case_id,
                    case.title,
                    case.change_type,
                    case.status,
                    case.inherent_risk,
                    case.residual_risk,
                    case.version,
                    None,
                    self._serialize_intake(intake),
                ),
            )
            self._append_audit_event(
                connection,
                case_id,
                "case_created",
                {"status": CaseStatus.DRAFT, "version": 1, "synthetic": True},
                actor=intake.business_owner,
            )
        return case

    def get(self, case_id: str) -> CaseDetail:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
        return self._row_to_case(row)

    def submit(self, case_id: str) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft cases can be submitted for intake review.",
            )
        submitted_at = datetime.now(timezone.utc)
        submitted = case.model_copy(
            update={
                "status": CaseStatus.INTAKE_REVIEW,
                "version": case.version + 1,
                "submitted_at": submitted_at,
            }
        )
        with self._connect() as connection:
            connection.execute(
                "UPDATE cases SET status = ?, version = ?, submitted_at = ? WHERE case_id = ?",
                (submitted.status, submitted.version, submitted_at.isoformat(), case_id),
            )
            self._append_audit_event(
                connection,
                case_id,
                "case_submitted",
                {"from_status": case.status, "to_status": submitted.status, "version": submitted.version},
                actor=case.intake.business_owner,
            )
        return submitted

    @staticmethod
    def _rating(score: int) -> RiskLevel:
        if score <= 2:
            return RiskLevel.LOW
        if score == 3:
            return RiskLevel.MODERATE
        return RiskLevel.HIGH

    def assess_risk(self, case_id: str, request: RiskAssessmentRequest) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.INTAKE_REVIEW:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only intake-review cases can enter analyst risk review.",
            )
        factor_scores = {
            "customer": request.customer_risk,
            "product": request.product_risk,
            "channel": request.channel_risk,
            "geography": request.geography_risk,
            "transaction": request.transaction_risk,
            "third_party": request.third_party_risk,
        }
        inherent_risk = math.ceil(sum(factor_scores.values()) / len(factor_scores))
        mitigation = request.control_effectiveness / 5
        residual_risk = max(1, math.ceil(inherent_risk * (1 - mitigation)))
        assessment = RiskAssessment(
            factor_scores=factor_scores,
            inherent_risk=inherent_risk,
            control_effectiveness=request.control_effectiveness,
            residual_risk=residual_risk,
            rating=self._rating(residual_risk),
            assessed_at=datetime.now(timezone.utc),
            assessed_by=request.analyst,
        )
        updated = case.model_copy(
            update={
                "status": CaseStatus.ANALYST_REVIEW,
                "inherent_risk": inherent_risk,
                "residual_risk": residual_risk,
                "risk_assessment": assessment,
                "version": case.version + 1,
            }
        )
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE cases SET status = ?, inherent_risk = ?, residual_risk = ?, version = ?, risk_assessment_json = ?
                WHERE case_id = ?
                """,
                (
                    updated.status,
                    inherent_risk,
                    residual_risk,
                    updated.version,
                    assessment.model_dump_json(),
                    case_id,
                ),
            )
            self._append_audit_event(
                connection,
                case_id,
                "risk_assessed",
                {
                    "factor_scores": factor_scores,
                    "inherent_risk": inherent_risk,
                    "control_effectiveness": request.control_effectiveness,
                    "residual_risk": residual_risk,
                    "configuration_version": assessment.configuration_version,
                },
                actor=request.analyst,
            )
        return updated

    def override_risk(self, case_id: str, request: AnalystOverrideRequest) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.ANALYST_REVIEW or not case.risk_assessment:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only assessed cases in analyst review can be overridden.",
            )
        override = AnalystOverride(
            previous_residual_risk=case.residual_risk,
            residual_risk=request.residual_risk,
            rationale=request.rationale,
            analyst=request.analyst,
            overridden_at=datetime.now(timezone.utc),
        )
        updated = case.model_copy(
            update={
                "residual_risk": request.residual_risk,
                "analyst_override": override,
                "version": case.version + 1,
            }
        )
        with self._connect() as connection:
            connection.execute(
                "UPDATE cases SET residual_risk = ?, version = ?, analyst_override_json = ? WHERE case_id = ?",
                (updated.residual_risk, updated.version, override.model_dump_json(), case_id),
            )
            self._append_audit_event(
                connection,
                case_id,
                "risk_overridden",
                {
                    "previous_residual_risk": override.previous_residual_risk,
                    "residual_risk": override.residual_risk,
                    "rationale": override.rationale,
                },
                actor=request.analyst,
            )
        return updated

    def draft_assessment(self, case_id: str) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.ANALYST_REVIEW or not case.risk_assessment:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only assessed cases in analyst review can receive an assessment draft.",
            )
        assessment = case.risk_assessment
        citations = [
            PolicyCitation(
                source_id="FATF-RBA-2014-1",
                title="FATF Guidance: The Risk-Based Approach",
                excerpt="Risk assessment should identify and understand the risks a firm faces and apply proportionate mitigation.",
                topic="risk_based_approach",
            ),
            PolicyCitation(
                source_id="RAW-SYNTHETIC-POLICY-01",
                title="Synthetic FCRM Product Change Standard",
                excerpt="Controls mitigate residual risk but do not eliminate the need for a documented human decision.",
                topic="controls_and_governance",
            ),
        ]
        draft = AssessmentDraft(
            summary=(
                f"The proposed {case.change_type.replace('_', ' ')} change has an inherent risk score of "
                f"{assessment.inherent_risk}/5 and a residual risk score of {case.residual_risk}/5. "
                f"The case requires analyst confirmation before committee review."
            ),
            analyst_questions=[
                "Confirm that sanctions screening covers all stated jurisdictions before launch.",
                "Validate the operating effectiveness evidence for the proposed transaction monitoring control.",
            ],
            citations=citations,
            prepared_at=datetime.now(timezone.utc),
        )
        updated = case.model_copy(update={"assessment_draft": draft, "version": case.version + 1})
        with self._connect() as connection:
            connection.execute(
                "UPDATE cases SET version = ?, assessment_draft_json = ? WHERE case_id = ?",
                (updated.version, draft.model_dump_json(), case_id),
            )
            self._append_audit_event(
                connection,
                case_id,
                "assessment_drafted",
                {"generator": draft.generator, "citation_ids": [citation.source_id for citation in citations]},
            )
        return updated

    def send_to_committee(self, case_id: str, analyst: str) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.ANALYST_REVIEW or not case.risk_assessment:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only assessed cases in analyst review can be sent to committee.",
            )
        updated = case.model_copy(update={"status": CaseStatus.COMMITTEE_DECISION, "version": case.version + 1})
        with self._connect() as connection:
            connection.execute(
                "UPDATE cases SET status = ?, version = ? WHERE case_id = ?",
                (updated.status, updated.version, case_id),
            )
            self._append_audit_event(
                connection,
                case_id,
                "sent_to_committee",
                {"residual_risk": updated.residual_risk, "version": updated.version},
                actor=analyst,
            )
        return updated

    def decide(self, case_id: str, request: CommitteeDecisionRequest) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.COMMITTEE_DECISION:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only committee-ready cases can receive a decision.",
            )
        decision = CommitteeDecision(
            decision=request.decision,
            rationale=request.rationale,
            committee_member=request.committee_member,
            decided_at=datetime.now(timezone.utc),
            conditions=[CommitteeCondition(**condition.model_dump()) for condition in request.conditions],
        )
        updated = case.model_copy(
            update={"status": CaseStatus.DECIDED, "committee_decision": decision, "version": case.version + 1}
        )
        with self._connect() as connection:
            connection.execute(
                "UPDATE cases SET status = ?, version = ?, committee_decision_json = ? WHERE case_id = ?",
                (updated.status, updated.version, decision.model_dump_json(), case_id),
            )
            self._append_audit_event(
                connection,
                case_id,
                "committee_decided",
                {
                    "decision": decision.decision,
                    "conditions": [condition.model_dump(mode="json") for condition in decision.conditions],
                    "version": updated.version,
                },
                actor=request.committee_member,
            )
        return updated

    def verify_condition(
        self, case_id: str, condition_id: str, request: ConditionVerificationRequest
    ) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.DECIDED or not case.committee_decision:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only decided cases with committee conditions can be verified.",
            )
        conditions = case.committee_decision.conditions
        condition_index = next(
            (index for index, condition in enumerate(conditions) if condition.condition_id == condition_id), None
        )
        if condition_index is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Committee condition not found.")
        condition = conditions[condition_index]
        if condition.status is ConditionStatus.VERIFIED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Committee condition is already verified.")
        verified_at = datetime.now(timezone.utc)
        conditions[condition_index] = condition.model_copy(
            update={"status": ConditionStatus.VERIFIED, "verified_by": request.verifier, "verified_at": verified_at}
        )
        decision = case.committee_decision.model_copy(update={"conditions": conditions})
        updated = case.model_copy(update={"committee_decision": decision, "version": case.version + 1})
        with self._connect() as connection:
            connection.execute(
                "UPDATE cases SET version = ?, committee_decision_json = ? WHERE case_id = ?",
                (updated.version, decision.model_dump_json(), case_id),
            )
            self._append_audit_event(
                connection,
                case_id,
                "committee_condition_verified",
                {
                    "condition_id": condition.condition_id,
                    "evidence_summary": request.evidence_summary,
                    "verified_at": verified_at.isoformat(),
                },
                actor=request.verifier,
            )
        return updated

    def audit_events(self, case_id: str) -> Sequence[AuditEvent]:
        self.get(case_id)
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM audit_events WHERE case_id = ? ORDER BY occurred_at, event_id", (case_id,)
            ).fetchall()
        return [
            AuditEvent(
                event_id=row["event_id"],
                case_id=row["case_id"],
                action=row["action"],
                actor=row["actor"],
                occurred_at=row["occurred_at"],
                payload=json.loads(row["payload_json"]),
                previous_hash=row["previous_hash"],
                event_hash=row["event_hash"],
            )
            for row in rows
        ]

    def verify_audit_events(self, case_id: str) -> AuditVerification:
        events = self.audit_events(case_id)
        previous_hash: str | None = None
        for event in events:
            expected_hash = self._hash_event(
                previous_hash,
                event.case_id,
                event.action,
                event.occurred_at,
                event.payload,
            )
            if event.previous_hash != previous_hash or event.event_hash != expected_hash:
                return AuditVerification(case_id=case_id, event_count=len(events), valid=False)
            previous_hash = event.event_hash
        return AuditVerification(case_id=case_id, event_count=len(events), valid=True)

    def evidence_package(self, case_id: str, requested_by: str = "examiner") -> EvidencePackage:
        case = self.get(case_id)
        with self._connect() as connection:
            self._append_audit_event(
                connection,
                case_id,
                "evidence_exported",
                {"package_version": "evidence-package-v1", "synthetic": True},
                actor=requested_by,
            )
        return EvidencePackage(
            generated_at=datetime.now(timezone.utc),
            case=self.get(case_id),
            audit_events=list(self.audit_events(case_id)),
            audit_verification=self.verify_audit_events(case_id),
        )


app = FastAPI(
    title="Risk Assessment Workbench API",
    version="0.1.0",
    description="Synthetic-data-only FCRM assessment service. Human decision authority is mandatory.",
)
case_store = CaseStore()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health", response_model=HealthResponse, tags=["operations"])
def health() -> HealthResponse:
    return HealthResponse(timestamp=datetime.now(timezone.utc))


@app.get("/api/v1/cases", response_model=list[CaseSummary], tags=["cases"])
def list_cases() -> list[CaseSummary]:
    return case_store.list()


@app.post(
    "/api/v1/cases",
    response_model=CaseDetail,
    status_code=status.HTTP_201_CREATED,
    tags=["cases"],
)
def create_case(intake: IntakeRequest) -> CaseDetail:
    return case_store.create(intake)


@app.get("/api/v1/cases/{case_id}", response_model=CaseDetail, tags=["cases"])
def get_case(case_id: str) -> CaseDetail:
    return case_store.get(case_id)


@app.post("/api/v1/cases/{case_id}/submit", response_model=CaseDetail, tags=["cases"])
def submit_case(case_id: str) -> CaseDetail:
    return case_store.submit(case_id)


@app.post("/api/v1/cases/{case_id}/risk-assessment", response_model=CaseDetail, tags=["risk"])
def assess_case_risk(case_id: str, request: RiskAssessmentRequest) -> CaseDetail:
    return case_store.assess_risk(case_id, request)


@app.post("/api/v1/cases/{case_id}/assessment-draft", response_model=CaseDetail, tags=["ai"])
def create_assessment_draft(case_id: str) -> CaseDetail:
    return case_store.draft_assessment(case_id)


@app.post("/api/v1/cases/{case_id}/risk-override", response_model=CaseDetail, tags=["analyst"])
def override_case_risk(case_id: str, request: AnalystOverrideRequest) -> CaseDetail:
    return case_store.override_risk(case_id, request)


@app.post("/api/v1/cases/{case_id}/send-to-committee", response_model=CaseDetail, tags=["analyst"])
def send_case_to_committee(case_id: str, analyst: str = "FCRM Analyst") -> CaseDetail:
    return case_store.send_to_committee(case_id, analyst)


@app.post("/api/v1/cases/{case_id}/committee-decision", response_model=CaseDetail, tags=["committee"])
def record_committee_decision(case_id: str, request: CommitteeDecisionRequest) -> CaseDetail:
    return case_store.decide(case_id, request)


@app.post(
    "/api/v1/cases/{case_id}/conditions/{condition_id}/verify",
    response_model=CaseDetail,
    tags=["committee"],
)
def verify_committee_condition(
    case_id: str, condition_id: str, request: ConditionVerificationRequest
) -> CaseDetail:
    return case_store.verify_condition(case_id, condition_id, request)


@app.get("/api/v1/cases/{case_id}/audit-events", response_model=list[AuditEvent], tags=["audit"])
def list_audit_events(case_id: str) -> list[AuditEvent]:
    return case_store.audit_events(case_id)


@app.get("/api/v1/cases/{case_id}/audit-verification", response_model=AuditVerification, tags=["audit"])
def verify_audit_events(case_id: str) -> AuditVerification:
    return case_store.verify_audit_events(case_id)


@app.get("/api/v1/cases/{case_id}/evidence-package", response_model=EvidencePackage, tags=["audit"])
def export_evidence_package(case_id: str, requested_by: str = "examiner") -> EvidencePackage:
    return case_store.evidence_package(case_id, requested_by)