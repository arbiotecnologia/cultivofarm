import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, Wand2, Sparkles, AlertTriangle, Info, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoedaBR } from "@/lib/masks";
import { formatDateDisplay } from "@/lib/date-utils";
import {
  usePartnerPrices,
  useSavePartnerPrices,
  calcFinal,
  calcEquivDose100mlFromHa,
  calcEquivLitroFromHa,
  calcLitroFromDose100ml,
  type PartnerPriceRow,
} from "@/hooks/usePartnerPrices";
import { PrecoComDesconto } from "@/components/comercial/PrecoComDesconto";
import { UNIDADE_LABEL_CURTA } from "@/lib/catalogo/unidades";

interface Props {
  partnerId: string;
  defaultDiscount?: number;
}

export function ParceiroPrecosTab({ partnerId, defaultDiscount = 0 }: Props) {
  const { data, isLoading } = usePartnerPrices(partnerId);
  const save = useSavePartnerPrices(partnerId);
  const qc = useQueryClient();
  const [rows, setRows] = useState<PartnerPriceRow[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState<number>(defaultDiscount);
  const [generating, setGenerating] = useState(false);
  const [normalizing, setNormalizing] = useState(false);

  useEffect(() => {
    setGlobalDiscount(defaultDiscount);
  }, [defaultDiscount]);

  const applyDefaultDiscountAll = async () => {
    if (!confirm(`Gerar tabela inicial aplicando ${defaultDiscount}% em todos os itens ativos?`)) return;
    setGenerating(true);
    try {
      const { data: count, error } = await supabase.rpc(
        "partner_apply_default_discount" as any,
        { p_partner_id: partnerId },
      );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["partner-prices", partnerId] });
      await qc.invalidateQueries({ queryKey: ["partner-catalog-secure", partnerId] });
      if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
        toast.info("Catálogo indisponível ou sem itens autorizados para gerar a tabela.");
      } else {
        toast.success("Tabela inicial gerada com sucesso");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar tabela");
    } finally {
      setGenerating(false);
    }
  };

  const normalizeAllToDefault = async () => {
    if (!confirm(`Normalizar todos os itens ao desconto padrão do parceiro (${defaultDiscount}%)? Exceções manuais serão sobrescritas.`)) return;
    setNormalizing(true);
    try {
      const { data: count, error } = await supabase.rpc(
        "partner_reset_prices_to_default" as any,
        { p_partner_id: partnerId },
      );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["partner-prices", partnerId] });
      await qc.invalidateQueries({ queryKey: ["partner-catalog-secure", partnerId] });
      toast.success(`${count ?? 0} itens normalizados ao padrão`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao normalizar");
    } finally {
      setNormalizing(false);
    }
  };

  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return rows.some((r, i) => {
      const o = data[i];
      return (
        !o ||
        r.preco_tabela !== o.preco_tabela ||
        r.desconto_percentual !== o.desconto_percentual ||
        r.preco_final !== o.preco_final
      );
    });
  }, [rows, data]);

  const updateRow = (idx: number, patch: Partial<PartnerPriceRow>) => {
    setRows((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };
      merged.preco_final = calcFinal(merged.preco_tabela, merged.desconto_percentual);
      next[idx] = merged;
      return next;
    });
  };

  const applyGlobalDiscount = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        desconto_percentual: globalDiscount,
        preco_final: calcFinal(r.preco_tabela, globalDiscount),
      })),
    );
  };

  const recalc = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        preco_final: calcFinal(r.preco_tabela, r.desconto_percentual),
      })),
    );
  };

  const handleSave = () => {
    const changed = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => {
        const o = data?.[i];
        return (
          !o ||
          r.preco_tabela !== o.preco_tabela ||
          r.desconto_percentual !== o.desconto_percentual ||
          r.preco_final !== o.preco_final
        );
      });
    save.mutate(
      changed.map(({ r }) => ({
        tipo: r.tipo,
        item_id: r.item_id,
        preco_tabela: r.preco_tabela,
        desconto_percentual: r.desconto_percentual,
        preco_final: r.preco_final,
      })),
    );
  };

  const produtoIdx = rows
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.tipo === "produto");
  const microIdx = rows
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.tipo === "microrganismo");

  const isException = (pct: number) =>
    Math.abs(Number(pct ?? 0) - Number(defaultDiscount ?? 0)) > 0.001;

  const resetRowToDefault = (idx: number) => {
    updateRow(idx, { desconto_percentual: defaultDiscount });
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Desconto padrão do parceiro: <strong>{defaultDiscount}%</strong>. Aplicado automaticamente em
          todo o catálogo (produtos e microrganismos). Valores diferentes aparecem como
          <Badge variant="outline" className="mx-1 border-amber-300 text-amber-700 bg-amber-50">Exceção</Badge>
          e <strong>não</strong> são sobrescritos quando o desconto padrão do parceiro é alterado.
        </AlertDescription>
      </Alert>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Esta tabela é a <strong>prioridade 2</strong> do motor comercial (preço por parceiro).
          Regras da matriz canônica por condição de pagamento (preço fixo ou "sob consulta") têm
          precedência sobre estes valores e são mantidas pela equipe comercial na matriz de
          condições. O preço efetivo de cada pedido é sempre recalculado no servidor.
        </AlertDescription>
      </Alert>


      <Card className="p-3 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <Label>Desconto global (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={globalDiscount}
            onChange={(e) => setGlobalDiscount(Number(e.target.value))}
          />
        </div>
        <Button variant="outline" onClick={applyGlobalDiscount}>
          <Wand2 className="h-4 w-4 mr-1" />
          Aplicar em todos
        </Button>
        <Button variant="outline" onClick={recalc}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Recalcular
        </Button>
        <Button onClick={handleSave} disabled={!dirty || save.isPending}>
          <Save className="h-4 w-4 mr-1" />
          Salvar tabela
        </Button>
      </Card>

      <Card className="p-3 flex flex-col sm:flex-row gap-2 sm:items-center justify-between bg-muted/40">
        <div className="text-sm">
          <div className="font-medium">Gerar / normalizar tabela com desconto padrão</div>
          <div className="text-xs text-muted-foreground">
            Aplica {defaultDiscount}% (desconto padrão do parceiro) em todos os itens ativos.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={normalizing || defaultDiscount < 0}
            onClick={normalizeAllToDefault}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            {normalizing ? "Normalizando..." : "Normalizar todos ao padrão"}
          </Button>
          <Button
            variant="secondary"
            disabled={generating || defaultDiscount <= 0}
            onClick={applyDefaultDiscountAll}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {generating ? "Gerando..." : "Gerar tabela inicial"}
          </Button>
        </div>
      </Card>

      {/* PRODUTOS */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 flex flex-wrap items-center gap-2 border-b">
          <div className="font-semibold">Produtos</div>
          <Badge variant="secondary">Unidade: hectare</Badge>
          <span className="text-xs text-muted-foreground">
            O valor cadastrado será usado como R$/ha no catálogo, carrinho e pedido B2B.
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="w-[160px]">Preço tabela por hectare</TableHead>
                <TableHead className="w-[110px]">Desconto %</TableHead>
                <TableHead className="w-[160px] text-right">Preço final por hectare</TableHead>
                <TableHead className="w-[180px]">Preview ao parceiro</TableHead>
                <TableHead className="w-[150px] text-right">Equiv. dose 100 mL</TableHead>
                <TableHead className="w-[140px] text-right">Equiv. litro</TableHead>
                <TableHead className="w-[140px]">Última atualização</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && produtoIdx.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Nenhum produto ativo encontrado.
                  </TableCell>
                </TableRow>
              )}
              {produtoIdx.map(({ r, i }) => {
                const dose = calcEquivDose100mlFromHa(r.preco_final, r.dose_ml_ha);
                const litro = calcEquivLitroFromHa(r.preco_final, r.dose_ml_ha);
                const semDose = !r.dose_ml_ha || r.dose_ml_ha <= 0;
                return (
                  <TableRow key={`p-${r.item_id}`}>
                    <TableCell>
                      <div className="font-medium">{r.item_nome}</div>
                      {r.item_codigo && (
                        <div className="text-xs text-muted-foreground font-mono">{r.item_codigo}</div>
                      )}
                      {semDose && (
                        <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Sem dose mL/ha cadastrada
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <MoneyInput
                        value={r.preco_tabela}
                        onValueChange={(v) => updateRow(i, { preco_tabela: Number(v ?? 0) })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={r.desconto_percentual}
                          onChange={(e) =>
                            updateRow(i, { desconto_percentual: Number(e.target.value) })
                          }
                        />
                        {isException(r.desconto_percentual) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            title={`Restaurar ao padrão (${defaultDiscount}%)`}
                            onClick={() => resetRowToDefault(i)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {isException(r.desconto_percentual) && (
                        <Badge
                          variant="outline"
                          className="mt-1 border-amber-300 text-amber-700 bg-amber-50 text-[10px]"
                        >
                          Exceção
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoedaBR(r.preco_final)}<span className="text-xs text-muted-foreground">{UNIDADE_LABEL_CURTA.hectare}</span>
                    </TableCell>
                    <TableCell>
                      <PrecoComDesconto
                        valorCheio={r.preco_tabela}
                        valorFinal={r.preco_final}
                        descontoPct={r.desconto_percentual}
                        unidadeLabel={UNIDADE_LABEL_CURTA.hectare}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {dose == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>{formatMoedaBR(dose)}<span className="text-xs text-muted-foreground">{UNIDADE_LABEL_CURTA.dose_100ml}</span></>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {litro == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>{formatMoedaBR(litro)}<span className="text-xs text-muted-foreground">{UNIDADE_LABEL_CURTA.litro}</span></>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.updated_at ? formatDateDisplay(r.updated_at) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="p-3 border-t text-xs text-muted-foreground">
          Cálculo: valor por dose 100 mL = preço por hectare ÷ (dose mL/ha ÷ 100). Valor por litro = valor por dose × 10. Produtos sem dose mL/ha cadastrada não terão valor equivalente por dose e litro.
        </div>
      </Card>

      {/* MICRORGANISMOS */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 flex flex-wrap items-center gap-2 border-b">
          <div className="font-semibold">Microrganismos</div>
          <Badge variant="secondary">Unidade: dose 100 mL</Badge>
          <span className="text-xs text-muted-foreground">
            O valor cadastrado será usado como R$/dose de 100 mL no catálogo, carrinho e pedido B2B.
          </span>
        </div>
        <div className="px-3 pt-3">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              1 litro = 10 doses de 100 mL. Valor equivalente por litro = dose × 10. Para preço por litro, cadastre o valor da dose correspondente.
            </AlertDescription>
          </Alert>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Microrganismo</TableHead>
                <TableHead className="w-[180px]">Preço tabela por dose 100 mL</TableHead>
                <TableHead className="w-[110px]">Desconto %</TableHead>
                <TableHead className="w-[180px] text-right">Preço final por dose 100 mL</TableHead>
                <TableHead className="w-[180px]">Preview ao parceiro</TableHead>
                <TableHead className="w-[140px] text-right">Equiv. litro</TableHead>
                <TableHead className="w-[140px]">Última atualização</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && microIdx.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Nenhum microrganismo ativo encontrado.
                  </TableCell>
                </TableRow>
              )}
              {microIdx.map(({ r, i }) => {
                const litro = calcLitroFromDose100ml(r.preco_final);
                return (
                  <TableRow key={`m-${r.item_id}`}>
                    <TableCell>
                      <div className="font-medium">{r.item_nome}</div>
                      {r.item_codigo && (
                        <div className="text-xs text-muted-foreground font-mono">{r.item_codigo}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <MoneyInput
                        value={r.preco_tabela}
                        onValueChange={(v) => updateRow(i, { preco_tabela: Number(v ?? 0) })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={r.desconto_percentual}
                          onChange={(e) =>
                            updateRow(i, { desconto_percentual: Number(e.target.value) })
                          }
                        />
                        {isException(r.desconto_percentual) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            title={`Restaurar ao padrão (${defaultDiscount}%)`}
                            onClick={() => resetRowToDefault(i)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {isException(r.desconto_percentual) && (
                        <Badge
                          variant="outline"
                          className="mt-1 border-amber-300 text-amber-700 bg-amber-50 text-[10px]"
                        >
                          Exceção
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoedaBR(r.preco_final)}<span className="text-xs text-muted-foreground">{UNIDADE_LABEL_CURTA.dose_100ml}</span>
                    </TableCell>
                    <TableCell>
                      <PrecoComDesconto
                        valorCheio={r.preco_tabela}
                        valorFinal={r.preco_final}
                        descontoPct={r.desconto_percentual}
                        unidadeLabel={UNIDADE_LABEL_CURTA.dose_100ml}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatMoedaBR(litro)}<span className="text-xs text-muted-foreground">{UNIDADE_LABEL_CURTA.litro}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.updated_at ? formatDateDisplay(r.updated_at) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Preço final é persistido na tabela. Histórico de alterações registrado automaticamente em auditoria (quem, quando, valor anterior e novo). Produtos são precificados por hectare; microrganismos por dose de 100 mL.
      </p>
    </div>
  );
}
