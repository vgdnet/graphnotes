import { useEffect, useRef, useState } from "react";
import type { GraphNode } from "./GraphView";
import { cardHash, wikiCardHash } from "./cardRoute";
import { renderBlocks } from "./markdownRender";
import type { NoteLinks } from "./markdownRender";

type MissingHint = { path: string; x: number; y: number };

function missingHintFromEvent(event: { target: EventTarget | null }, host: HTMLElement | null): MissingHint | null {
  if (!(event.target instanceof Element) || !host) return null;
  const link = event.target.closest("a.wiki-link--missing");
  if (!link || !host.contains(link)) return null;
  const path = link.getAttribute("data-missing-path") || "";
  if (!path) return null;
  const box = link.getBoundingClientRect();
  return { path, x: box.left + box.width / 2, y: box.top };
}

export function MarkdownBody({
  body,
  note,
  nodes = [],
  cardPath,
  signedIn = false,
  onCreateMissing,
}: {
  body: string;
  note: NoteLinks;
  nodes?: GraphNode[];
  cardPath?: string;
  signedIn?: boolean;
  onCreateMissing?: (path: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number>(0);
  const [hint, setHint] = useState<MissingHint | null>(null);
  const html = renderBlocks(body, note, nodes, (path) => wikiCardHash(cardPath, path));

  function showHint(next: MissingHint | null) {
    window.clearTimeout(hideTimer.current);
    setHint(next);
  }

  function scheduleHide() {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHint(null), 180);
  }

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  return (
    <div className="markdown-body-wrap">
      <div
        ref={hostRef}
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
        onMouseOver={(event) => {
          const next = missingHintFromEvent(event, hostRef.current);
          if (next) showHint(next);
        }}
        onMouseOut={(event) => {
          const related = event.relatedTarget;
          if (related instanceof Element && related.closest(".wiki-missing-hint")) return;
          if (missingHintFromEvent(event, hostRef.current)) scheduleHide();
        }}
      />
      {hint ? (
        <div
          className="wiki-missing-hint"
          role="tooltip"
          style={{ left: hint.x, top: hint.y }}
          onMouseEnter={() => showHint(hint)}
          onMouseLeave={scheduleHide}
        >
          {signedIn && onCreateMissing ? (
            <button
              className="wiki-missing-hint__action"
              type="button"
              onClick={() => {
                onCreateMissing(hint.path);
                setHint(null);
              }}
            >
              Создать карточку
            </button>
          ) : (
            <span>Карточки пока нет</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export { cardHash };
