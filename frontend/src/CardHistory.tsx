import { useEffect, useState } from "react";
import { cardApiUrl } from "./cardRoute";
import { ActorLink } from "./PersonCard";

type RevisionActor = { id: string; username: string; display_name: string };

type CardRevision = {
  id: string;
  n: number;
  kind: string;
  created_at: string;
  content_hash: string;
  change: string;
  actor: RevisionActor | null;
};

function revisionKindLabel(kind: string): string {
  if (kind === "created") return "создана";
  return "изменена";
}

export function CardHistory({ cardPath }: { cardPath: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revisions, setRevisions] = useState<CardRevision[] | null>(null);

  useEffect(() => {
    setOpen(false);
    setLoading(false);
    setError("");
    setRevisions(null);
  }, [cardPath]);

  async function showHistory() {
    setOpen(true);
    if (revisions !== null || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${cardApiUrl(cardPath)}/revisions`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить историю правок");
      }
      const payload = (await response.json()) as { revisions: CardRevision[] };
      setRevisions(payload.revisions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card-history">
      <button className="button button--quiet" type="button" onClick={() => void showHistory()}>
        История правок
      </button>
      {open ? (
        <div>
          {loading ? <p className="admin-panel__hint">Загружаем историю…</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {revisions && revisions.length === 0 ? (
            <p className="admin-panel__hint">Сохранённых редакций пока нет.</p>
          ) : null}
          {revisions && revisions.length > 0 ? (
            <ol className="card-history__list">
              {revisions.map((item) => (
                <li key={item.id} className="card-history__item">
                  <p className="card-history__meta">
                    <ActorLink actor={item.actor} />
                    <small>
                      {`редакция ${item.n} · ${revisionKindLabel(item.kind)}`}
                      {item.created_at ? ` · ${new Date(item.created_at).toLocaleString("ru")}` : ""}
                    </small>
                  </p>
                  {item.change ? (
                    <pre className="card-history__diff">{item.change}</pre>
                  ) : (
                    <p className="admin-panel__hint">Текст не изменился.</p>
                  )}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
