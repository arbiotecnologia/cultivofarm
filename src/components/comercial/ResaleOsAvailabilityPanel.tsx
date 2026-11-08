import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { Button } from "@/components/ui/button";
import {
  createResaleOsRequest,
  decodeResaleOsAvailability,
  type ResaleOsAvailabilityItem,
  type ResaleOsIntent,
} from "@/lib/comercial/resaleOsRequest";
import {
  clearResaleOsAttempt,
  loadResaleOsAttempt,
  retainResaleOsAttempt,
  type RetainedResaleOsAttempt,
} from "@/lib/authz/resaleOsAttemptStore";

/** Ação candidata dentro do detalhe canônico do vendedor; reader ausente/erro = painel fechado. */
export function ResaleOsAvailabilityPanel({ orderId, actorScope, onChanged }: {
  orderId: string;
  actorScope: string;
  onChanged?: () => void;
}) {
  const { user, profile, authzEpoch = 0, authzReady = true, checkAuthzAccess } = useAuth();
  const actor = useStorageAccessScope("resale-os-reader-actor");
  const request = useStorageAccessScope(`resale-os-availability:${orderId}`);
  const availability = useScopedPortalQuery({
    queryKey: ["resale-os-availability", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "rpc_b2b_resale_os_availability_v1" as never,
        { p_order_id: orderId } as never,
      );
      if (error) throw error;
      return decodeResaleOsAvailability(data, {
        orderId,
        actor: user?.id ?? "",
        tenant: profile?.organization_id ?? "",
      });
    },
  }, { request, actor });
  const scope = useMemo(() => ({
    scope: actorScope,
    actor: user?.id ?? "",
    tenant: profile?.organization_id ?? "",
  }), [actorScope, user?.id, profile?.organization_id]);
  const live = useRef({ actor: scope.actor, tenant: scope.tenant, epoch: authzEpoch, ready: actor.ready && authzReady });
  live.current = {
    actor: scope.actor,
    tenant: scope.tenant,
    epoch: authzEpoch,
    ready: actor.ready && authzReady && (checkAuthzAccess?.() ?? true),
  };
  const [attempt, setAttempt] = useState<RetainedResaleOsAttempt | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const requestKey = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!actor.ready) return;
    setAttempt(loadResaleOsAttempt(scope));
    setMessage("");
  }, [scope, actor.ready]);
  const submit = useRef(createResaleOsRequest(async (name, args) => {
    const { data, error } = await supabase.rpc(name as never, args as never);
    return { data, error };
  }, () => live.current, () => requestKey.current ?? crypto.randomUUID()));

  const data = availability.data;
  useEffect(() => {
    // Recuperação por leitura: uma OS persistida reconcilia a tentativa sem reenvio.
    if (!attempt || !data) return;
    const item = data.items.find((row) => row.order_item_id === attempt.itemId);
    if (item?.os_id && attempt.orderId === data.order_id) {
      clearResaleOsAttempt(scope, attempt.requestKey);
      setAttempt(null);
      setMessage("Preparo anterior confirmado pela leitura da OS.");
    }
  }, [attempt, data, scope]);

  if (!data?.available) return null;
  const visible = data.items.filter((item) => item.create_available || item.os_id ||
    attempt?.itemId === item.order_item_id);
  if (visible.length === 0) return null;

  const dispatch = async (item: ResaleOsAvailabilityItem) => {
    if (pendingRef.current || !item.create_available || !live.current.ready) return;
    const intent: ResaleOsIntent = {
      orderId: data.order_id,
      itemId: item.order_item_id,
      observed: data.observed_updated_at,
    };
    const retained = retainResaleOsAttempt(scope, intent, requestKey.current ?? crypto.randomUUID());
    if (!retained) {
      setMessage("Não foi possível reter a tentativa com segurança. Nenhuma chamada foi enviada.");
      return;
    }
    requestKey.current = retained.requestKey;
    setAttempt(retained);
    setMessage("");
    pendingRef.current = true;
    setPending(true);
    try {
      await submit.current(intent);
      clearResaleOsAttempt(scope, retained.requestKey);
      requestKey.current = null;
      if (mounted.current) setAttempt(null);
      await availability.refetch();
      onChanged?.();
    } catch {
      if (mounted.current) setMessage("Resultado não confirmado. A tentativa foi preservada; verifique antes de tentar novamente.");
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  };

  return (
    <section className="rounded-md border p-3 space-y-3" aria-label="Preparo de OS de revenda">
      <div>
        <h3 className="text-sm font-semibold">Preparo de OS de revenda</h3>
        <p className="text-xs text-muted-foreground">Disponibilidade confirmada pelo servidor para esta empresa e versão do pedido.</p>
      </div>
      {visible.map((item) => {
        const retained = attempt?.itemId === item.order_item_id ? attempt : null;
        const changed = !!retained && (retained.orderId !== data.order_id || retained.observed !== data.observed_updated_at);
        return (
          <div key={item.order_item_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="font-mono">Item {item.order_item_id.slice(0, 8)}</span>
            {item.os_id ? (
              <span className="text-muted-foreground">OS preparada · <span className="font-mono">{item.os_id.slice(0, 8)}</span></span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !item.create_available || changed || (!!attempt && !retained)}
                onClick={() => void dispatch(item)}
              >
                <ClipboardPlus className="mr-2 h-4 w-4" />
                {pending && retained ? "Confirmando…" : retained ? "Confirmar preparo anterior" : "Preparar OS de revenda"}
              </Button>
            )}
          </div>
        );
      })}
      {(message || (attempt && !data.items.some((item) => item.os_id && item.order_item_id === attempt.itemId))) && (
        <p role="status" className="text-xs text-muted-foreground">
          {message || "Existe uma tentativa anterior. Nenhum reenvio automático foi realizado."}
        </p>
      )}
    </section>
  );
}
