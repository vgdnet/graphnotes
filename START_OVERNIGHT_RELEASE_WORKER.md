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

Ночная цель — последовательно выполнять Stage 2–9 до максимально дальнего
безопасного checkpoint и, только если пройдены все gates, подготовить
production release `v0.1.0`. Не перескакивай стадии и не называй промежуточный
checkpoint полным MVP. Не переходи к Stage 3 без принятого ADR по GitHub
repository visibility/isolation и далее соблюдай decision gates каждого
Stage-файла.

Работай последовательно по traceability matrix активного Stage. После каждого
логического блока запускай применимые тесты. Заверши backend и frontend user
outcome, миграции, Compose и реальные integration flows. Не скрывай `FAIL` или
`NOT VERIFIED` в known issues.

Не deploy на `rhizome` и не создавай/push tag без отдельного явного разрешения
владельца для exact RC. При необходимости продукта, архитектуры, credentials
или опасного изменения остановись с `BLOCK` и точным описанием требуемого
решения.

Когда candidate текущего Stage готов:

1. укажи branch, exact HEAD SHA и base ref;
2. обеспечь чистое рабочее дерево либо перечисли всё, что не вошло в SHA;
3. запиши только наблюдавшиеся результаты в соответствующий
   `STAGE<N>_COMPLETED.md`;
4. обнови `STAGE_STATUS.md`;
5. передай candidate отдельному Technical Observer;
6. не объявляй Stage закрытым до его `PASS` и решения владельца;
7. после принятия начни следующую каноническую feature-ветку и повтори цикл.

Перед production остановись для отдельного owner approval, даже если все
автоматические проверки прошли.

---
