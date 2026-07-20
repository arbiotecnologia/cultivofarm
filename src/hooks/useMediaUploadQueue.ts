/**
 * Fila de upload de mídias com progresso e retry.
 */

import { useCallback, useRef, useState } from "react";
import { uploadMediaIdempotent, type MediaKind, type UploadInput } from "@/lib/mediaUpload";
import { compressImage, type ImageQuality } from "@/lib/mediaCompression";
import { toast } from "sonner";


export interface QueueItem {
  id: string;
  clientUuid: string;
  fileName: string;
  mimeType: string;
  kind: MediaKind;
  categoria?: string;
  legenda?: string | null;
  isPrincipal?: boolean;
  duracaoSegundos?: number | null;
  file: Blob;
  status: "compressing" | "queued" | "uploading" | "done" | "error";
  attempts: number;
  remotePath?: string | null;
  error?: string;
  previewUrl?: string;
  originalSize?: number;
  compressedSize?: number;
  quality?: ImageQuality;
  latitude?: number | null;
  longitude?: number | null;
}


export interface QueueProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string;
}

export interface EnqueueOptions {
  registroId: string;
  kind?: MediaKind;
  categoria?: string;
  legenda?: string | null;
  isPrincipal?: boolean;
  duracaoSegundos?: number | null;
  quality?: ImageQuality;
  latitude?: number | null;
  longitude?: number | null;
}


function detectKind(file: { type: string; name?: string }): MediaKind {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf") return "documento";
  return "foto";
}

