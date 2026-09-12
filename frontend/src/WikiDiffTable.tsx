export type WikiDiffRow = {
  op: "equal" | "delete" | "insert" | "replace" | string;
  left: string;
  right: string;
};

export function WikiDiffTable({
  html,
  rows,
  added,
}: {
  html?: string;
  rows?: WikiDiffRow[];
  added?: boolean;
}) {
  const caption = added
    ? "Новая карточка — слева в ризоме пусто, справа предложение (wikidiff2)"
    : "Правка: слева ризома, справа предложение (wikidiff2)";

  if (html) {
    return (
      <table className={added ? "wiki-diff diff wiki-diff--added" : "wiki-diff diff"}>
        <caption className="wiki-diff__caption">{caption}</caption>
        <thead>
          <tr>
            <th colSpan={2}>В ризоме</th>
            <th colSpan={2}>В предложении</th>
          </tr>
        </thead>
        <tbody dangerouslySetInnerHTML={{ __html: html }} />
      </table>
    );
  }

  const visible = rows ?? [];
  if (added) {
    return (
      <table className="wiki-diff wiki-diff--added">
        <caption className="wiki-diff__caption">{caption}</caption>
        <thead>
          <tr>
            <th>Предложение</th>
          </tr>
        </thead>
        <tbody>
          {visible.filter((row) => row.right).map((row, index) => (
            <tr key={`${row.op}-${index}`} className="wiki-diff__row wiki-diff__row--insert">
              <td className="wiki-diff__cell wiki-diff__cell--insert">
                <ins>{row.right || "\u00a0"}</ins>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table className="wiki-diff">
      <caption className="wiki-diff__caption">{caption}</caption>
      <thead>
        <tr>
          <th>В ризоме</th>
          <th>В предложении</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((row, index) => (
          <tr key={`${row.op}-${index}`} className={`wiki-diff__row wiki-diff__row--${row.op}`}>
            <td className={`wiki-diff__cell wiki-diff__cell--left wiki-diff__cell--${row.op}`}>
              {row.op === "delete" || row.op === "replace" ? <del>{row.left || "\u00a0"}</del> : (row.left || "\u00a0")}
            </td>
            <td className={`wiki-diff__cell wiki-diff__cell--right wiki-diff__cell--${row.op}`}>
              {row.op === "insert" || row.op === "replace" ? <ins>{row.right || "\u00a0"}</ins> : (row.right || "\u00a0")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
