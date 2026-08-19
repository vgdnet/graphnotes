from __future__ import annotations

from dataclasses import dataclass
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.github import SharedRepository
from app.models.proposal import Proposal, ProposalStatus
from app.models.user import User
from app.services.github import GitHubAppClient, GitHubAppError
from app.services.markdown import notes_lookup_map, parse_markdown, resolve_link_target
from app.services.proposal import ProposalError, _github, proposal_for_viewer
from app.services.repository import SHARED_SINGLETON_ID, published_sha

_PENDING = {
    ProposalStatus.OPEN.value,
    ProposalStatus.CHANGES_REQUESTED.value,
    ProposalStatus.CONFLICTED.value,
    ProposalStatus.FAILED.value,
    ProposalStatus.ACCEPTED_PENDING_MERGE.value,
    ProposalStatus.MERGED_INDEXING.value,
}


@dataclass(frozen=True)
class SnapshotEdge:
    source: str
    target: str
    type: str
    unresolved: bool


@dataclass(frozen=True)
class SnapshotNode:
    path: str
    title: str
    tags: tuple[str, ...]
    aliases: tuple[str, ...]
    content_hash: str
    isolated: bool


@dataclass
class Snapshot:
    nodes: dict[str, SnapshotNode]
    edges: frozenset[SnapshotEdge]
    unresolved_titles: dict[str, str]
    parse_warnings: int


def build_snapshot(files: dict[str, str]) -> Snapshot:
    parsed = {path: parse_markdown(path, text) for path, text in files.items()}
    lookup = notes_lookup_map(set(parsed))
    edges: set[SnapshotEdge] = set()
    linked: set[str] = set()
    unresolved_titles: dict[str, str] = {}
    warnings = 0
    for path, note in parsed.items():
        warnings += len(note.warnings)
        for link in note.typed_links:
            target_path = resolve_link_target(link.target, lookup)
            if target_path:
                edges.add(SnapshotEdge(path, target_path, link.kind, False))
                linked.add(path)
                linked.add(target_path)
                continue
            node_id = f"unresolved:{link.target}"
            unresolved_titles[node_id] = link.target
            edges.add(SnapshotEdge(path, node_id, link.kind, True))
            linked.add(path)
    nodes = {
        path: SnapshotNode(
            path=path,
            title=note.title,
            tags=tuple(sorted(set(note.tags))),
            aliases=tuple(sorted(set(note.aliases))),
            content_hash=note.content_hash,
            isolated=path not in linked,
        )
        for path, note in parsed.items()
    }
    return Snapshot(
        nodes=nodes,
        edges=frozenset(edges),
        unresolved_titles=unresolved_titles,
        parse_warnings=warnings,
    )


def _link_key(target: str) -> str:
    text = target.replace("\\", "/").strip().lstrip("/")
    if text.startswith("unresolved:"):
        text = text[len("unresolved:") :]
    if text.lower().endswith(".md"):
        text = text[:-3]
    return text.casefold()


def _marker(change: str) -> str:
    return {
        "added": "triangle",
        "removed": "octagon",
        "modified": "rectangle",
        "renamed": "diamond",
        "unresolved": "star",
        "unchanged": "ellipse",
    }.get(change, "ellipse")


def _empty_summary() -> dict[str, int]:
    return {
        "nodes_added": 0,
        "nodes_removed": 0,
        "nodes_modified": 0,
        "nodes_renamed": 0,
        "nodes_content_only": 0,
        "edges_added": 0,
        "edges_removed": 0,
        "edges_type_changed": 0,
        "unresolved_resolved": 0,
        "resolved_unresolved": 0,
        "tags_added": 0,
        "tags_removed": 0,
    }


