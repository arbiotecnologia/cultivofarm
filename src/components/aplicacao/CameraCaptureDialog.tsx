import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, X, AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

export function CameraCaptureDialog({ open, onOpenChange, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const start = async () => {
    setError(null);
    setLoading(true);
    stop();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Seu navegador não suporta acesso à câmera.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      const msg =
        e?.name === "NotAllowedError"
          ? "Permissão para usar a câmera foi negada."
          : e?.name === "NotFoundError"
          ? "Nenhuma câmera disponível neste dispositivo."
          : e?.message || "Não foi possível acessar a câmera.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) start();
    else stop();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facingMode]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        onOpenChange(false);
      },
      "image/jpeg",
      0.92
    );
  };

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
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-white z-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {error ? (
            <div className="text-center text-white p-6 space-y-3">
              <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm">{error}</p>
              <Button size="sm" variant="secondary" onClick={start}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          )}
        </div>
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
            <Button type="button" size="sm" onClick={handleCapture} disabled={!!error || loading}>
              <Camera className="h-4 w-4 mr-2" />
              Capturar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
