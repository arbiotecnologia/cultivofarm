export const brl = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

import { formatDateDisplay } from "@/lib/date-utils";

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const out = formatDateDisplay(d);
  return out || "—";
};

export type FinStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELED" | "OVERDUE";

export const STATUS_LABEL: Record<FinStatus, string> = {
  OPEN: "Em aberto",
  PARTIAL: "Parcial",
  PAID: "Pago",
  CANCELED: "Cancelado",
  OVERDUE: "Vencido",
};

export const STATUS_VARIANT: Record<FinStatus, "default" | "secondary" | "destructive" | "outline"> = {
  OPEN: "secondary",
  PARTIAL: "outline",
  PAID: "default",
  CANCELED: "outline",
  OVERDUE: "destructive",
};

export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return dt.toISOString().slice(0, 10);
}

export function generateInstallments(total: number, count: number, firstDue: string) {
  const base = Math.round((total / count) * 100) / 100;
  let acc = 0;
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const amount = i < count ? base : Math.round((total - acc) * 100) / 100;
    acc += amount;
    rows.push({
      installment_number: i,
      due_date: addMonths(firstDue, i - 1),
      amount,
    });
  }
  return rows;
}
