import { QRCodeSVG } from "qrcode.react";
import "./etiquetas.css";
interface Props { traceToken: string; codigo?: string | null; size?: number; }
export function buildRastreioUrl(token: string) {
  return `https://app.cultivofarm.com.br/rastrear-produto/${encodeURIComponent(token)}`;
}
export function QRCodeRastreioProduto({ traceToken, codigo, size = 96 }: Props) {
  return <div className="label-qr"><QRCodeSVG value={buildRastreioUrl(traceToken)} size={size} level="M" marginSize={4} />{codigo && <div className="text-xs font-mono break-all">{codigo}</div>}</div>;
}
