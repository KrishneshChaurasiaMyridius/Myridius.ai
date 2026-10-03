from datetime import datetime, timezone
from enum import StrEnum
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field, HttpUrl, model_validator


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


class CaseStore:
    """Temporary in-process storage until the PostgreSQL persistence story is implemented."""

    def __init__(self) -> None:
        self._cases: dict[str, CaseDetail] = {}

    def list(self) -> list[CaseSummary]:
        return [
            CaseSummary(
                case_id=case.case_id,
                title=case.title,
                change_type=case.change_type,
                status=case.status,
                inherent_risk=case.inherent_risk,
                residual_risk=case.residual_risk,
            )
            for case in self._cases.values()
        ]

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
        self._cases[case_id] = case
        return case

    def get(self, case_id: str) -> CaseDetail:
        try:
            return self._cases[case_id]
        except KeyError as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.") from error

    def submit(self, case_id: str) -> CaseDetail:
        case = self.get(case_id)
        if case.status is not CaseStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only draft cases can be submitted for intake review.",
            )
        submitted = case.model_copy(
            update={
                "status": CaseStatus.INTAKE_REVIEW,
                "version": case.version + 1,
                "submitted_at": datetime.now(timezone.utc),
            }
        )
        self._cases[case_id] = submitted
        return submitted


app = FastAPI(
    title="Risk Assessment Workbench API",
    version="0.1.0",
    description="Synthetic-data-only FCRM assessment service. Human decision authority is mandatory.",
)
case_store = CaseStore()


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