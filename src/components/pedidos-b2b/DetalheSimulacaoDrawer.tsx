import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSimulacaoFormalHeader } from "@/hooks/useSimulacaoFormalHeader";
import { usePartnerSimulationItems } from "@/hooks/usePartnerSimulations";
import { useProdutorSimulacaoDetalhe } from "@/hooks/useProdutorDetalheSecure";
import { PedidoHeaderFormal } from "./PedidoHeaderFormal";
import { PedidoItemRow } from "./PedidoItemRow";
import { PedidoItemProdutoInfo } from "./PedidoItemProdutoInfo";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/financial/format";
import { formatDateDisplay as fd } from "@/lib/date-utils";
import { fmtL } from "@/lib/envaseFormat";
import { scopeCan } from "./viewerScope";
import type { ViewerScope } from "./viewerScope";

interface Props {
  simulationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerScope?: ViewerScope;
  extraHeaderActions?: React.ReactNode;
}

const SIM_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviada_gestor: "Em análise",
  convertida_pedido: "Convertida em pedido",
  arquivada: "Arquivada",
};

export function DetalheSimulacaoDrawer({
  simulationId,
  open,
  onOpenChange,
  viewerScope = "comercial",
  extraHeaderActions,
}: Props) {
  if (viewerScope === "produtor") {
    return (
      <ProdutorSimulacaoDrawer
        simulationId={simulationId}
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }
  return (
    <InternoSimulacaoDrawer
      simulationId={simulationId}
      open={open}
      onOpenChange={onOpenChange}
      viewerScope={viewerScope}
      extraHeaderActions={extraHeaderActions}
    />
  );
}

function InternoSimulacaoDrawer({
  simulationId,
  open,
  onOpenChange,
  viewerScope,
  extraHeaderActions,
}: Required<Pick<Props, "simulationId" | "open" | "onOpenChange" | "viewerScope">> & { extraHeaderActions?: React.ReactNode }) {
  const { data, isLoading } = useSimulacaoFormalHeader(simulationId);
  const { data: items = [] } = usePartnerSimulationItems(simulationId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-5xl overflow-y-auto">
        <SheetHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <SheetTitle>Detalhe da simulação</SheetTitle>
          {extraHeaderActions ? <div className="flex items-center gap-2">{extraHeaderActions}</div> : null}
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
                      {scopeCan.itemDiscountColumn(viewerScope) && (
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
                        showDiscountCol={scopeCan.itemDiscountColumn(viewerScope)}
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

function ProdutorSimulacaoDrawer({
  simulationId,
  open,
  onOpenChange,
}: Required<Pick<Props, "simulationId" | "open" | "onOpenChange">>) {
  const { data, isLoading, error } = useProdutorSimulacaoDetalhe(simulationId);
  const h = data?.header;
  const items = data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhe da simulação</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : error || !h ? (
            <div className="text-sm text-destructive">
              Simulação indisponível ou fora do escopo do seu cadastro.
            </div>
          ) : (
            (() => {
              const validUntil =
                (h as any).valid_until ??
                new Date(new Date(h.created_at).getTime() + 30 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .slice(0, 10);
              const expired = new Date(validUntil + "T23:59:59") < new Date();
              return (
                <>
                  <div className="rounded-md border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-lg font-bold">
                        {h.numero ?? h.titulo ?? "Simulação"}
                      </div>
                      <Badge variant="secondary">
                        {SIM_STATUS_LABEL[h.status] ?? h.status}
                      </Badge>
                    </div>
                    {h.titulo && h.numero && (
                      <div className="text-sm text-muted-foreground">{h.titulo}</div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      Parceiro: {h.partner_nome ?? "—"}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Emissão: </span>
                        {fd(h.created_at)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Validade: </span>
                        <span className="inline-flex items-center gap-1">
                          {fd(validUntil)}
                          {expired && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-destructive border-destructive/40"
                            >
                              Expirada
                            </Badge>
                          )}
                        </span>
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
                    {h.objetivo_tecnico && (
                      <div className="text-sm">
                        <div className="text-muted-foreground text-xs">Objetivo técnico</div>
                        <div className="whitespace-pre-wrap">{h.objetivo_tecnico}</div>
                      </div>
                    )}
                    <div className="border-t pt-2 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Valor de tabela</span>
                      <span className="text-lg font-bold">
                        {brl(Number(h.total_cheio ?? 0))}
                      </span>
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
              );
            })()
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
