# Инструкция интегратору

Канонический путь поставки: `nord → GitHub → rhizome-test → принятая owner ревизия → main / rhizome`.

```
nord пишет код и ТЗ на feature-ветке
  → push GitHub
  → rhizome-test (172.16.13.14) fetch/checkout, migrate, compose, tests
  → если owner принял после тестов: merge/promote в main (или approved tag)
  → rhizome (prod) только approved revision; без push credentials на rhizome
```

Текущая стадия — одна feature-ветка (`feature/08-graph-diff`). Не смешивать стадии в одной ветке.

## Что считать прогрессом ТЗ

- История версий ТЗ: `docs/product/roadmap-and-governance.md` §15 плюс `git log`.
- Между версиями ТЗ коммитим и пушим на GitHub, **пока owner явно не сказал откатить**.
- Откат ТЗ — явная команда owner, не «тесты красные».
- Зелёные тесты на nord ≠ main.
- Зелёные тесты на rhizome-test **и** «принято» от owner = можно в main (или approved tag).

## Роли

- Integrator не выдумывает продукт и не правит ТЗ вместо продуктолога.
- `compose.yaml` остаётся production-safe: backend и frontend на loopback, PostgreSQL без host-порта.
- На rhizome-test — overlay `deploy/compose.rhizome-test.yaml` (LAN только у frontend).
- На rhizome нет credentials с правом push.
