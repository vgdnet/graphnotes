import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { GraphNode } from "./GraphView";
import { MarkdownBody } from "./MarkdownBody";
import type { NoteLinks } from "./markdownRender";
import type { ThemeName } from "./theme";

const PersonalMdxPane = lazy(() => import("./PersonalMdxPane").then((mod) => ({ default: mod.PersonalMdxPane })));

export type EditableNote = NoteLinks & {
  path: string;
  title: string;
  tags: string[];
  aliases: string[];
  warnings: string[];
  locked?: boolean;
  closed?: boolean;
  body: string;
  source?: string | null;
  content_hash: string;
};

function personalNoteUrl(cardPath: string): string {
  const filePath = cardPath.slice("personal:".length).replace(/^[0-9a-f-]{36}:/i, "");
  return `/api/personal/notes/${encodeURI(filePath)}`;
}

export function PersonalCardEditor({
  note,
  cardPath,
  nodes,
  theme,
  canEdit,
  submitting,
  onSaved,
  onError,
  setSubmitting,
}: {
  note: EditableNote;
  cardPath: string;
  nodes: GraphNode[];
  theme: ThemeName;
  canEdit: boolean;
  submitting: boolean;
  onSaved: (note: EditableNote) => void;
  onError: (message: string) => void;
  setSubmitting: (value: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.source ?? note.body);
  const editorRef = useRef<{ getMarkdown: () => string } | null>(null);

  useEffect(() => {
    setDraft(note.source ?? note.body);
    setEditing(false);
  }, [note.content_hash, note.path, note.source, note.body]);

  async function save() {
    const source = editorRef.current?.getMarkdown() ?? draft;
    setSubmitting(true);
    onError("");
    try {
      const response = await fetch(personalNoteUrl(cardPath), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, expected_hash: note.content_hash }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Не удалось сохранить");
      }
      onSaved((await response.json()) as EditableNote);
      setEditing(false);
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card-editor">
      {canEdit ? (
        <div className="graph-actions">
          {editing ? (
            <>
              <button className="button" type="button" onClick={() => void save()} disabled={submitting}>
                Сохранить
              </button>
              <button
                className="button button--quiet"
                type="button"
                onClick={() => {
                  setDraft(note.source ?? note.body);
                  setEditing(false);
                }}
                disabled={submitting}
              >
                Отмена
              </button>
            </>
          ) : (
            <button className="button button--quiet" type="button" onClick={() => setEditing(true)}>
              Отредактировать карточку
            </button>
          )}
        </div>
      ) : null}
      {editing ? (
        <Suspense fallback={<p className="admin-panel__hint">Загружаем редактор…</p>}>
          <PersonalMdxPane
            markdown={draft}
            theme={theme}
            editorRef={editorRef}
            onChange={setDraft}
            onParseError={onError}
          />
        </Suspense>
      ) : (
        <MarkdownBody body={note.body} note={note} nodes={nodes} cardPath={cardPath} />
      )}
    </div>
  );
}
