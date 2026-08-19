# Stage 3 - GitHub Integration

Status: CURRENT
Branch: `feature/03-github-integration`
Depends on: accepted Stage 2
Product model: ADR-007, ADR-008

## User outcome

Admin видит понятный статус единого knowledge repository. Авторизованный
пользователь может подключить **свой** git как личную ризому. Если knowledge
repository публичный, clone/fetch не требует аккаунта GraphNotes.

GraphNotes безопасно адресует одну общую Git revision и один connected personal
remote на пользователя. Это не GraphNotes-hosted vault и не обязательная ветка
`user/<uuid>` на общем репозитории.

## Product boundary

- одна GraphNotes installation связывается с одним GitHub knowledge repository;
- default branch представляет единую общую ризому;
- personal remote — git пользователя (ADR-008);
- workspace, organization, team, community и несколько shared repositories не
  моделируются;
- GraphNotes backend выполняет GitHub App-операции; App credentials пользователю
  не выдаются;
- публичный knowledge repo остаётся клонируемым обычным Git.

## Required inputs

Принято для `rhizome-test` (2026-08-19):

- shared knowledge repository: `https://github.com/vgdnet/rhizome` (public,
  default branch `main`);
- personal remote = отдельный GitHub repository, не fork;
- первый тестовый personal remote пользователя `efimov`:
  `https://github.com/vgdnet/guide_psy` (public, default branch `main`);
- тестовые `*.md` добавляет владелец в эти репозитории.

GitHub App зарегистрировано: `rhizome-absorber`, App ID `4646628`,
Client ID `Iv23liXB3caRQOOi0vtK`, owner `@vgdnet`, Installation ID
`154874395`.

API-проверка 2026-08-19: App видит `vgdnet/rhizome` и `vgdnet/guide_psy`
(Contents/Metadata read). Репозитории пока пустые (GitHub 409 на commits).
Webhook для LAN не требуется. Private key вне git.

Отсутствие access/credentials даёт `BLOCK`, но не разрешает придумывать
multi-workspace архитектуру или PostgreSQL-vault.

## Scope

- singleton repository binding/configuration;
- GitHub App authentication на backend;
- проверка installation/repository access и default branch;
- connect/disconnect personal git remote для authenticated user UUID;
- сохранение identifiers и observed commit SHA;
- sync states: ready, pending, rate-limited, unavailable, error;
- timeout, pagination и rate-limit handling;
- cryptographically verified, idempotent webhook receiver;
- audit admin repository-binding operations;
- frontend repository/sync status без обязательного Git-жаргона.

## API baseline

```text
GET  /api/repository/status
POST /api/repository/connect      # admin-only setup of the shared repo
POST /api/personal/connect
POST /api/webhooks/github
```

## Security requirements

- backend проверяет active user и global role;
- repository/installation identifiers берутся из trusted binding, не request;
- private key/token/webhook secret не возвращаются в API/логи;
- GitHub App имеет минимальные permissions;
- invalid webhook signature rejected before payload processing;
- arbitrary remote URL и SSRF запрещены;
- user cannot bind or write another user's personal remote;
- public source repository GraphNotes не определяет visibility knowledge repo.

## Data and consistency

- binding хранит stable GitHub identifiers, не только display names;
- personal remote ownership связан с internal user UUID;
- repeated webhook delivery idempotent;
- GitHub остаётся источником истины Git history;
- Stage не создаёт собственный Git/merge engine и не кладёт тела заметок в PostgreSQL.

## Out of scope

- workspace/multi-tenant knowledge repositories;
- take-from-shared и ZIP ingest (Stage 4);
- note index и graph API;
- proposal review/merge;
- graph diff;
- Obsidian-class editor.

## Verification

- migration upgrade/downgrade/re-upgrade;
- one shared repository and distinct personal remotes for two users;
- cross-user personal remote access rejected;
- invalid/duplicate webhook cases;
- revoked credential, timeout and rate-limit status;
- no credential leakage;
- exact SHA integration with test GitHub App on `rhizome-test`;
- backend/PostgreSQL exposure unchanged.

## Definition of Done

- installation addresses exactly one knowledge repository;
- one shared revision and one per-user personal remote are unambiguous;
- public-read clone of a public knowledge repo does not require GraphNotes login;
- failure states are observable/recoverable;
- no workspace, multi-shared-rhizome or PostgreSQL-vault entities were introduced;
- Technical Observer matrix has no mandatory `FAIL/NOT VERIFIED`;
- `STAGE3_COMPLETED.md` records identifiers without secrets and observed facts.
