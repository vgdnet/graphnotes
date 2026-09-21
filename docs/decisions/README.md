# GraphNotes ADRs — index, not a second spec

**Не читай superseded ADR как канон.** Живой принятый продукт —
`docs/product/PRODUCT_SPEC.md` **3.41** (что) +
`docs/context/MASTER_CONTEXT.md` (как). Чат не спецификация. Полный
текст ADR сюда не копируется.

Агенты открывают **два** живых файла, плюс этот индекс если нужно
узнать, какой ADR ещё living. Историю файлов не удаляем.

## Living (ещё правда)

| ADR | One-liner |
| --- | --- |
| [ADR-001](ADR-001-markdown-source-of-truth.md) | Markdown — источник истины знания; граф производный; нет `graph.json`. Где лежит `.md` — в SPEC/MASTER (плагин), не git-диск. |
| [ADR-002](ADR-002-password-auth-mvp.md) | MVP-вход: локальный username/password. Telegram как IdP — позже, на том же UUID. |
| [ADR-005](ADR-005-agpl-3-license.md) | ПО GraphNotes — AGPL-3.0 (`LICENSE`). Тела карточек в общую — WTFPL (договор автора, не второй LICENSE). |
| [ADR-006](ADR-006-production-git-readonly.md) | GitHub — **только доставка исходников**. `https://github.com/vgdnet/rhizome` **private**, не ingest, не публичный продукт (не путать с хостом `rhizome`). |
| [ADR-010](ADR-010-author-legal-contract.md) | Статус автора на UUID; не четвёртая RBAC-роль. |
| [ADR-011](ADR-011-closed-corpus.md) | Закрытый корпус остаётся в личном складе; `closed_paths` — флаг, не второй канон в PostgreSQL. |
| [ADR-012](ADR-012-user-cards.md) | Карточка человека `#/users/{login}`; публичного UUID нет. |
| [ADR-013](ADR-013-provenance-feed.md) | `rhizome_events` — кто что сделал в общей; без тел. |
| [ADR-014](ADR-014-commenter.md) | Комментатор — не четвёртая RBAC-роль. |
| [ADR-015](ADR-015-elasticsearch-next-search.md) | Elasticsearch **только после** первой утверждённой выкатки на production `rhizome`. До тех пор SQL `/search`; в Compose ES нет. |
| [ADR-016](ADR-016-rhizome-access-levels.md) | Уровни доступа = закрытый срез, не роль «потребитель»; не второй knowledge repo. |
| [ADR-017](ADR-017-smtp-login.md) | SMTP инсталляции: confirm / вход письмом / сброс. Не замена password IdP. |
| [ADR-018](ADR-018-wikidiff2-editor-engine.md) | Текст editor `/queue` — native C++ **wikidiff2**. Не `difflib`. **Не PHP как движок.** |

## Superseded (история)

Не ingest, не диск знания, не ZIP общей, не «учётка editor’а = ризома».

| ADR | Почему снят (побеждает 3.40) |
| --- | --- |
| [ADR-003](ADR-003-github-as-knowledge-git-engine.md) | GitHub как git-движок **знания**. Живой ingest — плагин; GitHub остаётся ADR-006 (исходники). |
| [ADR-004](ADR-004-local-dev-rhizome-target.md) | Среда/доставка — living ADR-006. |
| [ADR-007](ADR-007-single-shared-rhizome-global-rbac.md) | Одна ризома + RBAC как git-merge архитектура. Живые куски (одна ризома, `user < editor < admin`, без workspace) — в SPEC/MASTER. |
| [ADR-008](ADR-008-obsidian-git-shared-rhizome.md) | Личное = git-remote / запрет hosted store / ZIP общей. Авторы по-прежнему пишут в Obsidian; пишет плагин. |
| [ADR-009](ADR-009-differ-markdown-circulation.md) | Круговорот через git + ZIP опубликованной общей. Живой Differ — склады `personal_uploads` ↔ `shared_notes`. |

## Не эта волна

Не выдумывать грант-запись уже в общую (OPEN, следующая стадия). Не
стирать личный склад. Не выкладывать. Не merge в `main`.
