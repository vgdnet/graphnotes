# Контракт, который читает плагин

Серверная каноника: `docs/deployment/OBSIDIAN_PLUGIN_API.md`.
Продукт: `docs/product/functional.md` §6.3.4.
Поведение плагина: `docs/OBSIDIAN_PLUGIN_API_TZ.md` (PLG-01…07).

Плагин ходит на `{origin}/api/integrations/obsidian/v1`.
FastAPI сам префикса `/api` не имеет — его ставит Nginx.

## Поля, которые плагин принимает

Сервер в capabilities отдаёт `formats` и `limits.manifest_page_max`.
Клиент приводит их к `supported_extensions` и `manifest_page_size`.
`protocol_version` — `1` или `1.0`.
`GET /files/content` — сырые байты, версия в `X-GraphNotes-Version`.
В статусе передачи читается `remaining_blobs` (если нет — `required_blobs`).

Токен (`gnp_…`) хранится в кабинете GraphNotes и копируется в `data.json` плагина. Отзыв в кабинете блокирует ключ; новый ключ снова из кабинета.
HTTP только после явного флага. Редиректы не сопровождаются авторизацией.

Плагин копит правки локально и пишет в личное по кнопке / закрытию файла / минутам (ТЗ 2.90), не на каждый `modify`. Общую ризому не трогает. После копии в личное тот же токен читает `GET /api/differ` и создаёт заявку `POST /api/proposals` (ТЗ 3.20). Card Merge по-прежнему очередь editor’а, не этот пакет. `docs/OBSIDIAN_PLUGIN_API_TZ.md` — не канон: PLG-02/03 («сохранение не шлёт», обязательный выбор) сняты.

Если контракт меняется — правится серверный документ, затем этот файл.
