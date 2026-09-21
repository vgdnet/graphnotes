export type AdminGrantKind = "path" | "tag" | "prefix";

export type AdminGrantSummary = {
  id?: string;
  kind: string;
  value: string;
};

export type AdminRightsUser = {
  role: string;
  is_author: boolean;
  is_active: boolean;
  editor_tags?: string[];
  grants?: AdminGrantSummary[];
};

export const GRANT_KIND_LABEL: Record<string, string> = {
  path: "карточка",
  tag: "тег",
  prefix: "папка",
};

export function grantKindLabel(kind: string): string {
  return GRANT_KIND_LABEL[kind] || kind;
}

export function formatGrant(grant: AdminGrantSummary): string {
  return `${grantKindLabel(grant.kind)} ${grant.value}`;
}

export function visibleGrants(user: AdminRightsUser): AdminGrantSummary[] {
  const grants = user.grants || [];
  if (grants.length) return grants;
  return (user.editor_tags || []).map((value) => ({ kind: "tag", value }));
}

export function formatAdminRights(user: AdminRightsUser): string {
  const parts = [
    `роль ${user.role}`,
    user.is_author ? "автор" : "не автор",
    user.is_active ? "активен" : "заблокирован",
  ];
  const grants = visibleGrants(user);
  if (grants.length) {
    parts.push(`гранты: ${grants.map(formatGrant).join("; ")}`);
  } else {
    parts.push("грантов нет");
  }
  return parts.join(" · ");
}
