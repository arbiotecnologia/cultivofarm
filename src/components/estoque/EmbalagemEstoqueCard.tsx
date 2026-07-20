import { Card, CardContent } from "@/components/ui/card";
import { EmbalagemStatusBadge } from "./EmbalagemStatusBadge";
import { formatDateDisplay as fmtDateBR } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Package, QrCode, Tag, Truck, XCircle, Trash2, Link2, Search } from "lucide-react";

export type EmbalagemAction =
  | "etiqueta"
  | "gerar_etiqueta"
  | "vincular_existente"
  | "rastrear"
  | "qr"
  | "reservar"
  | "cancelar"
  | "descartar"
  | "ver";

export interface Embalagem {
  id: string;
  codigo_embalagem: string;
  status: string;
  lote_id: string;
  produto_id: string | null;
  etiqueta_id: string | null;
  entrega_id: string | null;
  volume: number;
  unidade: string;
  validade_em: string | null;
  fabricado_em: string | null;
  local_estoque: string | null;
}

export function EmbalagemEstoqueCard({
  embalagem,
  onAction,
}: {
  embalagem: Embalagem;
  onAction?: (action: EmbalagemAction, e: Embalagem) => void;
}) {
  const vencida = embalagem.validade_em ? new Date(embalagem.validade_em) < new Date() : false;
  const naoEntregue = !["entregue", "cancelado", "descartado"].includes(embalagem.status);
  const emEstoque = embalagem.status === "em_estoque";

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold">
            <Package className="h-4 w-4" /> {embalagem.codigo_embalagem}
          </div>
          <EmbalagemStatusBadge status={embalagem.status} vencida={vencida} />
        </div>
        <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
          <div>Volume: <span className="text-foreground font-medium">{embalagem.volume} {embalagem.unidade}</span></div>
          <div>Local: <span className="text-foreground">{embalagem.local_estoque ?? "—"}</span></div>
          <div>Fab.: {embalagem.fabricado_em ? fmtDateBR(embalagem.fabricado_em) : "—"}</div>
          <div>Val.: {embalagem.validade_em ? fmtDateBR(embalagem.validade_em) : "—"}</div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {embalagem.etiqueta_id ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onAction?.("etiqueta", embalagem)}>
                <Tag className="h-3 w-3 mr-1" />Ver etiqueta
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onAction?.("rastrear", embalagem)}>
                <Search className="h-3 w-3 mr-1" />Rastrear
              </Button>
            </>
          ) : (
            naoEntregue && (
              <>
                <Button size="sm" variant="outline" onClick={() => onAction?.("gerar_etiqueta", embalagem)}>
                  <Tag className="h-3 w-3 mr-1" />Gerar etiqueta
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onAction?.("vincular_existente", embalagem)}>
                  <Link2 className="h-3 w-3 mr-1" />Vincular existente
                </Button>
              </>
            )
          )}
          <Button size="sm" variant="ghost" onClick={() => onAction?.("qr", embalagem)}>
            <QrCode className="h-3 w-3 mr-1" />QR
          </Button>
          {emEstoque && (
            <Button size="sm" variant="outline" onClick={() => onAction?.("reservar", embalagem)}>
              <Truck className="h-3 w-3 mr-1" />Reservar
            </Button>
          )}
          {naoEntregue && (
            <>
              <Button size="sm" variant="ghost" className="text-amber-700" onClick={() => onAction?.("cancelar", embalagem)}>
                <XCircle className="h-3 w-3 mr-1" />Cancelar
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onAction?.("descartar", embalagem)}>
                <Trash2 className="h-3 w-3 mr-1" />Descartar
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