def compare_snapshots(
    base: Snapshot,
    head: Snapshot,
    *,
    proposal_id: str,
    status: str,
    stale: bool,
    conflicted: bool,
    complete: bool,
    limit: int,
) -> dict[str, object]:
    summary = _empty_summary()
    changes: list[dict[str, str]] = []
    node_change: dict[str, str] = {}
    from_path: dict[str, str] = {}
    titles: dict[str, str] = {**base.unresolved_titles, **head.unresolved_titles}
    tags_by_path: dict[str, list[str]] = {}

    added_paths = set(head.nodes) - set(base.nodes)
    removed_paths = set(base.nodes) - set(head.nodes)
    used_added: set[str] = set()
    used_removed: set[str] = set()
    added_by_hash: dict[str, list[str]] = {}
    for path in sorted(added_paths):
        added_by_hash.setdefault(head.nodes[path].content_hash, []).append(path)
    for path in sorted(removed_paths):
        matches = [
            candidate
            for candidate in added_by_hash.get(base.nodes[path].content_hash, [])
            if candidate not in used_added
        ]
        if len(matches) != 1:
            continue
        target = matches[0]
        used_removed.add(path)
        used_added.add(target)
        node_change[path] = "removed"
        node_change[target] = "renamed"
        from_path[target] = path
        titles[path] = base.nodes[path].title
        titles[target] = head.nodes[target].title
        tags_by_path[path] = list(base.nodes[path].tags)
        tags_by_path[target] = list(head.nodes[target].tags)
        summary["nodes_renamed"] += 1
        changes.append({"kind": "renamed", "path": target, "detail": f"{path} → {target}"})

    for path in sorted(added_paths - used_added):
        node_change[path] = "added"
        titles[path] = head.nodes[path].title
        tags_by_path[path] = list(head.nodes[path].tags)
        summary["nodes_added"] += 1
        changes.append({"kind": "added", "path": path, "detail": head.nodes[path].title})
    for path in sorted(removed_paths - used_removed):
        node_change[path] = "removed"
        titles[path] = base.nodes[path].title
        tags_by_path[path] = list(base.nodes[path].tags)
        summary["nodes_removed"] += 1
        changes.append({"kind": "removed", "path": path, "detail": base.nodes[path].title})

    content_only_paths: set[str] = set()
    for path in sorted(set(base.nodes) & set(head.nodes)):
        before = base.nodes[path]
        after = head.nodes[path]
        tags_by_path[path] = list(after.tags)
        titles[path] = after.title
        added_tags = set(after.tags) - set(before.tags)
        removed_tags = set(before.tags) - set(after.tags)
        summary["tags_added"] += len(added_tags)
        summary["tags_removed"] += len(removed_tags)
        kinds: list[str] = []
        if before.title != after.title:
            kinds.append("title")
        if added_tags or removed_tags:
            kinds.append("tags")
        if before.aliases != after.aliases:
            kinds.append("properties")
        if before.content_hash != after.content_hash:
            kinds.append("content")
        if not kinds:
            continue
        node_change[path] = "modified"
        summary["nodes_modified"] += 1
        if set(kinds) <= {"content", "title"}:
            content_only_paths.add(path)
            summary["nodes_content_only"] += 1
        changes.append({"kind": "modified", "path": path, "detail": ", ".join(kinds)})
        if added_tags:
            changes.append(
                {"kind": "tags", "path": path, "detail": "добавлены: " + ", ".join(sorted(added_tags))}
            )
        if removed_tags:
            changes.append(
                {"kind": "tags", "path": path, "detail": "убраны: " + ", ".join(sorted(removed_tags))}
            )

    base_ids = {(_edge_id(edge), edge) for edge in base.edges}
    head_ids = {(_edge_id(edge), edge) for edge in head.edges}
    base_by_id = {key: edge for key, edge in base_ids}
    head_by_id = {key: edge for key, edge in head_ids}
    edge_change: dict[tuple[str, str, str, bool], str] = {}

    for key, edge in sorted(head_by_id.items(), key=lambda item: item[0]):
        if key in base_by_id:
            continue
        pair = _resolution_pair(edge)
        before = _matching_resolution(base.edges, pair)
        if before is not None and before.unresolved != edge.unresolved:
            if edge.unresolved:
                summary["resolved_unresolved"] += 1
                kind = "resolved_unresolved"
            else:
                summary["unresolved_resolved"] += 1
                kind = "unresolved_resolved"
            edge_change[_edge_tuple(edge)] = "unresolved_changed"
            changes.append(
                {
                    "kind": kind,
                    "path": edge.source,
                    "detail": f"{edge.source} → {edge.target}",
                }
            )
            continue
        typed = _matching_type(base.edges, edge)
        if typed is not None and typed.type != edge.type:
            summary["edges_type_changed"] += 1
            edge_change[_edge_tuple(edge)] = "type_changed"
            changes.append(
                {
                    "kind": "type_changed",
                    "path": edge.source,
                    "detail": f"{typed.type} → {edge.type}",
                }
            )
            continue
        summary["edges_added"] += 1
        edge_change[_edge_tuple(edge)] = "added"
        changes.append(
            {"kind": "edge_added", "path": edge.source, "detail": f"{edge.source} → {edge.target}"}
        )

    for key, edge in sorted(base_by_id.items(), key=lambda item: item[0]):
        if key in head_by_id:
            continue
        pair = _resolution_pair(edge)
        after = _matching_resolution(head.edges, pair)
        if after is not None:
            continue
        typed = _matching_type(head.edges, edge)
        if typed is not None:
            continue
        summary["edges_removed"] += 1
        edge_change[_edge_tuple(edge)] = "removed"
        changes.append(
            {"kind": "edge_removed", "path": edge.source, "detail": f"{edge.source} → {edge.target}"}
        )

    structural = (
        summary["nodes_added"]
        + summary["nodes_removed"]
        + summary["nodes_renamed"]
        + summary["edges_added"]
        + summary["edges_removed"]
        + summary["edges_type_changed"]
        + summary["unresolved_resolved"]
        + summary["resolved_unresolved"]
        + summary["tags_added"]
        + summary["tags_removed"]
        + (summary["nodes_modified"] - summary["nodes_content_only"])
    )
    empty = not any(summary.values())
    no_structural = not empty and structural == 0

    changed_paths = {path for path, change in node_change.items() if change != "unchanged"}
    for edge, change in edge_change.items():
        if change == "unchanged":
            continue
        changed_paths.add(edge[0])
        changed_paths.add(edge[1])

    adjacency: dict[str, set[str]] = {}
    for edge in set(base.edges) | set(head.edges):
        adjacency.setdefault(edge.source, set()).add(edge.target)
        adjacency.setdefault(edge.target, set()).add(edge.source)
    neighborhood = set(changed_paths)
    for path in list(changed_paths):
        neighborhood.update(adjacency.get(path, set()))

    preferred = sorted(changed_paths) + sorted(neighborhood - changed_paths)
    visible = preferred[:limit]
    truncated = len(preferred) > limit
    visible_set = set(visible)

    nodes: list[dict[str, object]] = []
    seen_nodes: set[str] = set()
    for path in visible:
        if path in seen_nodes:
            continue
        seen_nodes.add(path)
        if path.startswith("unresolved:"):
            nodes.append(
                {
                    "path": path,
                    "title": titles.get(path, path.split(":", 1)[-1]),
                    "tags": [],
                    "change": "unresolved",
                    "marker": _marker("unresolved"),
                    "unresolved": True,
                    "isolated": False,
                    "from_path": None,
                }
            )
            continue
        after = head.nodes.get(path)
        before = base.nodes.get(path)
        note = after or before
        change = node_change.get(path, "unchanged")
        nodes.append(
            {
                "path": path,
                "title": titles.get(path, note.title if note else path),
                "tags": tags_by_path.get(path, list(note.tags) if note else []),
                "change": change,
                "marker": _marker(change if change != "unchanged" else "unchanged"),
                "unresolved": False,
                "isolated": bool(note.isolated) if note else False,
                "from_path": from_path.get(path),
            }
        )

    edges_out: list[dict[str, object]] = []
    seen_edges: set[tuple[str, str, str, bool]] = set()
    for edge in sorted(set(base.edges) | set(head.edges), key=_edge_id):
        if edge.source not in visible_set or edge.target not in visible_set:
            continue
        key = _edge_tuple(edge)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        change = edge_change.get(key, "unchanged")
        if key not in head_by_id:
            if _matching_type(head.edges, edge) is not None:
                continue
            if _matching_resolution(head.edges, _resolution_pair(edge)) is not None:
                continue
            if change == "unchanged":
                change = "removed"
        edges_out.append(
            {
                "source": edge.source,
                "target": edge.target,
                "type": edge.type,
                "change": change,
                "unresolved": edge.unresolved,
            }
        )

    return {
        "proposal_id": proposal_id,
        "status": status,
        "complete": complete,
        "truncated": truncated,
        "stale": stale,
        "conflicted": conflicted,
        "empty": empty,
        "no_structural_change": no_structural,
        "summary": summary,
        "nodes": nodes,
        "edges": edges_out,
        "changes": changes,
    }


