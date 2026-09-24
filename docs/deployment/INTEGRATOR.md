# Инструкция интегратору

Канонический путь поставки: `nord → канонический remote исходников → rhizome-test → принятая owner ревизия → main / rhizome`.

```
обсудили и приняли
  → продуктовое ТЗ (docs/product/)
  → техническое ТЗ (MASTER_CONTEXT, deployment)
  → Code Writer: код на nord, push в канонический remote
  → rhizome-test (172.16.13.14) fetch/checkout, migrate, compose, tests
  → если owner принял после тестов: merge/promote в main (или approved tag)
  → rhizome (prod) только approved revision; без push credentials на rhizome
```

ТЗ 2.98: Code Writer **выкладывает** карту инвайтов на `rhizome-test`.
Страница: `http://172.16.13.14:8080/#/invites` (только admin). JSON:
`GET http://172.16.13.14:8080/api/graph/invites`. Hash `#/api/graph/invites`
не страница. Production `rhizome` этим шагом не трогать.

Текущая стадия — одна feature-ветка (`feature/08-graph-diff`). Не смешивать стадии в одной ветке.

## Что считать прогрессом ТЗ

- История версий ТЗ: `docs/product/roadmap-and-governance.md` §15 плюс `git log`.
- Между версиями ТЗ коммитим и пушим в канонический remote, **пока owner явно не сказал откатить**.
- Откат ТЗ — явная команда owner, не «тесты красные».
- **ТЗ 2.99:** порядок поставки — продуктовое ТЗ → техническое ТЗ →
  выкладка на `rhizome-test`. На тест не раньше обоих ТЗ. Чат не канон.
- Зелёные тесты на nord ≠ main.
- Зелёные тесты на rhizome-test **и** «принято» от owner = можно в main (или approved tag).

## Роли

- **Code Writer** пишет код на `nord`, пушит в канонический remote и доводит выкладку
  до `rhizome-test` (fetch/checkout, migrate, compose). Для ТЗ 2.98 после
  выкладки открывается `http://172.16.13.14:8080/#/invites`.
- Integrator не выдумывает продукт и не правит ТЗ вместо продуктолога.
- `compose.yaml` остаётся production-safe: backend и frontend на loopback, PostgreSQL без host-порта.
Образ backend: native helper MediaWiki wikidiff2 C++ (pinned 1.14.2 +
CLI, ТЗ 3.03 / ADR-018 / owner 2026-09-21). `php-cli` / `php-wikidiff2`
снимаются, потому что они были только для этого helper — не запрет PHP
во всём проекте. Без helper очередь editor не рисует таблицу правок
(503, не `difflib`).
- На rhizome-test — overlay `deploy/compose.rhizome-test.yaml` (LAN только у frontend).
- На rhizome нет credentials с правом push.
