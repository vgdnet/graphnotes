# GraphNotes overnight release plan

Status: DRAFT / GATED
Prepared: 2026-08-18

## Target

Ночной цикл может последовательно выполнять Stage 2–9 и дойти до `v0.1.0`
только если каждый Stage полностью проходит свой gate, все blocking decisions
уже приняты, внешние credentials/environments доступны, а владелец отдельно
разрешает merge/tag/production deployment.

Цель — максимальный безопасный прогресс, а не объявление релиза к заданному
времени. При первом непреодолимом gate воркер фиксирует точный checkpoint и
останавливается с `BLOCK`.

## Why full MVP cannot be guaranteed by time

- Stage 3 требует configured test GitHub App и единого knowledge repository;
- GitHub App/credentials и минимальные permissions должны быть предоставлены и
  проверены, их нельзя выдумать;
- Stage 4–8 содержат самостоятельные data, parser, graph и merge boundaries;
- Stage 9 требует hardening, backup/recovery, CI/CD и release rehearsal;
- `rhizome` ещё требует безопасного reconciliation `/opt/graphnotes`, read-only
  Git access, Nginx configuration и отдельного production approval.

Скорость работы не отменяет эти gates. Если все prerequisites заранее
предоставлены, воркер продолжает последовательно; иначе сохраняет последний
проверенный Stage-checkpoint.

## Stage sequence

| Stage | Обязательный результат | Gate перед следующим Stage |
| --- | --- | --- |
| 2 | Password auth end-to-end | auth/security/migration PASS |
| 3 | One repository + GitHub App integration | real test installation and one personal state per user |
| 4 | Safe MD/ZIP import into personal Git state | hostile upload suite + commit consistency |
| 5 | Rebuildable derived graph index/API | rebuild equivalence + SHA consistency |
| 6 | Personal/shared Cytoscape UX | browser/isolation/scale PASS |
| 7 | Proposal/PR/review/merge | publication-scope decision + reconciliation PASS |
| 8 | Correct graph diff | feature-complete MVP Observer PASS |
| 9 | Hardening, CI/CD, recovery, production | RC rehearsal + owner production approval |

Подробное исполнимое ТЗ каждой строки находится в
`docs/stages/STAGE<N>.md`.

## Stage execution algorithm

Для каждой стадии без исключения:

1. подтвердить accepted previous Stage и прочитать новый Stage-файл;
2. проверить blocking decisions и credentials;
3. создать/использовать только каноническую feature-ветку стадии;
4. реализовать только её scope;
5. выполнить локальные проверки и миграции;
6. получить Technical Observer traceability matrix для stable candidate;
7. проверить exact SHA на `rhizome-test`;
8. исправить findings и повторить аудит;
9. создать `STAGE<N>_COMPLETED.md` с observed evidence;
10. только после принятия перейти к следующей стадии.

## Detailed Stage 2 starting sequence

### 1. Stabilize the candidate

- не смешивать в Stage 2 GitHub, Markdown, graph или proposal functionality;
- закончить backend и frontend auth outcome;
- исключить незакоммиченные файлы из утверждаемой ревизии;
- зафиксировать candidate SHA.

### 2. Verify every Stage 2 requirement

Обязательный минимум:

- регистрация с UUID и нормализованным уникальным username;
- Argon2 hash, ограничение длины пароля и отсутствие plaintext в БД/логах;
- login, refresh/session continuation, logout и `/api/users/me`;
- rotation и хранение только hash refresh/session secret;
- inactive user rejected на login, refresh и authenticated request;
- HttpOnly/SameSite/Secure cookie policy по environment;
- global hierarchical `user/editor/admin` RBAC and safe initial-admin bootstrap;
- миграция `upgrade`, `downgrade`, повторный `upgrade` на disposable DB;
- негативные auth-тесты и отсутствие secrets/password hashes в API;
- frontend register/login/reload/me/logout flow, а не только backend `curl`.

### 3. Local checks

- backend tests;
- backend startup/import;
- frontend type/build/tests;
- `docker compose config`;
- secret scan текущего diff;
- Technical Observer traceability matrix для `main...candidate`.

### 4. Integration on rhizome-test

Проверяется точный candidate SHA:

- clean fetch/checkout;
- image builds и Compose startup;
- Alembic migration against test PostgreSQL;
- реальные register/login/reload/me/logout/inactive flows;
- process/database health;
- backend остаётся loopback-only;
- PostgreSQL не получает host port;
- reboot/persistence check, если auth state зависит от runtime persistence;
- логи проверены на password, tokens, cookies и hashes.

### 5. Completion gate

- создать `docs/stages/STAGE2_COMPLETED.md` только с наблюдавшимися фактами;
- обновить `STAGE_STATUS.md`;
- повторить Technical Observer audit для exact SHA;
- получить `PASS` без обязательных `NOT VERIFIED`;
- merge/tag/push выполнять только при наличии соответствующего разрешения.

## Stop conditions

Ночной воркер обязан остановиться и сообщить `BLOCK`, если:

- требуется продуктовое или архитектурное решение;
- отсутствуют credentials, доступ к среде или секреты;
- миграция теряет данные или downgrade не определён без принятого исключения;
- security requirement не проверен;
- тесты или build не проходят;
- текущая ветка содержит несвязанные или неизвестные изменения;
- candidate на `rhizome-test` отличается от проверенного SHA;
- для Stage 3 отсутствуют test GitHub App/repository credentials или
  configuration единого knowledge repository.

Нельзя автоматически переходить к следующему Stage после `BLOCK` и нельзя
компенсировать незавершённое требование записью в known issues.

## Path from checkpoints to v0.1.0

```text
v0.1.0-dev.2  Stage 2 authentication
  -> dev.3     GitHub integration
  -> dev.4     safe Markdown import
  -> dev.5     derived graph engine
  -> dev.6     personal/shared graph UX
  -> dev.7     proposal and merge workflow
  -> alpha.1   graph diff; feature-complete MVP
  -> rc.1      Stage 9 hardening and production rehearsal
  -> v0.1.0    approved production deployment and smoke checks
```

Каждый переход выполняется отдельной feature-веткой, отдельным completion
artifact и отдельным exact-SHA gate на `rhizome-test`.