export function useMediaUploadQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState<QueueProgress>({
    total: 0,
    completed: 0,
    failed: 0,
  });
  const processingRef = useRef(false);
  const isPausedRef = useRef(false);
  const itemsRef = useRef<QueueItem[]>([]);


  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    itemsRef.current = itemsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i));
    setItems([...itemsRef.current]);
  }, []);


  const processOne = useCallback(
    async (item: QueueItem, registroId: string): Promise<boolean> => {
      let currentFile = item.file;

      // Se for imagem e ainda não estiver comprimido/processado
      if (item.kind === "foto" && !item.compressedSize && item.file instanceof File) {
        updateItem(item.id, { status: "compressing" });
        setProgress((p) => ({ ...p, current: `Otimizando ${item.fileName}...` }));
        
        try {
          const compressed = await compressImage(item.file as File, item.quality);
          currentFile = compressed;
          updateItem(item.id, { 
            file: compressed, 
            compressedSize: compressed.size 
          });
        } catch (err) {
          console.error("Erro compressão", err);
        }
      }

      updateItem(item.id, { status: "uploading" });
      setProgress((p) => ({ ...p, current: item.fileName }));

      const input: UploadInput = {
        clientUuid: item.clientUuid,
        file: currentFile,
        fileName: item.fileName,
        mimeType: item.mimeType,
        kind: item.kind,
        categoria: item.categoria,
        legenda: item.legenda,
        isPrincipal: item.isPrincipal,
        duracaoSegundos: item.duracaoSegundos,
        latitude: item.latitude,
        longitude: item.longitude,
        previousAttempts: item.attempts,
        previousRemotePath: item.remotePath,
      };

      const res = await uploadMediaIdempotent(input, registroId);

      if (res.success) {
        updateItem(item.id, {
          status: "done",
          attempts: res.attempts,
          remotePath: res.remotePath,
          error: undefined,
        });
        return true;
      }

      updateItem(item.id, {
        status: "error",
        attempts: res.attempts,
        remotePath: res.remotePath,
        error: res.error,
      });
      toast.error(`Falha ao enviar ${item.fileName}: ${res.error}`);
      return false;

    },
    [updateItem]
  );

  const drain = useCallback(
    async (registroId: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      try {
        while (true) {
          if (isPausedRef.current) break;

          const target = itemsRef.current.find((i) => i.status === "queued");

          if (!target) break;

          const ok = await processOne(target, registroId);
          setProgress((p) => ({
            ...p,
            completed: ok ? p.completed + 1 : p.completed,
            failed: ok ? p.failed : p.failed + 1,
          }));
        }
        
        if (!isPausedRef.current) {
          setProgress((p) => ({ ...p, current: undefined }));
        }
      } finally {
        processingRef.current = false;
      }
    },
    [processOne]
  );


  const togglePause = useCallback((registroId: string) => {
    const nextPaused = !isPausedRef.current;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;
    
    if (!nextPaused) {
      drain(registroId).catch(err => console.error("Erro no resume drain", err));
    }
  }, [drain]);

  const resume = useCallback((registroId: string) => {
    setIsPaused(false);
    isPausedRef.current = false;
    drain(registroId).catch(err => console.error("Erro no resume drain", err));
  }, [drain]);


  const enqueue = useCallback(
    async (files: File[], opts: EnqueueOptions) => {
      if (!files.length) return;
      const newItems: QueueItem[] = files.map((file) => {
        const kind = opts.kind || detectKind(file);
        const id = crypto.randomUUID();
        
        let previewUrl: string | undefined;
        if (file.type.startsWith("image/")) {
          previewUrl = URL.createObjectURL(file);
        }

        return {
          id,
          clientUuid: id,
          fileName: file.name || `${kind}_${Date.now()}`,
          mimeType: file.type || "application/octet-stream",
          kind,
          categoria: opts.categoria,
          legenda: opts.legenda,
          isPrincipal: opts.isPrincipal,
          duracaoSegundos: opts.duracaoSegundos,
          file,
          status: "queued",
          attempts: 0,
          previewUrl,
          originalSize: file.size,
          quality: opts.quality || 'standard',
          latitude: opts.latitude,
          longitude: opts.longitude,
        };
      });

      itemsRef.current = [...itemsRef.current, ...newItems];
      setItems([...itemsRef.current]);
      
      setProgress((p) => ({
        total: p.total + newItems.length,
        completed: p.completed,
        failed: p.failed,
        current: p.current,
      }));

      if (!isPausedRef.current) {
        drain(opts.registroId).catch(err => console.error("Erro no drain", err));
      }

    },
    [drain]
  );

  const retryFailed = useCallback(
    async (registroId: string) => {
      itemsRef.current = itemsRef.current.map((i) => (i.status === "error" ? { ...i, status: "queued" } : i));
      setItems([...itemsRef.current]);

      setProgress((p) => {
        return {
          total: p.total,
          completed: p.completed,
          failed: 0,
        };
      });
      drain(registroId).catch(err => console.error("Erro no retry drain", err));

    },
    [drain]
  );

  const clearFinished = useCallback(() => {
    itemsRef.current.forEach(i => {
      if ((i.status === "done" || i.status === "error") && i.previewUrl) {
        URL.revokeObjectURL(i.previewUrl);
      }
    });
    itemsRef.current = itemsRef.current.filter((i) => i.status !== "done" && i.status !== "error");
    setItems([...itemsRef.current]);
    setProgress({ total: 0, completed: 0, failed: 0 });
  }, []);

  const cancelItem = useCallback((id: string) => {
    const item = itemsRef.current.find(i => i.id === id);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    
    itemsRef.current = itemsRef.current.filter(i => i.id !== id);
    setItems([...itemsRef.current]);
    
    // Ajustar progresso se necessário
    if (item && item.status !== 'done') {
      setProgress(p => ({
        ...p,
        total: Math.max(0, p.total - 1),
        failed: item.status === 'error' ? Math.max(0, p.failed - 1) : p.failed
      }));
    }
  }, []);

  const cancelAllPending = useCallback(() => {
    itemsRef.current.forEach(i => {
      if (i.status !== 'done' && i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    });
    
    itemsRef.current = itemsRef.current.filter(i => i.status === 'done');
    setItems([...itemsRef.current]);
    
    setProgress(p => ({
      total: itemsRef.current.length,
      completed: itemsRef.current.length,
      failed: 0,
      current: undefined
    }));
  }, []);


  return {
    items,
    isPaused,
    progress,
    enqueue,
    resume,
    togglePause,
    retryFailed,
    clearFinished,
    cancelItem,
    cancelAllPending,
  };
}