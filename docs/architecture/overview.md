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
  ORCH --> AI[Provider adapter boundary]
  ORCH --> POLICY[Approved policy corpus]
  WEB --> E2E[Playwright browser workflow checks]
  API --> AUDIT[Append-only audit events]
```

The workflow engine and scoring service are deterministic. The default provider is a reproducible deterministic mock; an external provider must conform to the same typed adapter boundary and fails closed when unavailable or unconfigured. The AI adapter may propose extracted facts, retrieval-backed rationale and gaps, but cannot mutate approved configuration, advance gated workflow states, or make committee decisions.