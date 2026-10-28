import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";

export type DeliveryFinanceState = "rejeitado" | "resposta_incerta" | "recebivel_confirmado" | "fiscal_pendente";
export const isFinanceUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const blocked = "Cobrança indisponível até revisão do contrato financeiro. Seu rascunho foi preservado.";
type DeliveryIdentity = { id: string; organization_id: string; cliente_id: string; receivable_id: string | null };
type Receipt = { id: string; organization_id: string; origin_type: string; origin_id: string; customer_id: string;
  total_amount: number | string; status: string; fiscal_invoice_required: boolean; fiscal_invoice_status: string };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Read-only recovery of installed records. No candidate RPC, price fallback or write authority. */
export function useDeliveryFinanceReconciliation(deliveryId: unknown, open: boolean) {
  const { profile } = useAuth();
  const access = useStorageAccessScope(`delivery-finance:${deliveryId}:${open}`);
  const qc = useQueryClient();
  const lock = useRef<object | null>(null);
  const [action, setAction] = useState<{ scope: string; state: DeliveryFinanceState; message: string } | null>(null);
  const [pendingScope, setPendingScope] = useState<string | null>(null);
  const org = profile?.organization_id;
  const eligible = open && access.ready && isFinanceUuid(deliveryId) && isFinanceUuid(org);
  const key = ["delivery-finance-reconciliation", deliveryId, access.scope, access.scope];
  const query = useScopedPortalQuery({
    queryKey: ["delivery-finance-reconciliation", deliveryId], enabled: eligible, retry: false, staleTime: 0, refetchOnMount: "always",
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const current = access.capture();
      if (!current() || !eligible) throw new Error("Consulta indisponível neste contexto.");
      // Canonical SDK types lag captured organization_id columns; decode at this boundary, no second client.
      const { data: rawDelivery, error } = await (supabase as any).from("entregas")
        .select("id, organization_id, cliente_id, receivable_id").eq("id", deliveryId as string).eq("organization_id", org as string).maybeSingle();
      if (!current()) throw new Error("Contexto alterado.");
      if (error) throw error;
      if (!record(rawDelivery) || rawDelivery.id !== deliveryId || rawDelivery.organization_id !== org ||
        !isFinanceUuid(rawDelivery.cliente_id) || (rawDelivery.receivable_id !== null && !isFinanceUuid(rawDelivery.receivable_id))) {
        throw new Error("Entrega não disponível para esta empresa.");
      }
      const delivery = rawDelivery as DeliveryIdentity;
      // Search by canonical origin as well as checking the delivery pointer: lost ACK may precede UI refresh.
      const { data: rawRows, error: arError } = await (supabase as any).from("accounts_receivable")
        .select("id, organization_id, origin_type, origin_id, customer_id, total_amount, status, fiscal_invoice_required, fiscal_invoice_status")
        .eq("organization_id", org as string).eq("origin_type", "DELIVERY").eq("origin_id", deliveryId as string).neq("status", "CANCELED").limit(2);
      if (!current()) throw new Error("Contexto alterado.");
      if (arError) throw arError;
      if (!Array.isArray(rawRows) || rawRows.length > 1) throw new Error("Vínculo financeiro inconsistente; revise o lançamento existente.");
      const ar: unknown = rawRows[0];
      if (!ar) {
        if (delivery.receivable_id) throw new Error("Recebível vinculado não disponível.");
        return null;
      }
      if (!record(ar) || !isFinanceUuid(ar.id) || ar.organization_id !== org || ar.origin_type !== "DELIVERY" || ar.origin_id !== deliveryId ||
        ar.customer_id !== delivery.cliente_id || (delivery.receivable_id && delivery.receivable_id !== ar.id) ||
        !["number", "string"].includes(typeof ar.total_amount) || !Number.isFinite(Number(ar.total_amount)) || Number(ar.total_amount) <= 0 ||
        typeof ar.status !== "string" || ar.status === "CANCELED" || typeof ar.fiscal_invoice_required !== "boolean" || typeof ar.fiscal_invoice_status !== "string") {
        throw new Error("Vínculo financeiro inconsistente; revise o lançamento existente.");
      }
      return ar as Receipt;
    },
  }, { request: access, actor: access });
  useEffect(() => {
    lock.current = null;
    return () => { void qc.cancelQueries({ queryKey: key, exact: true }); qc.removeQueries({ queryKey: key, exact: true }); };
  }, [access.scope, qc]);
  const fresh = eligible && query.isSuccess && !query.isFetching && !query.error;
  const receipt = fresh ? query.data : null;
  const state: DeliveryFinanceState = receipt
    ? (receipt.fiscal_invoice_required && receipt.fiscal_invoice_status !== "ISSUED" ? "fiscal_pendente" : "recebivel_confirmado")
    : (query.error ? "resposta_incerta" : action?.scope === access.scope ? action.state : "resposta_incerta");
  const reject = () => {
    if (!eligible || lock.current) return;
    setAction({ scope: access.scope, state: "rejeitado", message: blocked });
  };
  const reconsultar = async () => {
    if (!eligible || lock.current) return;
    const ticket = {}; lock.current = ticket;
    const current = access.capture();
    setPendingScope(access.scope);
    try {
      await qc.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
      if (!current()) return;
      await query.refetch();
      if (!current()) return;
      // No record is not evidence that an uncertain write rolled back; never re-dispatch.
      setAction({ scope: access.scope, state: "resposta_incerta", message: "Consulta concluída. Nenhuma nova cobrança foi enviada." });
    } finally {
      if (lock.current === ticket) lock.current = null;
      if (current()) setPendingScope(null);
    }
  };
  return { access, eligible, fresh, receipt, state, reject, reconsultar,
    pending: pendingScope === access.scope,
    message: query.error ? "Não foi possível confirmar o recebível. Reconsulte sem repetir a cobrança."
      : action?.scope === access.scope ? action.message : blocked };
}