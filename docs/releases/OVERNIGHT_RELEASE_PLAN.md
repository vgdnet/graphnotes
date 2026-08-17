# GraphNotes overnight release plan

Status: DRAFT / GATED
Prepared: 2026-08-17

## Honest target for the current night

Текущий безопасный результат — полностью закрытый и принятый Stage 2 на
`rhizome-test`, готовый к checkpoint `v0.1.0-dev.2` после явного разрешения на
tag.

Это не полный GraphNotes MVP и не production release. Полный `v0.1.0` требует
Stage 3–9 и production gate.

## Why full MVP cannot be promised overnight

- Stage 3 требует отдельного принятого решения по visibility и изоляции
  knowledge-репозиториев GitHub;
- GitHub App/credentials и минимальные permissions должны быть предоставлены и
  проверены, их нельзя выдумать;
- Stage 4–8 содержат самостоятельные data, parser, graph и merge boundaries;
- Stage 9 требует hardening, backup/recovery, CI/CD и release rehearsal;
- `rhizome` ещё требует безопасного reconciliation `/opt/graphnotes`, read-only
  Git access, Nginx configuration и отдельного production approval.

Скорость работы не отменяет эти gates.

## Night sequence: Stage 2

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
- role enum `user/editor/admin` без преждевременной workspace-модели;
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
- для перехода к Stage 3 нет принятого ADR по GitHub repository isolation.

Нельзя автоматически переходить к следующему Stage после `BLOCK` и нельзя
компенсировать незавершённое требование записью в known issues.

## Path from checkpoint to v0.1.0

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
