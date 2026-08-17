# GraphNotes stage specifications

Статус: CANONICAL ROADMAP INDEX
Обновлено: 2026-08-18

Всего в roadmap **10 стадий: Stage 0–9**.

| Stage | Название | Основной результат | Версия/checkpoint |
| --- | --- | --- | --- |
| 0 | Infrastructure | Подготовлена базовая production-инфраструктура | historical |
| 1 | Project Bootstrap | Запускаемый skeleton приложения | completed |
| 2 | Password Authentication | Безопасный login/password flow | `v0.1.0-dev.2` |
| 3 | GitHub Integration | Installation связана с одним knowledge repository; one personal state per user | `v0.1.0-dev.3` |
| 4 | Markdown Import | Безопасный импорт Markdown в личное Git-состояние | `v0.1.0-dev.4` |
| 5 | Graph Engine | Восстановимый производный индекс и Graph API | `v0.1.0-dev.5` |
| 6 | Personal Graph | Личный и общественный граф доступны в UI | `v0.1.0-dev.6` |
| 7 | Publish / PR / Merge | Предложение, review и merge Markdown | `v0.1.0-dev.7` |
| 8 | Graph Diff | Визуальный diff изменения графа | `v0.1.0-alpha.1` |
| 9 | Production Hardening / CI/CD | Production release candidate | `v0.1.0-rc.1` → `v0.1.0` |

Версии являются предложением до одобрения
`docs/releases/RELEASE_VERSIONING.md` владельцем.

## Последовательность

Стадии выполняются строго последовательно. Каждая стадия использует отдельную
feature-ветку, exact-SHA проверку на `rhizome-test`, Technical Observer gate и
completion artifact.

Следующая стадия не начинается, пока:

- предыдущая не удовлетворяет своему Definition of Done;
- обязательные `FAIL` и `NOT VERIFIED` не устранены;
- completion artifact не содержит наблюдавшиеся результаты;
- владелец не принял требуемые продуктовые/архитектурные решения.

## Общие неизменяемые правила

- Markdown/Git — источник истины; граф и PostgreSQL-индекс производны;
- backend проверяет authentication, global role, personal ownership и layer;
- прямой GitHub-доступ конечному пользователю не выдаётся;
- новая инфраструктура вне MVP stack требует явного решения;
- секреты не коммитятся и не попадают в API/логи;
- backend и PostgreSQL не публикуются в LAN/production;
- `rhizome-test` — development/integration/test runtime;
- `rhizome` — production только для утверждённой ревизии.

## Completion artifacts

Для каждого Stage создаётся `STAGE<N>_COMPLETED.md` с:

- exact branch и SHA;
- фактически реализованным scope;
- миграциями и схемами данных;
- версиями зависимостей;
- выполненными командами и результатами;
- runtime-проверками на `rhizome-test`;
- security и exposure checks;
- known issues/technical debt;
- решениями, необходимыми следующей стадии.
