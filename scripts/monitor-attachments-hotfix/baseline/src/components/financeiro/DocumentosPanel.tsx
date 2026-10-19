import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Download, Trash2, Upload } from "lucide-react";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { financialDocumentStoragePath, supportsFinancialDocumentOwner } from "@/lib/financeiro/documentStoragePath";

export type DocOwnerType =
  | "RECEIVABLE" | "PAYABLE" | "DELIVERY"
  | "FISCAL_INVOICE" | "PAYMENT_RECEIVABLE" | "PAYMENT_PAYABLE";

const DOC_TYPES = [
  { v: "INVOICE", l: "Nota fiscal" },
  { v: "RECEIPT", l: "Comprovante" },
  { v: "BOLETO", l: "Boleto" },
  { v: "CONTRACT", l: "Contrato" },
  { v: "XML", l: "XML" },
  { v: "DANFE", l: "DANFE" },
  { v: "OTHER", l: "Outro" },
];

interface Props {
  ownerType: DocOwnerType;
  ownerId: string | null | undefined;
  defaultType?: string;
  canDelete?: boolean;
  compact?: boolean;
  /** Chamado após anexar ou remover, para invalidar consultas agregadas. */
  onChanged?: () => void;
}

export function DocumentosPanel({ ownerType, ownerId, defaultType = "RECEIPT", canDelete = false, compact, onChanged }: Props) {
  const { user, role } = useAuth();
  const access = useStorageAccessScope(`financial:${ownerType}:${ownerId}`);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState(defaultType);
  const supportedOwner = supportsFinancialDocumentOwner(ownerType, ownerId);
  const assertCurrent = (current: () => boolean) => {
    if (!current()) throw new Error("Acesso ao documento expirou. Revalide a sessão.");
  };

  const { data: scopedDocs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["fin-docs", ownerType, ownerId, access.scope],
    enabled: access.ready && !!ownerId,
    queryFn: async () => {
      if (!ownerId) return [];
      const current = access.capture();
      const { data, error } = await supabase
        .from("financial_documents")
        .select("*")
        .eq("owner_type", ownerType)
        .eq("owner_id", ownerId)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return current() ? data : [];
    },
  });
  const docs = access.ready ? scopedDocs : [];

  const upload = useMutation({
    mutationFn: async ({ file, current, documentType }: { file: File; current: () => boolean; documentType: string }) => {
      assertCurrent(current);
      if (!user || !ownerId) throw new Error("Contexto da empresa inválido");
      const path = financialDocumentStoragePath(ownerType, ownerId, file.name);
      const { error: upErr } = await supabase.storage.from("financial-docs").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      // An uploaded object may remain orphaned if the fence/metadata fails.
      // Never attempt destructive cleanup under a revoked/replaced session.
      assertCurrent(current);
      const { error: insErr } = await supabase.from("financial_documents").insert({
        owner_type: ownerType as any,
        owner_id: ownerId as any,
        document_type: documentType as any,
        file_name: file.name as any,
        storage_path: path as any,
        mime_type: file.type as any,
        file_size: file.size as any,
        uploaded_by: user.id as any,
      } as any);
      if (insErr) throw insErr;
      assertCurrent(current);
      return current;
    },
    onSuccess: (current) => {
      if (!current()) return;
      toast.success("Documento anexado");
      if (!current()) return;
      qc.invalidateQueries({ queryKey: ["fin-docs", ownerType, ownerId, access.scope] });
      if (current()) onChanged?.();
    },
    onError: (e: Error, { current }) => { if (current()) toast.error(e.message); },
  });

  const remove = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: () => boolean }) => {
      assertCurrent(current);
      if (!user || !supportedOwner) throw new Error("Sessão ou origem inválida");
      const rpc = supabase.rpc as unknown as (
        fn: "rpc_financial_document_soft_delete",
        args: { p_document_id: string; p_reason: string },
      ) => Promise<{ error: { message: string } | null }>;
      const { error } = await rpc("rpc_financial_document_soft_delete", {
        p_document_id: id,
        p_reason: "Removido pelo usuário",
      });
      if (error) throw error;
      assertCurrent(current);
      return current;
    },
    onSuccess: (current) => {
      if (!current()) return;
      toast.success("Documento removido");
      if (!current()) return;
      qc.invalidateQueries({ queryKey: ["fin-docs", ownerType, ownerId, access.scope] });
      if (current()) onChanged?.();
    },
    onError: (e: Error, { current }) => { if (current()) toast.error(e.message); },
  });

  const download = async (doc: any) => {
    if (!access.ready) return;
    const current = access.capture();
    const { data, error } = await supabase.storage.from("financial-docs").createSignedUrl(doc.storage_path, 60 * 5);
    if (!current()) return;
    if (error || !data) { toast.error("Falha ao baixar"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const isStaff = role === "administrador" || role === "gestor" || role === "administrativo" || role === "financeiro";
  const canDeleteFinal = canDelete && (role === "administrador" || role === "gestor");
  const podeArquivo = role === "administrador" || role === "gestor" || role === "financeiro";

  return (
    <div className="space-y-2">
      {isStaff && ownerId && podeArquivo && (
        <div className={`flex gap-2 items-end ${compact ? "" : "border rounded-md p-3 bg-muted/30"}`}>
          <div className="flex-1 min-w-0">
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={setType} disabled={!access.ready || !supportedOwner || upload.isPending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <input ref={fileRef} type="file" className="hidden" disabled={!access.ready || !supportedOwner || upload.isPending} onChange={(e) => {
            const f = e.target.files?.[0];
            const current = access.capture();
            if (f && current() && supportedOwner) upload.mutate({ file: f, current, documentType: type });
            if (fileRef.current) fileRef.current.value = "";
          }} />
          <Button type="button" variant="outline" onClick={() => { if (access.ready) fileRef.current?.click(); }} disabled={!access.ready || !supportedOwner || upload.isPending}>
            <Upload className="h-4 w-4 mr-1" />Anexar
          </Button>
        </div>
      )}
      <div className="space-y-1">
        {isError ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <span>Não foi possível carregar os documentos.</span>
            <Button size="sm" variant="outline" disabled={!access.ready} onClick={() => { if (access.ready) refetch(); }}>Tentar novamente</Button>
          </div>
        ) : isLoading ? (
          <p className="text-xs text-muted-foreground italic">Carregando documentos…</p>
        ) : docs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum documento anexado.</p>
        ) : docs.map((d: any) => (
          <div key={d.id} className="flex items-center justify-between gap-2 border rounded p-2 text-sm">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="truncate">{d.file_name}</div>
                <div className="text-xs text-muted-foreground">{DOC_TYPES.find(t => t.v === d.document_type)?.l || d.document_type}</div>
              </div>
            </div>
            <div className="flex gap-1">
              {podeArquivo && (
                <Button size="sm" variant="ghost" disabled={!access.ready} onClick={() => download(d)} aria-label="Baixar documento"><Download className="h-3 w-3" /></Button>
              )}
              {canDeleteFinal && (
                <Button size="sm" variant="ghost" disabled={!access.ready || !supportedOwner || remove.isPending} onClick={() => {
                  const current = access.capture();
                  if (current() && supportedOwner) remove.mutate({ id: d.id, current });
                }} aria-label="Remover documento" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
