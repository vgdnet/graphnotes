# Stage 9 - Production Hardening / CI/CD

Status: PLANNED / PRODUCTION-GATED
Branch: `feature/09-production`
Depends on: accepted Stage 8 feature-complete MVP

## User outcome

Feature-complete MVP безопасно, наблюдаемо и воспроизводимо разворачивается в
production. Обновление, rollback и восстановление данных имеют проверенную
процедуру.

## Required production decisions

До deployment владелец подтверждает:

- public hostname/domain и TLS termination;
- production access model и initial admin bootstrap;
- maintenance window и допустимый downtime;
- backup destination, retention и recovery expectations;
- GitHub App production installation/credentials;
- exact release candidate SHA/tag;
- явное разрешение на изменение `/opt/graphnotes`, Nginx и production services.

Неизвестные production-факты нельзя выдумывать.

## Scope

- CI для backend tests, frontend checks/build, migrations и Compose config;
- dependency/license/vulnerability и secret scanning с зафиксированной policy;
- reproducible images/dependency locks без плавающих `latest` для release;
- production Compose/configuration с loopback backend/frontend и internal DB;
- host Nginx integration, TLS/security headers и body/time limits;
- migration preflight, backup, upgrade и documented rollback/forward-fix;
- PostgreSQL backup и доказанный restore на disposable/test environment;
- health/readiness и structured safe logging;
- audit retention и correlation context;
- proposal/history retention and archival policy;
- resource limits, restart policy и disk/volume monitoring baseline;
- reconciliation/rebuild operational runbooks;
- read-only production Git access без push-capable credentials;
- staging rehearsal точного RC на `rhizome-test`;
- controlled production deployment на `rhizome`;
- post-deploy smoke checks и release record.

## Security hardening

- production cookies Secure/HttpOnly/SameSite по принятой модели;
- CORS, trusted hosts и proxy headers ограничены;
- auth/session secrets ротируемы и не имеют development defaults;
- rate limiting/brute-force protection реализованы без преждевременного Redis,
  если нагрузка этого не требует;
- upload/webhook limits действуют на proxy и application levels;
- GitHub/webhook secrets и DB credentials имеют минимальные права;
- dependency licenses совместимы с AGPL-3.0;
- логи, error responses и artifacts не содержат секретов/private content;
- production backend и PostgreSQL недоступны напрямую извне.

## Reliability and recovery

- backup создаётся до destructive migration;
- restore проверяется фактически, не только наличием файла;
- migration failure оставляет понятное recoverable состояние;
- rollback не обещается, если schema downgrade небезопасен: используется
  заранее описанный backup/forward-fix plan;
- повторный deploy той же ревизии идемпотентен;
- restart/reboot сохраняет данные и восстанавливает сервис;
- index rebuild из Git/Markdown проверен отдельно от DB restore.
- failed `merged_indexing` proposals can be reconciled without exposing a
  partial shared revision;
- role changes, editor/admin shared edits and proposal decisions remain in
  retained audit/history.

## Single shared rhizome scale hardening

- representative large node/edge/revision/proposal dataset;
- bounded graph/diff endpoints and paginated histories;
- PostgreSQL index/query-plan review for layer, revision, owner and proposal;
- incremental re-index and full-rebuild duration baseline;
- disk growth baseline for Git history, index revisions, audit and proposals;
- documented retention/archival without deleting canonical Git history;
- capacity thresholds that trigger a new architectural review;
- no Redis/Neo4j/queue/object storage added without measured need and decision.

## CI/CD promotion gate

```text
feature branch
  -> CI
      -> approved merge/tag
          -> exact RC on rhizome-test
              -> backup + owner approval
                  -> same SHA/tag on rhizome
                      -> smoke + release record
```

Автоматизация не должна давать production host push credentials или обходить
ручной approval первого MVP release.

## Verification on rhizome-test

- clean deployment from exact RC tag/SHA;
- full backend/frontend/e2e/security suite;
- migration from realistic previous schema/data;
- backup and restore drill;
- restart and reboot;
- GitHub outage/rate-limit, webhook replay и failed sync recovery;
- upload limits and hostile fixtures;
- port/firewall/exposure scan;
- Nginx config validation and TLS check where applicable;
- dependency/license/secret scans;
- manual index rebuild and consistency with Git SHA;
- interrupted proposal publication/reconciliation with old shared revision
  remaining visible;
- large shared-rhizome load/capacity baseline;
- rollback/forward-fix rehearsal.

## Production deployment gate

- Technical Observer: `PASS` for exact RC;
- no P0/P1 and no mandatory `NOT VERIFIED`;
- `v0.1.0-rc.1` identifies tested revision;
- owner explicitly approves production deployment;
- `/opt/graphnotes` unmanaged files reconciled safely;
- backup verified before migration;
- only the approved SHA/tag is deployed;
- post-deploy register/login/import/graph/proposal/diff smoke path passes;
- release record contains time, operator, SHA/tag, migrations and outcome.

## Out of scope

- Kubernetes, Redis/Celery, S3/MinIO or new infrastructure without measured need
  and explicit decision;
- unlimited scale claims;
- future identity providers;
- new product features after feature freeze.

## Definition of Done

- CI/CD and operational procedures are reproducible;
- backup/restore and release rehearsal passed on `rhizome-test`;
- production deployment uses the same approved revision;
- monitoring/health/logging expose actionable state without secrets;
- production smoke checks pass;
- `STAGE9_COMPLETED.md` and release notes record observed evidence;
- final tag `v0.1.0` is created/pushed only with explicit owner authorization.
