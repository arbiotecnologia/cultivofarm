import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPendingRegistros,
  getPendingMediaForRegistro,
  getFotosForRegistro,
  removePendingRegistro,
  getPendingCount,
  getPendingCheckins,
  removePendingCheckin,
  claimPendingRegistro,
  claimPendingCheckin,
  releasePendingRegistro,
  releasePendingCheckin,
  setRegistroRemoteId,
  updatePendingFoto,
  updatePendingCheckin,
  saveSyncedVisitMapping,
  getSyncedVisitMapping,
  cleanupOldSyncedVisitMappings,
  getPendingCampos,
  updatePendingCampo,
  removePendingCampo,
  getAllPendingDiagnosticos,
  updatePendingDiagnostico,
  removePendingDiagnostico,
  getAllPendingRecomendacoes,
  updatePendingRecomendacao,
  removePendingRecomendacao,
  type PendingFoto,
} from "@/lib/offlineDb";
import { emitTechnicalVisitSynced } from "@/lib/visitaSyncEvents";
import { toast } from "sonner";

const MAX_UPLOAD_ATTEMPTS = 3;

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string;
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}

/** Erro Postgres de violação de unicidade */
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505";
}

/** Tenta upload com upsert (idempotente) e valida via list */
async function uploadFotoWithRetry(
  foto: PendingFoto,
  registroRemoteId: string,
  log: (status: "sucesso" | "erro", msg?: string) => Promise<void>
): Promise<{ success: boolean; remotePath?: string }> {
  const ext = foto.fileName.split(".").pop()?.toLowerCase() || "jpg";
  // Path determinístico: o mesmo blob sobrescreve o mesmo path em retry
  const remotePath = foto.remotePath || `${registroRemoteId}/${foto.id}.${ext}`;

  const attempts = (foto.uploadAttempts || 0) + 1;

  if (attempts > MAX_UPLOAD_ATTEMPTS) {
    await log("erro", `máximo de tentativas (${MAX_UPLOAD_ATTEMPTS}) excedido`);
    return { success: false };
  }

  try {
    const { error: upErr } = await supabase.storage
      .from("consultor-arquivos")
      .upload(remotePath, foto.file, {
        contentType: foto.mimeType,
        upsert: true,
      });

    if (upErr) {
      await updatePendingFoto(foto.id, {
        uploadAttempts: attempts,
        lastUploadError: upErr.message,
        remotePath,
      });
      await log("erro", upErr.message);
      return { success: false };
    }

    // Validação pós-upload: confirma presença no storage
    const folder = remotePath.substring(0, remotePath.lastIndexOf("/"));
    const fileName = remotePath.substring(remotePath.lastIndexOf("/") + 1);
    const { data: listData } = await supabase.storage
      .from("consultor-arquivos")
      .list(folder, { search: fileName });
    const found = (listData || []).some((f) => f.name === fileName);
    if (!found) {
      await updatePendingFoto(foto.id, {
        uploadAttempts: attempts,
        lastUploadError: "upload sem confirmação no storage",
        remotePath,
      });
      await log("erro", "upload sem confirmação no storage");
      return { success: false };
    }

    // Insere referência (idempotente: se já existir mesmo path, não duplica)
    const { data: existing } = await supabase
      .from("registros_consultor_arquivos")
      .select("id")
      .eq("registro_consultor_id", registroRemoteId)
      .eq("arquivo_path", remotePath)
      .maybeSingle();

    if (!existing) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("registros_consultor_arquivos").insert({
        registro_consultor_id: registroRemoteId,
        arquivo_url: null,
        arquivo_path: remotePath,
        nome_arquivo: foto.fileName,
        tipo_arquivo: foto.mimeType,
        tipo_midia: "foto",
        categoria_arquivo: "geral",
        foto_principal: foto.isPrincipal,
        uploaded_by: user?.id || null,
        client_uuid: foto.id // Usar o ID local como client_uuid para idempotência
      } as any);
    }

    await updatePendingFoto(foto.id, {
      uploaded: true,
      remotePath,
      lastUploadError: null,
      uploadAttempts: attempts,
    });
    await log("sucesso");
    return { success: true, remotePath };
  } catch (err: any) {
    await updatePendingFoto(foto.id, {
      uploadAttempts: attempts,
      lastUploadError: err?.message || "erro desconhecido",
      remotePath,
    });
    await log("erro", err?.message || "erro desconhecido");
    return { success: false };
  }
}

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>({ total: 0, completed: 0, failed: 0 });
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  const syncAll = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);

    try {
      const pending = await getPendingRegistros();
      const pendingCheckins = await getPendingCheckins();
      const total = pending.length + pendingCheckins.length;
      setProgress({ total, completed: 0, failed: 0 });

      let syncedCount = 0;
      let failedCount = 0;

      const log = async (
        tipo_item: string,
        item_local_id: string,
        status: "sucesso" | "erro" | "tentativa",
        opts: { tentativa?: number; mensagem_erro?: string; item_remoto_id?: string; payload_resumo?: any } = {}
      ) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from("sync_log" as any).insert({
            user_id: user?.id || null,
            tipo_item,
            item_local_id,
            status,
            tentativa: opts.tentativa ?? 1,
            mensagem_erro: opts.mensagem_erro || null,
            item_remoto_id: opts.item_remoto_id || null,
            payload_resumo: opts.payload_resumo || null,
          });
        } catch {
          /* silencioso */
        }
      };

      // === REGISTROS ===
      for (const item of pending) {
        const claimed = await claimPendingRegistro(item.id);
        if (!claimed) continue;

        setProgress((p) => ({ ...p, current: item.payload?.objetivo_visita || "registro" }));

        await log("registro", item.id, "tentativa", {
          payload_resumo: { titulo: item.payload?.objetivo_visita, problema: item.payload?.problema_principal },
        });

        try {
          let remoteId = item.remoteId || null;
          let remoteVersion: number | null = (item as any).version ?? null;

          if (!remoteId) {
            const clientUuid =
              item.clientUuid || item.payload?.client_uuid || item.payload?.p_client_uuid || crypto.randomUUID();

            // === Contrato CANÔNICO: motor único via RPC idempotente ===
            if (item.operationType === "create_technical_visit") {
              const pl = (item.payload ?? {}) as Record<string, unknown>;
              const rpcArgs = {
                p_client_uuid: clientUuid,
                p_cliente_id: pl.p_cliente_id,
                p_fazenda_id: pl.p_fazenda_id,
                p_talhao_id: pl.p_talhao_id,
                p_cultura_id: pl.p_cultura_id ?? null,
                p_data_vistoria: pl.p_data_vistoria,
                p_tipo_visita: pl.p_tipo_visita ?? "vistoria_inicial",
                p_objetivo_visita: pl.p_objetivo_visita ?? null,
                p_safra: pl.p_safra ?? null,
                p_fase_fenologica: pl.p_fase_fenologica ?? null,
                p_solicitacao_id: pl.p_solicitacao_id ?? null,
                p_origem: pl.p_origem ?? "visita_avulsa",
                p_categoria_problema: pl.p_categoria_problema ?? null,
                p_nivel_pressao: pl.p_nivel_pressao ?? null,
                p_percentual_area_afetada: pl.p_percentual_area_afetada ?? null,
                p_urgencia: pl.p_urgencia ?? null,
                p_localizacao_na_area: pl.p_localizacao_na_area ?? null,
                p_observacoes_tecnicas: pl.p_observacoes_tecnicas ?? null,
                p_problema_principal: pl.p_problema_principal ?? null,
                p_area_hectares: pl.p_area_hectares ?? null,
                p_latitude: pl.p_latitude ?? null,
                p_longitude: pl.p_longitude ?? null,
                p_registro_origem_id: pl.p_registro_origem_id ?? null,
              };

              const { data, error } = await supabase.rpc(
                "rpc_criar_visita_idempotente" as never,
                rpcArgs as never,
              );

              const res = data as any;
              if (error || !res?.ok) {
                const msg = error?.message || res?.error || "rpc erro";
                await log("registro", item.id, "erro", { mensagem_erro: msg });
                await releasePendingRegistro(item.id);
                failedCount++;
                setProgress((p) => ({ ...p, failed: p.failed + 1 }));
                continue;
              }

              remoteId = res.registro_id;
              remoteVersion = typeof res.version === "number" ? res.version : null;
              await log("registro", item.id, "sucesso", {
                item_remoto_id: remoteId!,
                mensagem_erro: res.created ? "criado" : "idempotente — já existia",
              });
              // B0.2: persiste remoteId + version na pendência antes de qualquer remoção
              await setRegistroRemoteId(item.id, remoteId!, remoteVersion);
            } else if (item.operationType === "create_consultor_record") {
              // === Compatibilidade LEGADA (somente pendências antigas já gravadas) ===
              // Proibido para novas ocorrências: a UI grava sempre o contrato canônico.
              await log("registro", item.id, "tentativa", {
                mensagem_erro: "contrato legado detectado — pendência anterior à unificação",
              });
              const payloadWithUuid = { ...item.payload, client_uuid: clientUuid };

              const { data: registro, error } = await supabase
                .from("registros_consultor")
                .insert(payloadWithUuid as any)
                .select("id")
                .single();

              if (error) {
                if (isUniqueViolation(error)) {
                  const { data: existing } = await supabase
                    .from("registros_consultor")
                    .select("id")
                    .eq("client_uuid", payloadWithUuid.client_uuid)
                    .maybeSingle();
                  if (existing) {
                    remoteId = existing.id;
                    await log("registro", item.id, "sucesso", {
                      item_remoto_id: remoteId,
                      mensagem_erro: "idempotente — registro já existia (legado)",
                    });
                  } else {
                    await log("registro", item.id, "erro", { mensagem_erro: error.message });
                    await releasePendingRegistro(item.id);
                    failedCount++;
                    setProgress((p) => ({ ...p, failed: p.failed + 1 }));
                    continue;
                  }
                } else {
                  await log("registro", item.id, "erro", { mensagem_erro: error.message });
                  await releasePendingRegistro(item.id);
                  failedCount++;
                  setProgress((p) => ({ ...p, failed: p.failed + 1 }));
                  continue;
                }
              } else {
                remoteId = registro.id;
              }

              await setRegistroRemoteId(item.id, remoteId!);
            } else {
              // Sem operationType: pendência inválida/desconhecida. Nunca faz INSERT direto.
              await log("registro", item.id, "erro", {
                mensagem_erro: "operationType ausente — sincronização recusada (fallback legado proibido)",
              });
              await releasePendingRegistro(item.id);
              failedCount++;
              setProgress((p) => ({ ...p, failed: p.failed + 1 }));
              continue;
            }

          }

          // === Upload de mídias com gating ===
          const pendingMedia = await getPendingMediaForRegistro(item.id);
          let allMediaOk = true;

          for (const foto of pendingMedia) {
            const res = await uploadFotoWithRetry(foto, remoteId!, async (status, msg) => {
              await log("foto", foto.id, status, {
                item_remoto_id: remoteId!,
                tentativa: (foto.uploadAttempts || 0) + 1,
                mensagem_erro: msg,
              });
            });
            if (!res.success) allMediaOk = false;
          }

          if (allMediaOk) {
            // Ordem crítica: preservar mapping ANTES de remover a pendência
            if (item.operationType === "create_technical_visit") {
              try {
                await saveSyncedVisitMapping({
                  localId: item.id,
                  clientUuid: item.clientUuid || item.id,
                  remoteId: remoteId!,
                  version: remoteVersion,
                  syncedAt: Date.now(),
                });
                emitTechnicalVisitSynced({
                  localId: item.id,
                  clientUuid: item.clientUuid || item.id,
                  remoteId: remoteId!,
                  version: remoteVersion,
                });
              } catch (mapErr: any) {
                console.error("Falha ao salvar mapping local→remoto:", mapErr);
                await log("registro", item.id, "erro", {
                  mensagem_erro: `mapping falhou: ${mapErr?.message || "desconhecido"}`,
                });
                await releasePendingRegistro(item.id);
                failedCount++;
                setProgress((p) => ({ ...p, failed: p.failed + 1 }));
                continue;
              }
            }
            await log("registro", item.id, "sucesso", { item_remoto_id: remoteId! });
            await removePendingRegistro(item.id);
            syncedCount++;
            setProgress((p) => ({ ...p, completed: p.completed + 1 }));
          } else {
            // NÃO remove o item — fica na fila aguardando próxima tentativa
            await releasePendingRegistro(item.id);
            failedCount++;
            setProgress((p) => ({ ...p, failed: p.failed + 1 }));
          }
        } catch (err: any) {
          console.error("Sync item error:", err);
          await log("registro", item.id, "erro", { mensagem_erro: err?.message || "erro desconhecido" });
          await releasePendingRegistro(item.id);
          failedCount++;
          setProgress((p) => ({ ...p, failed: p.failed + 1 }));
        }
      }

      // === CHECK-INS ===
      for (const c of pendingCheckins) {
        const claimed = await claimPendingCheckin(c.id);
        if (!claimed) continue;

        setProgress((p) => ({ ...p, current: `Check-in (${c.payload?.tipo_checkin || "—"})` }));

        await log("checkin", c.id, "tentativa", {
          payload_resumo: { tipo: c.payload?.tipo_checkin },
        });

        try {
          // Upload da foto (se houver e ainda não enviada) com path determinístico + upsert
          let fotoPath: string | null = c.fotoRemotePath || null;

          if (c.fotoBlob && !c.fotoUploaded) {
            const ext = c.fotoFileName?.split(".").pop()?.toLowerCase() || "jpg";
            const path = c.fotoRemotePath || `checkins/offline/${c.id}.${ext}`;
            const attempts = (c.fotoUploadAttempts || 0) + 1;

            if (attempts > MAX_UPLOAD_ATTEMPTS) {
              await log("foto", c.id, "erro", { mensagem_erro: "máximo de tentativas excedido" });
              await releasePendingCheckin(c.id);
              failedCount++;
              setProgress((p) => ({ ...p, failed: p.failed + 1 }));
              continue;
            }

            const { error: upErr } = await supabase.storage
              .from("consultor-arquivos")
              .upload(path, c.fotoBlob, {
                contentType: c.fotoMimeType || "image/jpeg",
                upsert: true,
              });

            if (upErr) {
              await updatePendingCheckin(c.id, {
                fotoUploadAttempts: attempts,
                fotoLastError: upErr.message,
                fotoRemotePath: path,
              });
              await log("foto", c.id, "erro", { mensagem_erro: upErr.message, tentativa: attempts });
              await releasePendingCheckin(c.id);
              failedCount++;
              setProgress((p) => ({ ...p, failed: p.failed + 1 }));
              continue;
            }

            fotoPath = path;
            await updatePendingCheckin(c.id, {
              fotoUploaded: true,
              fotoRemotePath: path,
              fotoUploadAttempts: attempts,
              fotoLastError: null,
            });
            await log("foto", c.id, "sucesso", { tentativa: attempts });
          }

          // Fase 12.8 · Fase 7: nunca regenerar client_uuid no replay.
          const clientUuid = c.clientUuid || c.payload?.client_uuid;
          if (!clientUuid) {
            await log("checkin", c.id, "erro", { mensagem_erro: "client_uuid ausente" });
            await releasePendingCheckin(c.id);
            failedCount++;
            setProgress((p2) => ({ ...p2, failed: p2.failed + 1 }));
            continue;
          }
          const p = (c.payload || {}) as any;

          // Fase 12.8 · Fase 3 — despacha para RPC de checkin ou checkout.
          const isCheckout = p.tipo_checkin === "checkout";
          const rpcName = isCheckout ? "rpc_realizar_checkout_visita" : "rpc_realizar_checkin_visita";
          const rpcArgs: any = isCheckout
            ? {
                p_registro_id: p.registro_consultor_id ?? null,
                p_client_uuid: clientUuid,
                p_latitude: p.latitude ?? null,
                p_longitude: p.longitude ?? null,
                p_precisao: p.precisao_gps ?? null,
                p_justificativa_sem_gps: p.justificativa_sem_gps ?? null,
                p_observacoes: p.observacoes ?? null,
                p_captured_at_local: p.data_hora_checkin ?? c.createdAt ?? null,
                p_foto_path: fotoPath,
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
                p_captured_at_local: p.data_hora_checkin ?? c.createdAt ?? null,
                p_solicitacao_id: p.solicitacao_id ?? null,
                p_cliente_id: p.cliente_id ?? null,
                p_fazenda_id: p.fazenda_id ?? null,
                p_talhao_id: p.talhao_id ?? null,
                p_foto_path: fotoPath,
              };
          const { error } = await supabase.rpc(rpcName as any, rpcArgs);
          if (error) {
            // Fase 12.8 · Fase 3 · Correção 1:
            // NÃO tratar 23505 como sucesso. A idempotência real é sinalizada
            // pela RPC no retorno { idempotent: true } (ausência de erro).
            // Erros de negócio exigem reconciliação — a pendência permanece.
            const msg = error.message || "erro desconhecido";
            const businessCodes = [
              "idempotency_conflict",
              "checkin_duplicado_para_tipo",
              "checkout_duplicado",
              "checkout_sem_checkin",
              "gps_ou_justificativa_obrigatorio",
              "forbidden_visita",
              "relacional_divergente_cliente",
              "relacional_divergente_fazenda",
              "relacional_divergente_talhao",
              "relacional_divergente_solicitacao",
            ];
            const isBusiness = businessCodes.some((c) => msg.includes(c));
            await log("checkin", c.id, "erro", {
              mensagem_erro: isBusiness ? `conflito_negocio:${msg}` : msg,
            });
            await updatePendingCheckin(c.id, { lastSyncError: msg } as any);
            await releasePendingCheckin(c.id);
            failedCount++;
            setProgress((p2) => ({ ...p2, failed: p2.failed + 1 }));
            continue;
          }
          // Fase 12.8 · Fase 7: registrar evidência técnica APÓS a RPC bem-sucedida,
          // evitando arquivos órfãos em registros_consultor_arquivos.
          if (fotoPath && c.payload?.registro_consultor_id) {
            const { data: { user } } = await supabase.auth.getUser();
            const { error: arqErr } = await supabase
              .from("registros_consultor_arquivos")
              .insert({
                registro_consultor_id: c.payload.registro_consultor_id,
                arquivo_path: fotoPath,
                arquivo_url: null,
                tipo_midia: "foto",
                tipo_arquivo: c.fotoMimeType || "image/jpeg",
                categoria_arquivo: "checkin",
                uploaded_by: user?.id || null,
                client_uuid: `${clientUuid}_checkin`,
                legenda: "Foto de check-in (sincronizada offline)",
                latitude: c.payload?.latitude || null,
                longitude: c.payload?.longitude || null,
                capturado_em: c.createdAt,
              } as any);
            if (arqErr && !/duplicate|23505/i.test(arqErr.message)) {
              await log("foto", c.id, "erro", { mensagem_erro: `evidencia:${arqErr.message}` });
            }
          }
          await log("checkin", c.id, "sucesso");
          await removePendingCheckin(c.id);
          syncedCount++;
          setProgress((p) => ({ ...p, completed: p.completed + 1 }));
        } catch (err: any) {
          console.error("Sync checkin error:", err);
          await log("checkin", c.id, "erro", { mensagem_erro: err?.message || "erro desconhecido" });
          await releasePendingCheckin(c.id);
          failedCount++;
          setProgress((p) => ({ ...p, failed: p.failed + 1 }));
        }
      }


      // === CAMPO (Etapa 3 do wizard) ===
      const pendingCampos = await getPendingCampos();
      for (const cp of pendingCampos) {
        try {
          // Precisamos do remoteId — resolve pelo mapping local→remoto
          let remoteRegistroId = cp.remoteRegistroId || null;
          if (!remoteRegistroId) {
            const mapping = await getSyncedVisitMapping(cp.localRegistroId);
            remoteRegistroId = mapping?.remoteId || null;
          }
          if (!remoteRegistroId) {
            // ainda aguardando registro pai — mantém na fila
            continue;
          }

          setProgress((p) => ({ ...p, current: "Etapa 3 · Campo" }));
          await updatePendingCampo(cp.localRegistroId, { syncStatus: "syncing", syncingAt: Date.now() });
          await log("campo", cp.localRegistroId, "tentativa", { item_remoto_id: remoteRegistroId });

          const { data, error } = await supabase.rpc(
            "rpc_salvar_campo_visita" as never,
            {
              p_registro_consultor_id: remoteRegistroId,
              p_client_uuid: cp.clientUuid ?? null,
              p_payload: cp.payload,
              p_versao: cp.versao,
            } as never,
          );

          if (error) {
            await updatePendingCampo(cp.localRegistroId, {
              syncStatus: "sync_error",
              syncingAt: null,
              lastSyncError: error.message,
            });
            await log("campo", cp.localRegistroId, "erro", { mensagem_erro: error.message });
            failedCount++;
            setProgress((p) => ({ ...p, failed: p.failed + 1 }));
            continue;
          }

          const res = data as any;
          await log("campo", cp.localRegistroId, "sucesso", { item_remoto_id: remoteRegistroId });
          await removePendingCampo(cp.localRegistroId);
          syncedCount++;
          setProgress((p) => ({ ...p, completed: p.completed + 1 }));
        } catch (err: any) {
          console.error("Sync campo error:", err);
          await updatePendingCampo(cp.localRegistroId, {
            syncStatus: "sync_error",
            syncingAt: null,
            lastSyncError: err?.message || "erro desconhecido",
          }).catch(() => {});
          await log("campo", cp.localRegistroId, "erro", { mensagem_erro: err?.message || "erro desconhecido" });
          failedCount++;
          setProgress((p) => ({ ...p, failed: p.failed + 1 }));
        }
      }

      // === DIAGNÓSTICOS (Etapa 4 do wizard) ===
      const pendingDiag = await getAllPendingDiagnosticos();
      for (const d of pendingDiag) {
        try {
          const mapping = await getSyncedVisitMapping(d.localRegistroId);
          const remoteRegistroId = mapping?.remoteId || null;
          if (!remoteRegistroId) continue; // aguarda registro pai sincronizar

          setProgress((p) => ({ ...p, current: "Etapa 4 · Diagnóstico" }));
          await updatePendingDiagnostico(d.clientUuid, { syncStatus: "syncing", syncingAt: Date.now() });
          await log("diagnostico", d.clientUuid, "tentativa", { item_remoto_id: remoteRegistroId });

          if (d.deleted) {
            if (d.remoteId) {
              const { error } = await supabase.rpc("rpc_delete_diagnostico_visita" as any, { p_id: d.remoteId });
              if (error) throw error;
            }
            await removePendingDiagnostico(d.clientUuid);
            syncedCount++;
            setProgress((p) => ({ ...p, completed: p.completed + 1 }));
            continue;
          }

          const { data: rpcData, error: rpcErr } = await supabase.rpc("rpc_upsert_diagnostico_visita" as any, {
            p_registro_id: remoteRegistroId,
            p_client_uuid: d.clientUuid,
            p_payload: d.payload as any,
            p_expected_versao: d.versao,
          });
          if (rpcErr) throw rpcErr;
          await updatePendingDiagnostico(d.clientUuid, {
            syncStatus: "synced",
            remoteId: (rpcData as any)?.id ?? null,
            syncingAt: null,
          });

          await log("diagnostico", d.clientUuid, "sucesso", { item_remoto_id: remoteRegistroId });
          await removePendingDiagnostico(d.clientUuid);
          syncedCount++;
          setProgress((p) => ({ ...p, completed: p.completed + 1 }));
        } catch (err: any) {
          console.error("Sync diagnostico error:", err);
          await updatePendingDiagnostico(d.clientUuid, {
            syncStatus: "sync_error", syncingAt: null,
            lastSyncError: err?.message || "erro desconhecido",
          }).catch(() => {});
          await log("diagnostico", d.clientUuid, "erro", { mensagem_erro: err?.message || "erro desconhecido" });
          failedCount++;
          setProgress((p) => ({ ...p, failed: p.failed + 1 }));
        }
      }

      // === RECOMENDAÇÕES (Etapa 5 do wizard) ===
      const pendingRec = await getAllPendingRecomendacoes();
      for (const r of pendingRec) {
        try {
          const mapping = await getSyncedVisitMapping(r.localRegistroId);
          const remoteRegistroId = mapping?.remoteId || null;
          if (!remoteRegistroId) continue;

          setProgress((p) => ({ ...p, current: "Etapa 5 · Recomendação" }));
          await updatePendingRecomendacao(r.clientUuid, { syncStatus: "syncing", syncingAt: Date.now() });
          await log("recomendacao", r.clientUuid, "tentativa", { item_remoto_id: remoteRegistroId });

          if (r.deleted) {
            if (r.remoteId) {
              const { error } = await supabase.rpc("rpc_delete_recomendacao_visita" as any, { p_id: r.remoteId });
              if (error) throw error;
            }
            await removePendingRecomendacao(r.clientUuid);
            syncedCount++;
            setProgress((p) => ({ ...p, completed: p.completed + 1 }));
            continue;
          }

          const { error: rpcErrR } = await supabase.rpc("rpc_upsert_recomendacao_visita" as any, {
            p_registro_id: remoteRegistroId,
            p_client_uuid: r.clientUuid,
            p_payload: r.payload as any,
            p_expected_versao: r.versao,
          });
          if (rpcErrR) throw rpcErrR;

          await log("recomendacao", r.clientUuid, "sucesso", { item_remoto_id: remoteRegistroId });
          await removePendingRecomendacao(r.clientUuid);
          syncedCount++;
          setProgress((p) => ({ ...p, completed: p.completed + 1 }));
        } catch (err: any) {
          console.error("Sync recomendacao error:", err);
          await updatePendingRecomendacao(r.clientUuid, {
            syncStatus: "sync_error", syncingAt: null,
            lastSyncError: err?.message || "erro desconhecido",
          }).catch(() => {});
          await log("recomendacao", r.clientUuid, "erro", { mensagem_erro: err?.message || "erro desconhecido" });
          failedCount++;
          setProgress((p) => ({ ...p, failed: p.failed + 1 }));
        }
      }




      if (syncedCount > 0) {
        toast.success(`${syncedCount} item(s) sincronizado(s) com sucesso!`);
      }
      if (failedCount > 0) {
        toast.warning(`${failedCount} item(s) com falha — ficaram na fila para nova tentativa.`);
      }

      await refreshCount();
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
      syncingRef.current = false;
      // Mantém progresso visível por alguns segundos para o usuário ver o resultado
      setTimeout(() => setProgress({ total: 0, completed: 0, failed: 0 }), 4000);
    }
  }, [refreshCount]);

  useEffect(() => {
    if (isOnline) {
      syncAll();
    }
  }, [isOnline, syncAll]);

  useEffect(() => {
    refreshCount();
    // Cleanup de mappings antigos (> 30 dias) — não bloqueante
    cleanupOldSyncedVisitMappings().catch(() => {});
    const interval = setInterval(refreshCount, 10000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  return { isOnline, pendingCount, syncing, syncAll, refreshCount, progress };
}
