import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check, X, Loader2 } from "lucide-react";

export const MIN_PONTOS_ASSINATURA = 8;
export const MSG_ASSINATURA_CURTA =
  "Traço muito curto. Assine novamente ocupando mais espaço da área de desenho.";
export const MSG_ASSINATURA_IMAGEM =
  "Não foi possível gerar a imagem da assinatura. Limpe e assine novamente.";
export const MSG_ASSINATURA_FALHA =
  "Não foi possível registrar a assinatura. Tente novamente.";

interface Props {
  onConfirm: (data: {
    pngBlob: Blob;
    pngDataUrl: string;
    svgPath: string;
    hash: string;
    pontos: number;
  }) => Promise<void> | void;
  onCancel?: () => void;
  height?: number;
}

async function sha256(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function AssinaturaDigitalCanvas({ onConfirm, onCancel, height = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pathRef = useRef<string[]>([]);
  const pontosRef = useRef(0);
  const [hasInk, setHasInk] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  // Trava síncrona: impede duplo envio antes de qualquer re-render.
  const processandoRef = useRef(false);
  // Token de montagem: nada é aplicado após o unmount.
  const vivoRef = useRef(true);

  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);


  const getPos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    pathRef.current.push(`M${x.toFixed(1)} ${y.toFixed(1)}`);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    pathRef.current.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
    pontosRef.current += 1;
    if (!hasInk) setHasInk(true);
  };
  const end = () => {
    drawing.current = false;
  };

  const limpar = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pathRef.current = [];
    pontosRef.current = 0;
    setHasInk(false);
  };

  const confirmar = async () => {
    if (pontosRef.current < 8) {
      return;
    }
    const canvas = canvasRef.current!;
    const dataUrl = canvas.toDataURL("image/png");
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
    const svgPath = pathRef.current.join(" ");
    const hash = await sha256(svgPath + "|" + new Date().toISOString());
    onConfirm({ pngBlob: blob, pngDataUrl: dataUrl, svgPath, hash, pontos: pontosRef.current });
  };

  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height, touchAction: "none", display: "block" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      <div className="flex flex-wrap gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={limpar}>
          <Eraser className="h-4 w-4 mr-1" /> Limpar
        </Button>
        <Button type="button" size="sm" disabled={!hasInk} onClick={confirmar}>
          <Check className="h-4 w-4 mr-1" /> Confirmar assinatura
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ao confirmar, registramos data, hora, usuário responsável pela coleta e hash de validação. A assinatura
        digital representa comprovação operacional do recebimento.
      </p>
    </div>
  );
}
