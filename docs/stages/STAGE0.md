# Stage 0 - Infrastructure

Status: HISTORICAL / COMPLETED
Environment: `rhizome`

## Goal

Подготовить базовую серверную среду, в которой впоследствии может работать
GraphNotes, не реализуя само приложение.

## Intended scope

- Debian 13 host `rhizome`;
- рабочий каталог `/opt/graphnotes`;
- Docker Engine и Docker Compose;
- базовые filesystem ownership и доступ для будущего deployment;
- инвентаризация сети, firewall и reverse proxy без выдумывания значений;
- сохранение секретов вне Git.

## Out of scope

- application source code;
- product authentication, GitHub integration, Markdown и graph features;
- первая миграция базы приложения;
- production deployment непроверенной ревизии.

## Historical acceptance

Stage 0 был объявлен завершённым до появления текущего репозитория. Канонические
известные факты записаны в `STAGE0_COMPLETED.md`. Отсутствующие исторические
факты нельзя восстанавливать предположениями.

## Current safety rule

Перед любым production deployment состояние `rhizome` проверяется read-only.
Существующие файлы `/opt/graphnotes`, сеть, firewall и сервисы не
перезаписываются без инвентаризации и плана восстановления.
