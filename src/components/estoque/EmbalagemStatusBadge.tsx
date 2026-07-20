import { Badge } from "@/components/ui/badge";

const map: Record<string, { label: string; cls: string }> = {
  em_estoque: { label: "Em estoque", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  reservado: { label: "Reservado", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  separado: { label: "Separado", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  entregue: { label: "Entregue", cls: "bg-green-100 text-green-800 border-green-200" },
  cancelado: { label: "Cancelado", cls: "bg-zinc-200 text-zinc-700 border-zinc-300" },
  descartado: { label: "Descartado", cls: "bg-red-100 text-red-800 border-red-200" },
  vencido: { label: "Vencido", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  bloqueado_cq: { label: "Bloqueado CQ", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  bloqueado_operacional: { label: "Bloqueado op.", cls: "bg-rose-100 text-rose-800 border-rose-200" },
};

export function EmbalagemStatusBadge({ status, vencida }: { status: string; vencida?: boolean }) {
  const m = map[status] ?? { label: status, cls: "" };
  return (
    <div className="flex gap-1 flex-wrap">
      <Badge variant="outline" className={m.cls}>{m.label}</Badge>
      {vencida && status !== "vencido" && (
        <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300">Validade expirada</Badge>
      )}
    </div>
  );
}
