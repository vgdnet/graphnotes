# Prompt for the GraphNotes overnight Stage worker

Запусти основной Stage-воркер в корне репозитория GraphNotes и передай ему этот
prompt. Technical Observer должен оставаться отдельным read-only воркером.

---

Продолжай текущий активный Stage GraphNotes до проверенного candidate, соблюдая
`AGENTS.md` и все канонические источники.

Перед действиями полностью прочитай:

- `docs/product/PRODUCT_SPEC.md`;
- `docs/context/MASTER_CONTEXT.md`;
- `docs/context/ENVIRONMENTS.md`;
- `docs/context/STAGE_STATUS.md`;
- применимые ADR;
- активный Stage-файл;
- `docs/releases/OVERNIGHT_RELEASE_PLAN.md`;
- `docs/releases/RELEASE_VERSIONING.md`.

Ночная цель сейчас — завершить только Stage 2 и получить exact-SHA candidate,
проверенный на `rhizome-test`. Не называй его полным MVP или production
release. Не переходи к Stage 3 без принятого ADR по GitHub repository visibility
и isolation.

Работай последовательно по traceability matrix активного Stage. После каждого
логического блока запускай применимые тесты. Заверши backend и frontend user
outcome, миграции, Compose и реальные integration flows. Не скрывай `FAIL` или
`NOT VERIFIED` в known issues.

Не deploy на `rhizome`. Не создавай и не push tag без явного разрешения.
При необходимости продукта, архитектуры, credentials или опасного изменения
остановись с `BLOCK` и точным описанием требуемого решения.

Когда candidate готов:

1. укажи branch, exact HEAD SHA и base ref;
2. обеспечь чистое рабочее дерево либо перечисли всё, что не вошло в SHA;
3. запиши только наблюдавшиеся результаты в `STAGE2_COMPLETED.md`;
4. обнови `STAGE_STATUS.md`;
5. передай candidate отдельному Technical Observer;
6. не объявляй Stage закрытым до его `PASS` и решения владельца.

---
