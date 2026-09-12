from __future__ import annotations

import re
import uuid

_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def parse_card_ref(raw: str) -> tuple[str, uuid.UUID | None, uuid.UUID | None, str]:
    """Return (layer, owner_id, proposal_id, path) for a #/card/ address."""
    value = raw.strip()
    if value.startswith("proposal:"):
        rest = value[len("proposal:") :]
        proposal_id, sep, path = rest.partition(":")
        if sep and _UUID.match(proposal_id) and path:
            return "proposal", None, uuid.UUID(proposal_id), path
    if value.startswith("personal:"):
        rest = value[len("personal:") :]
        owner, sep, path = rest.partition(":")
        if sep and _UUID.match(owner) and path:
            return "personal", uuid.UUID(owner), None, path
        return "personal", None, None, rest
    return "shared", None, None, value


def personal_card_path(path: str, *, owner_id: uuid.UUID | None = None, viewer_id: uuid.UUID | None = None) -> str:
    if owner_id is not None and viewer_id is not None and owner_id != viewer_id:
        return f"personal:{owner_id}:{path}"
    return f"personal:{path}"


def proposal_card_path(proposal_id: uuid.UUID, path: str) -> str:
    return f"proposal:{proposal_id}:{path}"
