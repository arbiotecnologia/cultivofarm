import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Sparkles, Wand2 } from "lucide-react";
import { useCatalogoVolumes, CatalogoVolume, formatVolumeLabel } from "@/hooks/useCatalogoVolumes";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";
import { brl } from "@/lib/financial/format";
import { round2, roundVolume, labelUnidadeCurta } from "@/lib/catalogo/formatUnidades";
import { PrecoComDesconto } from "@/components/comercial/PrecoComDesconto";
import { TotaisCarrinho } from "@/components/comercial/TotaisCarrinho";
import { suggestVasilhames, sameLinhas, type LinhaVasilhame } from "@/lib/vasilhameSelection";

const nfmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export interface AddToCartPayload {
  volume: CatalogoVolume;
  area_ha: number | null;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  preco_unitario_cheio: number;
  subtotal_cheio: number;
  desconto_percentual: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: CatalogoUnificadoRow | null;
  doseRecomendadaLitroHa?: number | null;
  precoPorVolume?: (v: CatalogoVolume) => number | null;
  valorLitroBase?: number | null;
  valorLitroCheio?: number | null;
  descontoPct?: number | null;
  /** Recebe uma lista — um item por linha de vasilhame (combinação possível). */
  onConfirm: (payloads: AddToCartPayload[]) => void;
}