def _edge_id(edge: SnapshotEdge) -> tuple[str, str, str, bool]:
    return (edge.source, edge.target, edge.type, edge.unresolved)


def _edge_tuple(edge: SnapshotEdge) -> tuple[str, str, str, bool]:
    return _edge_id(edge)


def _resolution_pair(edge: SnapshotEdge) -> tuple[str, str]:
    return (edge.source, _link_key(edge.target))


def _matching_resolution(edges: frozenset[SnapshotEdge], pair: tuple[str, str]) -> SnapshotEdge | None:
    matches = [edge for edge in edges if _resolution_pair(edge) == pair]
    if len(matches) == 1:
        return matches[0]
    return None


def _matching_type(edges: frozenset[SnapshotEdge], edge: SnapshotEdge) -> SnapshotEdge | None:
    matches = [
        item
        for item in edges
        if item.source == edge.source
        and _link_key(item.target) == _link_key(edge.target)
        and item.unresolved == edge.unresolved
        and item.type != edge.type
    ]
    if len(matches) == 1:
        return matches[0]
    return None


def _incomplete(
    *,
    proposal_id: str,
    status: str,
    stale: bool,
    conflicted: bool,
    detail: str,
) -> dict[str, object]:
    return {
        "proposal_id": proposal_id,
        "status": status,
        "complete": False,
        "truncated": False,
        "stale": stale,
        "conflicted": conflicted,
        "empty": False,
        "no_structural_change": False,
        "summary": _empty_summary(),
        "nodes": [],
        "edges": [],
        "changes": [{"kind": "incomplete", "path": "", "detail": detail}],
    }


