import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { brl } from "@/lib/financial/format";
import { formatDateDisplay as fd } from "@/lib/date-utils";
import { useC2PilotEconomicApprove, useC2PilotEconomicState, type C2PilotKind } from "@/hooks/useC2PilotEconomicApproval";

const KIND_LABEL: Record<C2PilotKind, string> = { commercial: "Aprovação comercial", credit: "Aprovação de crédito" };
const newKey = () => `c2p-${crypto.randomUUID()}`;
const CONFLICT: Record<string, string> = {
  C2_PILOT_ECON_EVIDENCE_CHANGED: "Os dados da cotação mudaram. Recarregue antes de aprovar.",
  C2_PILOT_ECON_ALREADY_APPROVED: "Esta aprovação já foi registrada por outra pessoa.",
  C2_PILOT_ECON_DISABLED: "O piloto está desligado.",
  C2_PILOT_ECON_NOT_GRANTED: "Você não tem autorização vigente no piloto para este pedido.",
};

/** Painel do piloto: só aparece quando o servidor confirma estado; ações só com concessão vigente. */
export function C2PilotEconomicApproval({ orderId }: { orderId: string | null }) {
  const q = useC2PilotEconomicState(orderId);
  const approve = useC2PilotEconomicApprove();
  // Chave por (pedido, tipo, evidência): repetição explícita após resposta incerta reusa a mesma chave.
  const keys = useRef(new Map<string, string>());
  // Trava síncrona por montagem: duplo clique nunca despacha duas vezes.
  const inFlight = useRef(false);
  const [uncertain, setUncertain] = useState<C2PilotKind | null>(null);
  const read = q.data;
  if (!orderId || q.isError || !read || read.state !== "ready") return null;
  const p = read.pilot;
  if (!p.pilot_enabled && p.approvals.length === 0 && !p.forecast) return null;

  const act = (kind: C2PilotKind) => {
    if (!p.evidence || approve.isPending || inFlight.current) return;
    inFlight.current = true;
    const k = `${orderId}:${kind}:${p.evidence.evidence_hash}`;
    const key = keys.current.get(k) ?? newKey();
    keys.current.set(k, key);
    approve.mutate({ orderId, kind, idempotencyKey: key, evidenceHash: p.evidence.evidence_hash }, {
      onSettled: () => { inFlight.current = false; },
      onSuccess: (r) => { setUncertain(null); toast.success(r.forecast_id ? "Aprovação registrada. Previsão financeira estimada criada." : "Aprovação registrada."); },
      onError: (e: any) => {
        const msg = String(e?.message ?? "");
        const known = Object.keys(CONFLICT).find((c) => msg.includes(c));
        if (known) { keys.current.delete(k); setUncertain(null); toast.error(CONFLICT[known]); }
        else { setUncertain(kind); toast.error("Resposta não confirmada. Use 'Repetir' para conferir com a mesma solicitação."); }
      },
    });
  };
  const done = (kind: C2PilotKind) => p.approvals.find((a) => a.kind === kind);

  return (
    <div className="rounded-md border p-3 space-y-3 text-sm" data-testid="c2-pilot-economic">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Aprovação econômica (piloto)</span>
        <Badge variant="outline">{p.pilot_enabled ? "Piloto ativo" : "Piloto desligado"}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Registra apenas a aprovação econômica. O pedido continua em análise; nota fiscal, cobrança, reserva e entrega seguem bloqueadas.
      </p>
      {p.evidence && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="c2-pilot-evidence">
          <div><div className="text-xs text-muted-foreground">Total cotado</div>{brl(p.evidence.financed_total)}</div>
          <div><div className="text-xs text-muted-foreground">Meio</div>{p.evidence.method}</div>
          <div><div className="text-xs text-muted-foreground">Parcelas</div>{p.evidence.schedule.length}x (estimadas, a partir da NF)</div>
          <div><div className="text-xs text-muted-foreground">Itens</div>{p.evidence.items.reduce((s, i) => s + i.quantidade, 0)} embalagem(ns)</div>
        </div>
      )}
      {p.evidence_block_reason && <p className="text-destructive text-xs" data-testid="c2-pilot-block">Dados da cotação incompletos: aprovação indisponível.</p>}
      {(["commercial", "credit"] as C2PilotKind[]).map((kind) => {
        const a = done(kind);
        const can = kind === "commercial" ? p.can_approve_commercial : p.can_approve_credit;
        return (
          <div key={kind} className="flex items-center justify-between gap-2" data-testid={`c2-pilot-${kind}`}>
            <span>{KIND_LABEL[kind]}</span>
            {a ? <span className="text-xs">Aprovado em {fd(a.approved_at)} ({a.actor_role})</span>
              : can ? <Button size="sm" onClick={() => act(kind)} disabled={approve.isPending}>{uncertain === kind ? "Repetir" : "Aprovar"}</Button>
              : <span className="text-xs text-muted-foreground">Pendente</span>}
          </div>
        );
      })}
      {p.forecast && (
        <p className="text-xs" data-testid="c2-pilot-forecast">
          Previsão financeira estimada: {brl(p.forecast.total_amount)} — não é cobrança e não gera título.
        </p>
      )}
    </div>
  );
}
