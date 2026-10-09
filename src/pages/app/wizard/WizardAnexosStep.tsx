import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildTenantStoragePath, isConsultorStoragePath } from "@/lib/tenantStoragePath";
import { buildRemotePath, BUCKET, TECHNICAL_ATTACHMENT_ACCEPT, validateTechnicalAttachment } from "@/lib/mediaUpload";
import type { Tables } from "@/integrations/supabase/types";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOfflineSync";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, Loader2, Lock, Paperclip, Trash2, Upload, WifiOff, Image as ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  remoteRegistroId: string | null;
  locked: boolean;
  onDone: () => void;
}

type Attachment = Tables<"registros_consultor_arquivos">;

export default function WizardAnexosStep({ remoteRegistroId, locked, onDone }: Props) {
  const { user, profile } = useAuth();
  const access = useStorageAccessScope(JSON.stringify([remoteRegistroId, locked]));
  const mutationLock = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [legenda, setLegenda] = useState("");

  const { data: anexos = [], refetch, isLoading, error: listError } = useQuery({
    queryKey: ["wizard-anexos", remoteRegistroId, access.scope],
    enabled: !!remoteRegistroId && access.ready,
    queryFn: async () => {
      if (!remoteRegistroId || !access.ready) return [];
      const isCurrent = access.capture();
      const { data, error } = await supabase
        .from("registros_consultor_arquivos")
        .select("*")
        .eq("registro_consultor_id", remoteRegistroId)
        .neq("categoria_arquivo", "checkin")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return isCurrent() ? data ?? [] : [];
    },
  });

  const safeAnexos = useMemo(() => access.ready ? anexos : [], [access.ready, anexos]);
  const paths = useMemo(
    () => safeAnexos.flatMap((a) => a.arquivo_path && profile?.organization_id && remoteRegistroId &&
      isConsultorStoragePath(a.arquivo_path, profile.organization_id, remoteRegistroId) ? [a.arquivo_path] : []),
    [safeAnexos, profile?.organization_id, remoteRegistroId],
  );
  const { urls, error: urlError, refresh: refreshUrls } = useSignedUrls(paths);

  const refreshAttachments = async (id: string) => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ["wizard-anexos-flag", id] }),
      queryClient.invalidateQueries({ queryKey: ["wizard-revisao-counts", id] }),
    ]);
  };

  const handleUpload = async (file: File) => {
    if (mutationLock.current || locked || !isOnline || !access.ready || !user?.id || !remoteRegistroId || !profile?.organization_id) return;
    mutationLock.current = true;
    setUploading(true);
    const isCurrent = access.capture();
    let createdPath: string | null = null;
    let metadataSaved = false;
    try {
      const valid = validateTechnicalAttachment(file);
      const clientUuid = crypto.randomUUID();
      const path = await buildTenantStoragePath(buildRemotePath({
        clientUuid, file, fileName: `${clientUuid}.${valid.extension}`, mimeType: file.type, kind: valid.kind,
      }, remoteRegistroId));
      if (!isCurrent() || !isConsultorStoragePath(path, profile.organization_id, remoteRegistroId)) throw new Error("invalid_scope");
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      createdPath = path;
      if (!isCurrent()) throw new Error("invalid_scope");
      const { data, error: insErr } = await supabase.from("registros_consultor_arquivos").insert({
        registro_consultor_id: remoteRegistroId, arquivo_path: path, nome_arquivo: file.name,
        tipo_arquivo: file.type, tipo_midia: valid.mediaType, categoria_arquivo: "geral",
        client_uuid: clientUuid, uploaded_by: user.id, legenda: legenda.trim() || null,
      }).select("id").single();
      if (insErr || !data) throw insErr || new Error("metadata_not_confirmed");
      metadataSaved = true;
      if (isCurrent()) {
        setLegenda("");
        toast.success("Anexo enviado.");
        await refreshAttachments(remoteRegistroId);
      }
    } catch (err: unknown) {
      let compensationFailed = false;
      if (createdPath && !metadataSaved) {
        // Only this successful upsert:false upload is eligible for compensation.
        try {
          const { error } = await supabase.storage.from(BUCKET).remove([createdPath]);
          compensationFailed = !!error;
        } catch { compensationFailed = true; }
      }
      if (isCurrent()) {
        // Storage transport errors may contain signed URLs; never echo them.
        const validationMessage = !createdPath && err instanceof Error &&
          /^(Selecione|Tipo ou extensão)/.test(err.message) ? err.message : null;
        toast.error(compensationFailed
          ? "Anexo não registrado. Não foi possível limpar o arquivo enviado; solicite revisão antes de reenviar."
          : validationMessage || "Não foi possível enviar o anexo. Tente novamente.");
      }
    } finally {
      mutationLock.current = false;
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (mutationLock.current || !deleteTarget || locked || !isOnline || !access.ready || !remoteRegistroId || !profile?.organization_id) return;
    mutationLock.current = true;
    setDeleting(true);
    setDeleteError(null);
    const isCurrent = access.capture();
    try {
      const path = deleteTarget.arquivo_path;
      if (deleteTarget.registro_consultor_id !== remoteRegistroId || !path || !isConsultorStoragePath(path, profile.organization_id, remoteRegistroId)) throw new Error("invalid_scope");
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
      if (storageError) throw storageError;
      if (!isCurrent()) return;
      const { data, error } = await supabase.from("registros_consultor_arquivos").delete()
        .eq("id", deleteTarget.id).eq("registro_consultor_id", remoteRegistroId).eq("arquivo_path", path).select("id");
      if (error || data?.length !== 1) throw error || new Error("metadata_not_removed");
      if (isCurrent()) {
        toast.success("Anexo removido.");
        setDeleteTarget(null);
        await refreshAttachments(remoteRegistroId);
      }
    } catch {
      if (isCurrent()) setDeleteError("Não foi possível concluir a remoção. O registro do anexo foi preservado; tente novamente.");
    } finally {
      mutationLock.current = false;
      setDeleting(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4" />
        <h3 className="text-sm font-semibold">Anexos da visita</h3>
      </div>

      {locked && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" />Visita em modo leitura.</p>}
      <AlertDialog open={deleteTarget !== null && access.ready && !locked} onOpenChange={(open) => {
        if (!open && !mutationLock.current) { setDeleteTarget(null); setDeleteError(null); }
      }}>
        <AlertDialogContent onEscapeKeyDown={(event) => { if (mutationLock.current) event.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este anexo?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo será removido da visita. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={uploading || deleting || !isOnline} onClick={handleDelete}>{deleting ? "Removendo…" : "Confirmar remoção"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!locked && (!remoteRegistroId ? (
        <div className="flex items-start gap-2 rounded-md bg-muted border border-border p-2 text-xs text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5 mt-0.5" />
          <span>Sincronize a visita antes de adicionar anexos.</span>
        </div>
      ) : !isOnline ? (
        <div className="flex items-start gap-2 rounded-md bg-muted border border-border p-2 text-xs text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5 mt-0.5" />
          <span>Sem conexão — envio de anexos ficará disponível quando voltar online.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="legenda">Legenda (opcional)</Label>
            <Input
              id="legenda"
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              placeholder="Ex.: Detalhe da lesão"
              maxLength={200}
              disabled={uploading || deleting || !access.ready}
            />
          </div>
          <p className="text-xs text-muted-foreground">Fotos JPEG, PNG, WebP ou PDF, até 15MB por arquivo.</p>
          <input
            ref={fileRef}
            type="file"
            accept={TECHNICAL_ATTACHMENT_ACCEPT}
            aria-label="Selecionar foto ou PDF"
            disabled={uploading || deleting || !access.ready}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={uploading || deleting || !access.ready}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Adicionar anexo</>
            )}
          </Button>
        </div>
      ))}
      {urlError && <div role="alert" className="text-sm text-destructive">Não foi possível acessar alguns anexos. <Button variant="link" onClick={refreshUrls}>Tentar novamente</Button></div>}
      {listError && <div role="alert" className="text-sm text-destructive">Não foi possível consultar os anexos. <Button variant="link" onClick={() => refetch()}>Tentar novamente</Button></div>}

      <ul className="space-y-2">
        {isLoading ? <li className="text-sm text-muted-foreground">Carregando anexos…</li> : listError ? null : safeAnexos.length === 0 ? (
          <li className="text-sm text-muted-foreground text-center py-4">
            Nenhum anexo enviado ainda.
          </li>
        ) : (
          safeAnexos.map((a) => {
            const url = a.arquivo_path && paths.includes(a.arquivo_path) ? urls[a.arquivo_path] : null;
            const isImage = a.tipo_midia === "foto";
            return (
              <li key={a.id} className="border rounded-md p-2 flex items-center gap-2">
                <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {isImage && url ? (
                    <img src={url} alt={a.legenda || "anexo"} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{a.nome_arquivo || a.legenda || "Anexo"}</div>
                  {a.legenda && a.nome_arquivo && (
                    <div className="text-xs text-muted-foreground truncate">{a.legenda}</div>
                  )}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline text-primary shrink-0"
                  >
                    Abrir
                  </a>
                )}
                {!locked && <Button
                  size="icon"
                  variant="ghost"
                  disabled={uploading || deleting || !isOnline || !access.ready}
                  onClick={() => { if (!mutationLock.current) { setDeleteTarget(a); setDeleteError(null); } }}
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>}
              </li>
            );
          })
        )}
      </ul>

      <Button className="w-full" size="lg" onClick={onDone} disabled={uploading || deleting}>
        Avançar
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </Card>
  );
}
