import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Wallet, Download, ChevronRight } from "lucide-react";
import { B2BFinanceRouteGuard } from "@/components/guards/B2BFinanceRouteGuard";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useB2BFinanceCredit, useB2BFinanceObligations } from "@/hooks/useB2BFinance";
import { brl, fmtDate } from "@/lib/financial/format";
import { exportToCSV, buildExportFilename } from "@/lib/biExport";
import {
  installmentBalance, isOverdue, obligationStatusLabel, obligationExportRows, OBLIGATION_EXPORT_HEADERS, summarizeObligations, titleOpen,
  type ObligationTitle,
} from "@/lib/comercial/b2bFinanceRole";

const TABS = ["resumo", "titulos", "historico"] as const;
type Tab = (typeof TABS)[number];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function PortalFinanceiroB2B() {
  return <B2BFinanceRouteGuard>{(cap) => <FinanceHome key={cap.partnerId} {...cap} />}</B2BFinanceRouteGuard>;
}

function FinanceHome({ partnerId, partnerName, exportAllowed, creditRead }: { partnerId: string; partnerName: string | null; exportAllowed: boolean; creditRead: boolean }) {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? params.get("tab") as Tab : "resumo";
  const [cursors, setCursors] = useState<{ at: string; id: string }[]>([]);
  const cursor = cursors.length ? cursors[cursors.length - 1] : null;
  const q = useB2BFinanceObligations(partnerId, cursor);
  const credit = useB2BFinanceCredit(partnerId, creditRead);
  const rows = (q.data?.rows ?? []) as ObligationTitle[];
  const day = today();
  const summary = summarizeObligations(rows, day);
  const abertos = rows.filter(titleOpen);
  const historico = rows.filter((t) => !titleOpen(t));
  const last = rows[rows.length - 1];
  const hasNext = rows.length === (q.data?.limit ?? 50) && !!last;

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <PortalTopBar brandTitle="Financeiro B2B" brandSubtitle={partnerName ?? "Parceiro"} brandIcon={Wallet} showNotifications={false} settingsTo={null} />
      <main className="flex-1 w-full max-w-6xl mx-auto p-3 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground break-words">Financeiro do parceiro</h1>
            <p className="text-sm text-muted-foreground break-words">{partnerName ?? "Parceiro"} · somente consulta</p>
          </div>
          {exportAllowed && <Button variant="outline" size="sm" disabled={!rows.length}
            onClick={() => exportToCSV(obligationExportRows(rows), OBLIGATION_EXPORT_HEADERS, buildExportFilename("financeiro-parceiro-b2b"))}>
            <Download className="h-4 w-4 mr-1" aria-hidden="true" />Exportar CSV (página)</Button>}
        </div>
        <Tabs value={tab} onValueChange={(v) => { const n = new URLSearchParams(params); n.set("tab", v); setParams(n, { replace: true }); }}>
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="titulos">Títulos</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          {q.isLoading ? <p role="status" className="py-6 text-muted-foreground">Carregando informações financeiras…</p>
            : q.isError ? <div role="alert" className="py-6 space-y-2"><p className="text-foreground">Não foi possível carregar as informações financeiras.</p>
                <Button variant="outline" size="sm" onClick={() => void q.refetch()}>Tentar novamente</Button></div>
            : <>
              <TabsContent value="resumo" className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Kpi label="Em aberto (página)" value={brl(summary.open)} />
                  <Kpi label="Vencido (página)" value={brl(summary.overdue)} hint={`${summary.overdueCount} parcela(s)`} />
                  <Kpi label="Próximo vencimento" value={summary.nextDue ? fmtDate(summary.nextDue) : "—"} />
                  <Kpi label="Títulos em aberto (página)" value={String(summary.openTitles)} />
                </div>
                <Card><CardHeader className="pb-2"><CardTitle className="text-base">Crédito</CardTitle></CardHeader>
                  <CardContent className="text-sm">
                    {!creditRead ? <p className="text-muted-foreground">Informações de crédito indisponíveis para este acesso.</p>
                      : credit.isLoading ? <p role="status" className="text-muted-foreground">Carregando crédito…</p>
                      : credit.isError || !credit.data ? <div role="alert" className="space-y-2"><p className="text-foreground">Não foi possível carregar o crédito.</p>
                          <Button variant="outline" size="sm" onClick={() => void credit.refetch()}>Tentar novamente</Button></div>
                      : <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Crédito do parceiro">
                          <Kpi label="Limite" value={brl(credit.data.credit_limit)} />
                          <Kpi label="Utilizado" value={brl(credit.data.exposicao_atual)} hint={`${credit.data.percentual_utilizado.toLocaleString("pt-BR")}% do limite`} />
                          <Kpi label="Disponível" value={brl(credit.data.credito_disponivel)} hint={credit.data.tem_vencidos ? "Há valores vencidos" : undefined} />
                        </div>}
                  </CardContent></Card>
                <p className="text-xs text-muted-foreground">Totais marcados “(página)” somam só os títulos desta página; o crédito considera todas as obrigações do parceiro. Títulos cancelados ou quitados não entram no saldo.</p>
              </TabsContent>
              <TabsContent value="titulos"><TitleList rows={abertos} day={day} empty="Nenhum título em aberto." /></TabsContent>
              <TabsContent value="historico"><TitleList rows={historico} day={day} empty="Nenhum título quitado ou encerrado." /></TabsContent>
              <div className="flex justify-between gap-2 pt-2">
                <Button variant="ghost" size="sm" disabled={!cursors.length} onClick={() => setCursors((c) => c.slice(0, -1))}>Anteriores</Button>
                <Button variant="ghost" size="sm" disabled={!hasNext} onClick={() => last && setCursors((c) => [...c, { at: last.created_at, id: last.id }])}>
                  Mais títulos<ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" /></Button>
              </div>
            </>}
        </Tabs>
      </main>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold text-foreground break-words">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</CardContent></Card>;
}

function TitleList({ rows, day, empty }: { rows: ObligationTitle[]; day: string; empty: string }) {
  if (!rows.length) return <p className="py-6 text-muted-foreground">{empty}</p>;
  return <ul className="space-y-3" aria-label="Títulos">
    {rows.map((t) => <li key={t.id}><Card><CardContent className="p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><p className="font-medium text-foreground break-words">Pedido {t.numero}</p>
          <p className="text-xs text-muted-foreground">Emitido em {fmtDate(t.created_at)}</p></div>
        <div className="text-right"><p className="font-semibold text-foreground">{brl(t.total)}</p><Badge variant="outline">{obligationStatusLabel(t.status)}</Badge></div>
      </div>
      <ul className="divide-y border rounded-md" aria-label={`Parcelas do pedido ${t.numero}`}>
        {t.installments.map((i) => <li key={i.id} className="p-2 grid grid-cols-2 sm:grid-cols-5 gap-1 text-sm">
          <span>Parcela {i.numero}</span><span>{i.vencimento ? fmtDate(i.vencimento) : "—"}</span>
          <span>{brl(i.valor)}</span><span>Saldo {brl(installmentBalance(i, t.status))}</span>
          <span>{isOverdue(i, day, t.status) ? <Badge variant="destructive">Vencida</Badge> : <Badge variant="secondary">{obligationStatusLabel(i.status)}</Badge>}</span>
        </li>)}
      </ul>
    </CardContent></Card></li>)}
  </ul>;
}
