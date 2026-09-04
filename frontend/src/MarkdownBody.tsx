import type { GraphNode } from "./GraphView";
import { cardHash } from "./cardRoute";
import { renderBlocks } from "./markdownRender";
import type { NoteLinks } from "./markdownRender";

export function MarkdownBody({
  body,
  note,
  nodes = [],
}: {
  body: string;
  note: NoteLinks;
  nodes?: GraphNode[];
}) {
  const html = renderBlocks(body, note, nodes, cardHash);
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export { cardHash };
