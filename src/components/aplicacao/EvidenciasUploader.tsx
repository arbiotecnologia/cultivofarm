import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { CameraCaptureDialog } from "./CameraCaptureDialog";
import {
  ACCEPT_EVIDENCIAS,
  MAX_EVIDENCIA_MB,
  caminhoEvidencia,
  tipoEvidencia,
  validarArquivoEvidencia,
} from "@/lib/aplicacoes/evidencias";

const isMobileDevice = () =>
  typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export interface PendingEvidencia {
  id: string;
  file: File;
  previewUrl: string;
  legenda: string;
  tipo: "foto" | "documento" | "video" | "audio";
}

/** Metadados devolvidos pelo upload; persistidos apenas pela RPC transacional. */
export interface EvidenciaEnviada {
  tipo: PendingEvidencia["tipo"];
  storage_path: string;
  legenda: string | null;
  mime: string;
  tamanho_bytes: number;
}

interface Props {
  clienteId: string;
  pending: PendingEvidencia[];
  onChange: (items: PendingEvidencia[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

export function EvidenciasUploader({ pending, onChange, maxFiles = 20 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleAdd = (files: FileList | null) => {
    if (!files?.length) return;
    const incoming: PendingEvidencia[] = [];
    for (const f of Array.from(files)) {
      if (pending.length + incoming.length >= maxFiles) {
        toast.error(`Máximo de ${maxFiles} arquivos`);
        break;
      }
      const erro = validarArquivoEvidencia(f);
      if (erro) {
        toast.error(erro);
        continue;
      }
      incoming.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        legenda: "",
        tipo: tipoEvidencia(f.type),
      });
    }
    onChange([...pending, ...incoming]);
  };

  const remove = (id: string) => {
    const item = pending.find((p) => p.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    onChange(pending.filter((p) => p.id !== id));
  };

  const updateLegenda = (id: string, legenda: string) => {
    onChange(pending.map((p) => (p.id === id ? { ...p, legenda } : p)));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4 mr-2" />Arquivos
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (isMobileDevice()) cameraRef.current?.click();
            else setCameraOpen(true);
          }}
        >
          <Camera className="h-4 w-4 mr-2" />Câmera
        </Button>
        <span className="text-xs text-muted-foreground self-center">
          {pending.length}/{maxFiles} · máx {MAX_EVIDENCIA_MB}MB cada
        </span>
      </div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT_EVIDENCIAS} className="hidden"
        aria-label="Selecionar arquivos de evidência"
        onChange={(e) => { handleAdd(e.target.files); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif" capture="environment" className="hidden"
        aria-label="Capturar foto de evidência"
        onChange={(e) => { handleAdd(e.target.files); e.target.value = ""; }} />

      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={(file) => {
          const dt = new DataTransfer();
          dt.items.add(file);
          handleAdd(dt.files);
        }}
      />

      {pending.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {pending.map((p) => (
            <div key={p.id} className="border rounded-lg p-2 space-y-2 bg-card">
              <div className="relative aspect-video rounded overflow-hidden bg-muted flex items-center justify-center">
                {p.tipo === "foto" ? (
                  <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <FileText className="h-8 w-8 text-muted-foreground" />
                )}
                <button type="button" onClick={() => remove(p.id)}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <Input
                value={p.legenda}
                onChange={(e) => updateLegenda(p.id, e.target.value)}
                placeholder="Legenda (opcional)"
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground truncate">{p.file.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Remoção segura dos objetos enviados numa tentativa que falhou.
 * Nunca lança: a limpeza é compensatória e não pode mascarar o erro original.
 */
export async function limparObjetosEvidencias(paths: string[]): Promise<void> {
  const alvos = paths.filter((p) => typeof p === "string" && p.length > 0);
  if (!alvos.length) return;
  try {
    await supabase.storage.from("aplicacao-evidencias").remove(alvos);
  } catch {
    /* silencioso: a falha original já é reportada ao usuário */
  }
}

/**
 * Sobe apenas os objetos para `cliente_id/aplicacao_id/uuid.ext` e devolve os
 * metadados. Nenhuma URL assinada é gerada ou persistida; nenhum registro é
 * gravado aqui — a persistência é feita por rpc_salvar_aplicacao_v1.
 * Em qualquer falha, todos os objetos desta tentativa são removidos.
 */
export async function uploadEvidencias(
  pending: PendingEvidencia[],
  aplicacaoId: string,
  clienteId: string,
): Promise<EvidenciaEnviada[]> {
  if (!pending.length) return [];
  const enviados: string[] = [];
  const metadados: EvidenciaEnviada[] = [];
  try {
    for (const item of pending) {
      const erro = validarArquivoEvidencia(item.file);
      if (erro) throw new Error(erro);
      const path = caminhoEvidencia(clienteId, aplicacaoId, crypto.randomUUID(), item.file.type);
      const { error: upErr } = await supabase.storage
        .from("aplicacao-evidencias")
        .upload(path, item.file, { contentType: item.file.type, upsert: false });
      if (upErr) throw upErr;
      enviados.push(path);
      metadados.push({
        tipo: item.tipo,
        storage_path: path,
        legenda: item.legenda || null,
        mime: item.file.type,
        tamanho_bytes: item.file.size,
      });
    }
    return metadados;
  } catch (e) {
    await limparObjetosEvidencias(enviados);
    throw e;
  }
}