async def _tree(client: GitHubAppClient, owner: str, name: str, ref: str) -> dict[str, str]:
    paths = await client.list_markdown_files(owner, name, ref)
    if len(paths) > settings.index_max_notes:
        raise ProposalError(400, "too many notes to compare")
    files: dict[str, str] = {}
    for path in paths:
        files[path] = await client.get_file(owner, name, path, ref)
    return files


async def proposal_graph_diff(
    database: AsyncSession,
    user: User,
    proposal_id: uuid.UUID,
    client: GitHubAppClient,
    *,
    limit: int,
) -> dict[str, object]:
    row = await proposal_for_viewer(database, user, proposal_id)
    shared = await database.get(SharedRepository, SHARED_SINGLETON_ID)
    conflicted = row.status == ProposalStatus.CONFLICTED.value
    current = published_sha(shared) if shared is not None else None
    stale = row.status in _PENDING and current is not None and current != row.base_sha
    if shared is None:
        return _incomplete(
            proposal_id=str(row.id),
            status=row.status,
            stale=stale,
            conflicted=conflicted,
            detail="the shared rhizome is not connected",
        )
    try:
        base_files = await _tree(client, shared.owner, shared.name, row.base_sha)
        head_files = await _tree(client, shared.owner, shared.name, row.head_sha)
        base = build_snapshot(base_files)
        head = build_snapshot(head_files)
    except GitHubAppError as exc:
        mapped = _github(exc)
        return _incomplete(
            proposal_id=str(row.id),
            status=row.status,
            stale=stale,
            conflicted=conflicted,
            detail=mapped.detail,
        )
    except (ValueError, ProposalError) as exc:
        detail = exc.detail if isinstance(exc, ProposalError) else "proposal graph could not be derived"
        return _incomplete(
            proposal_id=str(row.id),
            status=row.status,
            stale=stale,
            conflicted=conflicted,
            detail=detail,
        )
    return compare_snapshots(
        base,
        head,
        proposal_id=str(row.id),
        status=row.status,
        stale=stale,
        conflicted=conflicted,
        complete=True,
        limit=limit,
    )
