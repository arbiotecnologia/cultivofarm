import { formatDateDisplay } from "@/lib/date-utils";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getNivelRiscoCor, getNivelRiscoLabel, getTipoAlertaLabel } from "@/lib/risco-agronomico";
import { Eye, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function PainelAlertas() {
  const [statusFilter, setStatusFilter] = useState("ativo");
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const alertasQuery = useQuery({
    queryKey: ["alertas_agronomicos", statusFilter],
    queryFn: async () => {
      let q = (supabase as any).from("alertas_agronomicos").select("*, fazendas(nome), talhoes(nome)").order("data_alerta", { ascending: false });
      if (statusFilter !== "todos") q = q.eq("status", statusFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: alertas, isLoading } = alertasQuery;

  const updateStatus = useAtualizarStatusAlerta();

  const alterarStatus = (alerta: { id: string; updated_at: string }, status: StatusAlerta) => {
    if (emAndamento || updateStatus.isPending) return;
    setEmAndamento(alerta.id);
    updateStatus.mutate({ id: alerta.id, status, expectedUpdatedAt: alerta.updated_at }, {
      onSuccess: () => toast.success("Alerta atualizado"),
      onError: (e) => toast.error(e.message),
      onSettled: () => setEmAndamento(null),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" aria-label="Filtrar alertas por status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="monitoramento">Em Monitoramento</SelectItem>
            <SelectItem value="encerrado">Encerrados</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{(alertas ?? []).length} alertas</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fazenda</TableHead>
                <TableHead>Talhão</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Risco</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : alertasQuery.isError ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">
                  <p className="text-sm mb-3">Não foi possível carregar os alertas.</p>
                  <Button size="sm" variant="outline" onClick={() => alertasQuery.refetch()}>Tentar novamente</Button>
                </TableCell></TableRow>
              ) : !(alertas ?? []).length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum alerta encontrado.</TableCell></TableRow>
              ) : (
                (alertas ?? []).map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.fazendas?.nome ?? "—"}</TableCell>
                    <TableCell>{a.talhoes?.nome ?? "Geral"}</TableCell>
                    <TableCell>{getTipoAlertaLabel(a.tipo_alerta)}</TableCell>
                    <TableCell><Badge className={getNivelRiscoCor(a.nivel_risco)}>{getNivelRiscoLabel(a.nivel_risco)}</Badge></TableCell>
                    <TableCell>{formatDateDisplay(a.data_alerta)}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "ativo" ? "destructive" : a.status === "monitoramento" ? "secondary" : "outline"}>
                        {a.status === "ativo" ? "Ativo" : a.status === "monitoramento" ? "Monitoramento" : "Encerrado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {a.status === "ativo" && (
                          <>
                            <Button size="sm" variant="ghost" title="Monitorar" aria-label="Colocar em monitoramento" disabled={emAndamento !== null} onClick={() => alterarStatus(a.id, a.status, "monitoramento")}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Encerrar" aria-label="Encerrar alerta" disabled={emAndamento !== null} onClick={() => alterarStatus(a.id, a.status, "encerrado")}>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {a.status === "monitoramento" && (
                          <Button size="sm" variant="ghost" title="Encerrar" aria-label="Encerrar alerta" disabled={emAndamento !== null} onClick={() => alterarStatus(a.id, a.status, "encerrado")}>
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
