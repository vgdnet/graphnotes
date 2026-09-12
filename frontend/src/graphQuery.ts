export type GraphScope = "full" | "local";

export const GRAPH_PAGE_LIMIT = 50;
export const LOCAL_GRAPH_DEPTHS = [1, 2, 3, 4] as const;

const FOREIGN_PERSONAL = /^personal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/i;

function isOwnPersonalCard(path: string): boolean {
  return path.startsWith("personal:") && !FOREIGN_PERSONAL.test(path);
}

export function graphRequestParams(options: {
  scope: GraphScope;
  center: string | null;
  depth: number;
  personalLayer?: boolean;
  limit?: number;
}): Record<string, string> {
  const params: Record<string, string> = {
    limit: String(options.limit ?? GRAPH_PAGE_LIMIT),
  };
  if (options.scope === "local" && options.center) {
    params.center = graphCenterForRequest(options.center, Boolean(options.personalLayer));
    params.depth = String(options.depth);
  }
  return params;
}

export function graphCenterForRequest(center: string, personalLayer: boolean): string {
  if (personalLayer && isOwnPersonalCard(center)) {
    return center.slice("personal:".length);
  }
  return center;
}

export function graphNodePath(cardPath: string | null | undefined, personalLayer: boolean): string | null {
  if (!cardPath) return null;
  if (personalLayer && isOwnPersonalCard(cardPath)) {
    return cardPath.slice("personal:".length);
  }
  return cardPath;
}
