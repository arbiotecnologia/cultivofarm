import { useCockpitQuery } from "@/hooks/useCockpitQuery";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Package, ShoppingBag } from "lucide-react";
import { buildProductionSummary, type LegacyGroup, type RevendaGroup } from "@/lib/estoque/productionSummary";
import { formatStockValue } from "@/lib/estoque/stockUnits";

// Volume legado em estoque_produto.volume_total está em L; lotes.volume_produzido está em mL.
const fmtL = (l: number) => `${(l || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`;

export function ProducaoResumoTab() {
  const { data, isLoading, available } = useCockpitQuery({
    queryKey: ["cockpit-producao-resumo"],
    queryFn: async ({ signal }) => {
      const { data: lotes, error: lotesErr } = await supabase
        .from("lotes")
        .select(`id, codigo_lote, volume_produzido, produto_id, microrganismo_id,
                 produtos(nome), microrganismos(nome_cientifico, nome)`)
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (lotesErr) throw lotesErr;

      const loteIds = (lotes ?? []).map((lot) => lot.id);
      let estoques: any[] = [];
      if (loteIds.length) {
        const { data: rows, error } = await supabase
          .from("estoque_produto")
          .select("lote_id, quantidade, volume_total, origem_estoque, unidade_comercial, conteudo_por_unidade, unidade_conteudo, quantidade_conteudo, validade, reservado_para_os_id, quantidade_reservada, expedido_em, status")
          .in("lote_id", loteIds)
          .abortSignal(signal);
        if (error) throw error;
        estoques = rows ?? [];
      }
      return buildProductionSummary(lotes ?? [], estoques, new Date().toISOString().slice(0, 10));
    },
    staleTime: 30_000,
  });

  if (!available) return <p role="alert">Resumo indisponível.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando resumo...</p>;
  if (!data) return null;

  const renderGrupo = (group: LegacyGroup) => (
    <div key={group.key} className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {group.tipo === "microrganismo" ? <FlaskConical className="h-4 w-4 text-primary shrink-0" /> : <Package className="h-4 w-4 text-primary shrink-0" />}
          <span className="font-semibold truncate">{group.label}</span>
          <Badge variant="outline" className="text-[10px]">{group.lotes.length} lote{group.lotes.length > 1 ? "s" : ""}</Badge>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-right"><p className="text-[10px] text-muted-foreground uppercase">Produzido</p><p className="font-mono-data font-bold">{fmtL(group.produzidoL)}</p></div>
          <div className="text-right"><p className="text-[10px] text-muted-foreground uppercase">Reservado OS</p><p className="font-mono-data font-bold text-amber-600 dark:text-amber-500">{fmtL(group.reservadoL)}</p></div>
          <div className="text-right"><p className="text-[10px] text-muted-foreground uppercase">Livre</p><p className="font-mono-data font-bold text-emerald-600">{fmtL(group.disponivelL)}</p></div>
        </div>
      </div>
      <Table>
        <TableHeader><TableRow className="text-[11px]"><TableHead>Lote</TableHead><TableHead className="text-right">Produzido</TableHead><TableHead className="text-right">Reservado OS</TableHead><TableHead className="text-right">Livre estoque</TableHead><TableHead className="text-right">Vencido/Expedido</TableHead></TableRow></TableHeader>
        <TableBody>{group.lotes.map((lot) => (
          <TableRow key={lot.lote_id} className="text-xs">
            <TableCell className="font-mono-data">{lot.codigo_lote || "—"}</TableCell>
            <TableCell className="text-right font-mono-data">{fmtL(lot.produzidoL)}</TableCell>
            <TableCell className="text-right font-mono-data text-amber-600 dark:text-amber-500">{fmtL(lot.reservadoL)}</TableCell>
            <TableCell className="text-right font-mono-data text-emerald-600">{fmtL(lot.disponivelL)}</TableCell>
            <TableCell className="text-right font-mono-data text-muted-foreground">{fmtL(lot.vencidoL)}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );

  const renderRevenda = (group: RevendaGroup) => (
    <div key={group.key} className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0"><ShoppingBag className="h-4 w-4 text-primary shrink-0" /><span className="font-semibold truncate">{group.label}</span><Badge variant="outline">{group.lotes.length} lote{group.lotes.length > 1 ? "s" : ""}</Badge></div>
        <span className="text-sm font-mono-data font-semibold">Entrada: {formatStockValue(group.entrada, group.unit)}</span>
      </div>
      <Table>
        <TableHeader><TableRow className="text-[11px]"><TableHead>Lote do fornecedor</TableHead><TableHead className="text-right">Entrada</TableHead><TableHead className="text-right">Reservado OS</TableHead><TableHead className="text-right">Livre estoque</TableHead><TableHead className="text-right">Vencido/Expedido</TableHead></TableRow></TableHeader>
        <TableBody>{group.lotes.map((lot) => (
          <TableRow key={`${lot.lote_id}:${lot.unit}`} className="text-xs">
            <TableCell className="font-mono-data">{lot.codigo_lote || "—"}</TableCell>
            <TableCell className="text-right font-mono-data">{formatStockValue(lot.entrada, lot.unit)}</TableCell>
            <TableCell className="text-right font-mono-data">{formatStockValue(lot.reservado, lot.unit)}</TableCell>
            <TableCell className="text-right font-mono-data">{formatStockValue(lot.disponivel, lot.unit)}</TableCell>
            <TableCell className="text-right font-mono-data text-muted-foreground">{formatStockValue(lot.vencido, lot.unit)}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Produzido total</p><p className="text-lg font-mono-data font-bold">{fmtL(data.totals.produzidoL)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Reservado p/ OS</p><p className="text-lg font-mono-data font-bold text-amber-600 dark:text-amber-500">{fmtL(data.totals.reservadoL)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Livre em estoque</p><p className="text-lg font-mono-data font-bold text-emerald-600">{fmtL(data.totals.disponivelL)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[10px] uppercase text-muted-foreground">Vencido/Expedido</p><p className="text-lg font-mono-data font-bold text-muted-foreground">{fmtL(data.totals.vencidoL)}</p></CardContent></Card>
      </div>

      {data.micro.length > 0 && <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Por microrganismo</CardTitle></CardHeader><CardContent className="space-y-3">{data.micro.map(renderGrupo)}</CardContent></Card>}
      {data.prod.length > 0 && <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Produção por produto</CardTitle></CardHeader><CardContent className="space-y-3">{data.prod.map(renderGrupo)}</CardContent></Card>}
      {data.revenda.length > 0 && <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> Compras para revenda</CardTitle></CardHeader><CardContent className="space-y-3">{data.revenda.map(renderRevenda)}</CardContent></Card>}
      {data.micro.length === 0 && data.prod.length === 0 && data.revenda.length === 0 && <p className="text-sm text-muted-foreground italic text-center py-8">Nenhum lote registrado ainda.</p>}
    </div>
  );
}
