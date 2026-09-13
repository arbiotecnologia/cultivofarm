import { STAGE_BY_STATUS, cockpitStage, isStageTerminal } from "./stage";

export function volumeLitros(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function formatVolume(value: unknown): string {
  const number = volumeLitros(value);
  return number === null ? "—" : `${number.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`;
}

export function somaVolumes(values: unknown[]): number | null {
  const numbers = values.map(volumeLitros);
  return numbers.some(n => n === null) ? null : numbers.reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

export function statusConhecido(status: unknown): boolean {
  return typeof status === "string" && (Object.prototype.hasOwnProperty.call(STAGE_BY_STATUS, status.toLowerCase()) || status === "aguardando");
}

export function podeOperar(item: { os_id?: string; id?: string; status_esteira_oficial?: string }): boolean {
  return !!item.os_id && !!item.id && statusConhecido(item.status_esteira_oficial) && !isStageTerminal(cockpitStage(item.status_esteira_oficial));
}

/** Repetições idênticas são removidas; conflitos não escolhem silenciosamente uma versão. */
export function deduplicarEsteira<T extends { os_id?: string; origem_os?: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    if (!row.os_id) throw new Error("Registro sem OS vinculada. Reconciliação necessária.");
    const key = `${row.origem_os}:${row.os_id}`;
    const previous = seen.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error("OS com registros divergentes na esteira. Reconciliação necessária.");
    seen.set(key, row);
  }
  return [...seen.values()];
}

export function filtrarCockpit<T extends { cliente_id?: string; fazenda_id?: string; produto_id?: string; microrganismo_id?: string; status_esteira_oficial: string }>(rows: T[], filters: { cliente: string; fazenda: string; produto: string; status: string }): T[] {
  return rows.filter(row => (filters.cliente === "all" || row.cliente_id === filters.cliente)
    && (filters.fazenda === "all" || row.fazenda_id === filters.fazenda)
    && (filters.produto === "all" || row.produto_id === filters.produto || row.microrganismo_id === filters.produto)
    && (filters.status === "all" || row.status_esteira_oficial === filters.status));
}

export function timestampBrasilia(value?: string | null): string {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
}

export function criarTrava() {
  let pending = false;
  return async (action: () => Promise<boolean>): Promise<boolean> => {
    if (pending) return false;
    pending = true;
    try { return await action(); } finally { pending = false; }
  };
}