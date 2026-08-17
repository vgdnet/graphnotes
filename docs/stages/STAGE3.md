# Stage 3 - GitHub Integration

Status: PLANNED / DECISION-GATED
Branch: `feature/03-github-integration`
Depends on: accepted Stage 2

## User outcome

Авторизованный пользователь видит доступные рабочие пространства и понятный
статус их knowledge repository. GraphNotes, а не браузер пользователя,
безопасно выполняет разрешённые GitHub-операции от имени приложения.

## Blocking decision before implementation

До начала реализации обязателен Accepted ADR, определяющий:

- private/public visibility knowledge repositories;
- изоляцию разных workspaces и пользователей;
- GitHub App installation model и минимальные permissions;
- модель основной и пользовательских веток;
- правила хранения installation/repository identifiers;
- кто может создавать workspace и привязывать repository.

Публичность source repository GraphNotes не делает пользовательские базы знаний
публичными. Без этого ADR Stage имеет статус `BLOCK`.

## Scope

- модели `workspace`, membership и GitHub repository binding;
- роли/права внутри workspace, не полагающиеся только на global role;
- GitHub App authentication на backend;
- шифруемое/секретное хранение credentials вне БД и Git;
- проверка installation/repository access и default branch;
- создание/обнаружение согласованного personal Git state пользователя;
- сохранение repository, branch и commit SHA identifiers;
- понятные состояния sync: ready, pending, rate-limited, unavailable, error;
- обработка GitHub timeout, pagination и rate limit;
- audit значимых admin операций;
- frontend workspace list и repository status без Git-жаргона там, где он не
  нужен пользователю.

## API baseline

```text
GET  /api/workspaces
GET  /api/workspaces/{id}/repo/status
POST /api/workspaces/{id}/repo/connect      # admin-only if selected by design
POST /api/webhooks/github                   # minimal verified receiver
```

Точные admin endpoints определяются после blocking ADR.

## Security requirements

- backend проверяет user, active status, global role и workspace membership;
- GitHub private key/token не возвращается в API и не логируется;
- GitHub App получает только минимальные permissions;
- webhook signature проверяется криптографически до обработки payload;
- repository/installation identifiers нельзя подменить через request;
- SSRF и произвольный Git remote запрещены;
- rate-limit и upstream errors не раскрывают секреты;
- конечному пользователю не выдаются GitHub credentials или прямой repository
  access в обход GraphNotes.

## Data and consistency

- workspace binding хранит stable GitHub identifiers, не только display names;
- наблюдавшийся commit SHA записывается вместе со статусом синхронизации;
- повторный webhook не создаёт дублирующие события;
- GitHub остаётся источником истины Git-состояния;
- Stage не создаёт собственный Git/merge engine.

## Out of scope

- загрузка и парсинг Markdown;
- note index и graph API;
- Pull Request review/merge UX;
- graph diff;
- Telegram/OAuth login.

## Verification

- migration upgrade/downgrade/re-upgrade;
- membership isolation и negative authorization matrix;
- работа с тестовой GitHub App installation/repository;
- invalid webhook signature rejected;
- duplicate webhook idempotent;
- revoked/expired credential, timeout и rate limit дают наблюдаемый статус;
- API не раскрывает credentials;
- exact SHA проходит Compose и integration checks на `rhizome-test`;
- backend/PostgreSQL exposure не расширен.

## Definition of Done

- blocking ADR принят и документы синхронизированы;
- пользователь видит только разрешённые workspaces;
- backend безопасно читает согласованный GitHub repository status;
- personal/shared Git states адресуются однозначно;
- failure modes видимы и повторяемы;
- Technical Observer matrix не содержит обязательных `FAIL/NOT VERIFIED`;
- создан `STAGE3_COMPLETED.md` с identifiers без secrets и observed results.