export function AddToCartDialog({
  open,
  onOpenChange,
  row,
  doseRecomendadaLitroHa,
  precoPorVolume,
  valorLitroBase,
  valorLitroCheio,
  descontoPct,
  onConfirm,
}: Props) {
  const { data: volumesCat } = useCatalogoVolumes();
  const volumesDisponiveis = useMemo<CatalogoVolume[]>(() => {
    if (!row) return [];
    const map = row.tipo === "produto" ? volumesCat?.porProdutoId : volumesCat?.porMicrorganismoId;
    return map?.get(row.id) ?? [];
  }, [row, volumesCat]);

  const [linhas, setLinhas] = useState<LinhaVasilhame[]>([]);
  const [areaHa, setAreaHa] = useState<string>("");
  const [litros, setLitros] = useState<string>("");
  const [combine, setCombine] = useState(true);
  const [manualOverride, setManualOverride] = useState(false);
  /** Origem da última edição de ha/L para evitar loop de sincronização. */
  const lastEditedRef = useRef<"ha" | "L" | null>(null);

  const descPct = Number(descontoPct ?? 0);

  const precoVolume = (v: CatalogoVolume): number => {
    const override = precoPorVolume?.(v);
    if (override != null) return override;
    // Fonte única: valor_litro_brl da tabela mestre (exibido no card).
    if (valorLitroBase && valorLitroBase > 0 && v.volume_ml > 0) {
      return round2(valorLitroBase * (v.volume_ml / 1000));
    }
    // Fallback: preço cadastrado no vasilhame.
    return v.preco_brl;
  };

  const precoVolumeCheio = (v: CatalogoVolume, finalVol: number): number => {
    if (valorLitroCheio && valorLitroCheio > 0 && v.volume_ml > 0) {
      return round2(valorLitroCheio * (v.volume_ml / 1000));
    }
    if (descPct > 0.0001 && descPct < 100) {
      return round2(finalVol / (1 - descPct / 100));
    }
    return finalVol;
  };

  // Reset on open / row change
  useEffect(() => {
    if (!open) return;
    setLinhas([]);
    setAreaHa("");
    setLitros("");
    setCombine(true);
    setManualOverride(false);
    lastEditedRef.current = null;
  }, [open, row?.id]);

  // Sincroniza ha ↔ L (quando há dose)
  useEffect(() => {
    if (!open) return;
    if (!doseRecomendadaLitroHa || doseRecomendadaLitroHa <= 0) return;
    if (lastEditedRef.current === "ha") {
      const ha = Number(areaHa);
      if (Number.isFinite(ha) && ha > 0) {
        const L = roundVolume(ha * doseRecomendadaLitroHa);
        setLitros(String(L));
      } else if (areaHa === "") {
        setLitros("");
      }
    } else if (lastEditedRef.current === "L") {
      const L = Number(litros);
      if (Number.isFinite(L) && L > 0) {
        const ha = roundVolume(L / doseRecomendadaLitroHa);
        setAreaHa(String(ha));
      } else if (litros === "") {
        setAreaHa("");
      }
    }
  }, [areaHa, litros, doseRecomendadaLitroHa, open]);

  const Lneed = useMemo(() => {
    const L = Number(litros);
    if (Number.isFinite(L) && L > 0) return L;
    const ha = Number(areaHa);
    if (doseRecomendadaLitroHa && doseRecomendadaLitroHa > 0 && Number.isFinite(ha) && ha > 0) {
      return ha * doseRecomendadaLitroHa;
    }
    return 0;
  }, [litros, areaHa, doseRecomendadaLitroHa]);

  const sugestao = useMemo<LinhaVasilhame[]>(() => {
    if (!volumesDisponiveis.length || Lneed <= 0) return [];
    // Produção/envase opera apenas em litros fechados — arredonda para o próximo litro inteiro.
    const LneedInteiro = Math.ceil(Lneed);
    return suggestVasilhames({
      volumes: volumesDisponiveis,
      priceOf: precoVolume,
      Lneed: LneedInteiro,
      combine,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumesDisponiveis, Lneed, combine, valorLitroBase, descPct]);

  // Auto-aplica sugestão quando não há override manual
  useEffect(() => {
    if (!open) return;
    if (manualOverride) return;
    if (sugestao.length === 0) {
      // Sem Lneed → mantém ao menos uma linha-base para edição manual.
      if (linhas.length === 0 && volumesDisponiveis.length > 0) {
        setLinhas([{ volumeId: volumesDisponiveis[0].id, qtd: 1 }]);
      }
      return;
    }
    if (!sameLinhas(linhas, sugestao)) {
      setLinhas(sugestao);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestao, manualOverride, open, volumesDisponiveis]);

  const markManual = () => setManualOverride(true);

  const updateLinha = (idx: number, patch: Partial<LinhaVasilhame>) => {
    markManual();
    setLinhas((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      // Se outra linha já tem esse volume, soma e remove a atual.
      if (patch.volumeId) {
        const dupIdx = next.findIndex((l, i) => i !== idx && l.volumeId === patch.volumeId);
        if (dupIdx >= 0) {
          next[dupIdx] = { ...next[dupIdx], qtd: next[dupIdx].qtd + merged.qtd };
          next.splice(idx, 1);
          return next;
        }
      }
      next[idx] = merged;
      return next;
    });
  };

  const removeLinha = (idx: number) => {
    markManual();
    setLinhas((prev) => prev.filter((_, i) => i !== idx));
  };

  const addLinha = () => {
    markManual();
    const usados = new Set(linhas.map((l) => l.volumeId));
    const disponivel = volumesDisponiveis.find((v) => !usados.has(v.id));
    if (!disponivel) return;
    setLinhas((prev) => [...prev, { volumeId: disponivel.id, qtd: 1 }]);
  };

  const aplicarSugestao = () => {
    setManualOverride(false);
    if (sugestao.length) setLinhas(sugestao);
  };

  // Totais
  const detalhe = useMemo(() => {
    return linhas
      .map((l) => {
        const v = volumesDisponiveis.find((x) => x.id === l.volumeId);
        if (!v) return null;
        const unit = precoVolume(v);
        const unitCheio = precoVolumeCheio(v, unit);
        const subtotal = round2(unit * l.qtd);
        const subtotalCheio = round2(unitCheio * l.qtd);
        return { linha: l, v, unit, unitCheio, subtotal, subtotalCheio };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, volumesDisponiveis, valorLitroBase, descPct]);

  const totalFinal = detalhe.reduce((s, d) => s + d.subtotal, 0);
  const totalCheio = detalhe.reduce((s, d) => s + d.subtotalCheio, 0);
  const litrosTotais = detalhe.reduce((s, d) => s + (d.linha.qtd * d.v.volume_ml) / 1000, 0);
  const doses100ml = detalhe.reduce((s, d) => s + (d.linha.qtd * d.v.volume_ml) / 100, 0);
  const sobra = Lneed > 0 ? Math.max(0, litrosTotais - Lneed) : 0;
  const faltante = Lneed > 0 ? Math.max(0, Lneed - litrosTotais) : 0;
  const coberturaHa = doseRecomendadaLitroHa && doseRecomendadaLitroHa > 0
    ? litrosTotais / doseRecomendadaLitroHa
    : 0;

  const sugestaoDifere = sugestao.length > 0 && !sameLinhas(linhas, sugestao);
  const usandoSugestao = !manualOverride && sugestao.length > 0 && sameLinhas(linhas, sugestao);

  const litrosInteiros = litrosTotais > 0 && Math.abs(litrosTotais - Math.round(litrosTotais)) < 1e-6;

  const podeConfirmar = detalhe.length > 0
    && detalhe.every((d) => d.linha.qtd > 0 && d.unit > 0)
    && litrosInteiros;

  const handleConfirm = () => {
    if (!podeConfirmar) return;
    const payloads: AddToCartPayload[] = detalhe.map((d) => ({
      volume: d.v,
      area_ha: Number(areaHa) > 0 ? Number(areaHa) : null,
      quantidade: d.linha.qtd,
      preco_unitario: d.unit,
      subtotal: d.subtotal,
      preco_unitario_cheio: d.unitCheio,
      subtotal_cheio: d.subtotalCheio,
      desconto_percentual: descPct,
    }));
    onConfirm(payloads);
    onOpenChange(false);
  };

  const setAreaHaInput = (v: string) => {
    lastEditedRef.current = "ha";
    setManualOverride(false);
    setAreaHa(v);
  };
  const setLitrosInput = (v: string) => {
    lastEditedRef.current = "L";
    setManualOverride(false);
    setLitros(v);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Adicionar ao carrinho</DialogTitle>
          <DialogDescription className="truncate">
            {row?.nome}
            {row?.codigo && <span className="font-mono ml-2 text-[10px]">{row.codigo}</span>}
          </DialogDescription>
        </DialogHeader>

        {volumesDisponiveis.length === 0 ? (
          <Alert className="border-amber-300 bg-amber-50">
            <AlertDescription className="text-xs text-amber-900">
              Nenhum volume comercial cadastrado para este item. Solicite à Cultivo Farm.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {/* Necessidade */}
            <div className="grid grid-cols-2 gap-2">
              {doseRecomendadaLitroHa && doseRecomendadaLitroHa > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Área-alvo (ha)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={areaHa}
                    onChange={(e) => setAreaHaInput(e.target.value)}
                    placeholder="Ex.: 200"
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Volume total (L)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={litros}
                  onChange={(e) => setLitrosInput(e.target.value)}
                  placeholder="Ex.: 20"
                />
              </div>
            </div>
            {doseRecomendadaLitroHa && doseRecomendadaLitroHa > 0 && (
              <p className="text-[10px] text-muted-foreground italic -mt-1">
                Dose referencial: {nfmt.format(doseRecomendadaLitroHa)} L/ha. Os vasilhames são sugeridos automaticamente — ajuste se necessário.
              </p>
            )}

            {/* Toggle combinar */}
            <div className="flex items-center justify-between border rounded-md p-2">
              <div className="space-y-0.5">
                <Label htmlFor="combine-toggle" className="text-xs font-medium">Combinar vasilhames</Label>
                <p className="text-[10px] text-muted-foreground">
                  Mistura tamanhos diferentes para minimizar sobra (ex.: 20 L + 5 L). Alterar reaplica a sugestão.
                </p>
              </div>
              <Switch
                id="combine-toggle"
                checked={combine}
                onCheckedChange={(v) => {
                  setCombine(v);
                  setManualOverride(false);
                  setLinhas([]);
                }}
              />
            </div>

            {/* Linhas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Vasilhames</Label>
                {usandoSugestao && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Sparkles className="h-3 w-3" /> Sugestão automática
                  </Badge>
                )}
                {sugestaoDifere && (
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={aplicarSugestao}>
                    <Wand2 className="h-3 w-3" /> Sugerir conjunto ideal
                  </Button>
                )}
              </div>

              {detalhe.map((d, idx) => {
                const plAtual = d.v.volume_ml > 0 ? d.unit / (d.v.volume_ml / 1000) : 0;
                return (
                  <div key={idx} className="border rounded-md p-2 space-y-2">
                    <div className="flex items-end gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <Label className="text-[10px] text-muted-foreground">Volume</Label>
                        <Select
                          value={d.linha.volumeId}
                          onValueChange={(v) => updateLinha(idx, { volumeId: v })}
                        >
                          <SelectTrigger className="h-8 text-xs w-full min-w-0">
                            <SelectValue asChild>
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap truncate">
                                <span className="font-medium">{formatVolumeLabel(d.v)}</span>
                                <span className="text-muted-foreground">· {brl(plAtual)}{labelUnidadeCurta("litro")}</span>
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {volumesDisponiveis.map((v) => {
                              const p = precoVolume(v);
                              const pCheio = precoVolumeCheio(v, p);
                              const pl = v.volume_ml > 0 ? p / (v.volume_ml / 1000) : 0;
                              const disc = pCheio > p + 0.005;
                              return (
                                <SelectItem key={v.id} value={v.id}>
                                  <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                                    <span className="font-medium">{formatVolumeLabel(v)}</span>
                                    <span className="text-muted-foreground">—</span>
                                    {disc && <span className="line-through text-muted-foreground">{brl(pCheio)}</span>}
                                    <span className="font-semibold">{brl(p)}</span>
                                    <span className="text-muted-foreground">· {brl(pl)}{labelUnidadeCurta("litro")}</span>
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 w-20 shrink-0">
                        <Label className="text-[10px] text-muted-foreground">Qtd</Label>
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          className="h-8 text-xs"
                          value={d.linha.qtd}
                          onChange={(e) => updateLinha(idx, { qtd: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLinha(idx)}
                        disabled={detalhe.length <= 1}
                        aria-label="Remover vasilhame"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between border-t pt-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {d.linha.qtd} × {brl(d.unit)}
                      </span>
                      <PrecoComDesconto
                        valorCheio={d.subtotalCheio}
                        valorFinal={d.subtotal}
                        descontoPct={descPct}
                        size="sm"
                        align="end"
                      />
                    </div>
                  </div>
                );
              })}

              {combine && volumesDisponiveis.length > linhas.length && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-1"
                  onClick={addLinha}
                >
                  <Plus className="h-3 w-3" /> Adicionar vasilhame
                </Button>
              )}
            </div>

            {/* Resumo */}
            <div className="border rounded-md p-2 text-xs space-y-1 bg-muted/30">
              <div className="flex justify-between"><span className="text-muted-foreground">Volume total entregue</span><span>{nfmt.format(litrosTotais)} L</span></div>
              {Lneed > 0 && (
                <>
                  {sobra > 0 && (
                    <div className="flex justify-between text-amber-700"><span>Sobra</span><span>+{nfmt.format(sobra)} L</span></div>
                  )}
                  {faltante > 0 && (
                    <div className="flex justify-between text-destructive"><span>Faltante</span><span>-{nfmt.format(faltante)} L</span></div>
                  )}
                </>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Dose 100 mL</span><span>{Math.round(doses100ml)} Doses</span></div>
              {coberturaHa > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Cobertura estimada</span><span>{nfmt.format(coberturaHa)} ha</span></div>
              )}
              <TotaisCarrinho subtotalCheio={totalCheio} totalFinal={totalFinal} compact className="mt-1" />
            </div>

            {litrosTotais > 0 && !litrosInteiros && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  Produção e envase operam apenas em litros fechados. Ajuste os vasilhames para totalizar um volume inteiro (atual: {nfmt.format(litrosTotais)} L).
                </AlertDescription>
              </Alert>
            )}

            {detalhe.some((d) => d.unit <= 0) && (
              <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                Algum vasilhame sem preço configurado
              </Badge>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!podeConfirmar}>Adicionar ao carrinho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
