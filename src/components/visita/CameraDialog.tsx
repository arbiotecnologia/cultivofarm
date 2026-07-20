import { useEffect, useRef, useState } from "react";
import { Camera, X, RotateCcw, Check, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface CameraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (blob: Blob) => void;
}

export function CameraDialog({ open, onOpenChange, onCapture }: CameraDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);


  const startCamera = async () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // Verificar se existem várias câmeras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === "videoinput");
      setHasMultipleCameras(videoDevices.length > 1);

    } catch (err: any) {
      console.error("Erro ao acessar câmera:", err);
      toast.error("Não foi possível acessar a câmera. Verifique as permissões.");
      onOpenChange(false);
    }
  };

  useEffect(() => {
    if (open) {
      startCamera();
      setCapturedImage(null);
      setCapturedBlob(null);
    } else {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [open, facingMode]);

  // Garante que o vídeo sempre receba o stream ativo (incluindo ao voltar de uma captura)
  useEffect(() => {
    if (videoRef.current && stream && !capturedImage) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, capturedImage]);


  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const dataUrl = canvas.toDataURL("image/jpeg");
            setCapturedBlob(blob);
            setCapturedImage(dataUrl);
            setOriginalBlob(blob);
            setOriginalImage(dataUrl);
            setEnhanced(false);
          }
        }, "image/jpeg", 0.92);
      }
    }
  };

  const enhanceImage = async () => {
    if (!originalImage) return;
    if (enhanced) {
      // Reverter ao original
      setCapturedImage(originalImage);
      setCapturedBlob(originalBlob);
      setEnhanced(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Filtros automáticos: contraste + saturação + brilho leve
      ctx.filter = "contrast(1.15) saturate(1.12) brightness(1.05)";
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setCapturedImage(canvas.toDataURL("image/jpeg"));
          setEnhanced(true);
        }
      }, "image/jpeg", 0.95);
    };
    img.src = originalImage;
  };

  const handleConfirm = () => {
    if (capturedBlob) {
      onCapture(capturedBlob);
      onOpenChange(false);
    }
  };


  const toggleCamera = () => {
    setFacingMode(prev => prev === "user" ? "environment" : "user");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-black border-none h-[85vh] flex flex-col gap-0">
        <DialogHeader className="p-4 shrink-0 bg-gradient-to-b from-black/60 to-transparent">
          <DialogTitle className="text-white flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Capturar Foto
          </DialogTitle>
          <DialogDescription className="sr-only">
            Use a câmera do dispositivo para capturar uma foto e adicionar como evidência.
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex-1 min-h-[300px] bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-contain"
          />
          {capturedImage && (
            <img
              src={capturedImage}
              alt="Captura"
              className="absolute inset-0 w-full h-full object-contain"
            />
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>


        <DialogFooter className="p-4 sm:p-6 bg-black shrink-0 flex-row justify-center gap-4 sm:justify-center">
          {!capturedImage ? (
            <>
              {hasMultipleCameras && (
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={toggleCamera}
                >
                  <RefreshCw className="h-6 w-6" />
                </Button>
              )}
              <Button
                size="lg"
                className="rounded-full w-16 h-16 p-0 bg-white hover:bg-white/90 text-black border-4 border-white/30"
                onClick={capturePhoto}
              >
                <div className="w-12 h-12 rounded-full border-2 border-black" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-6 w-6" />
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <Button
                size="sm"
                variant={enhanced ? "default" : "outline"}
                className={enhanced ? "w-full bg-amber-500 hover:bg-amber-600 text-white" : "w-full bg-white/10 border-white/20 text-white hover:bg-white/20"}
                onClick={enhanceImage}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {enhanced ? "Imagem melhorada (clique para reverter)" : "Melhorar imagem"}
              </Button>
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={() => {
                    setCapturedImage(null);
                    setCapturedBlob(null);
                    setOriginalImage(null);
                    setOriginalBlob(null);
                    setEnhanced(false);
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Repetir
                </Button>
                <Button
                  size="lg"
                  className="flex-1 bg-primary text-primary-foreground"
                  onClick={handleConfirm}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar
                </Button>
              </div>
            </div>
          )}

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

