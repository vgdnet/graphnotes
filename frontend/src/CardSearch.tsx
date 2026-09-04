import { useEffect, useState } from "react";
import { cardHash } from "./cardRoute";

type SearchHit = { path: string; title: string; tags: string[] };
type SearchResponse = {
  query: string;
  tag: string;
  hits: SearchHit[];
  available_tags: string[];
};

export function CardSearch({
  canReadNotes,
  onNeedAuth,
}: {
  canReadNotes: boolean;
  onNeedAuth?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [body, setBody] = useState<SearchResponse>({
    query: "",
    tag: "",
    hits: [],
    available_tags: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (tag) params.set("tag", tag);
      const suffix = params.toString() ? `?${params}` : "";
      setLoading(true);
      void fetch(`/api/search${suffix}`, { signal: controller.signal })
        .then(async (response) => (
          response.ok
            ? (await response.json()) as SearchResponse
            : { query: query.trim(), tag, hits: [], available_tags: [] }
        ))
        .then(setBody)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tag]);

  const waiting = query.trim() || tag;
  const tags = body.available_tags;

  return (
    <section className="notes-panel notes-panel--search" aria-labelledby="card-search-heading">
      <div>
        <p className="eyebrow">Карточки</p>
        <h2 id="card-search-heading">Поиск по ризоме</h2>
        <p className="admin-panel__hint">
          Слова в названии и пути, теги карточек. Ищем только то, что этому зрителю уже можно показать.
          {canReadNotes ? " Совпадение открывает карточку с отрисованным Markdown." : " Гость видит совпадения; тело карточки — после входа."}
        </p>
      </div>
      <label className="card-search__field">
        Найти
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="слово, путь или часть названия"
          autoFocus
        />
      </label>
      {tags.length > 0 && (
        <div className="card-search__tags" role="group" aria-label="Теги">
          {tags.map((name) => (
            <button
              key={name}
              className={tag === name ? "tag-chip tag-chip--active" : "tag-chip"}
              type="button"
              onClick={() => setTag((current) => (current === name ? "" : name))}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <p className="admin-panel__hint" role="status">
        {loading ? "Ищем…" : waiting && body.hits.length === 0 ? "Совпадений нет." : waiting ? `Совпадений: ${body.hits.length}.` : "Наберите слово или выберите тег."}
      </p>
      {body.hits.length > 0 && (
        <ul className="card-search__hits">
          {body.hits.map((hit) => (
            <li key={hit.path}>
              <a
                className="card-search__hit"
                href={cardHash(hit.path)}
                onClick={() => {
                  if (!canReadNotes) onNeedAuth?.();
                }}
              >
                <strong>{hit.title}</strong>
                <small>{hit.path}</small>
                {hit.tags.length > 0 && (
                  <span className="card-search__hit-tags">
                    {hit.tags.map((name) => name).join(" · ")}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
