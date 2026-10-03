# Product Specification

## Objective

Reduce a new-product or material-change financial-crime risk assessment from 15-20 business days to a decision-ready package in about two days, while retaining human decision authority and a complete evidence trail.

## Personas

| Persona | Primary activity | Authority |
| --- | --- | --- |
| Product owner | Creates and corrects a change request | Submits evidence; cannot decide risk outcome |
| FCRM analyst | Reviews assessment, corrects facts and recommends outcome | Can override with evidence and rationale; cannot record committee decision |
| Risk committee member | Reviews decision pack and records decision | Can approve, reject, defer or approve with conditions |

## Initial requirements

- `REQ-001`: The system shall accept synthetic change requests for product, feature, process, vendor, geography and customer-segment changes.
- `REQ-002`: The system shall calculate inherent and residual risk deterministically from versioned, configurable inputs.
- `REQ-003`: The system shall enforce a non-zero residual-risk floor after controls are assessed.
- `REQ-004`: The system shall retain versioned inputs, policy citations, configuration, AI artifacts, reviewer actions and decisions.
- `REQ-005`: The system shall require a human analyst review before committee decisioning.
- `REQ-006`: The system shall never approve or reject a case automatically.

## Scope boundary

The MVP uses synthetic data only and makes no connection to bank systems, identity providers or real customer information.