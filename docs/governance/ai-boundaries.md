# AI Boundaries and Human Gates

## Principle

The workbench prepares an assessment; authorised humans make every risk and approval decision.

## Current implementation

The `assessment-draft` API is a deterministic mock adapter. It produces a review-only summary, analyst questions and visible citations. Its response carries `decision_authority: human_only` and it cannot alter a case status, risk configuration or committee outcome.

Every completed draft also records an immutable execution ledger entry containing the adapter, prompt version, retrieval query, evidence and citation counts, estimated input/output tokens, duration, and completion time. The ledger provides traceability and evaluation data; it is not an authority to advance a workflow state.

| Stage | System action | Human gate |
| --- | --- | --- |
| Intake | Validates required synthetic-data fields | Product owner submits the request |
| Risk assessment | Calculates inherent and residual risk deterministically | FCRM analyst reviews the assessment |
| Assessment draft | Produces cited review material | Analyst accepts, corrects or overrides outputs |
| Committee | Creates a decision-ready case state | Committee member records approve, reject, defer, or conditional approval |

## Failure behavior

If a draft cannot be prepared, the case remains in analyst review. It cannot advance automatically. The API records an audit event for every successful material action, and audit events are hash-linked by case.

## Scope note

The included FATF and internal-policy citations are demo artifacts. The regulatory source register and governed corpus ingestion remain required before a production deployment.