import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCommercialSimulator } from "@/hooks/useCommercial";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";
import { BookOpen } from "lucide-react";
import { brl as fmt } from "@/lib/financial/format";
import { PrecoComDesconto } from "@/components/comercial/PrecoComDesconto";
import { TotaisCarrinho } from "@/components/comercial/TotaisCarrinho";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

export default function SimuladorComercial() {
  const sim = useCommercialSimulator();
  const [partnerId, setPartnerId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [quantidade, setQuantidade] = useState<string>("1");
  const [desconto, setDesconto] = useState<string>("0");
  const [catalogOpen, setCatalogOpen] = useState(false);

  type SimulationFormSnapshot = {
    partnerId: string;
    productId: string;
    quantidade: string;
    desconto: string;
  };
  const [lastSimulatedValues, setLastSimulatedValues] =
    useState<SimulationFormSnapshot | null>(null);

  const currentValues: SimulationFormSnapshot = { partnerId, productId, quantidade, desconto };
  const areEqual = (a: SimulationFormSnapshot, b: SimulationFormSnapshot) =>
    a.partnerId === b.partnerId &&
    a.productId === b.productId &&
    a.quantidade === b.quantidade &&
    a.desconto === b.desconto;
  const hasAnyMeaningfulInput = (v: SimulationFormSnapshot) =>
    !!v.partnerId || !!v.productId || v.quantidade !== "1" || v.desconto !== "0";
  const isDirty = lastSimulatedValues
    ? !areEqual(currentValues, lastSimulatedValues)
    : hasAnyMeaningfulInput(currentValues);
  useUnsavedChanges(isDirty);

  const { data: partners = [] } = useQuery({
    queryKey: ["partner-accounts-active-sim"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_accounts")
        .select("id, razao_social")
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["produtos-b2b-sim"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, codigo, tipo")
        .eq("ativo", true)
        .eq("b2b_enabled", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedProduct = useMemo(
    () => (products as any[]).find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  const handleSim = () => {
    if (!partnerId || !productId) return;
    const snapshot = { partnerId, productId, quantidade, desconto };
    sim.mutate(
      {
        partner_id: partnerId,
        product_id: productId,
        quantidade: Number(quantidade) || 0,
        desconto: Number(desconto) || 0,
      },
      { onSuccess: () => setLastSimulatedValues(snapshot) },
    );
  };

  const r = sim.data;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Simulador Comercial</h1>
        <p className="text-sm text-muted-foreground">Simule preço, desconto e rentabilidade de operações B2B.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Parâmetros</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Parceiro</label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {partners.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.razao_social}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Produto</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 border rounded-md px-3 py-2 text-sm bg-muted/30">
                  {selectedProduct ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[9px] uppercase">{selectedProduct.tipo}</Badge>
                      <span className="truncate">{selectedProduct.nome}</span>
                      {selectedProduct.codigo && <span className="font-mono text-[10px] text-muted-foreground">{selectedProduct.codigo}</span>}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Nenhum produto selecionado</span>
                  )}
                </div>
                <Sheet open={catalogOpen} onOpenChange={setCatalogOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm"><BookOpen className="h-4 w-4 mr-1" /> Catálogo</Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Catálogo Comercial</SheetTitle>
                      <SheetDescription>Selecione um produto B2B para simular.</SheetDescription>
                    </SheetHeader>
                    <div className="mt-4">
                      <CatalogoCardsGrid
                        scope="interno"
                        filterRow={(r) => r.tipo === "produto" && r.ativo && r.b2b_enabled}
                        showStatusFilter={false}
                        showB2BFilter={false}
                        hideApprovedBadge
                        actionSlot={(r) => (
                          <Button size="sm" onClick={() => { setProductId(r.id); setCatalogOpen(false); }}>
                            Selecionar
                          </Button>
                        )}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Quantidade</label>
              <Input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Desconto (%)</label>
              <Input type="number" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleSim} disabled={sim.isPending || !partnerId || !productId}>
            {sim.isPending ? "Calculando..." : "Simular"}
          </Button>
        </CardContent>
      </Card>

      {r && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
            {r.price_source_label && (
              <p className="text-xs text-muted-foreground">{r.price_source_label}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-md p-3 bg-primary/5 border-primary/30">
              <div className="text-xs text-muted-foreground mb-1">Preço unitário</div>
              <PrecoComDesconto
                valorCheio={r.preco_tabela}
                valorFinal={r.preco_final}
                descontoPct={r.preco_tabela > 0 ? (1 - r.preco_final / r.preco_tabela) * 100 : 0}
                size="lg"
              />
            </div>
            <TotaisCarrinho
              subtotalCheio={Number(r.preco_tabela ?? 0) * (Number(quantidade) || 0)}
              totalFinal={Number(r.valor_total ?? 0)}
              labelTotal="Valor Total"
            />
            <div className="grid md:grid-cols-3 gap-3 text-sm">
              <Kpi label="Custo Estimado/un" value={fmt(r.custo_estimado_unitario)} />
              <Kpi label="Margem Unitária" value={fmt(r.margem_unitaria)} />
              <Kpi label="Margem %" value={`${Number(r.margem_pct ?? 0).toFixed(2)}%`} />
              <Kpi label="Rentabilidade Total" value={fmt(r.rentabilidade_total)} highlight />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-md p-3 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-lg">{value}</div>
    </div>
  );
}
