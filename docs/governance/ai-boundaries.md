# AI Boundaries and Human Gates

## Principle

The workbench prepares an assessment; authorised humans make every risk and approval decision.

## Current implementation

The default `assessment-draft` API adapter is deterministic. The optional Anthropic adapter receives the complete synthetic intake, deterministic risk-factor inputs and configuration snapshot, bounded evidence excerpts, and approved policy excerpts. It produces a structured analyst brief containing a summary, factor-level rationale, control observations, evidence gaps, and analyst questions. The API remains authoritative for deterministic scores and citations, validates evidence references against the case, and marks the response `decision_authority: human_only`.

Every draft attempt runs through an explicit provider adapter boundary. Completed and failed attempts both create immutable execution ledger entries containing the adapter, prompt version, retrieval query, evidence and citation counts, estimated input/output tokens, provider-reported token counts when available, duration, completion time, and a failure reason when applicable. The ledger provides traceability and evaluation data; it is not an authority to advance a workflow state.

Policy text is also governed independently of drafting. An administrator may register a policy source and a committee member must explicitly approve it. Non-synthetic policy sources require a source URL. In OIDC mode, synthetic seed entries are excluded from retrieval, and drafting fails closed if no approved, non-synthetic source matches. Retirement removes a source from future retrieval while preserving its audit history.

| Stage | System action | Human gate |
| --- | --- | --- |
| Intake | Validates required synthetic-data fields | Product owner submits the request |
| Risk assessment | Calculates inherent and residual risk deterministically | FCRM analyst reviews the assessment |
| Assessment draft | Produces cited review material | Analyst accepts, corrects or overrides outputs |
| Committee | Creates a decision-ready case state | Committee member records approve, reject, defer, or conditional approval |

## Failure behavior

If a draft provider is unconfigured, returns unsupported deterministic scores or evidence references, or cannot prepare a draft, the case remains in analyst review and the failure is recorded in both the execution ledger and hash-linked audit trail. It cannot advance automatically. The API records an audit event for every successful material action, and audit events are hash-linked by case.

## Scope note

The included FATF-labelled and internal-policy citations are synthetic demo artifacts. They are not retrieved in OIDC mode. A production deployment still requires regulatory-owner review, source versioning, and an agreed corpus update and retirement process.