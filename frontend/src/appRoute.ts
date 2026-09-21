import { normalizeCardPath, parseCardRoute } from "./cardRoute.js";
import { parseAuthHash, type AuthMailPurpose } from "./authMail.js";

export type ShellView =
  | "graph"
  | "invites"
  | "settings"
  | "queue"
  | "offer"
  | "differ"
  | "contribution"
  | "person"
  | "admin"
  | "card"
  | "search"
  | "about";

export type AppRoute =
  | { kind: "graph" }
  | { kind: "invites" }
  | { kind: "search" }
  | { kind: "start_card" }
  | { kind: "card"; path: string }
  | { kind: "user" }
  | { kind: "person"; login: string }
  | { kind: "person_unknown" }
  | { kind: "offer" }
  | { kind: "differ" }
  | { kind: "queue" }
  | { kind: "contribution" }
  | { kind: "admin" }
  | { kind: "about" }
  | { kind: "auth"; purpose?: AuthMailPurpose; token?: string };

const VIEW_HASH: Record<Exclude<AppRoute["kind"], "card" | "start_card" | "auth" | "person" | "person_unknown">, string> = {
  graph: "#/graph",
  invites: "#/invites",
  search: "#/search",
  user: "#/user",
  offer: "#/offer",
  differ: "#/differ",
  queue: "#/queue",
  contribution: "#/contribution",
  admin: "#/admin",
  about: "#/about",
};

export function viewHash(kind: keyof typeof VIEW_HASH): string {
  return VIEW_HASH[kind];
}

const PERSON_UUID = /^\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERSON_LOGIN = /^\/users\/([a-z0-9][a-z0-9_.-]{2,31})$/i;
const LOGIN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function personCardHash(login: string): string {
  const value = login.replace(/^@/, "").trim().toLowerCase();
  if (!value || LOGIN_UUID.test(value)) return "#/graph";
  return `#/users/${value}`;
}

export function hashFromPathname(pathname: string): string | null {
  const trimmed = (pathname.startsWith("/") ? pathname : `/${pathname}`).replace(/\/+$/, "") || "/";
  if (PERSON_UUID.test(trimmed) || PERSON_LOGIN.test(trimmed)) return `#${trimmed}`;
  return null;
}

export function parseAppRoute(hash: string): AppRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const value = raw.startsWith("/") ? raw : `/${raw}`;
  if (value === "/" || value === "" || value === "/graph") return { kind: "graph" };
  if (value === "/my_graph") return { kind: "graph" };
  if (value === "/invites") return { kind: "invites" };
  if (value === "/search") return { kind: "search" };
  if (value === "/user") return { kind: "user" };
  if (PERSON_UUID.test(value)) return { kind: "person_unknown" };
  const personLogin = PERSON_LOGIN.exec(value);
  if (personLogin) return { kind: "person", login: personLogin[1] };
  if (value === "/offer") return { kind: "offer" };
  if (value === "/queue") return { kind: "queue" };
  if (value === "/contribution") return { kind: "contribution" };
  if (value === "/differ") return { kind: "differ" };
  if (value === "/admin") return { kind: "admin" };
  if (value === "/about") return { kind: "about" };
  if (value === "/auth" || value.startsWith("/auth")) {
    const parsed = parseAuthHash(hash);
    if (parsed) return { kind: "auth", purpose: parsed.purpose, token: parsed.token };
    return { kind: "auth" };
  }
  if (value === "/card") return { kind: "start_card" };
  if (value === "/card/") return { kind: "search" };
  const card = parseCardRoute(hash);
  if (card.kind === "card") return { kind: "card", path: normalizeCardPath(card.path) };
  if (card.kind === "search") return { kind: "search" };
  return { kind: "graph" };
}

export function routeToView(route: AppRoute): ShellView {
  switch (route.kind) {
    case "invites":
      return "invites";
    case "search":
      return "search";
    case "start_card":
    case "card":
      return "card";
    case "user":
      return "settings";
    case "offer":
      return "offer";
    case "differ":
      return "differ";
    case "queue":
      return "queue";
    case "contribution":
      return "contribution";
    case "person":
    case "person_unknown":
      return "person";
    case "admin":
      return "admin";
    case "about":
      return "about";
    default:
      return "graph";
  }
}
