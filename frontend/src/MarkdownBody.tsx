import type { GraphNode } from "./GraphView";

type NoteLinks = {
  links: string[];
  unresolved_links: string[];
  locked_links?: string[];
};

function cardHash(path: string): string {
  return `#/card/${encodeURIComponent(path)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkKey(target: string): string {
  let text = target.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (text.toLowerCase().endsWith(".md")) text = text.slice(0, -3);
  return text.toLowerCase();
}

function hasKey(items: string[], target: string): boolean {
  const key = linkKey(target);
  return items.some((item) => linkKey(item) === key);
}

function resolveWiki(
  raw: string,
  note: NoteLinks,
  nodes: GraphNode[],
): { kind: "ok"; path: string; label: string } | { kind: "locked" | "missing"; label: string } {
  const [targetPart, alias] = raw.split("|", 2);
  const target = (targetPart || "").split("#", 1)[0].trim();
  const label = (alias || target).trim() || raw;
  if (!target) return { kind: "missing", label };
  if (hasKey(note.locked_links || [], target)) return { kind: "locked", label };
  if (hasKey(note.unresolved_links, target)) return { kind: "missing", label };
  const key = linkKey(target);
  const found = nodes.find((node) => {
    const pathKey = linkKey(node.path);
    return pathKey === key || pathKey.endsWith(`/${key}`) || node.title.toLowerCase() === target.toLowerCase();
  });
  if (found) return { kind: "ok", path: found.path, label };
  if (hasKey(note.links, target)) {
    const path = target.toLowerCase().endsWith(".md") ? target : `${target}.md`;
    return { kind: "ok", path, label };
  }
  return { kind: "missing", label };
}

function renderInline(text: string, note: NoteLinks, nodes: GraphNode[]): string {
  const escaped = escapeHtml(text);
  const withCode = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  const withWiki = withCode.replace(/\[\[([^[\]]+)\]\]/g, (_match, raw: string) => {
    const resolved = resolveWiki(raw, note, nodes);
    if (resolved.kind === "ok") {
      return `<a class="wiki-link" href="${cardHash(resolved.path)}">${escapeHtml(resolved.label)}</a>`;
    }
    if (resolved.kind === "locked") {
      return `<span class="wiki-link wiki-link--locked">замок · ${escapeHtml(resolved.label)}</span>`;
    }
    return `<span class="wiki-link wiki-link--missing">нет заметки · ${escapeHtml(resolved.label)}</span>`;
  });
  const withMdLinks = withWiki.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" rel="noreferrer noopener" target="_blank">$1</a>',
  );
  return withMdLinks
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderBlocks(body: string, note: NoteLinks, nodes: GraphNode[]): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const fence: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        fence.push(lines[i]);
        i += 1;
      }
      html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
      i += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2], note, nodes)}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      html.push(`<blockquote>${renderInline(quote.join(" "), note, nodes)}</blockquote>`);
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i]);
        i += 1;
      }
      const parsed = rows
        .filter((row, index) => index !== 1)
        .map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
      const header = parsed[0] || [];
      const bodyRows = parsed.slice(1);
      html.push(
        "<table><thead><tr>"
        + header.map((cell) => `<th>${renderInline(cell, note, nodes)}</th>`).join("")
        + "</tr></thead><tbody>"
        + bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, note, nodes)}</td>`).join("")}</tr>`).join("")
        + "</tbody></table>",
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item, note, nodes)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item, note, nodes)}</li>`).join("")}</ol>`);
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !lines[i].startsWith("> ")) {
      para.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${renderInline(para.join(" "), note, nodes)}</p>`);
  }
  return html.join("");
}

export function MarkdownBody({
  body,
  note,
  nodes = [],
}: {
  body: string;
  note: NoteLinks;
  nodes?: GraphNode[];
}) {
  const html = renderBlocks(body, note, nodes);
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export { cardHash };
