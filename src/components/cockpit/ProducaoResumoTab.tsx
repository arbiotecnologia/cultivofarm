import { useCockpitQuery } from "@/hooks/useCockpitQuery";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Package } from "lucide-react";

// Volume em `estoque_produto.volume_total` já está em LITROS.
// Volume em `lotes.volume_produzido` está em mL.
const fmtL = (l: number) => `${(l || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`;

interface AggRow {
  key: string;
  label: string;
  tipo: "microrganismo" | "produto";
  produzidoL: number;
  reservadoL: number;
  disponivelL: number;
  vencidoL: number;
  lotes: {
    lote_id: string;
    codigo_lote: string | null;
    produzidoL: number;
    reservadoL: number;
    disponivelL: number;
    vencidoL: number;
  }[];
}

export function ProducaoResumoTab() {
  const { data, isLoading, available } = useCockpitQuery({
    queryKey: ["cockpit-producao-resumo"],
    queryFn: async ({ signal }) => {
      const { data: lotes, error: lotesErr } = await supabase
        .from("lotes")
        .select(
          `id, codigo_lote, volume_produzido, produto_id, microrganismo_id,
           produtos(nome), microrganismos(nome_cientifico, nome)`,
        )
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (lotesErr) throw lotesErr;

      const loteIds = (lotes ?? []).map((l: any) => l.id);
      let estoques: any[] = [];
      if (loteIds.length) {
        const { data: e, error: eErr } = await supabase
          .from("estoque_produto")
          .select(
            "lote_id, volume_total, validade, reservado_para_os_id, quantidade_reservada, expedido_em, status",
          )
          .in("lote_id", loteIds)
          .abortSignal(signal);
        if (eErr) throw eErr;
        estoques = e ?? [];
      }

      const hoje = new Date().toISOString().slice(0, 10);
      const porLote = new Map<string, { reservadoL: number; disponivelL: number; vencidoL: number }>();
      for (const est of estoques) {
        const b = porLote.get(est.lote_id) ?? { reservadoL: 0, disponivelL: 0, vencidoL: 0 };
        const v = Number(est.volume_total) || 0;
        if (!v) {
          porLote.set(est.lote_id, b);
          continue;
        }
        const vencido = est.validade && est.validade < hoje;
        const expedido = !!est.expedido_em;
        const reservado =
          !!est.reservado_para_os_id || Number(est.quantidade_reservada || 0) > 0;
        if (vencido || expedido) b.vencidoL += v;
        else if (reservado) b.reservadoL += v;
        else if (est.status === "disponivel") b.disponivelL += v;
        else b.reservadoL += v;
        porLote.set(est.lote_id, b);
      }

      const groupsMicro = new Map<string, AggRow>();
      const groupsProd = new Map<string, AggRow>();

      for (const l of lotes ?? []) {
        const b = porLote.get(l.id) ?? { reservadoL: 0, disponivelL: 0, vencidoL: 0 };
        const produzidoL = (Number(l.volume_produzido) || 0) / 1000;
        const loteRow = {
          lote_id: l.id,
          codigo_lote: l.codigo_lote,
          produzidoL,
          ...b,
        };

        if (l.microrganismo_id) {
          const nome =
            (l as any).microrganismos?.nome_cientifico ||
            (l as any).microrganismos?.nome ||
            "Microrganismo";

          const g = groupsMicro.get(l.microrganismo_id) ?? {
            key: l.microrganismo_id,
            label: nome,
            tipo: "microrganismo" as const,
            produzidoL: 0,
            reservadoL: 0,
            disponivelL: 0,
            vencidoL: 0,
            lotes: [],
          };
          g.produzidoL += produzidoL;
          g.reservadoL += b.reservadoL;
          g.disponivelL += b.disponivelL;
          g.vencidoL += b.vencidoL;
          g.lotes.push(loteRow);
          groupsMicro.set(l.microrganismo_id, g);
        } else if (l.produto_id) {
          const nome = (l as any).produtos?.nome || "Produto";
          const g = groupsProd.get(l.produto_id) ?? {
            key: l.produto_id,
            label: nome,
            tipo: "produto" as const,
            produzidoL: 0,
            reservadoL: 0,
            disponivelL: 0,
            vencidoL: 0,
            lotes: [],
          };
          g.produzidoL += produzidoL;
          g.reservadoL += b.reservadoL;
          g.disponivelL += b.disponivelL;
          g.vencidoL += b.vencidoL;
          g.lotes.push(loteRow);
          groupsProd.set(l.produto_id, g);
        }
      }

      const micro = Array.from(groupsMicro.values()).sort((a, b) => b.produzidoL - a.produzidoL);
      const prod = Array.from(groupsProd.values()).sort((a, b) => b.produzidoL - a.produzidoL);
      const totals = [...micro, ...prod].reduce(
        (t, g) => ({
          produzidoL: t.produzidoL + g.produzidoL,
          reservadoL: t.reservadoL + g.reservadoL,
          disponivelL: t.disponivelL + g.disponivelL,
          vencidoL: t.vencidoL + g.vencidoL,
        }),
        { produzidoL: 0, reservadoL: 0, disponivelL: 0, vencidoL: 0 },
      );
      return { micro, prod, totals };
    },
    staleTime: 30_000,
  });

  if (!available) return <p role="alert">Resumo indisponível.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando resumo...</p>;
  if (!data) return null;

  const renderGrupo = (g: AggRow) => (
    <div key={g.key} className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {g.tipo === "microrganismo" ? (
            <FlaskConical className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <Package className="h-4 w-4 text-primary shrink-0" />
          )}
          <span className="font-semibold truncate">{g.label}</span>
          <Badge variant="outline" className="text-[10px]">
            {g.lotes.length} lote{g.lotes.length > 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase">Produzido</p>
            <p className="font-mono-data font-bold">{fmtL(g.produzidoL)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase">Reservado OS</p>
            <p className="font-mono-data font-bold text-amber-600 dark:text-amber-500">
              {fmtL(g.reservadoL)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase">Livre</p>
            <p className="font-mono-data font-bold text-emerald-600">{fmtL(g.disponivelL)}</p>
          </div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="text-[11px]">
            <TableHead>Lote</TableHead>
            <TableHead className="text-right">Produzido</TableHead>
            <TableHead className="text-right">Reservado OS</TableHead>
            <TableHead className="text-right">Livre estoque</TableHead>
            <TableHead className="text-right">Vencido/Expedido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {g.lotes.map((l) => (
            <TableRow key={l.lote_id} className="text-xs">
              <TableCell className="font-mono-data">{l.codigo_lote || "—"}</TableCell>
              <TableCell className="text-right font-mono-data">{fmtL(l.produzidoL)}</TableCell>
              <TableCell className="text-right font-mono-data text-amber-600 dark:text-amber-500">
                {fmtL(l.reservadoL)}
              </TableCell>
              <TableCell className="text-right font-mono-data text-emerald-600">
                {fmtL(l.disponivelL)}
              </TableCell>
              <TableCell className="text-right font-mono-data text-muted-foreground">
                {fmtL(l.vencidoL)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Produzido total</p>
          <p className="text-lg font-mono-data font-bold">{fmtL(data.totals.produzidoL)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Reservado p/ OS</p>
          <p className="text-lg font-mono-data font-bold text-amber-600 dark:text-amber-500">
            {fmtL(data.totals.reservadoL)}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Livre em estoque</p>
          <p className="text-lg font-mono-data font-bold text-emerald-600">{fmtL(data.totals.disponivelL)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Vencido/Expedido</p>
          <p className="text-lg font-mono-data font-bold text-muted-foreground">
            {fmtL(data.totals.vencidoL)}
          </p>
        </CardContent></Card>
      </div>

      {data.micro.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FlaskConical className="h-4 w-4" /> Por microrganismo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">{data.micro.map(renderGrupo)}</CardContent>
        </Card>
      )}

      {data.prod.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" /> Por produto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">{data.prod.map(renderGrupo)}</CardContent>
        </Card>
      )}

      {data.micro.length === 0 && data.prod.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-8">
          Nenhum lote registrado ainda.
        </p>
      )}
    </div>
  );
}
