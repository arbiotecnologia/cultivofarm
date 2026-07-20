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
  const queryClient = useQueryClient();

  const { data: alertas, isLoading } = useQuery({
    queryKey: ["alertas_agronomicos", statusFilter],
    queryFn: async () => {
      let q = supabase.from("alertas_agronomicos").select("*, fazendas(nome), talhoes(nome)").order("data_alerta", { ascending: false });
      if (statusFilter !== "todos") q = q.eq("status", statusFilter as "ativo" | "monitoramento" | "encerrado");
      const { data } = await q;
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("alertas_agronomicos").update({ status: status as any, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["alertas_agronomicos"] }); toast.success("Alerta atualizado"); },
    onError: () => toast.error("Erro ao atualizar alerta"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
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
                            <Button size="sm" variant="ghost" title="Monitorar" onClick={() => updateStatus.mutate({ id: a.id, status: "monitoramento" })}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" title="Encerrar" onClick={() => updateStatus.mutate({ id: a.id, status: "encerrado" })}>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {a.status === "monitoramento" && (
                          <Button size="sm" variant="ghost" title="Encerrar" onClick={() => updateStatus.mutate({ id: a.id, status: "encerrado" })}>
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
