import { useState } from "react";
import { useSearchParams, useOutletContext } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Wallet, Eye, Download } from "lucide-react";
import { usePortalPartnerFinancial } from "@/hooks/useB2BFinanceiro";
import { MinhaSituacaoFinanceira } from "@/components/portal-parceiro/MinhaSituacaoFinanceira";
import { brl, fmtDate } from "@/lib/financial/format";
import { exportToCSV, buildExportFilename } from "@/lib/biExport";

const variantFor = (s: string): "default" | "secondary" | "outline" | "destructive" =>
  s === "recebido" ? "default" : s === "vencido" ? "destructive" : s === "cancelado" ? "outline" : "secondary";

const TITULOS_HEADERS = {
  numero: "Pedido",
  total: "Valor",
  vencimento: "Vencimento",
  financial_status: "Status",
  payment_method: "Forma",
};

const VALID_TABS = ["resumo", "titulos", "historico"] as const;
type TabId = (typeof VALID_TABS)[number];

export default function ParceiroFinanceiro() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { data = [], isLoading } = usePortalPartnerFinancial(partner?.id ?? null);
  const [open, setOpen] = useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabId = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabId)
    : "resumo";

  const titulos = data.filter((r) => r.financial_status !== "recebido");
  const historico = data.filter((r) => r.financial_status === "recebido");
  const qtdVencidos = titulos.filter((r) => r.financial_status === "vencido").length;
  const totalAberto = titulos.reduce((s, r) => s + Number(r.total || 0), 0);

  const handleExport = () => {
    const rows = titulos.map((r) => ({
      numero: r.numero,
      total: brl(r.total),
      vencimento: r.vencimento ?? "",
      financial_status: r.financial_status,
      payment_method: r.payment_method ?? "",
    }));
    exportToCSV(rows, TITULOS_HEADERS, buildExportFilename("financeiro-parceiro"));
  };

  const renderTitulosTable = (rows: typeof data, emptyMsg: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pedido</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Forma</TableHead>
          <TableHead className="text-right">Parcelas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && (
          <TableRow><TableCell colSpan={6} className="text-center py-6">Carregando…</TableCell></TableRow>
        )}
        {!isLoading && rows.length === 0 && (
          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{emptyMsg}</TableCell></TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.partner_order_id}>
            <TableCell className="font-mono text-xs">{r.numero}</TableCell>
            <TableCell className="text-right">{brl(r.total)}</TableCell>
            <TableCell>{fmtDate(r.vencimento)}</TableCell>
            <TableCell><Badge variant={variantFor(r.financial_status)}>{r.financial_status}</Badge></TableCell>
            <TableCell className="capitalize">{r.payment_method ?? "—"}</TableCell>
            <TableCell className="text-right">
              <Button size="icon" variant="ghost" onClick={() => setOpen(r)} title="Ver parcelas">
                <Eye className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Financeiro</h1>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams);
          if (v === "resumo") next.delete("tab");
          else next.set("tab", v);
          setSearchParams(next, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="titulos">Títulos</TabsTrigger>
          <TabsTrigger value="historico">Histórico Financeiro</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          <MinhaSituacaoFinanceira />
        </TabsContent>

        <TabsContent value="titulos" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Meus títulos em aberto</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Em aberto: <span className="font-medium">{titulos.length}</span>
                  {" · "}Vencidos: <span className="font-medium text-destructive">{qtdVencidos}</span>
                  {" · "}Total: <span className="font-medium">{brl(totalAberto)}</span>
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={isLoading || titulos.length === 0}
                aria-label="Exportar títulos para CSV"
              >
                <Download className="h-4 w-4 mr-1" /> Exportar CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {renderTitulosTable(titulos, "Nenhum título em aberto.")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico Financeiro</CardTitle>
              <p className="text-xs text-muted-foreground">
                Títulos já quitados e comprovantes de recebimento.
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {renderTitulosTable(historico, "Nenhum título quitado no período.")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>



      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Parcelas — Pedido {open?.numero}</DialogTitle>
            <DialogDescription>Detalhes das parcelas do título selecionado.</DialogDescription>
          </DialogHeader>
          {open && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(open.installments ?? []).map((i: any) => (
                  <TableRow key={i.numero}>
                    <TableCell>{i.numero}</TableCell>
                    <TableCell>{fmtDate(i.vencimento)}</TableCell>
                    <TableCell className="text-right">{brl(i.valor)}</TableCell>
                    <TableCell className="text-right">{brl(i.recebido)}</TableCell>
                    <TableCell><Badge variant="outline">{i.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="text-xs text-muted-foreground">
            Visualização apenas. Em caso de divergência, fale com seu contato comercial.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
