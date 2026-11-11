import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { usePedidoFormalHeader } from "@/hooks/usePedidoFormalHeader";
import { usePartnerOrderItems } from "@/hooks/usePartnerOrders";
import { useProdutorPedidoDetalhe } from "@/hooks/useProdutorDetalheSecure";
import { PedidoHeaderFormal } from "./PedidoHeaderFormal";
import { PedidoItemRow } from "./PedidoItemRow";
import { PedidoItemProdutoInfo } from "./PedidoItemProdutoInfo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financial/format";
import { formatDateDisplay as fd } from "@/lib/date-utils";
import { fmtL } from "@/lib/envaseFormat";
import {
  partnerOrderStatusLabelForPartner,
  partnerOrderStatusVariantForPartner,
} from "@/lib/partnerOrderStatus";
import { scopeCan, type ViewerScope } from "./viewerScope";
import { generatePedidoPdf } from "@/lib/pdf/pedidoPdf";
import { useAuth } from "@/hooks/useAuth";


interface Props {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerScope?: ViewerScope;
  /** Empresa fornecedora/emitente do PDF, resolvida pelo chamador (vendedor B2B autorizado ou tenant ativo). */
  empresaNome: string | null;
  /** Conteúdo adicional montado pelo chamador (ex.: painel do piloto econômico C2). */
  extra?: React.ReactNode;
}

export function DetalhePedidoDrawer({
  orderId,
  open,
  onOpenChange,
  viewerScope = "comercial",
  empresaNome,
  extra,
}: Props) {
  // Técnico B2B: bloqueado para pedidos oficiais
  if (viewerScope === "parceiro_tecnico") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Acesso restrito</SheetTitle>
          </SheetHeader>
          <div className="mt-4 text-sm text-muted-foreground">
            Técnicos B2B não têm acesso ao detalhe de pedidos oficiais. Fale com o gestor
            do parceiro.
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (viewerScope === "produtor") {
    return (
      <ProdutorPedidoDrawer
        orderId={orderId}
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }

  return (
    <InternoPedidoDrawer
      orderId={orderId}
      open={open}
      onOpenChange={onOpenChange}
      viewerScope={viewerScope}
      empresaNome={empresaNome}
    />
  );
}

function InternoPedidoDrawer({
  orderId,
  open,
  onOpenChange,
  viewerScope,
  empresaNome,
}: Required<Pick<Props, "orderId" | "open" | "onOpenChange" | "viewerScope">> & { empresaNome: string | null }) {
  const { data, isLoading } = usePedidoFormalHeader(orderId);
  const { data: items = [] } = usePartnerOrderItems(orderId);
  const { profile, role } = useAuth();
  const showDiscountCol = scopeCan.itemDiscountColumn(viewerScope);

  const handleDownloadPdf = async () => {
    if (!data) return;
    const { blobUrl, filename } = await generatePedidoPdf({
      empresaNome,
      pedido: data,
      parceiro_nome:
        data.partner?.nome_fantasia ?? data.partner?.razao_social ?? null,
      cliente_nome:
        data.cliente?.nome_fantasia ?? data.cliente?.razao_social ?? null,
      baixado_por: {
        nome: (profile as any)?.nome ?? (profile as any)?.nome_completo,
        email: (profile as any)?.email,
        perfil: role as any,
      },
      itens: items as any[],
    });
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-5xl overflow-y-auto">
        <SheetHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <SheetTitle>Detalhe do pedido</SheetTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={!data}
          >
            <Download className="h-4 w-4 mr-1" /> Baixar PDF
          </Button>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {isLoading || !data ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : (
            <>
              <PedidoHeaderFormal doc={data} viewerScope={viewerScope} />
              <div>
                <div className="text-sm font-semibold mb-2">Itens ({items.length})</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[280px]">Produto</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Qtd</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Volume</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Volume total</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Unit.</TableHead>
                      {showDiscountCol && (
                        <TableHead className="text-right whitespace-nowrap">Desc.</TableHead>
                      )}
                      <TableHead className="text-right whitespace-nowrap">Subtotal</TableHead>

                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it: any) => (
                      <PedidoItemRow
                        key={it.id}
                        item={it}
                        showDiscountCol={showDiscountCol}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProdutorPedidoDrawer({
  orderId,
  open,
  onOpenChange,
}: Required<Pick<Props, "orderId" | "open" | "onOpenChange">>) {
  const { data, isLoading, error } = useProdutorPedidoDetalhe(orderId);
  const h = data?.header;
  const items = data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhe do pedido</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : error || !h ? (
            <div className="text-sm text-destructive">
              Pedido indisponível ou fora do escopo do seu cadastro.
            </div>
          ) : (
            <>
              <div className="rounded-md border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-lg font-bold">{h.numero}</div>
                  <Badge variant={partnerOrderStatusVariantForPartner(h.status)}>
                    {partnerOrderStatusLabelForPartner(h.status)}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Parceiro: {h.partner_nome ?? "—"}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Emissão: </span>
                    {fd(h.created_at)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Prev. entrega: </span>
                    {h.estimated_delivery_date ? fd(h.estimated_delivery_date) : "—"}
                  </div>
                  {h.cultura && (
                    <div>
                      <span className="text-muted-foreground">Cultura: </span>
                      {h.cultura}
                    </div>
                  )}
                  {h.area_total_ha && (
                    <div>
                      <span className="text-muted-foreground">Área: </span>
                      {h.area_total_ha} ha
                    </div>
                  )}
                </div>
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Valor final</span>
                  <span className="text-lg font-bold">{brl(Number(h.total ?? 0))}</span>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">Itens ({items.length})</div>
                <Table>
                  <TableHeader>
                      <TableRow>
                      <TableHead className="min-w-[280px]">Produto</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Qtd</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Volume</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Volume total</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => {
                      const um = String((it as any).unidade_medida ?? "");
                      const volMl = Number((it as any).volume_ml ?? 0);
                      const qtdN = Number(it.quantidade ?? 0);
                      const qtdUnit =
                        um === "unidade" && volMl > 0 ? "un" : (um || "");
                      let vasilhameLabel: string | null = null;
                      let volumeTotalLabel: string | null = null;
                      if (um === "unidade" && volMl > 0) {
                        vasilhameLabel = fmtL(volMl);
                        volumeTotalLabel = fmtL(qtdN * volMl);
                      } else if (um === "dose") {
                        vasilhameLabel = "100 mL";
                        volumeTotalLabel = fmtL(qtdN * 100);
                      } else if (um === "litro") {
                        volumeTotalLabel = fmtL(qtdN * 1000);
                      }
                      return (
                      <TableRow key={it.id}>
                        <TableCell className="text-sm">
                          <PedidoItemProdutoInfo item={it} />
                        </TableCell>
                        <TableCell className="text-right">
                          {qtdN.toLocaleString("pt-BR")}
                          {qtdUnit && (
                            <span className="text-[11px] text-muted-foreground"> {qtdUnit}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {vasilhameLabel ? (
                            <span className="font-medium">{vasilhameLabel}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {volumeTotalLabel ? (
                            <span className="font-medium">{volumeTotalLabel}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {brl(Number(it.subtotal ?? 0))}
                        </TableCell>
                      </TableRow>
                      );
                    })}

                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
