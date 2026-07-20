import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useB2BPartnerProfitability, useRecalcPartnerRiskScore } from "@/hooks/useB2BFinanceiro";
import { RiskBadge } from "@/components/financeiro/RiskBadge";
import { brl } from "@/lib/financial/format";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type BulkStatus = "idle" | "processing" | "completed" | "failed";

export default function CentralGovernancaB2B() {
  const { data = [], isLoading } = useB2BPartnerProfitability();
  const recalc = useRecalcPartnerRiskScore();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ status: BulkStatus; done: number; total: number; failed: number }>(
    { status: "idle", done: 0, total: 0, failed: 0 }
  );

  const handleRecalcAll = async () => {
    if (data.length === 0) return;
    setBulk({ status: "processing", done: 0, total: data.length, failed: 0 });
    let done = 0;
    let failed = 0;
    for (const r of data) {
      try {
        await recalc.mutateAsync(r.partner_id);
      } catch {
        failed++;
      }
      done++;
      setBulk({ status: "processing", done, total: data.length, failed });
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["b2b-aging"] }),
      qc.invalidateQueries({ queryKey: ["b2b-aging-det"] }),
      qc.invalidateQueries({ queryKey: ["b2b-exec-alerts"] }),
      qc.invalidateQueries({ queryKey: ["b2b-exec-dashboard"] }),
      qc.invalidateQueries({ queryKey: ["b2b-profit"] }),
    ]);
    const finalStatus: BulkStatus = failed > 0 ? "failed" : "completed";
    setBulk({ status: finalStatus, done, total: data.length, failed });
    if (failed > 0) toast.error(`${failed} parceiro(s) falharam no recálculo`);
    else toast.success("Score, aging e alertas atualizados");
  };

  const pct = bulk.total > 0 ? Math.round((bulk.done / bulk.total) * 100) : 0;
  const processing = bulk.status === "processing";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Central de Governança Financeira</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada do risco, exposição e situação financeira dos parceiros.</p>
        </div>
        <div className="flex flex-col items-end gap-2 min-w-[260px]">
          <Button onClick={handleRecalcAll} disabled={processing || isLoading || data.length === 0}>
            <RefreshCw className={`h-4 w-4 mr-2 ${processing ? "animate-spin" : ""}`} />
            {processing ? "Recalculando…" : "Recalcular score, aging e alertas"}
          </Button>
          {bulk.status !== "idle" && (
            <div className="w-full space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  {bulk.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                  {bulk.status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                  {processing && `Processando ${bulk.done}/${bulk.total}`}
                  {bulk.status === "completed" && `Concluído (${bulk.done}/${bulk.total})`}
                  {bulk.status === "failed" && `Concluído com falhas (${bulk.done}/${bulk.total})`}
                </span>
                {bulk.failed > 0 && <Badge variant="destructive" className="h-4 text-[10px]">{bulk.failed} falhas</Badge>}
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          )}
        </div>
      </div>


      <Card>
        <CardHeader><CardTitle className="text-base">Parceiros</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parceiro</TableHead>
                <TableHead className="text-right">Comprado</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead className="text-right">Inadimpl.</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Risco</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sem dados.</TableCell></TableRow>}
              {data.map(r => (
                <TableRow key={r.partner_id}>
                  <TableCell className="font-medium">{r.partner_name}</TableCell>
                  <TableCell className="text-right">{brl(r.total_comprado)}</TableCell>
                  <TableCell className="text-right">{brl(r.total_aberto)}</TableCell>
                  <TableCell className="text-right">{Number(r.inadimplencia_pct).toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{r.risk_score}</TableCell>
                  <TableCell className="text-right"><RiskBadge level={r.risk_level} /></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={busy === r.partner_id}
                      onClick={async () => { setBusy(r.partner_id); try { await recalc.mutateAsync(r.partner_id); } finally { setBusy(null); } }}>
                      <RefreshCw className={`h-4 w-4 ${busy === r.partner_id ? "animate-spin" : ""}`} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
