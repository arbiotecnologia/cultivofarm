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
    if (processandoRef.current) return;
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
    if (!drawing.current || processandoRef.current) return;
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
    if (processandoRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pathRef.current = [];
    pontosRef.current = 0;
    setHasInk(false);
    setErro(null);
  };

  const confirmar = async () => {
    // Trava síncrona: um segundo clique no mesmo tick não inicia outra coleta.
    if (processandoRef.current) return;
    if (pontosRef.current < MIN_PONTOS_ASSINATURA) {
      setErro(MSG_ASSINATURA_CURTA);
      return;
    }
    processandoRef.current = true;
    setProcessando(true);
    setErro(null);

    // Snapshot imutável ANTES de qualquer await: edições/limpezas posteriores
    // não alteram o que será enviado.
    const canvas = canvasRef.current!;
    const svgPath = pathRef.current.join(" ");
    const pontos = pontosRef.current;

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b ?? null), "image/png"),
      );
      if (!vivoRef.current) return;
      if (!blob || blob.size <= 0) {
        setErro(MSG_ASSINATURA_IMAGEM);
        return;
      }
      const hash = await sha256(svgPath + "|" + new Date().toISOString());
      if (!vivoRef.current) return;
      // Callback pode ser assíncrono: é aguardado, nunca uma promessa solta.
      await onConfirm({ pngBlob: blob, pngDataUrl: dataUrl, svgPath, hash, pontos });
    } catch {
      if (!vivoRef.current) return;
      setErro(MSG_ASSINATURA_FALHA);
    } finally {
      if (vivoRef.current) {
        processandoRef.current = false;
        setProcessando(false);
      }
    }
  };

  const bloqueado = processando || !hasInk;

  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          aria-label="Área de desenho da assinatura"
          style={{
            width: "100%",
            height,
            touchAction: "none",
            display: "block",
            opacity: processando ? 0.6 : 1,
          }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      {erro && (
        <p className="text-xs text-destructive" role="alert" data-testid="assinatura-erro">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={processando}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={limpar} disabled={processando}>
          <Eraser className="h-4 w-4 mr-1" /> Limpar
        </Button>
        <Button type="button" size="sm" disabled={bloqueado} onClick={() => void confirmar()}>
          {processando ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1" />
          )}
          {processando ? "Registrando…" : "Confirmar assinatura"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ao confirmar, registramos data, hora, usuário responsável pela coleta e hash de validação. A assinatura
        digital representa comprovação operacional do recebimento.
      </p>
    </div>
  );

}
