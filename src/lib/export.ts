/** Exporta linhas para CSV (download local). Sem backend, sem dados fictícios. */
export function toCSV(rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const linhas = [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))];
  return "\uFEFF" + linhas.join("\n");
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
