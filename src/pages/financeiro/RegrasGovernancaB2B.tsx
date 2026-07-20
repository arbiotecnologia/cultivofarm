import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFinancialGovernanceRules, useUpdateFinancialGovernanceRule } from "@/hooks/useB2BFinanceiro";

const LABEL: Record<string, string> = {
  bloquear_pedido: "Bloquear pedido",
  bloquear_aprovacao: "Bloquear aprovação comercial",
  bloquear_producao: "Bloquear envio à produção",
  bloquear_entrega: "Bloquear liberação de entrega",
};

export default function RegrasGovernancaB2B() {
  const { data = [], isLoading } = useFinancialGovernanceRules();
  const upd = useUpdateFinancialGovernanceRule();

  const toggle = (row: any, field: string, value: boolean) =>
    upd.mutate({ id: row.id, [field]: value });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Regras de Governança Financeira</h1>
        <p className="text-sm text-muted-foreground">Configure quando o sistema deve bloquear operações por crédito, inadimplência ou score crítico.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Regras</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regra</TableHead>
                <TableHead className="text-center">Ativa</TableHead>
                <TableHead className="text-center">Por crédito</TableHead>
                <TableHead className="text-center">Por inadimplência</TableHead>
                <TableHead className="text-center">Por score crítico</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>}
              {data.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{LABEL[r.regra] ?? r.regra}</TableCell>
                  <TableCell className="text-center"><Switch checked={r.ativo} onCheckedChange={(v) => toggle(r, "ativo", v)} /></TableCell>
                  <TableCell className="text-center"><Switch checked={r.por_credito} onCheckedChange={(v) => toggle(r, "por_credito", v)} /></TableCell>
                  <TableCell className="text-center"><Switch checked={r.por_inadimplencia} onCheckedChange={(v) => toggle(r, "por_inadimplencia", v)} /></TableCell>
                  <TableCell className="text-center"><Switch checked={r.por_score_critico} onCheckedChange={(v) => toggle(r, "por_score_critico", v)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
