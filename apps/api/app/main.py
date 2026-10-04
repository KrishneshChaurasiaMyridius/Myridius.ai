from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
import hashlib
import json
import math
import os
import sqlite3
from typing import Annotated, Any, Callable, Literal, Sequence
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, HttpUrl, ValidationInfo, field_validator, model_validator


class StoreConnection:
    """Minimal SQL dialect adapter for SQLite local demos and PostgreSQL deployments."""

    def __init__(self, connection: Any, is_postgres: bool) -> None:
        self.connection = connection
        self.is_postgres = is_postgres

    def __enter__(self) -> "StoreConnection":
        return self

    def __exit__(self, exception_type: object, exception: object, traceback: object) -> None:
        if exception_type is None:
            self.connection.commit()
        else:
            self.connection.rollback()
        self.connection.close()

    def execute(self, statement: str, parameters: tuple[object, ...] = ()) -> Any:
        if self.is_postgres:
            statement = statement.replace("?", "%s")
        return self.connection.execute(statement, parameters)


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


class Role(StrEnum):
    PRODUCT_OWNER = "product_owner"
    ANALYST = "analyst"
    COMMITTEE_MEMBER = "committee_member"
    AUDITOR = "auditor"
    ADMINISTRATOR = "administrator"


class Actor(BaseModel):
    actor_id: str
    display_name: str
    role: Role


DEMO_ACTORS = {
    "product-owner": Actor(actor_id="product-owner", display_name="Taylor Product Owner", role=Role.PRODUCT_OWNER),
    "analyst": Actor(actor_id="analyst", display_name="Alex FCRM Analyst", role=Role.ANALYST),
    "committee": Actor(actor_id="committee", display_name="Morgan Committee Member", role=Role.COMMITTEE_MEMBER),
    "auditor": Actor(actor_id="auditor", display_name="Avery Internal Auditor", role=Role.AUDITOR),
    "administrator": Actor(actor_id="administrator", display_name="Casey Risk Administrator", role=Role.ADMINISTRATOR),
}


def current_actor(x_actor_id: Annotated[str | None, Header()] = None) -> Actor:
    if not x_actor_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="An X-Actor-Id header is required.")
    actor = DEMO_ACTORS.get(x_actor_id)
    if not actor:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown demo actor.")
    return actor


def require_roles(*roles: Role) -> Callable[[Actor], Actor]:
    def dependency(actor: Annotated[Actor, Depends(current_actor)]) -> Actor:
        if actor.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Actor is not authorised for this action.")
        return actor

    return dependency


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


class OperationsMetrics(BaseModel):
    generated_at: datetime
    cases_by_status: dict[str, int]
    audit_event_count: int
    invalid_audit_chain_count: int
    active_risk_configuration: str
    policy_source_count: int


class CaseSummary(BaseModel):
    case_id: str
    title: str
    change_type: str
    status: CaseStatus
    inherent_risk: int = Field(ge=1, le=5)
    residual_risk: int = Field(ge=1, le=5)


