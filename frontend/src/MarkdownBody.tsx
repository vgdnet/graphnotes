import type { GraphNode } from "./GraphView";
import { cardHash, wikiCardHash } from "./cardRoute";
import { renderBlocks } from "./markdownRender";
import type { NoteLinks } from "./markdownRender";

export function MarkdownBody({
  body,
  note,
  nodes = [],
  cardPath,
}: {
  body: string;
  note: NoteLinks;
  nodes?: GraphNode[];
  cardPath?: string;
}) {
  const html = renderBlocks(body, note, nodes, (path) => wikiCardHash(cardPath, path));
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export { cardHash };
