# GraphNotes — один Obsidian-плагин

Desktop-плагин: **личное хранилище** (как бывший Publisher) и, если API
говорит `can_see_queue`, **очередь правок** editor’а. «Предложить в ризому»
у `user` и пока capabilities неизвестны; у известного editor/admin
панель офера и пункт меню скрыты. Это грубый шлюз, не вечный ACL.

Справа — панель GraphNotes. Кнопка **«Передать правки на сервер»** пишет
vault → личный склад. **«Предложить в ризому»** у обычного участника создаёт
заявку, не пишет в общую: на панели после копии **и** в контекстном меню
файла в проводнике (Markdown) / меню редактора открытой заметки
(ТЗ 3.32). Очередь (`GET /api/proposals`) видна только
editor/admin.

**«Принять в работу»** скачивает две стороны карточки в кэш плагина.
Слияние открывается с диска. **Save & Resolve** сначала пишет принятый
файл в vault и открывает эту заметку; POST `/resolve` — вторая операция,
только если локальный текст ≠ опубликованная общая. Таймаут/504 не
откатывает vault.

| | leftover Publisher (`obsidian-plugin/`) | этот плагин |
| --- | --- | --- |
| `manifest.id` | `graphnotes-publisher` | `graphnotes-card-merge` |
| вид | `graphnotes-publisher-sync` | `graphnotes-card-merge-queue` |
| API | `/api/integrations/obsidian/v1` | то же + `/api/proposals` + `/api/differ` |
| пишет | личный склад | личный склад; в общую — через заявку/очередь |

Вход: токен `gnp_…` из кабинета (Настройки → Obsidian). Если Publisher уже
вошёл в этом vault — «Взять из Publisher».

## Установка

Локальный тест: **одна и та же сборка** (`dist/graphnotes-card-merge`:
`main.js`, `manifest.json`, `styles.css`) ставится в **два** vault’а —
`/home/efimov/obsidian/guide_psy` (токен участника) и
`/home/efimov/obsidian/rhizome` (токен editor). `data.json` в каждом vault
свой — не копировать и не затирать.

1. Obsidian desktop 1.8.7+.
2. `pnpm build` → скопировать три файла в
   `<vault>/.obsidian/plugins/graphnotes-card-merge/` (не `work/`, не
   `debug.log`).
3. Origin `http://172.16.13.14:8080`, HTTP, токен `gnp_…`, «Проверить подключение».
4. **Reload app without saving** в **обоих** vault’ах после копирования `main.js`.
5. В `guide_psy`: включить `graphnotes-card-merge`, выключить leftover
   `graphnotes-publisher` — два клиента сразу не запускать.

## Как пользоваться

1. Справа панель **GraphNotes**. Без editor-доступа очереди нет. Офер
   («Предложить в ризому») — только у роли `user` (панель и пункт в
   контекстном меню файла).
2. Токен **editor/admin** — очередь сайта `/queue`, без панели офера.
3. **«Принять в работу»** скачивает одну карточку (две стороны) на диск.
4. Save & Resolve пишет **эту одну** карточку в vault и открывает её
   новым листом (`createLeafBySplit` / `getLeaf(true)`, не MergeView).
   Соседние файлы той же заявки остаются в очереди.
5. Лог: `.obsidian/plugins/graphnotes-card-merge/debug.log`. Команда
   **GraphNotes: показать debug.log**.

## Разработка

Node.js 22+, pnpm. Из этой папки: `pnpm check`.

Проектный код: AGPL-3.0-only.
