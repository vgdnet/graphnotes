# Owner decisions required before v0.1.0

Статус: OPEN INPUTS
Обновлено: 2026-08-17

Эти решения нельзя принимать техническому или Stage-воркеру самостоятельно.
Пока обязательное решение отсутствует, соответствующий Stage имеет `BLOCK`.

## Before Stage 3

- private/public visibility knowledge repositories;
- один repository на workspace или другая модель изоляции;
- GitHub App installation ownership и test installation;
- минимальные GitHub permissions;
- основная и personal branch naming/lifecycle;
- кто создаёт workspace и привязывает repository.

Результат: Accepted ADR до реализации Stage 3.

## Before Stage 6 final UX

- нужен ли отдельный local-neighborhood graph и его максимальная глубина;
- минимальный provenance, показываемый для node/edge;
- редактирование через graph остаётся вне MVP, если отдельный ADR не принимает
  обратное решение.

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
