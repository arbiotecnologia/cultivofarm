import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, X, AlertTriangle, Loader2, Smartphone } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

function mensagemErroCamera(e: any): string {
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permissão para usar a câmera foi negada. Autorize o acesso nas configurações do navegador.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Nenhuma câmera foi encontrada neste dispositivo.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "A câmera está ocupada por outro aplicativo ou não pôde ser iniciada.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Nenhuma câmera compatível com a configuração solicitada foi encontrada.";
    default:
      return e?.message || "Não foi possível acessar a câmera.";
  }
}

export function CameraCaptureDialog({ open, onOpenChange, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  /** Cada tentativa recebe um id; streams de tentativas antigas são descartadas. */
  const tentativaRef = useRef(0);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pronto, setPronto] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPronto(false);
  }, []);

  const start = useCallback(async () => {
    const id = ++tentativaRef.current;
    setError(null);
    setPronto(false);
    setLoading(true);
    stop();
    const descartar = (stream: MediaStream) => stream.getTracks().forEach((t) => t.stop());
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Seu navegador não suporta acesso à câmera.");
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch (e: any) {
        if (e?.name !== "OverconstrainedError" && e?.name !== "ConstraintNotSatisfiedError") throw e;
        // Uma única nova tentativa sem restrições.
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      // A tentativa foi cancelada (fechamento/troca) enquanto a promessa resolvia.
      if (id !== tentativaRef.current) {
        descartar(stream);
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch (e: any) {
          if (id !== tentativaRef.current) return;
          setError(
            "O vídeo da câmera não pôde ser iniciado automaticamente. Toque em Tentar novamente ou use a câmera do dispositivo.",
          );
          return;
        }
      }
    } catch (e: any) {
      if (id !== tentativaRef.current) return;
      setError(mensagemErroCamera(e));
    } finally {
      if (id === tentativaRef.current) setLoading(false);
    }
  }, [facingMode, stop]);

  useEffect(() => {
    if (open) start();
    else {
      tentativaRef.current++;
      stop();
    }
    return () => {
      tentativaRef.current++;
      stop();
    };
  }, [open, facingMode, start, stop]);

  const avaliarProntidao = () => {
    const v = videoRef.current;
    setPronto(!!v && v.videoWidth > 0 && v.videoHeight > 0);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setPronto(false);
      setError("A imagem da câmera ainda não está disponível. Aguarde um instante e tente novamente.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Não foi possível processar a imagem capturada neste navegador.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Não foi possível gerar a foto. Tente novamente.");
          return;
        }
        const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        onOpenChange(false);
      },
      "image/jpeg",
      0.92,
    );
  };

  const usarCameraDoDispositivo = () => fallbackRef.current?.click();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Capturar foto
          </DialogTitle>
        </DialogHeader>
        <div className="relative bg-black aspect-video flex items-center justify-center">
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white z-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {error ? (
            <div className="text-center text-white p-6 space-y-3">
              <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm" role="alert">{error}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button size="sm" variant="secondary" onClick={start}>
                  Tentar novamente
                </Button>
                <Button size="sm" variant="secondary" onClick={usarCameraDoDispositivo}>
                  <Smartphone className="h-4 w-4 mr-2" />
                  Usar câmera/galeria do dispositivo
                </Button>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={avaliarProntidao}
              onCanPlay={avaliarProntidao}
              onPlaying={avaliarProntidao}
              onEmptied={() => setPronto(false)}
              className="w-full h-full object-contain"
            />
          )}
        </div>
        <input
          ref={fallbackRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Usar câmera ou galeria do dispositivo"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            onCapture(file);
            onOpenChange(false);
          }}
        />
        <div className="flex items-center justify-between gap-2 p-4 border-t bg-background">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFacingMode((m) => (m === "environment" ? "user" : "environment"))}
            disabled={!!error || loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Trocar câmera
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleCapture} disabled={!!error || loading || !pronto}>
              <Camera className="h-4 w-4 mr-2" />
              Capturar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
