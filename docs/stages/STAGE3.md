# Stage 3 - GitHub Integration

Status: PLANNED / ACCESS-GATED
Branch: `feature/03-github-integration`
Depends on: accepted Stage 2

## User outcome

Авторизованный пользователь видит понятный статус единого knowledge repository.
GraphNotes безопасно адресует одну общую Git revision и ровно одно personal Git
state для каждого пользователя.

## Product boundary

- одна GraphNotes installation связывается с одним GitHub knowledge repository;
- default branch представляет единую общую ризому;
- `user/<uuid>` или эквивалентное состояние представляет личную ризому user;
- workspace, organization, team, community и несколько shared repositories не
  моделируются;
- GraphNotes backend выполняет GitHub-операции; пользователю credentials не
  выдаются.

## Required inputs

- visibility единого knowledge repository;
- GitHub App test installation и repository identifier;
- минимальные permissions;
- подтверждённые names/lifecycle shared и personal branches;
- webhook secret для `rhizome-test`.

Отсутствие access/credentials даёт `BLOCK`, но не разрешает придумывать
multi-workspace архитектуру.

## Scope

- singleton repository binding/configuration;
- GitHub App authentication на backend;
- проверка installation/repository access и default branch;
- создание/обнаружение personal state ровно для authenticated user UUID;
- сохранение branch/revision identifiers и observed commit SHA;
- sync states: ready, pending, rate-limited, unavailable, error;
- timeout, pagination и rate-limit handling;
- cryptographically verified, idempotent webhook receiver;
- audit admin repository-binding operations;
- frontend repository/sync status без обязательного Git-жаргона.

## API baseline

```text
GET  /api/repository/status
POST /api/repository/connect      # admin-only setup
POST /api/webhooks/github
```

## Security requirements

- backend проверяет active user и global role;
- repository/installation identifiers берутся из trusted binding, не request;
- private key/token/webhook secret не возвращаются в API/логи;
- GitHub App имеет минимальные permissions;
- invalid webhook signature rejected before payload processing;
- arbitrary remote URL и SSRF запрещены;
- user cannot address another user's personal branch;
- public source repository GraphNotes не определяет visibility knowledge repo.

## Data and consistency

- binding хранит stable GitHub identifiers, не только display names;
- personal state ownership связан с internal user UUID;
- repeated webhook delivery idempotent;
- GitHub остаётся источником истины Git history;
- Stage не создаёт собственный Git/merge engine.

## Out of scope

- workspace/multi-tenant knowledge repositories;
- Markdown import/parser;
- note index и graph API;
- proposal review/merge;
- graph diff.

## Verification

- migration upgrade/downgrade/re-upgrade;
- one shared branch and distinct personal branches for two users;
- cross-user personal branch access rejected;
- invalid/duplicate webhook cases;
- revoked credential, timeout and rate-limit status;
- no credential leakage;
- exact SHA integration with test GitHub App on `rhizome-test`;
- backend/PostgreSQL exposure unchanged.

## Definition of Done

- installation addresses exactly one knowledge repository;
- one shared and one per-user personal Git state are unambiguous;
- failure states are observable/recoverable;
- no workspace or multi-shared-rhizome entities were introduced;
- Technical Observer matrix has no mandatory `FAIL/NOT VERIFIED`;
- `STAGE3_COMPLETED.md` records identifiers without secrets and observed facts.
