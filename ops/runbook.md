# Operations Runbook

## Service health

- `GET /health` confirms that the API process is accepting requests.
- `GET /api/v1/operations/metrics` requires an auditor or administrator actor. It reports case distribution, audit-event volume, hash-chain failures, active risk configuration and approved policy-source count.
- A non-zero `invalid_audit_chain_count` is a stop-the-line condition: preserve the database, prevent further evidence exports and escalate to the risk-control owner.

## Local demonstration

1. Start the API from `apps/api` with `C:\Python313\python.exe -m uvicorn app.main:app --port 8000`.
2. Start the workbench from `apps/web` with `npm.cmd run dev`.
3. Use the identity selector to demonstrate separation of duties.
4. Run `C:\Python313\python.exe evals\run_workflow_evaluation.py` from the repository root for a repeatable synthetic control check.

## Container deployment

- Set `DATABASE_URL` to a PostgreSQL connection string; the API selects PostgreSQL when it is present.
- Use a unique secret database password outside source control.
- The current seeded identity provider is demonstration-only. Replace it with an enterprise OIDC/JWT identity provider before a production deployment.
- Back up the PostgreSQL database before every application or configuration release. Preserve audit-event history; there is intentionally no production deletion endpoint.

## Incident response

- API unavailable: check `/health`, database connectivity, then container logs.
- Audit failure: stop evidence exports and preserve the affected database snapshot.
- Unauthorized action: capture actor, case ID, endpoint and timestamp from logs; review the identity-provider claim mapping in production.
