import { useRef, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Camera, Mic, Paperclip, StickyNote, Star, Trash2, Image as ImageIcon, FileText,
  Settings2, MapPin, ExternalLink, AlertTriangle, Undo2
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { buildTenantStoragePath } from "@/lib/tenantStoragePath";

import { useAuth } from "@/hooks/useAuth";
import { AudioRecorder } from "@/components/visita/AudioRecorder";
import { UploadQueuePanel } from "@/components/visita/UploadQueuePanel";
import { useMediaUploadQueue } from "@/hooks/useMediaUploadQueue";
import { AttachmentPager } from "@/components/shared/AttachmentPager";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { NotasRapidas, type QuickNote } from "@/components/visita/NotasRapidas";
import { CameraDialog } from "@/components/visita/CameraDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


function LegendaInput({
  id,
  initialValue,
  onSave,
  placeholder,
  className,
  disabled,
}: {
  id: string;
  initialValue: string;
  onSave: (val: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setValue(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, initialValue]);

  const commit = () => {
    if (value !== initialValue) onSave(value);
  };

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; commit(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  );
}


const FOTO_CATEGORIAS = [
  "sintoma_foliar", "praga", "doenca", "planta_daninha",
  "nematoide", "solo", "raiz", "panorama_area", "equipamento", "checkin", "outro",
] as const;

const ANEXO_CATEGORIAS = [
  { value: "laudo", label: "Laudo" },
  { value: "documento_cliente", label: "Documento do cliente" },
  { value: "recomendacao_anexa", label: "Recomendação anexa" },
];

interface ArquivoRow {
  id: string;
  arquivo_url: string;
  arquivo_path: string | null;
  tipo_midia: string | null;
  tipo_arquivo: string | null;
  categoria_arquivo: string | null;
  legenda: string | null;
  duracao_segundos: number | null;
  foto_principal: boolean | null;
  capturado_em: string | null;
  latitude: number | null;
  longitude: number | null;
  uploaded_at: string;
}

interface EvidenciasTabsProps {
  registroId: string;
  arquivos: ArquivoRow[];
  notes: QuickNote[];
  onNotesChange: (notes: QuickNote[]) => void;
  disabled?: boolean;
}

export function EvidenciasTabs({
  registroId,
  arquivos,
  notes,
  onNotesChange,
  disabled,
}: EvidenciasTabsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queue = useMediaUploadQueue();

  const filePaths = arquivos.map(a => a.arquivo_path).filter(Boolean);
  const { urls: signedUrls, pagination: attachmentPage } = useSignedUrls(filePaths);

  const getEffectiveUrl = (arquivo: ArquivoRow) => {
    // Somente blob autenticado; arquivo_url gravada nunca é usada como fallback.
    return (arquivo.arquivo_path && signedUrls[arquivo.arquivo_path]) || null;
  };
  const fotoInput = useRef<HTMLInputElement>(null);
  const anexoInput = useRef<HTMLInputElement>(null);



  const [anexoCategoria, setAnexoCategoria] = useState("laudo");
  const [anexoLegenda, setAnexoLegenda] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [showCameraDialog, setShowCameraDialog] = useState(false);

  // Padrão: HD. Usuário pode habilitar compressão para economizar dados (3G/4G).
  const [compressMode, setCompressMode] = useState(() => {
    return localStorage.getItem("media-quality-pref") === "standard";
  });
  const qualityHD = !compressMode;

  const toggleCompress = (val: boolean) => {
    setCompressMode(val);
    localStorage.setItem("media-quality-pref", val ? "standard" : "hd");
  };


  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["visita-arquivos", registroId] });

  // Re-fetch a lista quando uploads concluem (a fila é assíncrona, então o
  // refresh logo após enqueue acontece antes do insert no banco).
  const doneCountRef = useRef(0);
  useEffect(() => {
    const done = queue.items.filter((i) => i.status === "done").length;
    if (done !== doneCountRef.current) {
      doneCountRef.current = done;
      if (done > 0) refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.items]);


  const fotos = arquivos.filter(
    (a) => a.tipo_midia === "foto" || (!a.tipo_midia && a.tipo_arquivo?.startsWith("image"))
  );
  const audios = arquivos.filter(
    (a) => a.tipo_midia === "audio" || a.tipo_arquivo?.startsWith("audio")
  );
  const anexos = arquivos.filter((a) =>
    ["laudo", "documento_cliente", "recomendacao_anexa"].includes(a.categoria_arquivo || "")
  );

  const openMaps = (lat: number, lng: number) => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS 
      ? `maps://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}`
      : `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(url, "_blank");
  };

  const handleFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    let lat: number | null = null;
    let lng: number | null = null;

    try {
      // Tenta obter geolocalização
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      }).catch(() => null);

      if (pos) {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }

      await queue.enqueue(files, { 
        registroId, 
        kind: "foto", 
        categoria: "geral",
        quality: qualityHD ? 'hd' : 'standard',
        latitude: lat,
        longitude: lng
      });
      refresh();
      e.target.value = "";
    } catch (err: any) {
      toast.error(err.message || "Falha no upload");
    }
  };

  const handleCapture = async (blob: Blob) => {
    let lat: number | null = null;
    let lng: number | null = null;

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      }).catch(() => null);

      if (pos) {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }

      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
      await queue.enqueue([file], {
        registroId,
        kind: "foto",
        categoria: "geral",
        quality: qualityHD ? 'hd' : 'standard',
        latitude: lat,
        longitude: lng
      });
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Falha no upload da captura");
    }
  };


  const handleAnexos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    let lat: number | null = null;
    let lng: number | null = null;

    try {
      // Tenta obter geolocalização se não for desativado
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      }).catch(() => null);

      if (pos) {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }

      await queue.enqueue(files, {
        registroId,
        categoria: anexoCategoria,
        legenda: anexoLegenda || null,
        quality: qualityHD ? 'hd' : 'standard',
        latitude: lat,
        longitude: lng
      });
      setAnexoLegenda("");
      refresh();
      e.target.value = "";
    } catch (err: any) {
      toast.error(err.message || "Falha no upload");
    }
  };

  const handleAudio = async (blob: Blob, duration: number) => {
    if (!user) return;
    try {
      const clientUuid = crypto.randomUUID();
      const fileName = `audio_${Date.now()}.webm`;
      // Path determinístico para áudio: {registroId}/audio/{clientUuid}.webm
      const path = await buildTenantStoragePath(`${registroId}/audio/${clientUuid}.webm`);
      
      const { error: upErr } = await supabase.storage
        .from("consultor-arquivos")
        .upload(path, blob, { 
          contentType: "audio/webm",
          upsert: true 
        });
      
      if (upErr) throw upErr;
      
      const { error } = await (supabase as any).from("registros_consultor_arquivos").insert({
        registro_consultor_id: registroId,
        arquivo_path: path,
        arquivo_url: null, // Legado
        tipo_arquivo: "audio/webm",
        tipo_midia: "audio",
        categoria_arquivo: "geral",
        duracao_segundos: duration,
        uploaded_by: user.id,
        client_uuid: clientUuid,
        capturado_em: new Date().toISOString(),
      } as any);
      
      if (error) throw error;
      toast.success("Áudio salvo");
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Falha ao salvar áudio");
    }
  };

  const updateArquivo = async (id: string, patch: Partial<ArquivoRow>) => {
    const { error } = await (supabase as any)
      .from("registros_consultor_arquivos")
      .update(patch as any)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const removeArquivo = async (id: string) => {
    // Primeiro pegamos os dados do arquivo para permitir o "Desfazer"
    const { data: arquivoParaRemover, error: fetchError } = await (supabase as any)
      .from("registros_consultor_arquivos")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !arquivoParaRemover) {
      toast.error("Não foi possível localizar o arquivo para exclusão");
      return;
    }

    const { error } = await (supabase as any)
      .from("registros_consultor_arquivos")
      .delete()
      .eq("id", id);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    refresh();

    // Mostrar toast com opção de Desfazer e contador regressivo
    let secondsLeft = 5;
    
    const undoAction = {
      label: "Desfazer",
      onClick: async () => {
        clearInterval(interval);
        // Removemos campos gerados automaticamente para o insert
        // Usamos 'as any' para evitar erros de tipagem com campos que podem não estar na interface local
        const { id: _, uploaded_at: __, ...rest } = arquivoParaRemover as any;
        const { error: undoError } = await (supabase as any)
          .from("registros_consultor_arquivos")
          .insert(rest);
        
        if (undoError) {
          toast.error("Erro ao restaurar item: " + undoError.message);
        } else {
          toast.success("Item restaurado com sucesso");
          refresh();
        }
      }
    };

    const toastId = toast.success("Item removido", {
      description: `Desfazer disponível por ${secondsLeft}s`,
      action: undoAction,
      duration: 5000,
    });

    const interval = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        return;
      }
      
      // Atualiza o mesmo toast usando o ID
      toast.success("Item removido", {
        id: toastId,
        description: `Desfazer disponível por ${secondsLeft}s`,
        action: undoAction,
        duration: 5000,
      });
    }, 1000);
  };

  const setPrincipal = async (id: string) => {
    // Limpa principal anterior, marca esta
    await (supabase as any)
      .from("registros_consultor_arquivos")
      .update({ foto_principal: false } as any)
      .eq("registro_consultor_id", registroId);
    await updateArquivo(id, { foto_principal: true });
  };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-3">
        <AttachmentPager pagination={attachmentPage} />
        <UploadQueuePanel
          progress={queue.progress}
          items={queue.items}
          isPaused={queue.isPaused}
          onRetryFailed={() => queue.retryFailed(registroId)}
          onClearFinished={queue.clearFinished}
          onTogglePause={() => queue.togglePause(registroId)}
          onCancelItem={queue.cancelItem}
          onCancelAll={queue.cancelAllPending}
        />

        <Tabs defaultValue="fotos">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="fotos" className="text-xs gap-1">
              <Camera className="h-3.5 w-3.5" /> Fotos
              <Badge variant="outline" className="ml-1 text-[10px]">{fotos.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="audios" className="text-xs gap-1">
              <Mic className="h-3.5 w-3.5" /> Áudios
              <Badge variant="outline" className="ml-1 text-[10px]">{audios.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="anexos" className="text-xs gap-1">
              <Paperclip className="h-3.5 w-3.5" /> Anexos
              <Badge variant="outline" className="ml-1 text-[10px]">{anexos.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="notas" className="text-xs gap-1">
              <StickyNote className="h-3.5 w-3.5" /> Notas
              <Badge variant="outline" className="ml-1 text-[10px]">{notes.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* FOTOS */}
          <TabsContent value="fotos" className="space-y-3 mt-3">
            {/* Toggle compressão (padrão: HD ligado) */}
            <TooltipProvider>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Settings2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Label htmlFor="compress-toggle" className="text-xs cursor-pointer">
                    Comprimir foto
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] bg-muted text-muted-foreground rounded-full w-4 h-4 inline-flex items-center justify-center cursor-help shrink-0">?</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-[11px]">
                        <strong>Desligado (padrão):</strong> HD até 4K, ~5 MB por foto.<br />
                        <strong>Ligado:</strong> Full HD, ~1 MB (recomendado para 3G/4G).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  id="compress-toggle"
                  checked={compressMode}
                  onCheckedChange={toggleCompress}
                  disabled={disabled}
                />
              </div>
            </TooltipProvider>


            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setShowCameraDialog(true)}
                disabled={disabled}
                size="sm"
              >
                <Camera className="h-4 w-4 mr-1.5" /> Tirar foto
              </Button>
              <Button
                onClick={() => fotoInput.current?.click()}
                disabled={disabled}
                size="sm"
                variant="outline"
              >
                <ImageIcon className="h-4 w-4 mr-1.5" /> Adicionar da galeria
              </Button>
              <input
                ref={fotoInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFotos}
              />
            </div>


            <CameraDialog 
              open={showCameraDialog} 
              onOpenChange={setShowCameraDialog}
              onCapture={handleCapture}
            />


            {fotos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma foto adicionada ainda.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {fotos.map((f) => (
                  <div key={f.id} className="rounded-lg overflow-hidden border bg-card flex flex-col">
                    <div className="relative aspect-square bg-muted">
                      <img
                        src={getEffectiveUrl(f)}
                        alt={f.legenda || "Foto"}
                        className="w-full h-full object-cover cursor-zoom-in"
                        onClick={() => setZoom(getEffectiveUrl(f))}
                      />
                      {f.foto_principal && (
                        <Badge className="absolute top-1 left-1 text-[9px] gap-0.5">
                          <Star className="h-2.5 w-2.5 fill-current" /> Principal
                        </Badge>
                      )}
                      {typeof f.latitude === 'number' && typeof f.longitude === 'number' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openMaps(f.latitude!, f.longitude!);
                          }}
                          className="absolute top-1 right-1 flex items-center bg-background/90 hover:bg-background text-[8px] h-5 px-1.5 rounded-full border shadow-sm transition-colors"
                          title="Ver no mapa"
                        >
                          <MapPin className="h-2.5 w-2.5 mr-0.5 text-primary" />
                          <span className="font-medium">Mapa</span>
                        </button>
                      )}
                    </div>
                    <div className="p-1.5 space-y-1.5 border-t">
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant={f.foto_principal ? "default" : "outline"}
                          className="h-7 w-7 shrink-0"
                          onClick={() => setPrincipal(f.id)}
                          title="Marcar como principal"
                          disabled={disabled}
                        >
                          <Star className={`h-3.5 w-3.5 ${f.foto_principal ? "fill-current" : ""}`} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive hover:text-destructive-foreground ml-auto"
                              title="Excluir foto"
                              disabled={disabled}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5" />
                                Confirmar exclusão
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir esta foto? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeArquivo(f.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <LegendaInput
                        id={f.id}
                        initialValue={f.legenda || ""}
                        onSave={(val) => updateArquivo(f.id, { legenda: val })}
                        placeholder="Adicionar legenda"
                        className="h-7 text-[11px]"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ÁUDIOS */}
          <TabsContent value="audios" className="space-y-3 mt-3">
            {!disabled && <AudioRecorder onRecorded={handleAudio} />}
            {audios.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum áudio gravado.</p>
            ) : (
              <ul className="space-y-2">
                {audios.map((a) => (
                  <li key={a.id} className="rounded-lg border bg-card p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <LegendaInput
                        id={a.id}
                        initialValue={a.legenda || ""}
                        onSave={(val) => updateArquivo(a.id, { legenda: val })}
                        placeholder="Título do áudio"
                        className="h-7 text-xs flex-1"
                        disabled={disabled}
                      />
                      {!disabled && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5" />
                                Confirmar exclusão
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir este áudio? Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeArquivo(a.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                    <audio src={getEffectiveUrl(a)} controls className="w-full" />
                    {a.duracao_segundos != null && (
                      <p className="text-[10px] text-muted-foreground">{a.duracao_segundos}s</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ANEXOS */}
          <TabsContent value="anexos" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Finalidade</Label>
                <Select value={anexoCategoria} onValueChange={setAnexoCategoria} disabled={disabled}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANEXO_CATEGORIAS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Legenda</Label>
                <Input
                  value={anexoLegenda}
                  onChange={(e) => setAnexoLegenda(e.target.value)}
                  placeholder="Ex: Laudo solo lab. ABC"
                  className="h-9 text-xs"
                  disabled={disabled}
                />
              </div>
            </div>
            <Button
              onClick={() => anexoInput.current?.click()}
              variant="outline"
              size="sm"
              disabled={disabled}
              className="w-full"
            >
              <Paperclip className="h-4 w-4 mr-1.5" /> Selecionar PDF / imagem
            </Button>
            <input
              ref={anexoInput}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={handleAnexos}
            />
            {anexos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem anexos.</p>
            ) : (
              <ul className="space-y-2">
                {anexos.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded border bg-card p-2 text-xs">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <a
                      href={getEffectiveUrl(a)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-0 truncate hover:underline"
                    >
                      {a.legenda || a.categoria_arquivo || "anexo"}
                    </a>
                    <Badge variant="outline" className="text-[10px]">
                      {a.categoria_arquivo}
                    </Badge>
                    {typeof a.latitude === 'number' && typeof a.longitude === 'number' && (
                      <div className="flex items-center gap-1.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-primary hover:bg-primary/10"
                                onClick={() => openMaps(a.latitude!, a.longitude!)}
                              >
                                <MapPin className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-[10px]">Ver localização no mapa</p>
                              <p className="text-[9px] opacity-70">{a.latitude.toFixed(5)}, {a.longitude.toFixed(5)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                    {!disabled && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                              <AlertTriangle className="h-5 w-5" />
                              Confirmar exclusão
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir este anexo? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeArquivo(a.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* NOTAS */}
          <TabsContent value="notas" className="mt-3">
            <NotasRapidas notes={notes} onChange={onNotesChange} disabled={disabled} />
          </TabsContent>
        </Tabs>

        <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
          <DialogContent className="max-w-3xl p-2">
            {zoom && <img src={zoom} alt="Foto ampliada" className="w-full h-auto rounded" />}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
