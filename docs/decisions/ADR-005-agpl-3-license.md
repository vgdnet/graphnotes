# ADR-005 - GNU Affero General Public License v3.0

Status: Accepted

## Context
GraphNotes is open-source software and needs one canonical project license that
also addresses distribution and use of modified versions over a network.

## Decision
GraphNotes is licensed under the GNU Affero General Public License version 3.0
(`AGPL-3.0`). The standard license text is stored in the repository root as
`LICENSE` and is the canonical project license.

Unless a file explicitly states otherwise, GraphNotes source code is distributed
under AGPL-3.0. New project-owned source files and contributions must remain
compatible with this license.

## Consequences
- users may inspect, use, modify and redistribute GraphNotes under AGPL-3.0
- operators who modify GraphNotes and provide it over a network must satisfy the
  corresponding source-availability obligations of AGPL-3.0
- dependency licenses must be reviewed for compatibility with AGPL-3.0
- changing the canonical project license requires a new accepted decision and
  any contributor permissions required by applicable law
