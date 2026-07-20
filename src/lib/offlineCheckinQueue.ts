import { supabase } from "@/integrations/supabase/client";

const LS_KEY = "arbio:pending_checkins";

export interface PendingCheckin {
  localId: string;
  registroId: string;
  payload: Record<string, any>;
  createdAt: string;
}

function read(): PendingCheckin[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: PendingCheckin[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("[offlineCheckinQueue] write failed", err);
  }
}

export function enqueueCheckin(registroId: string, payload: Record<string, any>): PendingCheckin {
  const item: PendingCheckin = {
    localId: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    registroId,
    payload,
    createdAt: new Date().toISOString(),
  };
  const all = read();
  all.push(item);
  write(all);
  return item;
}

export function getPendingCheckins(registroId?: string): PendingCheckin[] {
  const all = read();
  return registroId ? all.filter((i) => i.registroId === registroId) : all;
}

export function removePendingCheckin(localId: string) {
  write(read().filter((i) => i.localId !== localId));
}

export function countPendingCheckins(registroId?: string): number {
  return getPendingCheckins(registroId).length;
}

export async function syncPendingCheckins(): Promise<{ synced: number; failed: number }> {
  const items = read();
  let synced = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const p = item.payload as any;
      const clientUuid = p.client_uuid ?? item.localId;
      // Fase 12.8 · Fase 3 — despacha para RPC de checkin ou checkout.
      const isCheckout = p.tipo_checkin === "checkout";
      const rpcName = isCheckout ? "rpc_realizar_checkout_visita" : "rpc_realizar_checkin_visita";
      const args: any = isCheckout
        ? {
            p_registro_id: p.registro_consultor_id ?? null,
            p_client_uuid: clientUuid,
            p_latitude: p.latitude ?? null,
            p_longitude: p.longitude ?? null,
            p_precisao: p.precisao_gps ?? null,
            p_justificativa_sem_gps: p.justificativa_sem_gps ?? null,
            p_observacoes: p.observacoes ?? null,
            p_captured_at_local: p.data_hora_checkin ?? item.createdAt ?? null,
            p_foto_path: p.foto_path ?? null,
          }
        : {
            p_registro_id: p.registro_consultor_id ?? null,
            p_client_uuid: clientUuid,
            p_tipo: p.tipo_checkin,
            p_latitude: p.latitude ?? null,
            p_longitude: p.longitude ?? null,
            p_precisao: p.precisao_gps ?? null,
            p_justificativa_sem_gps: p.justificativa_sem_gps ?? null,
            p_observacoes: p.observacoes ?? null,
            p_captured_at_local: p.data_hora_checkin ?? item.createdAt ?? null,
            p_solicitacao_id: p.solicitacao_id ?? null,
            p_cliente_id: p.cliente_id ?? null,
            p_fazenda_id: p.fazenda_id ?? null,
            p_talhao_id: p.talhao_id ?? null,
            p_foto_path: p.foto_path ?? null,
          };
      const { error } = await supabase.rpc(rpcName as any, args);
      if (error) {
        // Checkout sem checkin remoto → mantém pendente, tenta em próximo ciclo.
        failed++;
        break;
      }
      removePendingCheckin(item.localId);
      synced++;
    } catch {
      failed++;
      break;
    }
  }
  return { synced, failed };
}
