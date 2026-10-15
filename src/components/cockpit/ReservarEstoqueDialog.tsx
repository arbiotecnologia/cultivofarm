import { useCockpitQuery } from "@/hooks/useCockpitQuery";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, PackageOpen } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
import { fmtEmb, computeTotals, findInvalidIds, clampQty } from "./reservaCalc";
import { toast } from "sonner";

export interface ReservarEstoqueTarget {
  programacao_id: string;
  os_id: string;
  origem: "manual" | "onfarm" | "b2b" | string;
  lote_id: string;
  codigo_lote?: string | null;
  produto?: string;
  cliente_id?: string;
  cliente_nome?: string;
  titular_nome?: string;
  titular_tipo?: "cliente" | "parceiro" | "desconhecido";
  numero_os?: string;
  partner_id?: string;
  partner_order_id?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: ReservarEstoqueTarget | null;
}

export function ReservarEstoqueDialog({ open, onOpenChange, target }: Props) {
  const qc = useQueryClient();
  const { reservarEstoqueLote } = useEsteiraLaboratorio();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Chave estável por abertura do diálogo: reenvio/duplo clique vira replay.
  const idempotencyKeyRef = useRef<string>("");


  const { data: itens = [], isLoading, error: queryError, available } = useCockpitQuery({
    queryKey: ["estoque-disponivel-lote", target?.lote_id, target?.os_id],
    enabled: open && !!target?.lote_id,
    queryFn: async ({ signal }) => {
      if (!target?.lote_id || !target.os_id) return [];
      const { data, error } = await supabase
        .from("estoque_produto")
        .select("id, quantidade, volume_total, validade, status, produto_id, microrganismo_id, lote_id, envase_id, reservado_para_os_id, reservado_para_os_tipo, lotes(codigo_lote), produtos(nome), microrganismos(nome)")
        .eq("lote_id", target.lote_id)
        .or(`status.eq.disponivel,and(status.eq.reservado,reservado_para_os_id.eq.${target.os_id})`)
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: open ? 10000 : false,
  });

  useEffect(() => {
    if (open) {
      const disp = itens.filter((i: any) => i.status === "disponivel");
      setSelectedIds(disp.map((i: any) => i.id));
      const initQtys: Record<string, string> = {};
      disp.forEach((i: any) => { initQtys[i.id] = String(i.quantidade ?? ""); });
      setQtys(initQtys);
      setObservacao("");
      setProgress(null);
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `reserva:${target?.os_id ?? "os"}:${target?.lote_id ?? "lote"}:${
          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)
        }`;
      }
    }
  }, [open, itens, target?.os_id, target?.lote_id]);

  useEffect(() => {
    if (!open) idempotencyKeyRef.current = "";
  }, [open]);

  const itensDisponiveis = useMemo(() => itens.filter((i: any) => i.status === "disponivel"), [itens]);
  const itemJaReservadoParaEstaOS = useMemo(
    () => itens.find((i: any) => i.status === "reservado" && i.reservado_para_os_id === target?.os_id) ?? null,
    [itens, target?.os_id]
  );
  const somenteReservaExistente = !!itemJaReservadoParaEstaOS && itensDisponiveis.length === 0;

  const selectedItems = useMemo(
    () => itensDisponiveis.filter((i: any) => selectedIds.includes(i.id)),
    [itensDisponiveis, selectedIds]
  );

  const { totalUn: totalUnSel, totalL: totalLSel } = computeTotals(selectedItems as any, qtys);

  const totalUn = itens.reduce((s: number, i: any) => s + Number(i.quantidade ?? 0), 0);
  const totalL = itens.reduce((s: number, i: any) => s + Number(i.volume_total ?? 0), 0);
  const resumoLote = itens.length > 1 ? `${itens.length} embalagens · ${totalUn} un · ${totalL} L` : null;

  const invalidIds = findInvalidIds(selectedItems as any, qtys);
  const hasInvalid = invalidIds.length > 0;

  if (!target || !available) return null;


  const handleConfirm = async () => {
    const isParceiro = target.titular_tipo === "parceiro";
    if (isParceiro && !target.partner_id) {
      toast.error("Parceiro não identificado para esta OS.");
      return;
    }
    if (isParceiro && !target.partner_order_id) {
      toast.error("Pedido B2B não vinculado a esta OS.");
      return;
    }

    if (!isParceiro && !target.cliente_id) {
      toast.error("Cliente não identificado para esta OS.");
      return;
    }
    if (selectedItems.length === 0) {
      toast.error("Selecione ao menos uma embalagem.");
      return;
    }
    // valida qty
    for (const it of selectedItems) {
      const q = Number(qtys[it.id] ?? 0);
      if (!q || q <= 0) {
        toast.error(`Informe a quantidade para ${fmtEmb(it)}.`);
        return;
      }
      if (q > Number(it.quantidade ?? 0)) {
        toast.error(`Quantidade excede o disponível (${it.quantidade}) em ${fmtEmb(it)}.`);
        return;
      }
    }

    const os_tipo: "onfarm" | "padrao" | "b2b" = isParceiro
      ? "b2b"
      : target.origem === "onfarm" ? "onfarm" : "padrao";

    setSubmitting(true);
    setProgress({ done: 0, total: selectedItems.length });

    // Uma única transação no banco: ou reserva tudo, ou nada.
    // A chave é estável por abertura do diálogo, então reenvio não duplica.
    const { ok } = await reservarEstoqueLote({
      osId: target.os_id,
      origem: os_tipo,
      itens: selectedItems.map((it: any) => ({
        item_id: it.id,
        quantidade: Number(qtys[it.id]),
      })),
      idempotencyKey: idempotencyKeyRef.current,
      dados: {
        cliente_id: isParceiro ? null : target.cliente_id ?? null,
        partner_id: isParceiro ? target.partner_id ?? null : null,
        partner_order_id: isParceiro ? target.partner_order_id ?? null : null,
        observacao: observacao || null,
        titular_nome: isParceiro ? target.titular_nome ?? null : target.cliente_nome ?? target.titular_nome ?? null,
      },
    });

    setProgress({ done: selectedItems.length, total: selectedItems.length });
    setSubmitting(false);

    qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] });
    qc.invalidateQueries({ queryKey: ["estoque-disponivel-lote", target.lote_id] });

    if (ok) onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reservar estoque — Lote {target.codigo_lote ?? "—"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">{target.titular_tipo === "parceiro" ? "Parceiro" : "Cliente"}:</span> <span className="font-medium">{target.titular_nome ?? target.cliente_nome ?? "—"}</span></div>
            <div><span className="text-muted-foreground">OS:</span> <span className="font-medium">{target.numero_os ?? target.os_id.slice(0, 8)}</span> <span className="text-[10px] uppercase text-muted-foreground">({target.origem})</span></div>
            <div><span className="text-muted-foreground">Produto:</span> <span className="font-medium">{target.produto ?? "—"}</span></div>
            {resumoLote && (
              <div><span className="text-muted-foreground">Lote:</span> <span className="font-medium">{resumoLote}</span></div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando estoque...
            </div>
          ) : queryError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4 text-center space-y-2">
              <p className="text-sm font-medium text-destructive">Erro ao carregar saldo do lote.</p>
              <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["estoque-disponivel-lote"] })}>
                Tentar novamente
              </Button>
            </div>
          ) : somenteReservaExistente ? (
            <div className="rounded-md border p-4 space-y-2 bg-muted/20">
              <p className="text-sm font-medium">Este lote já está reservado para esta OS.</p>
              <p className="text-xs text-muted-foreground">
                Quantidade reservada: <span className="font-semibold text-foreground">{itemJaReservadoParaEstaOS.quantidade}</span>
                {itemJaReservadoParaEstaOS.volume_total ? ` · ${itemJaReservadoParaEstaOS.volume_total} L` : ""}
              </p>
              <div className="pt-1">
                <Button asChild variant="outline" size="sm" className="gap-1.5 h-8">
                  <Link to={`/entregas?os=${target.os_id}`}>Ir para Entrega</Link>
                </Button>
              </div>
            </div>
          ) : itens.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center space-y-3 bg-muted/20">
              <PackageOpen className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Nenhum item disponível para este lote.</p>
              <div className="pt-1">
                <Button asChild variant="outline" size="sm" className="gap-1.5 h-8">
                  <Link to={`/envase?os=${target.numero_os}`}>Realizar Envase</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {itensDisponiveis.length > 1 && (
                <div className="flex items-center justify-between">
                  <Label>Embalagens do lote</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      const disp = itensDisponiveis.map((i: any) => i.id);
                      setSelectedIds(selectedIds.length === disp.length ? [] : disp);
                    }}
                  >
                    {selectedIds.length === itensDisponiveis.length ? "Limpar" : "Selecionar todas"}
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {itens.map((it: any) => {
                  const disabled = it.status !== "disponivel";
                  const checked = selectedIds.includes(it.id);
                  const maxQty = Number(it.quantidade ?? 0);
                  return (
                    <div
                      key={it.id}
                      className={`rounded-md border p-3 ${disabled ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        {!disabled && itensDisponiveis.length > 1 && (
                          <Checkbox
                            id={`est-${it.id}`}
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(v) => {
                              setSelectedIds((prev) =>
                                v ? [...prev, it.id] : prev.filter((id) => id !== it.id)
                              );
                            }}
                          />
                        )}
                        <div className="flex-1 text-sm space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{it.produtos?.nome ?? it.microrganismos?.nome ?? "—"}</span>
                            <span className="text-xs font-semibold whitespace-nowrap">{fmtEmb(it)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center justify-between">
                            <span>
                              Volume: <span className="font-semibold text-foreground">{it.volume_total ?? 0} L</span>
                              {disabled && <span className="ml-2 text-[10px] uppercase">já reservado</span>}
                            </span>
                            <span>Validade {formatDateDisplay(it.validade)}</span>
                          </div>
                          {!disabled && checked && (() => {
                            const raw = qtys[it.id] ?? "";
                            const num = Number(raw);
                            const invalid = !raw || isNaN(num) || num <= 0 || num > maxQty;
                            return (
                              <div className="space-y-1 pt-1">
                                <div className="flex items-center gap-2">
                                  <Label htmlFor={`qty-${it.id}`} className="text-xs whitespace-nowrap">Qtd a reservar</Label>
                                  <Input
                                    id={`qty-${it.id}`}
                                    type="number"
                                    min={1}
                                    max={maxQty}
                                    value={raw}
                                    onChange={(e) => {
                                      const clamped = clampQty(e.target.value, maxQty);
                                      setQtys((p) => ({ ...p, [it.id]: clamped }));
                                    }}
                                    className={`h-8 w-24 ${invalid ? "border-destructive text-destructive" : ""}`}
                                  />
                                  <span className="text-[11px] text-muted-foreground">de {maxQty}</span>
                                </div>
                                {invalid && (
                                  <p className="text-[10px] text-destructive font-medium">
                                    {num > maxQty ? `Excede o disponível (${maxQty}).` : "Informe uma quantidade válida."}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 pt-2">
                <Label>Observação (opcional)</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  maxLength={500}
                  placeholder="Detalhes da reserva..."
                  rows={2}
                />
              </div>

              {selectedItems.length > 0 && (
                <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground flex items-center justify-between">
                  <span>Total selecionado:</span>
                  <span className="font-semibold text-foreground">
                    {selectedItems.length} {selectedItems.length === 1 ? "embalagem" : "embalagens"} · {totalUnSel} un · {totalLSel.toFixed(totalLSel % 1 ? 2 : 0)} L
                  </span>
                </div>
              )}

              {progress && (
                <div className="text-xs text-muted-foreground text-center">
                  Reservando {progress.done} de {progress.total}…
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedItems.length === 0 || somenteReservaExistente || submitting || hasInvalid}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmar reserva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
