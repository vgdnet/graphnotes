# ADR-002 - Password authentication for MVP

Status: Accepted

## Decision
The MVP uses GraphNotes-owned username/password authentication.

Telegram authentication is retained as future scope and, if added, will link to the existing internal user UUID.

## Consequences
- Stage 2 implements local credentials
- Telegram does not block the MVP
- identity-provider expansion remains possible later
