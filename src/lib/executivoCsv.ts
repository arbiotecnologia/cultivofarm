// Utilitário CSV seguro para o Portal Executivo.
// Protege contra CSV injection prefixando células iniciadas por = + - @ \t \r com apóstrofo,
// escapa aspas, e adiciona BOM UTF-8.

function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  // Protege contra CSV injection
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  // Escapa aspas
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

export function arrayToCsv(headers: Record<string, string>, rows: any[]): string {
  const keys = Object.keys(headers);
  const head = keys.map((k) => sanitizeCell(headers[k])).join(",");
  const body = rows
    .map((row) => keys.map((k) => sanitizeCell(row?.[k])).join(","))
    .join("\n");
  return head + "\n" + body;
}

export function downloadCsv(filename: string, csv: string) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildCsvFilename(prefix: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
}
