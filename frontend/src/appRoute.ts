import { normalizeCardPath, parseCardRoute } from "./cardRoute.js";
import { parseAuthHash, type AuthMailPurpose } from "./authMail.js";

export type ShellView =
  | "graph"
  | "my_graph"
  | "settings"
  | "differ"
  | "queue"
  | "offer"
  | "contribution"
  | "admin"
  | "card"
  | "search"
  | "about";

export type AppRoute =
  | { kind: "graph" }
  | { kind: "my_graph" }
  | { kind: "search" }
  | { kind: "start_card" }
  | { kind: "card"; path: string }
  | { kind: "user" }
  | { kind: "offer" }
  | { kind: "queue" }
  | { kind: "contribution" }
  | { kind: "differ" }
  | { kind: "admin" }
  | { kind: "about" }
  | { kind: "auth"; purpose?: AuthMailPurpose; token?: string };

const VIEW_HASH: Record<Exclude<AppRoute["kind"], "card" | "start_card" | "auth">, string> = {
  graph: "#/graph",
  my_graph: "#/my_graph",
  search: "#/search",
  user: "#/user",
  offer: "#/offer",
  queue: "#/queue",
  contribution: "#/contribution",
  differ: "#/differ",
  admin: "#/admin",
  about: "#/about",
};

export function viewHash(kind: keyof typeof VIEW_HASH): string {
  return VIEW_HASH[kind];
}

export function parseAppRoute(hash: string): AppRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const value = raw.startsWith("/") ? raw : `/${raw}`;
  if (value === "/" || value === "" || value === "/graph") return { kind: "graph" };
  if (value === "/my_graph") return { kind: "my_graph" };
  if (value === "/search") return { kind: "search" };
  if (value === "/user") return { kind: "user" };
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
    case "my_graph":
      return "my_graph";
    case "search":
      return "search";
    case "start_card":
    case "card":
      return "card";
    case "user":
      return "settings";
    case "offer":
      return "offer";
    case "queue":
      return "queue";
    case "contribution":
      return "contribution";
    case "differ":
      return "differ";
    case "admin":
      return "admin";
    case "about":
      return "about";
    default:
      return "graph";
  }
}