class DocumentEvidenceRequest(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    document_type: str = Field(min_length=3, max_length=100)
    content: str = Field(min_length=20, max_length=20_000)
    source_url: HttpUrl | None = None
    is_synthetic: Literal[True]


class DocumentEvidence(DocumentEvidenceRequest):
    document_id: str = Field(default_factory=lambda: str(uuid4()))
    extracted_jurisdictions: list[str] = Field(default_factory=list)
    extracted_controls: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    extracted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    extracted_by: str = "deterministic-document-extractor-v1"


class CaseDetail(CaseSummary):
    version: int
    submitted_at: datetime | None
    intake: IntakeRequest
    risk_assessment: Any | None = None
    assessment_draft: Any | None = None
    analyst_override: Any | None = None
    committee_decision: Any | None = None
    document_evidence: list[DocumentEvidence] = Field(default_factory=list)


class RiskAssessmentRequest(BaseModel):
    customer_risk: int = Field(ge=1, le=5)
    product_risk: int = Field(ge=1, le=5)
    channel_risk: int = Field(ge=1, le=5)
    geography_risk: int = Field(ge=1, le=5)
    transaction_risk: int = Field(ge=1, le=5)
    third_party_risk: int = Field(ge=1, le=5)
    control_effectiveness: int = Field(ge=0, le=4)
    analyst: str = Field(min_length=3, max_length=120)


RISK_FACTORS = ("customer", "product", "channel", "geography", "transaction", "third_party")


class RiskConfiguration(BaseModel):
    version: str = Field(pattern=r"^risk-config-v[1-9][0-9]*$")
    factor_weights: dict[str, float]
    control_mitigation_divisor: float = Field(gt=4, le=10)
    low_risk_maximum: int = Field(ge=1, le=4)
    moderate_risk_maximum: int = Field(ge=2, le=5)
    updated_by: str = Field(min_length=3, max_length=120)
    updated_at: datetime

    @model_validator(mode="after")
    def validate_scoring_parameters(self) -> "RiskConfiguration":
        if set(self.factor_weights) != set(RISK_FACTORS):
            raise ValueError("Factor weights must cover each risk factor exactly once.")
        if any(weight <= 0 for weight in self.factor_weights.values()):
            raise ValueError("Factor weights must be greater than zero.")
        if self.low_risk_maximum >= self.moderate_risk_maximum:
            raise ValueError("The low-risk maximum must be below the moderate-risk maximum.")
        return self


class RiskConfigurationUpdateRequest(BaseModel):
    version: str = Field(pattern=r"^risk-config-v[1-9][0-9]*$")
    factor_weights: dict[str, float]
    control_mitigation_divisor: float = Field(gt=4, le=10)
    low_risk_maximum: int = Field(ge=1, le=4)
    moderate_risk_maximum: int = Field(ge=2, le=5)
    updated_by: str = Field(min_length=3, max_length=120)


class RiskAssessment(BaseModel):
    factor_scores: dict[str, int]
    inherent_risk: int = Field(ge=1, le=5)
    control_effectiveness: int = Field(ge=0, le=4)
    residual_risk: int = Field(ge=1, le=5)
    rating: RiskLevel
    configuration_version: str = "risk-config-v1"
    configuration_snapshot: dict[str, Any] = Field(default_factory=dict)
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


class PolicySource(PolicyCitation):
    approved: bool = True
    synthetic_data: Literal[True] = True
    effective_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    retired_at: datetime | None = None
    governance_owner: str = "System seed"


class PolicySourceCreateRequest(BaseModel):
    source_id: str = Field(pattern=r"^[A-Z0-9-]{4,80}$")
    title: str = Field(min_length=10, max_length=300)
    excerpt: str = Field(min_length=20, max_length=2_000)
    topic: str = Field(min_length=3, max_length=100)


class PolicyAuditEvent(BaseModel):
    event_id: str
    source_id: str
    action: str
    actor: str
    occurred_at: datetime
    payload: dict[str, object]


class AssessmentDraft(BaseModel):
    summary: str
    analyst_questions: list[str]
    citations: list[PolicyCitation]
    evidence_document_ids: list[str] = Field(default_factory=list)
    evidence_context: list[str] = Field(default_factory=list)
    retrieval_query: str = ""
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

    def __init__(self, database_path: str = "raw.db", database_url: str | None = None) -> None:
        self.database_path = database_path
        self.database_url = database_url
        self._initialize()

    @property
    def is_postgres(self) -> bool:
        return bool(self.database_url)

    def _connect(self) -> StoreConnection:
        if self.database_url:
            try:
                import psycopg
                from psycopg.rows import dict_row
            except ImportError as error:
                raise RuntimeError("PostgreSQL deployment requires psycopg.") from error
            connection = psycopg.connect(
                self.database_url.replace("postgresql+psycopg://", "postgresql://"), row_factory=dict_row
            )
            return StoreConnection(connection, is_postgres=True)
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return StoreConnection(connection, is_postgres=False)

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
            if not self.is_postgres:
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
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS intake_versions (
                    case_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    intake_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (case_id, version)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS evidence_documents (
                    document_id TEXT PRIMARY KEY,
                    case_id TEXT NOT NULL,
                    document_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS risk_configurations (
                    version TEXT PRIMARY KEY,
                    configuration_json TEXT NOT NULL,
                    active INTEGER NOT NULL CHECK(active IN (0, 1))
                )
                """
            )
            active_configuration = connection.execute(
                "SELECT version FROM risk_configurations WHERE active = 1"
            ).fetchone()
            if not active_configuration:
                default_configuration = self._default_risk_configuration()
                connection.execute(
                    "INSERT INTO risk_configurations (version, configuration_json, active) VALUES (?, ?, 1)",
                    (default_configuration.version, default_configuration.model_dump_json()),
                )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS policy_sources (
                    source_id TEXT PRIMARY KEY,
                    source_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS policy_audit_events (
                    event_id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            source_count = connection.execute("SELECT COUNT(*) AS count FROM policy_sources").fetchone()["count"]
            if not source_count:
                for source in self._default_policy_sources():
                    connection.execute(
                        "INSERT INTO policy_sources (source_id, source_json) VALUES (?, ?)",
                        (source.source_id, source.model_dump_json()),
                    )

    @staticmethod
    def _default_risk_configuration() -> RiskConfiguration:
        return RiskConfiguration(
            version="risk-config-v1",
            factor_weights={factor: 1 for factor in RISK_FACTORS},
            control_mitigation_divisor=5,
            low_risk_maximum=2,
            moderate_risk_maximum=3,
            updated_by="System seed",
            updated_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def _default_policy_sources() -> list[PolicySource]:
        return [
            PolicySource(
                source_id="FATF-RBA-2014-1",
                title="FATF Guidance: The Risk-Based Approach",
                excerpt="Risk assessment should identify and understand the risks a firm faces and apply proportionate mitigation.",
                topic="risk_based_approach",
            ),
            PolicySource(
                source_id="RAW-SYNTHETIC-POLICY-01",
                title="Synthetic FCRM Product Change Standard",
                excerpt="Controls mitigate residual risk but do not eliminate the need for a documented human decision.",
                topic="controls_and_governance",
            ),
        ]

    def policy_sources(self) -> list[PolicySource]:
        with self._connect() as connection:
            rows = connection.execute("SELECT source_json FROM policy_sources ORDER BY source_id").fetchall()
        return [PolicySource.model_validate_json(row["source_json"]) for row in rows]

    def _append_policy_audit_event(
        self, connection: StoreConnection, source_id: str, action: str, payload: dict[str, object], actor: Actor
    ) -> None:
        connection.execute(
            """
            INSERT INTO policy_audit_events (event_id, source_id, action, actor, occurred_at, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                source_id,
                action,
                actor.display_name,
                datetime.now(timezone.utc).isoformat(),
                json.dumps(payload, sort_keys=True),
            ),
        )

    def add_policy_source(self, request: PolicySourceCreateRequest, actor: Actor) -> PolicySource:
        source = PolicySource(**request.model_dump(), governance_owner=actor.display_name)
        with self._connect() as connection:
            existing = connection.execute(
                "SELECT source_id FROM policy_sources WHERE source_id = ?", (source.source_id,)
            ).fetchone()
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Policy source identifier already exists.")
            connection.execute(
                "INSERT INTO policy_sources (source_id, source_json) VALUES (?, ?)",
                (source.source_id, source.model_dump_json()),
            )
            self._append_policy_audit_event(
                connection, source.source_id, "policy_source_added", {"topic": source.topic}, actor
            )
        return source

    def retire_policy_source(self, source_id: str, actor: Actor) -> PolicySource:
        with self._connect() as connection:
            row = connection.execute("SELECT source_json FROM policy_sources WHERE source_id = ?", (source_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy source not found.")
            source = PolicySource.model_validate_json(row["source_json"])
            if source.retired_at:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Policy source is already retired.")
            retired = source.model_copy(update={"approved": False, "retired_at": datetime.now(timezone.utc)})
            connection.execute(
                "UPDATE policy_sources SET source_json = ? WHERE source_id = ?",
                (retired.model_dump_json(), source_id),
            )
            self._append_policy_audit_event(connection, source_id, "policy_source_retired", {}, actor)
        return retired

    def policy_audit_events(self, source_id: str) -> list[PolicyAuditEvent]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM policy_audit_events WHERE source_id = ? ORDER BY occurred_at, event_id", (source_id,)
            ).fetchall()
        return [
            PolicyAuditEvent(
                event_id=row["event_id"],
                source_id=row["source_id"],
                action=row["action"],
                actor=row["actor"],
                occurred_at=row["occurred_at"],
                payload=json.loads(row["payload_json"]),
            )
            for row in rows
        ]

    def operations_metrics(self) -> OperationsMetrics:
        cases = self.list()
        cases_by_status = {status.value: 0 for status in CaseStatus}
        invalid_audit_chain_count = 0
        for case in cases:
            cases_by_status[case.status] += 1
            if not self.verify_audit_events(case.case_id).valid:
                invalid_audit_chain_count += 1
        with self._connect() as connection:
            audit_event_count = connection.execute("SELECT COUNT(*) AS count FROM audit_events").fetchone()["count"]
        return OperationsMetrics(
            generated_at=datetime.now(timezone.utc),
            cases_by_status=cases_by_status,
            audit_event_count=audit_event_count,
            invalid_audit_chain_count=invalid_audit_chain_count,
            active_risk_configuration=self.active_risk_configuration().version,
            policy_source_count=len(self.policy_sources()),
        )

    def retrieve_policy_sources(self, topics: set[str]) -> list[PolicyCitation]:
        citations = [
            PolicyCitation(**source.model_dump(exclude={"approved", "synthetic_data"}))
            for source in self.policy_sources()
            if source.approved and source.retired_at is None and source.topic in topics
        ]
        if not citations:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No approved policy source matched the assessment; analyst escalation is required.",
            )
        return citations

    def active_risk_configuration(self) -> RiskConfiguration:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT configuration_json FROM risk_configurations WHERE active = 1"
            ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No active risk configuration.")
        return RiskConfiguration.model_validate_json(row["configuration_json"])

    def activate_risk_configuration(
        self, request: RiskConfigurationUpdateRequest, actor: Actor
    ) -> RiskConfiguration:
        configuration = RiskConfiguration(
            **request.model_dump(exclude={"updated_by"}), updated_by=actor.display_name, updated_at=datetime.now(timezone.utc)
        )
        with self._connect() as connection:
            existing = connection.execute(
                "SELECT version FROM risk_configurations WHERE version = ?", (configuration.version,)
            ).fetchone()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Risk configuration version already exists and cannot be overwritten.",
                )
            connection.execute("UPDATE risk_configurations SET active = 0 WHERE active = 1")
            connection.execute(
                "INSERT INTO risk_configurations (version, configuration_json, active) VALUES (?, ?, 1)",
                (configuration.version, configuration.model_dump_json()),
            )
        return configuration

    def reset(self) -> None:
        """Test helper; production code has no deletion endpoint for audit evidence."""
        default_configuration = self._default_risk_configuration()
        with self._connect() as connection:
            connection.execute("DELETE FROM audit_events")
            connection.execute("DELETE FROM cases")
            connection.execute("DELETE FROM risk_configurations")
            connection.execute("DELETE FROM policy_audit_events")
            connection.execute("DELETE FROM policy_sources")
            connection.execute(
                "INSERT INTO risk_configurations (version, configuration_json, active) VALUES (?, ?, 1)",
                (default_configuration.version, default_configuration.model_dump_json()),
            )
            for source in self._default_policy_sources():
                connection.execute(
                    "INSERT INTO policy_sources (source_id, source_json) VALUES (?, ?)",
                    (source.source_id, source.model_dump_json()),
                )

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
    def _extract_document_evidence(request: DocumentEvidenceRequest) -> DocumentEvidence:
        content = request.content.lower()
        jurisdictions = sorted({code for code in ("GB", "US", "EU", "SG", "AE") if code.lower() in content})
        controls = [
            control
            for control in ("Sanctions screening", "Transaction monitoring", "Customer due diligence")
            if control.lower() in content
        ]
        indicators = [
            indicator
            for indicator in ("cross-border", "third party", "high-risk", "cash", "crypto")
            if indicator in content
        ]
        return DocumentEvidence(
            **request.model_dump(),
            extracted_jurisdictions=jurisdictions,
            extracted_controls=controls,
            risk_indicators=indicators,
        )

    def document_evidence(self, case_id: str) -> list[DocumentEvidence]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT document_json FROM evidence_documents WHERE case_id = ? ORDER BY document_id", (case_id,)
            ).fetchall()
        return [DocumentEvidence.model_validate_json(row["document_json"]) for row in rows]

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
            order_by = "case_id DESC" if self.is_postgres else "rowid DESC"
            rows = connection.execute(f"SELECT * FROM cases ORDER BY {order_by}").fetchall()
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
            connection.execute(
                "INSERT INTO intake_versions (case_id, version, intake_json, created_at) VALUES (?, ?, ?, ?)",
                (case_id, case.version, self._serialize_intake(intake), datetime.now(timezone.utc).isoformat()),
            )
        return case

    def get(self, case_id: str) -> CaseDetail:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
        return self._row_to_case(row).model_copy(update={"document_evidence": self.document_evidence(case_id)})

    def add_document_evidence(self, case_id: str, request: DocumentEvidenceRequest, actor: Actor) -> DocumentEvidence:
        case = self.get(case_id)
        if case.status is not CaseStatus.DRAFT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Evidence can only be added while the case is a draft.")
        evidence = self._extract_document_evidence(request)
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO evidence_documents (document_id, case_id, document_json) VALUES (?, ?, ?)",
                (evidence.document_id, case_id, evidence.model_dump_json()),
            )
            self._append_audit_event(
                connection,
                case_id,
                "document_evidence_added",
                {"document_id": evidence.document_id, "document_type": evidence.document_type, "synthetic": True},
                actor=actor.display_name,
            )
        return evidence

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

    def update_draft_intake(self, case_id: str, intake: IntakeRequest) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft cases can be edited; create a new versioned assessment after submission.",
            )
        updated = case.model_copy(
            update={
                "title": intake.title,
                "change_type": intake.change_type,
                "intake": intake,
                "version": case.version + 1,
            }
        )
        with self._connect() as connection:
            connection.execute(
                "UPDATE cases SET title = ?, change_type = ?, version = ?, intake_json = ? WHERE case_id = ?",
                (updated.title, updated.change_type, updated.version, self._serialize_intake(intake), case_id),
            )
            connection.execute(
                "INSERT INTO intake_versions (case_id, version, intake_json, created_at) VALUES (?, ?, ?, ?)",
                (case_id, updated.version, self._serialize_intake(intake), datetime.now(timezone.utc).isoformat()),
            )
            self._append_audit_event(
                connection,
                case_id,
                "draft_intake_updated",
                {"previous_version": case.version, "version": updated.version, "synthetic": True},
                actor=intake.business_owner,
            )
        return updated

    @staticmethod
    def _rating(score: int, configuration: RiskConfiguration) -> RiskLevel:
        if score <= configuration.low_risk_maximum:
            return RiskLevel.LOW
        if score <= configuration.moderate_risk_maximum:
            return RiskLevel.MODERATE
        return RiskLevel.HIGH

    def assess_risk(self, case_id: str, request: RiskAssessmentRequest, actor: Actor) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.INTAKE_REVIEW:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only intake-review cases can enter analyst risk review.",
            )
        configuration = self.active_risk_configuration()
        factor_scores = {
            "customer": request.customer_risk,
            "product": request.product_risk,
            "channel": request.channel_risk,
            "geography": request.geography_risk,
            "transaction": request.transaction_risk,
            "third_party": request.third_party_risk,
        }
        weighted_score = sum(
            factor_scores[factor] * configuration.factor_weights[factor] for factor in RISK_FACTORS
        ) / sum(configuration.factor_weights.values())
        inherent_risk = math.ceil(weighted_score)
        mitigation = request.control_effectiveness / configuration.control_mitigation_divisor
        residual_risk = max(1, math.ceil(inherent_risk * (1 - mitigation)))
        assessment = RiskAssessment(
            factor_scores=factor_scores,
            inherent_risk=inherent_risk,
            control_effectiveness=request.control_effectiveness,
            residual_risk=residual_risk,
            rating=self._rating(residual_risk, configuration),
            configuration_version=configuration.version,
            configuration_snapshot=configuration.model_dump(mode="json"),
            assessed_at=datetime.now(timezone.utc),
            assessed_by=actor.display_name,
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
                    "configuration_version": configuration.version,
                    "configuration": assessment.configuration_snapshot,
                },
                actor=actor.display_name,
            )
        return updated

    def override_risk(self, case_id: str, request: AnalystOverrideRequest, actor: Actor) -> CaseDetail:
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
            analyst=actor.display_name,
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
                actor=actor.display_name,
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
        retrieval_query = f"{case.change_type.replace('_', ' ')} risk assessment and control governance"
        citations = self.retrieve_policy_sources({"risk_based_approach", "controls_and_governance"})
        evidence_context = [
            f"{evidence.title}: jurisdictions={', '.join(evidence.extracted_jurisdictions) or 'none'}; "
            f"indicators={', '.join(evidence.risk_indicators) or 'none'}"
            for evidence in case.document_evidence
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
            evidence_document_ids=[evidence.document_id for evidence in case.document_evidence],
            evidence_context=evidence_context,
            retrieval_query=retrieval_query,
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
                {
                    "generator": draft.generator,
                    "retrieval_query": retrieval_query,
                    "citation_ids": [citation.source_id for citation in citations],
                    "evidence_document_ids": draft.evidence_document_ids,
                },
            )
        return updated

    def send_to_committee(self, case_id: str, actor: Actor) -> CaseDetail:
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
                actor=actor.display_name,
            )
        return updated

    def decide(self, case_id: str, request: CommitteeDecisionRequest, actor: Actor) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.COMMITTEE_DECISION:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only committee-ready cases can receive a decision.",
            )
        decision = CommitteeDecision(
            decision=request.decision,
            rationale=request.rationale,
            committee_member=actor.display_name,
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
                actor=actor.display_name,
            )
        return updated

    def verify_condition(
        self, case_id: str, condition_id: str, request: ConditionVerificationRequest, actor: Actor
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
            update={"status": ConditionStatus.VERIFIED, "verified_by": actor.display_name, "verified_at": verified_at}
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
                actor=actor.display_name,
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

    def evidence_package(self, case_id: str, actor: Actor) -> EvidencePackage:
        case = self.get(case_id)
        with self._connect() as connection:
            self._append_audit_event(
                connection,
                case_id,
                "evidence_exported",
                {"package_version": "evidence-package-v1", "synthetic": True},
                actor=actor.display_name,
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
case_store = CaseStore(
    database_path=os.getenv("RAW_DATABASE_PATH", "raw.db"),
    database_url=os.getenv("DATABASE_URL"),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type", "X-Actor-Id"],
)


@app.get("/health", response_model=HealthResponse, tags=["operations"])
def health() -> HealthResponse:
    return HealthResponse(timestamp=datetime.now(timezone.utc))


@app.get("/api/v1/operations/metrics", response_model=OperationsMetrics, tags=["operations"])
def get_operations_metrics(
    actor: Annotated[Actor, Depends(require_roles(Role.AUDITOR, Role.ADMINISTRATOR))]
) -> OperationsMetrics:
    return case_store.operations_metrics()


@app.get("/api/v1/risk-configurations/active", response_model=RiskConfiguration, tags=["risk"])
def get_active_risk_configuration() -> RiskConfiguration:
    return case_store.active_risk_configuration()


@app.get("/api/v1/actors", response_model=list[Actor], tags=["identity"])
def list_demo_actors() -> list[Actor]:
    return list(DEMO_ACTORS.values())


@app.put("/api/v1/risk-configurations/active", response_model=RiskConfiguration, tags=["risk"])
def update_active_risk_configuration(
    request: RiskConfigurationUpdateRequest,
    actor: Annotated[Actor, Depends(require_roles(Role.ADMINISTRATOR))],
) -> RiskConfiguration:
    return case_store.activate_risk_configuration(request, actor)


@app.get("/api/v1/policy-sources", response_model=list[PolicySource], tags=["policy"])
def list_policy_sources() -> list[PolicySource]:
    return case_store.policy_sources()


@app.post("/api/v1/policy-sources", response_model=PolicySource, status_code=status.HTTP_201_CREATED, tags=["policy"])
def create_policy_source(
    request: PolicySourceCreateRequest,
    actor: Annotated[Actor, Depends(require_roles(Role.ADMINISTRATOR))],
) -> PolicySource:
    return case_store.add_policy_source(request, actor)


@app.post("/api/v1/policy-sources/{source_id}/retire", response_model=PolicySource, tags=["policy"])
def retire_policy_source(
    source_id: str, actor: Annotated[Actor, Depends(require_roles(Role.ADMINISTRATOR))]
) -> PolicySource:
    return case_store.retire_policy_source(source_id, actor)


@app.get("/api/v1/policy-sources/{source_id}/audit-events", response_model=list[PolicyAuditEvent], tags=["policy"])
def list_policy_audit_events(
    source_id: str, actor: Annotated[Actor, Depends(require_roles(Role.AUDITOR, Role.ADMINISTRATOR))]
) -> list[PolicyAuditEvent]:
    return case_store.policy_audit_events(source_id)


@app.get("/api/v1/cases", response_model=list[CaseSummary], tags=["cases"])
def list_cases() -> list[CaseSummary]:
    return case_store.list()


@app.post(
    "/api/v1/cases",
    response_model=CaseDetail,
    status_code=status.HTTP_201_CREATED,
    tags=["cases"],
)
def create_case(
    intake: IntakeRequest, actor: Annotated[Actor, Depends(require_roles(Role.PRODUCT_OWNER))]
) -> CaseDetail:
    if intake.business_owner != actor.display_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Product owners may only submit their own cases.")
    return case_store.create(intake)


@app.get("/api/v1/cases/{case_id}", response_model=CaseDetail, tags=["cases"])
def get_case(case_id: str) -> CaseDetail:
    return case_store.get(case_id)


@app.post("/api/v1/cases/{case_id}/submit", response_model=CaseDetail, tags=["cases"])
def submit_case(
    case_id: str, actor: Annotated[Actor, Depends(require_roles(Role.PRODUCT_OWNER))]
) -> CaseDetail:
    case = case_store.get(case_id)
    if case.intake.business_owner != actor.display_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Product owners may only submit their own cases.")
    return case_store.submit(case_id)


@app.put("/api/v1/cases/{case_id}/intake", response_model=CaseDetail, tags=["cases"])
def update_case_intake(
    case_id: str,
    intake: IntakeRequest,
    actor: Annotated[Actor, Depends(require_roles(Role.PRODUCT_OWNER))],
) -> CaseDetail:
    case = case_store.get(case_id)
    if case.intake.business_owner != actor.display_name or intake.business_owner != actor.display_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Product owners may only update their own cases.")
    return case_store.update_draft_intake(case_id, intake)


@app.post("/api/v1/cases/{case_id}/document-evidence", response_model=DocumentEvidence, status_code=status.HTTP_201_CREATED, tags=["documents"])
def add_case_document_evidence(
    case_id: str,
    request: DocumentEvidenceRequest,
    actor: Annotated[Actor, Depends(require_roles(Role.PRODUCT_OWNER))],
) -> DocumentEvidence:
    case = case_store.get(case_id)
    if case.intake.business_owner != actor.display_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Product owners may only add evidence to their own cases.")
    return case_store.add_document_evidence(case_id, request, actor)


@app.post("/api/v1/cases/{case_id}/risk-assessment", response_model=CaseDetail, tags=["risk"])
def assess_case_risk(
    case_id: str,
    request: RiskAssessmentRequest,
    actor: Annotated[Actor, Depends(require_roles(Role.ANALYST))],
) -> CaseDetail:
    return case_store.assess_risk(case_id, request, actor)


@app.post("/api/v1/cases/{case_id}/assessment-draft", response_model=CaseDetail, tags=["ai"])
def create_assessment_draft(
    case_id: str, actor: Annotated[Actor, Depends(require_roles(Role.ANALYST))]
) -> CaseDetail:
    return case_store.draft_assessment(case_id)


@app.post("/api/v1/cases/{case_id}/risk-override", response_model=CaseDetail, tags=["analyst"])
def override_case_risk(
    case_id: str,
    request: AnalystOverrideRequest,
    actor: Annotated[Actor, Depends(require_roles(Role.ANALYST))],
) -> CaseDetail:
    return case_store.override_risk(case_id, request, actor)


@app.post("/api/v1/cases/{case_id}/send-to-committee", response_model=CaseDetail, tags=["analyst"])
def send_case_to_committee(
    case_id: str, actor: Annotated[Actor, Depends(require_roles(Role.ANALYST))]
) -> CaseDetail:
    return case_store.send_to_committee(case_id, actor)


@app.post("/api/v1/cases/{case_id}/committee-decision", response_model=CaseDetail, tags=["committee"])
def record_committee_decision(
    case_id: str,
    request: CommitteeDecisionRequest,
    actor: Annotated[Actor, Depends(require_roles(Role.COMMITTEE_MEMBER))],
) -> CaseDetail:
    return case_store.decide(case_id, request, actor)


@app.post(
    "/api/v1/cases/{case_id}/conditions/{condition_id}/verify",
    response_model=CaseDetail,
    tags=["committee"],
)
def verify_committee_condition(
    case_id: str,
    condition_id: str,
    request: ConditionVerificationRequest,
    actor: Annotated[Actor, Depends(require_roles(Role.ANALYST))],
) -> CaseDetail:
    return case_store.verify_condition(case_id, condition_id, request, actor)


@app.get("/api/v1/cases/{case_id}/audit-events", response_model=list[AuditEvent], tags=["audit"])
def list_audit_events(case_id: str) -> list[AuditEvent]:
    return case_store.audit_events(case_id)


@app.get("/api/v1/cases/{case_id}/audit-verification", response_model=AuditVerification, tags=["audit"])
def verify_audit_events(case_id: str) -> AuditVerification:
    return case_store.verify_audit_events(case_id)


@app.get("/api/v1/cases/{case_id}/evidence-package", response_model=EvidencePackage, tags=["audit"])
def export_evidence_package(
    case_id: str, actor: Annotated[Actor, Depends(require_roles(Role.AUDITOR, Role.ANALYST, Role.COMMITTEE_MEMBER))]
) -> EvidencePackage:
    return case_store.evidence_package(case_id, actor)