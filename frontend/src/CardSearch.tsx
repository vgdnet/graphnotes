import { useEffect, useMemo, useState } from "react";
import { canonicalCardHash } from "./cardRoute";

type SearchLayer = "shared" | "personal" | "proposal";
type SearchHit = {
  path: string;
  title: string;
  tags: string[];
  layer?: SearchLayer | string;
  owner?: string | null;
};
type SearchResponse = {
  query: string;
  tag: string;
  layer?: string;
  hits: SearchHit[];
  available_tags: string[];
};
type Facet = "all" | SearchLayer;

function layerLabel(hit: SearchHit, ownPersonal: boolean): string {
  if (hit.layer === "proposal") return "правка";
  if (hit.layer === "personal") {
    if (hit.owner) return hit.owner;
    return ownPersonal ? "ваша" : "личная";
  }
  return "общая";
}

export function CardSearch({
  canReadNotes,
  role = "user",
  hasPersonal = false,
  onNeedAuth,
}: {
  canReadNotes: boolean;
  role?: "user" | "editor" | "admin";
  hasPersonal?: boolean;
  onNeedAuth?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [facet, setFacet] = useState<Facet>("all");
  const [body, setBody] = useState<SearchResponse>({
    query: "",
    tag: "",
    hits: [],
    available_tags: [],
  });
  const [loading, setLoading] = useState(false);
  const canReview = role === "editor" || role === "admin";

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (tag) params.set("tag", tag);
      if (canReadNotes) params.set("layer", "visible");
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
  }, [query, tag, canReadNotes]);

  const waiting = query.trim() || tag;
  const tags = body.available_tags;
  const hits = useMemo(() => {
    if (facet === "all") return body.hits;
    return body.hits.filter((hit) => (hit.layer || "shared") === facet);
  }, [body.hits, facet]);

  const hint = !canReadNotes
    ? "Гость ищет по опубликованной общей. Тело карточки — после входа."
    : role === "admin"
      ? "Ищем все карточки, которые можно открыть: общая, личные слои, правки в очереди. Слой подсвечен на каждой карточке."
      : canReview
        ? "Ищем вашу ризому, общую и правки, которые вам дали на ревью."
        : hasPersonal
          ? "Ищем вашу ризому и общую. Слой карточки подсвечен: общая или ваша."
          : "Ищем опубликованную общую ризому.";

  return (
    <section className="notes-panel notes-panel--search" aria-labelledby="card-search-heading">
      <div>
        <p className="eyebrow">Поиск</p>
        <h2 id="card-search-heading">Поиск по карточкам</h2>
        <p className="admin-panel__hint">{hint}</p>
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
      {canReadNotes && (hasPersonal || canReview) && (
        <div className="card-search__facets" role="tablist" aria-label="Слой">
          <button
            className={facet === "all" ? "tag-chip tag-chip--active" : "tag-chip"}
            type="button"
            role="tab"
            aria-selected={facet === "all"}
            onClick={() => setFacet("all")}
          >
            Все
          </button>
          <button
            className={facet === "shared" ? "tag-chip tag-chip--active layer-chip layer-chip--shared" : "tag-chip layer-chip layer-chip--shared"}
            type="button"
            role="tab"
            aria-selected={facet === "shared"}
            onClick={() => setFacet("shared")}
          >
            Общая
          </button>
          {hasPersonal && (
            <button
              className={facet === "personal" ? "tag-chip tag-chip--active layer-chip layer-chip--personal" : "tag-chip layer-chip layer-chip--personal"}
              type="button"
              role="tab"
              aria-selected={facet === "personal"}
              onClick={() => setFacet("personal")}
            >
              Ваша
            </button>
          )}
          {canReview && (
            <button
              className={facet === "proposal" ? "tag-chip tag-chip--active layer-chip layer-chip--proposal" : "tag-chip layer-chip layer-chip--proposal"}
              type="button"
              role="tab"
              aria-selected={facet === "proposal"}
              onClick={() => setFacet("proposal")}
            >
              Правки
            </button>
          )}
        </div>
      )}
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
        {loading ? "Ищем…" : waiting && hits.length === 0 ? "Совпадений нет." : waiting ? `Совпадений: ${hits.length}.` : "Наберите слово или выберите тег."}
      </p>
      {hits.length > 0 && (
        <ul className="card-search__hits">
          {hits.map((hit) => {
            const layer = hit.layer || "shared";
            const showLayer = hasPersonal || canReview || layer !== "shared";
            return (
            <li key={hit.path}>
              <a
                className={showLayer ? `card-search__hit card-search__hit--${layer}` : "card-search__hit"}
                href={canonicalCardHash(hit.path)}
                onClick={() => {
                  if (!canReadNotes) onNeedAuth?.();
                }}
              >
                {showLayer && (
                  <span className={`layer-chip layer-chip--${layer}`}>
                    {layerLabel(hit, hasPersonal)}
                  </span>
                )}
                <strong>{hit.title}</strong>
                <small>{hit.path}</small>
                {hit.tags.length > 0 && (
                  <span className="card-search__hit-tags">
                    {hit.tags.map((name) => name).join(" · ")}
                  </span>
                )}
              </a>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
