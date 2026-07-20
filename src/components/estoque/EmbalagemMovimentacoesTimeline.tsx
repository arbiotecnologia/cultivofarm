import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTimeDisplay as fmtDateTimeBR } from "@/lib/date-utils";

interface Mov {
  id: string;
  tipo_movimentacao: string;
  status_anterior: string | null;
  status_novo: string | null;
  observacao: string | null;
  created_at: string;
}

const tipoLabels: Record<string, string> = {
  entrada_estoque: "Entrada em estoque",
  etiqueta_vinculada: "Etiqueta vinculada",
  reserva_entrega: "Reserva para entrega",
  separacao_entrega: "Separação confirmada",
  entrega_confirmada: "Entrega física confirmada",
  cancelamento: "Cancelamento",
  descarte: "Descarte",
  bloqueio: "Bloqueio",
  desbloqueio: "Desbloqueio",
  ajuste_manual: "Ajuste manual",
  leitura_qr: "Leitura QR",
  divergencia_qr: "Divergência QR",
};

export function EmbalagemMovimentacoesTimeline({ embalagemId }: { embalagemId: string }) {
  const [movs, setMovs] = useState<Mov[]>([]);
  useEffect(() => {
    (supabase as any)
      .from("estoque_embalagem_movimentacoes")
      .select("*")
      .eq("embalagem_id", embalagemId)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => setMovs(data ?? []));
  }, [embalagemId]);
  if (!movs.length) return <p className="text-sm text-muted-foreground">Sem movimentações.</p>;
  return (
    <ol className="space-y-2">
      {movs.map((m) => (
        <li key={m.id} className="border-l-2 border-primary/30 pl-3 text-sm">
          <div className="font-medium">{tipoLabels[m.tipo_movimentacao] ?? m.tipo_movimentacao}</div>
          <div className="text-xs text-muted-foreground">{fmtDateTimeBR(m.created_at)}</div>
          {m.observacao && <div className="text-xs">{m.observacao}</div>}
        </li>
      ))}
    </ol>
  );
}
