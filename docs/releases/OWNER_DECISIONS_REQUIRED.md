# Owner decisions required before v0.1.0

Статус: OPEN INPUTS
Обновлено: 2026-08-19

Эти решения нельзя принимать техническому или Stage-воркеру самостоятельно.
Пока обязательное решение отсутствует, соответствующий Stage имеет `BLOCK`.

## Before Stage 3

Принято ADR-008 (2026-08-19):

- knowledge repository может быть публичным на чтение без аккаунта GraphNotes;
- личная ризома = git пользователя (obsidian-git или аналог);
- вклад в общую требует регистрации, connected git и очереди editor’ов;
- ветки/механики merge остаются Git; UX — «предложить / принять / взять себе».

Ещё нужно для реализации Stage 3:

- GitHub App test installation и идентификатор shared repository;
- минимальные GitHub permissions;
- как именно подключается personal remote (fork, отдельный repo, App installation);
- webhook secret для `rhizome-test`.

Модель одной общей ризомы и одного repository уже принята ADR-007; Stage 3 не
должен снова открывать вопрос workspace/multiple shared repositories.

## Before Stage 6 final UX

- нужен ли отдельный local-neighborhood graph **общей** ризомы и его глубина;
- минимальный provenance, показываемый для node/edge;
- редактирование через graph остаётся вне MVP, если отдельный ADR не принимает
  обратное решение.
- локальный граф текущей заметки «как Obsidian» не требуется (ADR-008).

Решения по глубине/provenance могут быть локальными требованиями Stage, если не
меняют product model или security boundary.

## Before Stage 7

- proposal публикует выбранные изменения или весь personal diff;
- как scope proposal фиксируется относительно Git SHA;
- что происходит с personal changes, появившимися после создания proposal.

Результат: зафиксированное product decision; ADR обязателен, если меняется
ownership/merge workflow.

## Before Stage 9 production deployment

- hostname/domain и TLS termination;
- initial production admin bootstrap;
- maintenance window/downtime;
- backup location, retention и recovery expectation;
- production GitHub App installation/secrets;
- exact RC SHA/tag;
- разрешение на reconciliation `/opt/graphnotes`;
- разрешение на Nginx/services/migration changes;
- явное разрешение на production deployment и final tag `v0.1.0`.

## Versioning approval

Подтвердить или изменить предложенную схему из
`docs/releases/RELEASE_VERSIONING.md`. Пока она имеет статус `PROPOSED`, Stage
может завершаться по SHA, но release tags не создаются автоматически.
