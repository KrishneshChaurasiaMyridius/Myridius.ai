# AI Boundaries and Human Gates

## Principle

The workbench prepares an assessment; authorised humans make every risk and approval decision.

## Current implementation

The `assessment-draft` API is a deterministic mock adapter. It produces a review-only summary, analyst questions and visible citations. Its response carries `decision_authority: human_only` and it cannot alter a case status, risk configuration or committee outcome.

Every draft attempt runs through an explicit provider adapter boundary. Completed and failed attempts both create immutable execution ledger entries containing the adapter, prompt version, retrieval query, evidence and citation counts, estimated input/output tokens, duration, completion time, and a failure reason when applicable. The ledger provides traceability and evaluation data; it is not an authority to advance a workflow state.

Policy text is also governed independently of drafting. An administrator may register a synthetic policy source, but the source remains pending review and is excluded from retrieval until a committee member explicitly approves it. Retirement removes a source from future retrieval while preserving its audit history.

| Stage | System action | Human gate |
| --- | --- | --- |
| Intake | Validates required synthetic-data fields | Product owner submits the request |
| Risk assessment | Calculates inherent and residual risk deterministically | FCRM analyst reviews the assessment |
| Assessment draft | Produces cited review material | Analyst accepts, corrects or overrides outputs |
| Committee | Creates a decision-ready case state | Committee member records approve, reject, defer, or conditional approval |

## Failure behavior

If a draft provider is unconfigured or cannot prepare a draft, the case remains in analyst review and the failure is recorded in both the execution ledger and hash-linked audit trail. It cannot advance automatically. The API records an audit event for every successful material action, and audit events are hash-linked by case.

## Scope note

The included FATF and internal-policy citations are demo artifacts. The regulatory source register and governed corpus ingestion remain required before a production deployment.