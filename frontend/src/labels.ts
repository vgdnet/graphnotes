export const RHIZOME_TITLE = "Ризома психоанализа";

export const RHIZOME_LEAD =
  "Совместная база знаний по психоанализу: школы, авторы, понятия, тексты, клинические идеи, библиография, маршруты чтения и связи между ними.";

export function roleLabel(role: string): string {
  if (role === "admin") return "администратор";
  if (role === "editor") return "редактор";
  if (role === "user") return "участник";
  return role;
}

export function ruCount(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} ${many}`;
  if (last === 1) return `${n} ${one}`;
  if (last >= 2 && last <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function ruNotes(n: number): string {
  return ruCount(n, "заметка", "заметки", "заметок");
}

export function graphIndexStatusLabel(status: string | undefined): string {
  if (status === "empty") return "индекс пуст";
  if (status === "current") return "актуален";
  if (status === "updating") return "обновляется";
  if (status === "error") return "часть узлов ещё не обновилась, откройте позже";
  return status || "не загружен";
}

export function contributionIsEmpty(payload: {
  notes: unknown[];
  stats?: { accepted?: number; notes?: number };
} | null | undefined): boolean {
  if (!payload) return true;
  if (payload.notes.length > 0) return false;
  if ((payload.stats?.accepted ?? 0) > 0) return false;
  if ((payload.stats?.notes ?? 0) > 0) return false;
  return true;
}
