import { supabase } from "@/integrations/supabase/client";
import type { PendingRecomendacao } from "@/lib/offlineDb";
import { recomendacaoOwnedBy, recomendacaoValidationError, type RecomendacaoOwner } from "./recomendacaoContract";

/** No mapping is fabricated; all locators still require canonical live authority. */
export async function syncRecomendacao(
  entry: PendingRecomendacao, actor: RecomendacaoOwner, remoteRegistroId: string | null,
  current: () => boolean,
) {
  const fence = () => { if (!current()) throw new Error("recommendation_context_changed"); };
  fence();
  if (!recomendacaoOwnedBy(entry, actor)) throw new Error("recommendation_owner_unproven");
  if (!remoteRegistroId) throw new Error("recommendation_parent_unresolved");
  if (entry.versionContract !== "expected_v1") throw new Error("recommendation_legacy_version_requires_review");
  if (!entry.deleted) {
    const invalid = recomendacaoValidationError(entry.payload);
    if (invalid) throw new Error(invalid);
  }
  const proveActor = async () => {
    fence();
    const { data, error } = await supabase.auth.getUser();
    fence();
    if (error || data.user?.id !== actor.userId) throw new Error("recommendation_context_changed");
    const profile = await supabase.from("profiles").select("user_id, organization_id, ativo")
      .eq("user_id", actor.userId).maybeSingle();
    fence();
    if (profile.error || profile.data?.ativo !== true || profile.data.organization_id !== actor.organizationId) {
      throw new Error("recommendation_context_changed");
    }
  };
  await proveActor();
  const workspace = await supabase.rpc("rpc_get_visita_workspace", { p_registro_id: remoteRegistroId });
  fence();
  if (workspace.error) throw workspace.error;
  const ws = workspace.data as unknown as { registro?: { id?: string }; permissions?: {
    can_edit?: boolean; is_participant?: boolean; is_editable_status?: boolean;
  } };
  const writable = ws?.permissions?.can_edit === true ||
    (ws?.permissions?.is_participant === true && ws.permissions.is_editable_status === true);
  if (ws?.registro?.id !== remoteRegistroId || !writable) throw new Error("forbidden_visita");
  await proveActor();
  if (entry.deleted) {
    if (!entry.remoteId) throw new Error("recommendation_remote_id_missing");
    const result = await supabase.rpc("rpc_delete_recomendacao_visita", { p_id: entry.remoteId });
    fence();
    if (result.error) throw result.error;
  } else {
    const result = await supabase.rpc("rpc_upsert_recomendacao_visita", {
      p_registro_id: remoteRegistroId, p_client_uuid: entry.clientUuid,
      p_payload: { ...entry.payload }, p_expected_versao: entry.versao,
    });
    fence();
    if (result.error) throw result.error;
    const receipt = result.data as unknown as { id?: string; versao?: number; client_uuid?: string };
    if (!receipt?.id || receipt.client_uuid !== entry.clientUuid || !Number.isInteger(receipt.versao)) {
      throw new Error("recommendation_receipt_unproven");
    }
  }
  await proveActor();
}