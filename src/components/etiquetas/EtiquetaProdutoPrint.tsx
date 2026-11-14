import { QRCodeRastreioProduto } from "./QRCodeRastreioProduto";
import { formatDateDisplay } from "@/lib/date-utils";
import { labelDetails, labelTemplate, snapshotCompany, type LabelData } from "@/lib/etiquetas";
import "./etiquetas.css";
export type EtiquetaData = LabelData;
export function EtiquetaProdutoPrint({ etiqueta }: { etiqueta: LabelData }) {
  const template = labelTemplate(etiqueta);
  const compact = template === "etiqueta-op-50x30" || template === "etiqueta-op-80x50";
  const company = snapshotCompany(etiqueta);
  return <article className="product-label" data-template={template} data-label-id={etiqueta.id} aria-label={`Etiqueta ${etiqueta.codigo_etiqueta}`}>
    <header className="label-header">{company.logo && !compact && <img className="label-logo" src={company.logo} alt={company.name} crossOrigin="anonymous" />}<strong>{company.name}</strong></header>
    <div className="label-body"><div className="label-identification">
      <div className="label-product">{etiqueta.produto_nome}</div>
      <div>Lote: {etiqueta.lote_codigo}</div>
      <div>{etiqueta.codigo_etiqueta}</div>
      {etiqueta.recipiente_seq != null && <div>Recipiente {etiqueta.recipiente_seq}{etiqueta.recipiente_total != null ? `/${etiqueta.recipiente_total}` : ""}</div>}
      {etiqueta.volume != null && <div>{etiqueta.volume} {etiqueta.unidade}</div>}
      {etiqueta.fabricado_em && <div>Fab: {formatDateDisplay(etiqueta.fabricado_em)}</div>}
      <div>Val: {etiqueta.validade_em ? formatDateDisplay(etiqueta.validade_em) : "Não informada"}</div>
      {!compact && <div className="label-details">{labelDetails(etiqueta).map(([key, value]) => <p key={key}><b>{key}:</b> {value}</p>)}</div>}
    </div><QRCodeRastreioProduto traceToken={etiqueta.trace_token} size={100} /></div>
  </article>;
}
