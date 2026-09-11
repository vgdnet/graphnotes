import { personCardHash } from "./appRoute";

export type PersonAchievements = {
  accepted_notes: number;
  accepted_links: number;
  proposals: number;
  created: number;
  edits: number;
};

export type PersonStore = {
  personal_notes: number;
  personal_links: number;
  proposed_notes: number;
  proposed_links: number;
  proposed_edit_bytes: number;
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
  store?: PersonStore;
  notes: { path: string; title: string; state: string }[];
  invited_at?: string | null;
  inviter?: { id: string; username: string } | null;
};

export function formatStoreBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} МБ`;
}

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

export function InviteAttribution({
  invitedAt,
  inviterId,
  inviterUsername,
}: {
  invitedAt?: string | null;
  inviterId?: string | null;
  inviterUsername?: string | null;
}) {
  if (!inviterUsername || !invitedAt) return null;
  const handle = inviterUsername.replace(/^@/, "");
  return (
    <p className="person-invite">
      Приглашен {formatInvitedAt(invitedAt)} по приглашению от{" "}
      <a className="person-link" href={personCardHash(handle)}>
        @{handle}
      </a>
    </p>
  );
}

export function ActorLink({
  actor,
}: {
  actor: { id?: string; username?: string; display_name: string } | null | undefined;
}) {
  if (!actor) return <strong>автор</strong>;
  const login = actor.username?.replace(/^@/, "").trim();
  if (!login) return <strong>{actor.display_name}</strong>;
  return (
    <a className="person-link" href={personCardHash(login)}>
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
          Карточка человека: гость и вошедший видят одни и те же счётчики. Тела чужих
          личных файлов не открываются.
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
            <InviteAttribution
              invitedAt={card.invited_at}
              inviterId={card.inviter?.id}
              inviterUsername={card.inviter?.username}
            />
            {(card.user.website || card.user.telegram || card.user.phone) ? (
              <p className="person-description">
                {[card.user.website, card.user.telegram, card.user.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="stat-grid" aria-label="Карточка пользователя">
            <div className="stat-card">
              <strong>{card.store?.personal_notes ?? 0}</strong>
              <span>Карточек в личном складе</span>
            </div>
            <div className="stat-card">
              <strong>{card.store?.personal_links ?? 0}</strong>
              <span>Связей в личном складе</span>
            </div>
            <div className="stat-card">
              <strong>{card.store?.proposed_notes ?? 0}</strong>
              <span>Карточек предложено в ризому</span>
            </div>
            <div className="stat-card">
              <strong>{card.store?.proposed_links ?? 0}</strong>
              <span>Связей предложено в ризому</span>
            </div>
            <div className="stat-card">
              <strong>{formatStoreBytes(card.store?.proposed_edit_bytes ?? 0)}</strong>
              <span>Объём предложенных правок</span>
            </div>
            <div className="stat-card">
              <strong>{card.achievements.accepted_notes}</strong>
              <span>Принято в общую</span>
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
