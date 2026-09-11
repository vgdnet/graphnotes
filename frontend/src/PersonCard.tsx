import { personCardHash } from "./appRoute";

export type PersonAchievements = {
  accepted_notes: number;
  accepted_links: number;
  proposals: number;
  created: number;
  edits: number;
};

export type PersonCardData = {
  user: {
    id: string;
    username: string;
    display_name: string;
    role: string;
    is_author: boolean;
    website?: string | null;
    phone?: string | null;
    telegram?: string | null;
  };
  self: boolean;
  achievements: PersonAchievements;
  notes: { path: string; title: string; state: string }[];
  invited_at?: string | null;
  inviter?: { id: string; username: string } | null;
};

const INVITE_MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

export function formatInvitedAt(iso: string): string {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return iso.slice(0, 10);
  return `${stamp.getUTCDate()} ${INVITE_MONTHS[stamp.getUTCMonth()]} ${stamp.getUTCFullYear()}`;
}

export function ActorLink({
  actor,
}: {
  actor: { id: string; display_name: string } | null | undefined;
}) {
  if (!actor) return <strong>автор</strong>;
  return (
    <a className="person-link" href={personCardHash(actor.id)}>
      {actor.display_name}
    </a>
  );
}

export function PersonCardPage({
  card,
  loading,
  error,
  onOpenNote,
}: {
  card: PersonCardData | null;
  loading: boolean;
  error: string;
  onOpenNote: (path: string) => void;
}) {
  const name = card?.user.display_name || "Карточка человека";
  return (
    <section className="notes-panel" aria-labelledby="person-heading">
      <div>
        <p className="eyebrow">Человек</p>
        <h2 id="person-heading">{name}</h2>
        <p className="admin-panel__hint">
          Публичный след вклада в ризому: счётчики и принятые карточки. Не GitHub-профиль
          и не чужой личный git.
        </p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && !card ? (
        <p className="admin-panel__hint" role="status">Загружаем карточку человека…</p>
      ) : null}
      {card && (
        <div className="profile-card">
          <div className="avatar" aria-hidden="true">
            {card.user.display_name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{card.user.display_name}</strong>
            <span>
              @{card.user.username} · {card.user.role}
              {card.user.is_author ? " · автор" : ""}
            </span>
            {card.inviter && card.invited_at ? (
              <p className="admin-panel__hint">
                Приглашен {formatInvitedAt(card.invited_at)} по приглашению от{" "}
                <a className="person-link" href={personCardHash(card.inviter.id)}>
                  @{card.inviter.username}
                </a>
              </p>
            ) : null}
          </div>
          {card.user.website ? (
            <p className="admin-panel__hint">{card.user.website}</p>
          ) : null}
          <div className="stat-grid" aria-label="Достижения">
            <div className="stat-card">
              <strong>{card.achievements.accepted_notes}</strong>
              <span>Принято карточек</span>
            </div>
            <div className="stat-card">
              <strong>{card.achievements.accepted_links}</strong>
              <span>Связей в общей</span>
            </div>
            <div className="stat-card">
              <strong>{card.achievements.proposals}</strong>
              <span>Предложений</span>
            </div>
            <div className="stat-card">
              <strong>{card.achievements.created}</strong>
              <span>Создано в ризоме</span>
            </div>
            <div className="stat-card">
              <strong>{card.achievements.edits}</strong>
              <span>Правок в ризоме</span>
            </div>
          </div>
          {card.notes.length > 0 ? (
            <ul className="note-list">
              {card.notes.map((item) => (
                <li key={item.path}>
                  <button className="note-link" type="button" onClick={() => onOpenNote(item.path)}>
                    <strong>{item.title}</strong>
                    <small>{item.path}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-panel__hint">Пока нет принятых в общую карточек.</p>
          )}
        </div>
      )}
    </section>
  );
}
