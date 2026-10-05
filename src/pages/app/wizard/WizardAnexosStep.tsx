import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildTenantStoragePath } from "@/lib/tenantStoragePath";
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

const MAX_MB = 15;

export default function WizardAnexosStep({ remoteRegistroId, locked, onDone }: Props) {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [legenda, setLegenda] = useState("");

  const { data: anexos = [], refetch } = useQuery({
    queryKey: ["wizard-anexos", remoteRegistroId],
    enabled: !!remoteRegistroId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registros_consultor_arquivos")
        .select("*")
        .eq("registro_consultor_id", remoteRegistroId!)
        .neq("categoria_arquivo", "checkin")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const paths = useMemo(
    () => anexos.map((a: any) => a.arquivo_path).filter(Boolean) as string[],
    [anexos],
  );
  const { urls } = useSignedUrls(paths);

  const handleUpload = async (file: File) => {
    if (!user?.id || !remoteRegistroId) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo excede ${MAX_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const clientUuid = crypto.randomUUID();
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = await buildTenantStoragePath(`anexos/${user.id}/${remoteRegistroId}/${clientUuid}.${ext}`);
      const { error: upErr } = await supabase.storage
        .from("consultor-arquivos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const { error: insErr } = await supabase.from("registros_consultor_arquivos").insert({
        registro_consultor_id: remoteRegistroId,
        arquivo_path: path,
        nome_arquivo: file.name,
        tipo_arquivo: file.type,
        tipo_midia: (isImage ? "foto" : isVideo ? "video" : "documento") as any,
        categoria_arquivo: "anexo" as any,
        client_uuid: clientUuid,
        uploaded_by: user.id,
        legenda: legenda.trim() || null,
      } as any);
      if (insErr) throw insErr;

      setLegenda("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Anexo enviado.");
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["wizard-anexos-flag", remoteRegistroId] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao enviar anexo");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (row: any) => {
    if (!confirm("Remover este anexo?")) return;
    try {
      if (row.arquivo_path) {
        await supabase.storage.from("consultor-arquivos").remove([row.arquivo_path]);
      }
      const { error } = await supabase
        .from("registros_consultor_arquivos")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Anexo removido.");
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao remover");
    }
  };

  if (locked) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span className="text-sm">Visita finalizada — Etapa Anexos em modo leitura.</span>
        </div>
        <ul className="space-y-2 text-sm">
          {anexos.length === 0 && (
            <li className="text-muted-foreground">Nenhum anexo.</li>
          )}
          {anexos.map((a: any) => (
            <li key={a.id} className="flex items-center gap-2 border-l-2 pl-2">
              {a.tipo_midia === "foto" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              <span className="text-sm truncate">{a.nome_arquivo || a.legenda || "Anexo"}</span>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4" />
        <h3 className="text-sm font-semibold">Anexos da visita</h3>
      </div>

      {!remoteRegistroId ? (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <WifiOff className="h-3.5 w-3.5 mt-0.5" />
          <span>Sincronize a visita antes de adicionar anexos.</span>
        </div>
      ) : !isOnline ? (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
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
              disabled={uploading}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Adicionar anexo</>
            )}
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {anexos.length === 0 ? (
          <li className="text-sm text-muted-foreground text-center py-4">
            Nenhum anexo enviado ainda.
          </li>
        ) : (
          anexos.map((a: any) => {
            const url = a.arquivo_path ? urls[a.arquivo_path] : null;
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
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(a)}
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            );
          })
        )}
      </ul>

      <Button className="w-full" size="lg" onClick={onDone}>
        Avançar
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </Card>
  );
}
