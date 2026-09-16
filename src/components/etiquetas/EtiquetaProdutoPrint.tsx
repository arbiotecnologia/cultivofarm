import { QRCodeRastreioProduto } from "./QRCodeRastreioProduto";
import { formatDateDisplay } from "@/lib/date-utils";

export interface EtiquetaData {
  id: string;
  codigo_etiqueta: string;
  tipo_etiqueta: string;
  status: string;
  produto_nome: string;
  protocolo_nome?: string | null;
  lote_codigo: string;
  volume?: number | null;
  unidade?: string | null;
  quantidade_embalagens?: number | null;
  cepas?: string[] | null;
  fabricado_em?: string | null;
  validade_em?: string | null;
  conservacao?: string | null;
  uso_recomendado?: string | null;
  trace_token: string;
}

export function EtiquetaProdutoPrint({ etiqueta }: { etiqueta: EtiquetaData }) {
  const reduzida = etiqueta.tipo_etiqueta === "reduzida";

  if (reduzida) {
    return (
      <div
        className="border border-black bg-white text-black p-2 flex gap-2"
        style={{ width: "50mm", height: "30mm", fontSize: "7pt" }}
      >
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <div>
            <div className="font-bold">Cultivo Farm</div>
            <div className="truncate font-semibold">{etiqueta.produto_nome}</div>
            <div>Lote: <span className="font-mono">{etiqueta.lote_codigo}</span></div>
            {etiqueta.volume && (
              <div>Vol: {etiqueta.volume}{etiqueta.unidade || ""}</div>
            )}
          </div>
          <div className="text-[6pt]">
            {etiqueta.fabricado_em && <div>Fab: {formatDateDisplay(etiqueta.fabricado_em)}</div>}
            {etiqueta.validade_em && <div>Val: {formatDateDisplay(etiqueta.validade_em)}</div>}
          </div>
        </div>
        <div className="shrink-0">
          <QRCodeRastreioProduto traceToken={etiqueta.trace_token} codigo={etiqueta.codigo_etiqueta} size={60} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="border-2 border-black bg-white text-black p-3 flex flex-col gap-2"
      style={{ width: "100mm", minHeight: "60mm", fontSize: "8pt" }}
    >
      <div className="flex items-start justify-between border-b border-black pb-1">
        <div>
          <div className="font-bold text-base leading-tight">Cultivo Farm</div>
          <div className="text-[7pt] italic">Agricultura Sustentável</div>
        </div>
        <div className="text-right text-[7pt]">
          <div className="font-mono">{etiqueta.codigo_etiqueta}</div>
          <div className="uppercase">{etiqueta.tipo_etiqueta}</div>
        </div>
      </div>

      <div className="flex gap-2 flex-1">
        <div className="flex-1 space-y-1">
          <div>
            <div className="text-[7pt] uppercase text-gray-600">Produto</div>
            <div className="font-bold leading-tight">{etiqueta.produto_nome}</div>
            {etiqueta.protocolo_nome && (
              <div className="text-[7pt]">Protocolo: {etiqueta.protocolo_nome}</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <div className="text-[7pt] uppercase text-gray-600">Lote</div>
              <div className="font-mono font-semibold">{etiqueta.lote_codigo}</div>
            </div>
            {etiqueta.volume != null && (
              <div>
                <div className="text-[7pt] uppercase text-gray-600">Volume</div>
                <div className="font-semibold">{etiqueta.volume}{etiqueta.unidade ? ` ${etiqueta.unidade}` : ""}</div>
              </div>
            )}
            {etiqueta.fabricado_em && (
              <div>
                <div className="text-[7pt] uppercase text-gray-600">Fabricação</div>
                <div>{formatDateDisplay(etiqueta.fabricado_em)}</div>
              </div>
            )}
            {etiqueta.validade_em && (
              <div>
                <div className="text-[7pt] uppercase text-gray-600">Validade</div>
                <div className="font-semibold">{formatDateDisplay(etiqueta.validade_em)}</div>
              </div>
            )}
          </div>
          {etiqueta.cepas && etiqueta.cepas.length > 0 && (
            <div>
              <div className="text-[7pt] uppercase text-gray-600">Cepas/Microrganismos</div>
              <div className="text-[7pt]">{etiqueta.cepas.join(", ")}</div>
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-center">
          <QRCodeRastreioProduto traceToken={etiqueta.trace_token} codigo={etiqueta.codigo_etiqueta} size={80} />
        </div>
      </div>

      <div className="border-t border-black pt-1 text-[6.5pt] leading-tight">
        {etiqueta.conservacao && <div><b>Conservação:</b> {etiqueta.conservacao}</div>}
        {etiqueta.uso_recomendado && <div><b>Uso:</b> {etiqueta.uso_recomendado}</div>}
        <div className="italic text-gray-700 mt-1">
          Produto rastreável pelo QR Code. Este rótulo não substitui documento fiscal ou recomendação técnica.
        </div>
      </div>
    </div>
  );
}
