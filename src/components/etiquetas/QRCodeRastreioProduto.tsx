import { QRCodeSVG } from "qrcode.react";

interface Props {
  traceToken: string;
  codigo?: string | null;
  size?: number;
}

export function buildRastreioUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/rastrear-produto/${token}`;
}

export function QRCodeRastreioProduto({ traceToken, codigo, size = 96 }: Props) {
  const url = buildRastreioUrl(traceToken);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="bg-white p-1 rounded border">
        <QRCodeSVG value={url} size={size} level="M" includeMargin={false} />
      </div>
      {codigo && <div className="text-[10px] font-mono">{codigo}</div>}
    </div>
  );
}
