# Architecture Overview

```mermaid
flowchart LR
  PO[Product owner] --> WEB[Next.js workbench]
  ANALYST[FCRM analyst] --> WEB
  COMMITTEE[Risk committee] --> WEB
  WEB --> API[FastAPI service]
  API --> DB[(PostgreSQL)]
  API --> SCORE[Deterministic scoring]
  API --> ORCH[Assessment orchestrator]
  ORCH --> AI[Mock AI adapter]
  ORCH --> POLICY[Approved policy corpus]
  API --> AUDIT[Append-only audit events]
```

The workflow engine and scoring service are deterministic. The AI adapter may propose extracted facts, retrieval-backed rationale and gaps, but cannot mutate approved configuration, advance gated workflow states, or make committee decisions.