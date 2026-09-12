# GraphNotes Card Merge — плагин сверки Differ

Desktop 0.1.0: два Markdown рядом в CodeMirror 6 `MergeView`. Это **не**
второй Differ и **не** GraphNotes Publisher.

Слева — **опубликованная общая** (`incoming` из `GET /api/differ/files/{path}`).
Справа — файл в текущем vault. Стрелки копируют кусок слева направо.
**Save & Resolve** пишет только локальный `.md`. Предложение в общую —
на сайте, `#/offer`.

Сайт показывает ту же пару кнопкой «Текст сверки» на `/offer`.

| | Publisher | Card Merge |
| --- | --- | --- |
| `manifest.id` | `graphnotes-publisher` | `graphnotes-card-merge` |
| вид | `graphnotes-publisher-sync` | `graphnotes-card-merge` |
| API | `/api/integrations/obsidian/v1` | `/api/differ`, `/api/differ/files/{path}` |
| пишет | личный склад GraphNotes | только файл vault |

Вход как у Publisher: токен `gnp_…` из кабинета (Настройки → Obsidian),
кнопка «Проверить подключение» зовёт
`GET /api/integrations/obsidian/v1/capabilities`. Если Publisher уже
вошёл в этом vault — «Взять из Publisher». Пароль учётки не вводится.
`data.json` у плагинов раздельный.

## Установка

1. Obsidian desktop 1.8.7+, отдельное тестовое хранилище.
2. `pnpm build`, папка `dist/graphnotes-card-merge` → `<vault>/.obsidian/plugins/`.
3. В настройках: origin `http://172.16.13.14:8080`, HTTP, токен `gnp_…`, «Проверить подключение».

## Как пользоваться

1. Команда «Сравнить и слить карточку» или иконка сравнения.
2. «Список Differ» — тот же `GET /api/differ`, что кабинет.
3. Путь открывает `GET /api/differ/files/{путь}`: слева общая, справа vault.
4. Либо второй путь в vault без сети.
5. Save & Resolve перезаписывает правую панель в локальный файл.

## Контракт

Это API GraphNotes, тот же origin, что у сайта и Publisher.
Тест: `http://172.16.13.14:8080`. Плагин зовёт `/api/differ` и
`/api/differ/files/{path}`; Nginx снимает `/api`, FastAPI видит `/differ`.
Ответ файла:

```json
{
  "path": "fresh.md",
  "title": "fresh",
  "kind": "added",
  "incoming": { "layer": "shared", "path": "fresh.md", "body": "", "author": null, "updated_at": null },
  "current": { "layer": "personal", "path": "fresh.md", "body": "# Fresh\n", "author": { "username": "alice", "display_name": "Alice" }, "updated_at": "2026-09-12T02:00:00Z" }
}
```

`kind`: `added` | `changed` | `same`. Закрытый путь — 404.

## Разработка

```sh
pnpm install
pnpm build
pnpm test
```

AGPL-3.0-only. CodeMirror 6 бандлится; пакет `obsidian` — нет.
