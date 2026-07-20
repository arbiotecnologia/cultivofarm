import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Upload, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CameraCaptureDialog } from "./CameraCaptureDialog";

const isMobileDevice = () =>
  typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export interface PendingEvidencia {
  id: string;
  file: File;
  previewUrl: string;
  legenda: string;
  tipo: "foto" | "documento" | "video" | "audio";
}

interface Props {
  clienteId: string;
  pending: PendingEvidencia[];
  onChange: (items: PendingEvidencia[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

const detectTipo = (file: File): PendingEvidencia["tipo"] => {
  if (file.type.startsWith("image/")) return "foto";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "documento";
};

export function EvidenciasUploader({ pending, onChange, maxFiles = 20, maxSizeMB = 10 }: Props) {
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
      if (f.size > maxSizeMB * 1024 * 1024) {
        toast.error(`${f.name}: maior que ${maxSizeMB}MB`);
        continue;
      }
      incoming.push({
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        legenda: "",
        tipo: detectTipo(f),
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
          {pending.length}/{maxFiles} · máx {maxSizeMB}MB cada
        </span>
      </div>
      <input ref={inputRef} type="file" multiple accept="image/*,application/pdf,video/*,audio/*" className="hidden"
        onChange={(e) => { handleAdd(e.target.files); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
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

/** Faz upload das evidências para o bucket e registra na tabela */
export async function uploadEvidencias(
  pending: PendingEvidencia[],
  aplicacaoId: string,
  clienteId: string,
  userId?: string
) {
  if (!pending.length) return;
  const rows: any[] = [];
  for (const item of pending) {
    const ext = item.file.name.split(".").pop()?.toLowerCase() || "bin";
    const safeName = `${crypto.randomUUID()}.${ext}`;
    const path = `${clienteId}/${aplicacaoId}/${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("aplicacao-evidencias")
      .upload(path, item.file, { contentType: item.file.type, upsert: false });
    if (upErr) throw upErr;
    const { data: signed } = await supabase.storage
      .from("aplicacao-evidencias")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    rows.push({
      tipo: item.tipo,
      url: signed?.signedUrl || null,
      storage_path: path,
      legenda: item.legenda || null,
      mime: item.file.type,
      tamanho_bytes: item.file.size,
      created_by: userId || null,
      // Se for novo upload em uma aplicação, a origem é a própria aplicação
      versao_origem_id: aplicacaoId
    });
  }
  
  const { data: inserted, error } = await supabase.from("aplicacao_evidencias").insert(rows).select("id");
  if (error) throw error;

  if (inserted && inserted.length > 0) {
    const vinculos = inserted.map(ev => ({
      aplicacao_id: aplicacaoId,
      evidencia_id: ev.id
    }));
    await supabase.from("aplicacao_evidencias_vinculos").insert(vinculos);
  }
}
