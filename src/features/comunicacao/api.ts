/**
 * Data-access tipado para o Módulo de Comunicação.
 * Todas as chamadas passam pelo cliente Supabase padrão.
 * As tabelas/RPCs só existirão após a aplicação da migration proposta em
 * restoration/comunicacao-fase1/migration.sql. Antes disso a UI é inacessível
 * via feature flag.
 *
 * Os casts (`as unknown as ...`) existem porque `types.ts` não foi regenerado
 * ainda. O runbook manda regenerar após staging e remover estes casts em uma
 * mudança dedicada, sem alterar a shape declarada em `./types.ts` (fonte
 * manual até a regeneração).
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  CommunicationRpcContracts,
  ComunicacaoEvento,
  ComunicacaoOutbox,
  ComunicacaoPreferencia,
  ComunicacaoRegra,
  ComunicacaoTemplate,
} from "./types";

type SbClientRpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      order: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>;
        range: (from: number, to: number) => Promise<{ data: unknown; error: { message: string } | null; count?: number | null }>;
      };
    };
  };
};

const sb = supabase as unknown as SbClientRpc;

async function callRpc<K extends keyof CommunicationRpcContracts>(
  name: K,
  args: CommunicationRpcContracts[K]["args"],
): Promise<CommunicationRpcContracts[K]["returns"]> {
  const { data, error } = await sb.rpc(name as string, args as Record<string, unknown>);
  if (error) throw new Error(error.message);
  return data as CommunicationRpcContracts[K]["returns"];
}

// ---------------- Templates ----------------

export async function listTemplates(limit = 100): Promise<ComunicacaoTemplate[]> {
  const { data, error } = await sb
    .from("comunicacao_templates")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ComunicacaoTemplate[];
}

export const createTemplate = (
  args: CommunicationRpcContracts["rpc_create_communication_template"]["args"],
) => callRpc("rpc_create_communication_template", args);

export const updateTemplate = (
  args: CommunicationRpcContracts["rpc_update_communication_template"]["args"],
) => callRpc("rpc_update_communication_template", args);

export const activateTemplate = (id: string) =>
  callRpc("rpc_activate_communication_template", { p_template_id: id });

export const archiveTemplate = (id: string) =>
  callRpc("rpc_archive_communication_template", { p_template_id: id });

// ---------------- Regras ----------------

export async function listRules(): Promise<ComunicacaoRegra[]> {
  const { data, error } = await sb
    .from("comunicacao_regras")
    .select("*")
    .order("prioridade", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ComunicacaoRegra[];
}

export const upsertRule = (
  args: CommunicationRpcContracts["rpc_upsert_communication_rule"]["args"],
) => callRpc("rpc_upsert_communication_rule", args);

// ---------------- Fila / eventos ----------------

export async function listEvents(page = 0, pageSize = 25): Promise<ComunicacaoEvento[]> {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await sb
    .from("comunicacao_eventos")
    .select("*")
    .order("occurred_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  return (data ?? []) as ComunicacaoEvento[];
}

export async function listOutbox(page = 0, pageSize = 25): Promise<ComunicacaoOutbox[]> {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await sb
    .from("comunicacao_outbox")
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  return (data ?? []) as ComunicacaoOutbox[];
}

// ---------------- Preferências do próprio usuário ----------------

export async function listOwnPreferences(): Promise<ComunicacaoPreferencia[]> {
  const { data, error } = await sb
    .from("comunicacao_preferencias")
    .select("*")
    .order("canal", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ComunicacaoPreferencia[];
}

export const updateOwnPreference = (
  args: CommunicationRpcContracts["rpc_update_communication_preferences"]["args"],
) => callRpc("rpc_update_communication_preferences", args);

// ---------------- Fase 2 ----------------

export const setTemplateMetadata = (
  args: CommunicationRpcContracts["rpc_set_communication_template_metadata"]["args"],
) => callRpc("rpc_set_communication_template_metadata", args);

export const previewAdministrativeBroadcast = (
  args: CommunicationRpcContracts["rpc_preview_administrative_broadcast_count"]["args"],
) => callRpc("rpc_preview_administrative_broadcast_count", args);

/**
 * Publica broadcast administrativo (`administrative_important_update`). O
 * `idempotency_key` deve ser um nonce UUID gerado por INTENÇÃO de envio,
 * preservado em retries/duplo clique e renovado após sucesso ou reset.
 */
