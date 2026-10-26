# AI Boundaries and Human Gates

## Principle

The workbench prepares an assessment; authorised humans make every risk and approval decision.

## Current implementation

The default `assessment-draft` API adapter is deterministic. The optional Anthropic adapter receives the complete synthetic intake, deterministic risk-factor inputs and configuration snapshot, bounded evidence excerpts, and approved policy excerpts. It produces a structured analyst brief containing a summary, factor-level rationale, control observations, evidence gaps, and analyst questions. The API remains authoritative for deterministic scores and citations, validates evidence references against the case, and marks the response `decision_authority: human_only`.

Every draft attempt runs through an explicit provider adapter boundary. Completed and failed attempts both create immutable execution ledger entries containing the adapter, prompt version, retrieval query, evidence and citation counts, estimated input/output tokens, provider-reported token counts when available, duration, completion time, and a failure reason when applicable. The ledger provides traceability and evaluation data; it is not an authority to advance a workflow state.

Policy text is also governed independently of drafting. An administrator registers immutable source revisions with a source URL, version number, topic, and optional predecessor; a committee member must approve each revision before it is cited. Approval sets the effective date and, for a replacement, atomically retires the predecessor while preserving both records and their audit history. Direct retirement also removes a source from future retrieval. In OIDC mode, synthetic demo entries are excluded from retrieval, and drafting fails closed if no approved, non-synthetic source matches. Synthetic seed text is demonstrative only and is not an authoritative regulatory quotation.

| Stage | System action | Human gate |
| --- | --- | --- |
| Intake | Validates required synthetic-data fields | Product owner submits the request |
| Risk assessment | Calculates inherent and residual risk deterministically | FCRM analyst reviews the assessment |
| Assessment draft | Produces cited review material | Analyst accepts, corrects or overrides outputs |
| Committee | Creates a decision-ready case state | Committee member records approve, reject, defer, or conditional approval |

## Failure behavior

If a draft provider is unconfigured, returns unsupported deterministic scores or evidence references, or cannot prepare a draft, the case remains in analyst review and the failure is recorded in both the execution ledger and hash-linked audit trail. It cannot advance automatically. The API records an audit event for every successful material action, and audit events are hash-linked by case.

## Production corpus gate

The included policy citations are synthetic demo artifacts. Their displayed provenance is explicitly marked and they are not retrieved in OIDC mode. No authoritative replacement corpus is bundled: regulatory or internal policy text must be supplied and verified by its owner, then registered and committee-approved before production use. Production enablement still requires an assigned regulatory owner and a documented review, update, approval, and retirement cadence.