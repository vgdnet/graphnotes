# GraphNotes release versioning

Status: PROPOSED
Proposed: 2026-08-17

Этот документ предлагает техническую схему версий. Он становится каноническим
после явного одобрения владельца проекта.

## Scheme

GraphNotes использует Semantic Versioning для продуктовых релизов:

```text
MAJOR.MINOR.PATCH[-PRERELEASE]
```

До первого стабильного публичного контракта используется линия `0.x`.

## First MVP line

- `v0.1.0-dev.N` — внутренний принятый Stage-checkpoint; не production release;
- `v0.1.0-alpha.N` — все основные пользовательские сценарии MVP реализованы,
  но hardening ещё не завершён;
- `v0.1.0-beta.N` — feature-complete MVP прошёл расширенное интеграционное
  тестирование; допускаются исправления, но не новая функциональность;
- `v0.1.0-rc.N` — точная production candidate revision после Stage 9;
- `v0.1.0` — первый MVP, развёрнутый на `rhizome` и прошедший production smoke
  checks.

Рекомендуемое соответствие roadmap:

| Milestone | Version |
| --- | --- |
| Accepted Stage 2 checkpoint | `v0.1.0-dev.2` |
| Accepted Stage 3 checkpoint | `v0.1.0-dev.3` |
| Accepted Stage 4 checkpoint | `v0.1.0-dev.4` |
| Accepted Stage 5 checkpoint | `v0.1.0-dev.5` |
| Accepted Stage 6 checkpoint | `v0.1.0-dev.6` |
| Accepted Stage 7 checkpoint | `v0.1.0-dev.7` |
| Accepted Stage 8 / feature-complete MVP | `v0.1.0-alpha.1` |
| Stage 9 hardening candidate | `v0.1.0-rc.1` |
| Approved production deployment | `v0.1.0` |

Stage number и product version — разные сущности. Stage-checkpoint не должен
выдаваться пользователю как готовый MVP.

## Tag rules

- тег создаётся только на закоммиченный exact SHA;
- рабочее дерево должно быть чистым;
- SHA должен пройти применимые проверки на `rhizome-test`;
- для `alpha`, `beta`, `rc` и final обязателен Technical Observer gate;
- `v0.1.0` ставится только на ту ревизию, которая фактически развёрнута в
  production;
- теги не перемещаются и не переиспользуются;
- исправление после опубликованного `v0.1.0` получает `v0.1.1`, а не
  перезаписанный тег;
- создание tag и push требуют явного разрешения владельца.