export const publishAdministrativeBroadcast = (args: {
  target_role: string;
  titulo: string;
  mensagem: string;
  idempotency_key: string;
}) =>
  callRpc("rpc_publish_communication_event_v2", {
    p_event_key: "administrative_important_update",
    // Fase 2.4: broadcast administrativo não tem origem — source_type/source_id nulos
    p_source_type: null,
    p_source_id: null,
    p_payload: {
      target_role: args.target_role,
      titulo: args.titulo,
      mensagem: args.mensagem,
    },
    p_idempotency_key: args.idempotency_key,
  });

/**
 * Publicação manual de `produto_pronto_aplicacao` para uma OS regular (não
 * on-farm até haver definição de negócio). Servidor valida existência da OS e
 * ignora conteúdo do payload (todos os dados vêm do banco via helpers v2).
 * `idempotency_key` deve ser um nonce UUID por intenção do administrador.
 */
export const publishManualProdutoProntoAplicacao = (args: {
  os_id: string;
  idempotency_key: string;
}) =>
  callRpc("rpc_publish_communication_event_v2", {
    p_event_key: "produto_pronto_aplicacao",
    p_source_type: "ordens_servico",
    p_source_id: args.os_id,
    p_payload: {},
    p_idempotency_key: args.idempotency_key,
  });


/** Lista OS regulares para o seletor manual da aba Comunicados (admin). */
export async function listOrdensServicoRegularesParaComunicado(
  limit = 50,
): Promise<Array<{ id: string; numero_os: string | null; status: string | null }>> {
  const { data, error } = await sb
    .from("ordens_servico")
    .select("id, numero_os, status")
    .order("created_at", { ascending: false })
    .limit(limit) as unknown as {
      data: Array<{ id: string; numero_os: string | null; status: string | null }> | null;
      error: { message: string } | null;
    };
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------------- Fase 2.4 ----------------

/** Verificação administrativa de canal (email/telefone) — admin somente. */
export const verifyCommunicationChannel = (
  args: CommunicationRpcContracts["rpc_verify_communication_channel"]["args"],
) => callRpc("rpc_verify_communication_channel", args);

/**
 * Consulta booleans de configuração dos canais via Edge Function
 * `communication-health`. Nunca retorna secrets — apenas configured/enabled.
 * Requisita apenas sob demanda. Falha ou função ausente não deve quebrar UI.
 */
export type CommunicationHealthErrorCode =
  | "function_unavailable"
  | "unauthorized"
  | "unexpected_error";

export interface CommunicationHealthResult {
  ok: boolean;
  fetched_at: string;
  delivery_enabled?: boolean;
  email?: { enabled: boolean; configured: boolean };
  whatsapp?: { enabled: boolean; configured: boolean };
  in_app?: { enabled: boolean; configured: boolean };
  /** Fase 4: webhook de entrega WhatsApp (Meta). Só booleans, nunca segredos. */
  whatsapp_webhook?: { enabled: boolean; configured: boolean };
  /** Código genérico allowlisted — nunca contém message bruta, secrets ou PII. */
  error?: CommunicationHealthErrorCode;
}

/**
 * Fase 2.5: mapeia qualquer erro (Edge Function, Supabase, exception) para um
 * código genérico allowlisted. Detalhes técnicos ficam em console.warn (fora
 * da resposta exibida) e nunca sobem à UI, evitando vazar segredos/PII.
 */
function mapHealthError(status: number | undefined): CommunicationHealthErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404 || status === 405 || status === 501 || status === 503) {
    return "function_unavailable";
  }
  return "unexpected_error";
}

export async function fetchCommunicationHealth(): Promise<CommunicationHealthResult> {
  const now = new Date().toISOString();
  try {
    const sbInvoke = (supabase as unknown as {
      functions: {
        invoke: (name: string, opts: { method: string; body?: unknown }) => Promise<{
          data: unknown; error: { message?: string; status?: number } | null;
        }>;
      };
    }).functions;
    const { data, error } = await sbInvoke.invoke("communication-health", { method: "POST" });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[communication-health] invoke error", error.status);
      return { ok: false, fetched_at: now, error: mapHealthError(error.status) };
    }
    const d = (data ?? {}) as Omit<CommunicationHealthResult, "error"> & { ok?: boolean };
    return { ...d, ok: !!d.ok, fetched_at: now };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[communication-health] exception", (e as Error).name);
    return { ok: false, fetched_at: now, error: "unexpected_error" };
  }
}
