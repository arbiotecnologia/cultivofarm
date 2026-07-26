/**
 * Tipos manuais para as tabelas/RPCs do Módulo de Comunicação (Fase 1).
 *
 * IMPORTANTE — o arquivo `src/integrations/supabase/types.ts` é gerado a partir
 * do schema aplicado. Como a migration desta fase ainda não foi aplicada em
 * staging, os tipos oficiais NÃO contêm essas tabelas. Este módulo suplementar
 * é a fonte manual usada pela camada de features enquanto a regeneração não
 * ocorre. Após aplicar em staging, regenerar types.ts e comparar contra este
 * arquivo (runbook, seção 6.2).
 *
 * Cobre exatamente a migration em restoration/comunicacao-fase1/migration.sql.
 * Sem `any` — todas as tabelas e RPCs estão declaradas.
 */

export type ComunicacaoCanal = "email" | "whatsapp" | "in_app" | "push";
export type ComunicacaoTemplateStatus = "draft" | "active" | "archived";
export type ComunicacaoOutboxStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled"
  | "skipped"
  | "dead_letter";
export type ComunicacaoEventoStatus =
  | "received"
  | "processed"
  | "skipped"
  | "failed";

export interface ComunicacaoTemplateParameterMapping {
  index: number;
  variavel: string;
  tipo?: string;
}

export interface ComunicacaoTemplate {
  id: string;
  chave: string;
  nome: string;
  canal: ComunicacaoCanal;
  versao: number;
  status: ComunicacaoTemplateStatus;
  locale: string;
  assunto: string | null;
  corpo: string;
  variaveis: string[];
  /** Fase 2: metadados de canal (WhatsApp Meta). */
  provider_template_name: string | null;
  language_code: string | null;
  parameter_mapping: ComunicacaoTemplateParameterMapping[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ComunicacaoRegra {
  id: string;
  event_key: string;
  perfil: string | null;
  estrategia: "by_role" | "source_participants" | "broadcast_role";
  canal: ComunicacaoCanal;
  template_chave: string;
  template_versao: number | null;
  condicoes: Record<string, unknown>;
  prioridade: number;
  enabled: boolean;
  cooldown_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface ComunicacaoEvento {
  id: string;
  event_key: string;
  source_type: string | null;
  source_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
  status: ComunicacaoEventoStatus;
  processed_at: string | null;
  processing_error: string | null;
  outbox_enqueued: number;
  outbox_skipped: number;
  idempotency_key: string;
  created_at: string;
}

export interface ComunicacaoOutbox {
  id: string;
  event_id: string;
  rule_id: string | null;
  template_id: string | null;
  template_chave: string;
  template_versao: number;
  canal: ComunicacaoCanal;
  recipient_user_id: string | null;
  recipient_cliente_id: string | null;
  status: ComunicacaoOutboxStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  locked_at: string | null;
  locked_by: string | null;
  lease_expires_at: string | null;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComunicacaoPreferencia {
  id: string;
  user_id: string | null;
  cliente_id: string | null;
  canal: ComunicacaoCanal;
  enabled: boolean;
  telefone_verificado: boolean;
  email_verificado: boolean;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_out_at: string | null;
  source: "user" | "cliente_portal" | "admin" | "system";
  updated_at: string;
}

/** Contratos de RPC — usados pela UI e testes; regenerar após staging. */
export interface CommunicationRpcContracts {
  rpc_create_communication_template: {
    args: {
      p_chave: string;
      p_nome: string;
      p_canal: ComunicacaoCanal;
      p_assunto: string | null;
      p_corpo: string;
      p_variaveis: string[];
    };
    returns: { ok: boolean; template_id: string; versao: number };
  };
  rpc_update_communication_template: {
    args: {
      p_template_id: string;
      p_nome: string;
      p_assunto: string | null;
      p_corpo: string;
      p_variaveis: string[];
    };
    returns: { ok: boolean };
  };
  rpc_activate_communication_template: {
    args: { p_template_id: string };
    returns: { ok: boolean };
  };
  rpc_archive_communication_template: {
    args: { p_template_id: string };
    returns: { ok: boolean; already_archived?: boolean };
  };
  rpc_upsert_communication_rule: {
    args: {
      p_rule_id: string | null;
      p_event_key: string;
      p_perfil: string | null;
      p_estrategia: "by_role" | "source_participants" | "broadcast_role";
      p_canal: ComunicacaoCanal;
      p_template_chave: string;
      p_template_versao: number | null;
      p_condicoes: Record<string, unknown>;
      p_prioridade: number;
      p_enabled: boolean;
      p_cooldown_seconds: number;
    };
    returns: { ok: boolean; rule_id: string };
  };
  rpc_publish_communication_event: {
    args: {
      p_event_key: string;
      p_source_type: string | null;
      p_source_id: string | null;
      p_payload: Record<string, unknown>;
      p_idempotency_key: string;
    };
    returns: {
      ok: boolean;
      event_id: string;
      duplicated: boolean;
      enqueued?: number;
      skipped?: number;
    };
  };
  rpc_update_communication_preferences: {
    args: {
      p_canal: ComunicacaoCanal;
      p_enabled: boolean;
      p_whatsapp_opt_in: boolean | null;
    };
    returns: { ok: boolean };
  };
  // ---- Fase 2 ----
  rpc_set_communication_template_metadata: {
    args: {
      p_template_id: string;
      p_provider_template_name: string | null;
      p_language_code: string | null;
      p_parameter_mapping: ComunicacaoTemplateParameterMapping[];
    };
    returns: { ok: boolean };
  };
  rpc_preview_administrative_broadcast_count: {
    args: { p_target_role: string };
    returns: {
      ok: boolean;
      target_role: string;
      total_users_in_role: number;
      estimated_recipients_by_canal: Record<string, number>;
    };
  };
}
