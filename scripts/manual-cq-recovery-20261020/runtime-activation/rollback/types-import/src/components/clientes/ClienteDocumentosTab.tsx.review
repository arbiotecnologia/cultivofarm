import { formatDateDisplay } from "@/lib/date-utils";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileIcon, Upload, Trash2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";

type ClienteDocumento = Database["public"]["Tables"]["cliente_documentos"]["Row"];
type DocumentoTipo = Database["public"]["Enums"]["cliente_doc_tipo"];
const TIPOS: { value: DocumentoTipo; label: string }[] = [
  { value: "cnh", label: "CNH" },
  { value: "cartao_cnpj", label: "Cartão CNPJ" },
  { value: "inscricao_produtor", label: "Inscrição de Produtor" },
  { value: "rg", label: "RG" },
  { value: "comprovante_endereco", label: "Comprovante de Endereço" },
  { value: "contrato_social", label: "Contrato Social" },
  { value: "procuracao", label: "Procuração" },
  { value: "car_mapa", label: "CAR / Mapa" },
  { value: "outro", label: "Outro" },
];

const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  clienteId: string;
}

export function ClienteDocumentosTab({ clienteId }: Props) {
  const { profile } = useAuth();
  const access = useStorageAccessScope(`cliente:${clienteId}`);
  const [result, setResult] = useState<{ scope: string; docs: ClienteDocumento[] }>({ scope: "", docs: [] });
  const docs = access.ready && result.scope === access.scope ? result.docs : [];
  // Snapshot da lista exibida: troca de documentos/escopo aborta e revoga bytes.
  const attachmentOpener = useAuthenticatedAttachmentOpener(
    JSON.stringify(["cliente-docs", clienteId, docs.map((d) => [d.id, d.arquivo_path])]),
    "clientes-docs",
  );
  // Contrato de caminho apenas; tenant/papel são decididos pela Storage RLS.
  const locator = (path: unknown) => {
    const org = profile?.organization_id;
    if (typeof path !== "string" || !org || !clienteId) return null;
    const prefix = `${org}/clientes/${clienteId}/`;
    if (!path.startsWith(prefix) || path.split("/").some((part) => !part || part === "." || part === "..")) return null;
    return path;
  };
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<DocumentoTipo | "">("");
  const [descricao, setDescricao] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState<ClienteDocumento | null>(null);
  const [showErrors, setShowShowErrors] = useState(false);
  const mutationLock = useRef(false);

  const fetchDocs = useCallback(async () => {
    if (!clienteId || !access.ready) return;
    const current = access.capture();
    setLoading(true);
    const { data, error } = await supabase
      .from("cliente_documentos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("uploaded_at", { ascending: false });
    if (!current()) return;
    if (error) toast.error("Não foi possível carregar documentos.");
    setResult({ scope: access.scope, docs: data || [] });
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, access.scope]);

  useEffect(() => {
    setResult({ scope: access.scope, docs: [] });
    setConfirmDel(null);
    setFile(null);
    setLoading(false);
    fetchDocs();
  }, [fetchDocs, access.scope]);

  const handleUpload = async () => {
    if (!access.ready || mutationLock.current) return;
    setShowShowErrors(true);
    if (!tipo) return toast.error("Selecione o tipo do documento");
    if (!file) return toast.error("Selecione um arquivo para enviar");
    if (file.size > MAX_BYTES) return toast.error("Arquivo excede o limite de 10 MB");

    mutationLock.current = true;
    const current = access.capture();
    setUploading(true);
    try {
      if (!profile?.organization_id) throw new Error("Contexto da empresa inválido");
      const { data: client, error: clientError } = await supabase.from("clientes").select("id").eq("id", clienteId).filter("organization_id", "eq", profile.organization_id).maybeSingle();
      if (!current() || clientError || !client) throw new Error("cadastro_scope_denied");
      const ext = file.name.split(".").pop() || "bin";
      const path = `${profile.organization_id}/clientes/${clienteId}/${tipo}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      
      const { error: upErr } = await supabase.storage
        .from("clientes-docs")
        .upload(path, file, { contentType: file.type });
      
      if (upErr) throw upErr;
      if (!current()) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!current() || !user) return;
      const { error: dbErr } = await supabase.from("cliente_documentos").insert([
        {
          cliente_id: clienteId,
          nome: file.name,
          tipo,
          descricao: descricao || null,
          arquivo_path: path,
          tamanho_bytes: file.size,
          mime: file.type,
          uploaded_by: user?.id,
        },
      ]);
      
      if (dbErr) {
        // Rollback storage if DB fails
        await supabase.storage.from("clientes-docs").remove([path]);
        throw dbErr;
      }
      if (!current()) return;

      toast.success("Documento enviado com sucesso!");
      setFile(null);
      setDescricao("");
      setTipo("");
      setShowShowErrors(false);
      const input = document.getElementById("doc-file") as HTMLInputElement | null;
      if (input) input.value = "";
      fetchDocs();
    } catch {
      if (current()) toast.error("Não foi possível enviar o documento. Confira a sessão e tente novamente.");
    } finally {
      mutationLock.current = false;
      setUploading(false);
    }
  };

  const erroDocumento = () => toast.error("Documento indisponível no momento. Tente novamente.");
  const handlePrepare = (doc: ClienteDocumento) => {
    if (!access.ready || !attachmentOpener.ready) return;
    const path = locator(doc.arquivo_path);
    if (!path) { erroDocumento(); return; }
    void attachmentOpener.open(path, erroDocumento);
  };
  // Só por clique explícito, depois do preparo.
  const handleDownload = (doc: ClienteDocumento) => {
    const path = locator(doc.arquivo_path);
    if (path) attachmentOpener.download(path, doc.nome || "documento");
  };

  const handleDelete = async (doc: ClienteDocumento) => {
    if (!access.ready || mutationLock.current || !docs.some(d => d.id === doc.id)) return;
    mutationLock.current = true;
    const current = access.capture();
    try {
      const { error: storageError } = await supabase.storage.from("clientes-docs").remove([doc.arquivo_path]);
      if (storageError) throw storageError;
      if (!current()) return;
      const { error } = await supabase
        .from("cliente_documentos")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
      if (!current()) return;
      toast.success("Documento removido");
      setConfirmDel(null);
      fetchDocs();
    } catch {
      if (current()) toast.error("Não foi possível remover o documento.");
    } finally { mutationLock.current = false; }
  };

  const grupos = docs.reduce<Record<string, ClienteDocumento[]>>((acc, d) => {
    const k = d.tipo || "outro";
    (acc[k] ||= []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-6 pt-4">
      <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
        <h3 className="text-sm font-semibold">Enviar novo documento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => { const selected = TIPOS.find(t => t.value === v); if (!selected) return; setTipo(selected.value); setShowShowErrors(false); }}>
              <SelectTrigger className={!tipo && showErrors ? "border-destructive ring-destructive/20" : ""}>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: emitido em 2024"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label>Arquivo (PDF, JPG, PNG — até 10 MB)</Label>
            <Input
              id="doc-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
              className={!file && showErrors ? "border-destructive ring-destructive/20" : ""}
              onChange={(e) => {
                const selectedFile = e.target.files?.[0] || null;
                setFile(selectedFile);
                if (selectedFile) setShowShowErrors(false);
              }}
            />
          </div>
          <Button type="button" onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Enviar
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Documentos anexados {docs.length > 0 && `(${docs.length})`}
          </h3>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {!loading && docs.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
            Nenhum documento anexado ainda.
          </p>
        )}

        {Object.entries(grupos).map(([tipoKey, arr]) => (
          <div key={tipoKey} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{TIPO_LABEL[tipoKey] || tipoKey}</Badge>
              <span className="text-xs text-muted-foreground">{arr.length} arquivo(s)</span>
            </div>
            <div className="space-y-2">
              {arr.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileIcon className="h-5 w-5 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {((doc.tamanho_bytes || 0) / 1024 / 1024).toFixed(2)} MB
                        {doc.uploaded_at &&
                          ` · ${formatDateDisplay(doc.uploaded_at)}`}
                        {doc.descricao && ` · ${doc.descricao}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {(() => {
                      const path = locator(doc.arquivo_path);
                      const ready = !!path && !!attachmentOpener.urls[path];
                      const busy = !!path && attachmentOpener.loadingPaths.includes(path);
                      return ready ? (
                        <Button type="button" variant="ghost" size="sm" aria-label={`Baixar ${doc.nome}`} onClick={() => handleDownload(doc)}>
                          <Download className="h-4 w-4 mr-1" /> Baixar
                        </Button>
                      ) : (
                        <Button type="button" variant="ghost" size="sm" aria-label={`Preparar ${doc.nome}`} disabled={busy} onClick={() => handlePrepare(doc)}>
                          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileIcon className="h-4 w-4 mr-1" />} Preparar
                        </Button>
                      );
                    })()}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => setConfirmDel(doc)}
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente o arquivo "{confirmDel?.nome}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDel && handleDelete(confirmDel)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
