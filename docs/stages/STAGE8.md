# Stage 8 - Graph Diff

Status: PLANNED
Branch: `feature/08-graph-diff`
Depends on: accepted Stage 7

## User outcome

User и editor видят, как proposal изменит структуру знания: какие заметки и
связи добавятся, удалятся или изменятся, до принятия merge-решения.

## Scope

- deterministic graph diff между proposal base и head Git SHAs;
- added, removed и modified nodes;
- added и removed directed edges;
- resolved ↔ unresolved transitions;
- связь graph diff с textual Markdown diff и proposal;
- backend endpoint с bounded result/pagination/summary;
- React/Cytoscape preview с legend и доступными нецветовыми markers;
- фильтры и focus affected neighborhood;
- stale/outdated preview detection при изменении proposal revision;
- empty/no-structural-change и conflict states;
- cache только как производное, invalidated по SHAs.

## API baseline

```text
GET /api/workspaces/{id}/graph/diff?proposal_id=...
```

Ответ обязан включать base/head SHA, status completeness и counts, чтобы UI не
выдавал частичный diff за полный.

## Correctness rules

- diff вычисляется из двух канонических Markdown/Git states;
- graph diff не становится отдельным merge input;
- одинаковые SHAs дают пустой diff;
- rename/content/link changes имеют детерминированную классификацию;
- failed parsing/indexing делает preview incomplete, а не silently empty;
- результат можно пересчитать без сохранённого graph-файла.

## Security and scale

- доступ наследует proposal/workspace authorization;
- пользователь не может сравнивать произвольные чужие SHAs;
- response имеет node/edge/size/time bounds;
- large diff отдаёт summary/truncation с явным status;
- private note content не включается без необходимости;
- cache key включает workspace, authorized proposal и exact SHAs.

## Out of scope

- собственный merge engine;
- автоматическая оценка качества/истинности знания;
- graph-based editing;
- real-time multi-user diff;
- изменение publication decision Stage 7.

## Verification

- fixtures для add/remove/modify/rename/link/unresolved transitions;
- graph diff согласуется с clean re-index обоих SHAs;
- no-change и text-only/no-graph-change cases;
- incomplete parser/index state visible;
- authorization and arbitrary-SHA rejection;
- large diff bounds/truncation;
- visual legend, filters и keyboard-accessible details;
- end-to-end proposal preview on `rhizome-test` exact SHA.

## Definition of Done

- editor до merge видит корректные структурные последствия proposal;
- user видит graph diff своего proposal;
- preview однозначно связан с base/head SHA;
- incomplete/stale result нельзя принять за current complete diff;
- Stage 2–8 вместе удовлетворяют feature-complete MVP criteria;
- создан `STAGE8_COMPLETED.md` с correctness fixtures и scale limits;
- candidate может называться `v0.1.0-alpha.1` только после Observer PASS и
  явного разрешения на tag.
