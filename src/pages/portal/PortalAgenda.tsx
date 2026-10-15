import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export default function PortalAgenda() {
  const { clienteId, loading: clLoading } = usePortalCliente();
  const fence = useStorageAccessScope(`producer-agenda:${clienteId}`);
  const isMobile = useIsMobile();
  const { data: retornos = [], isLoading: loading, refetch: fetchRetornos } = useScopedPortalQuery({
    queryKey: ["portal-agenda", clienteId], enabled: !!clienteId,
    queryFn: async signal => {
      const { data, error } = await supabase.from("portal_solicitacoes")
        .select("*, fazendas(nome), talhoes(nome)").eq("cliente_id", clienteId ?? "")
        .eq("tipo_demanda", "retorno_tecnico").order("data_prevista_atendimento", { ascending: true }).abortSignal(signal);
      if (error) throw error;
      return data || [];
    }
  });

  const handleConfirmar = async (id: string) => {
    if (!clienteId || !fence.ready || !retornos.some(r => r.id === id)) return;
    const current = fence.capture();
    const { error } = await supabase
      .from("portal_solicitacoes")
      .update({ confirmacao_produtor: "confirmada" })
      .eq("id", id)
      .eq("cliente_id", clienteId); // Segurança adicional

    if (!current()) return;
    if (error) {
      toast.error("Erro ao confirmar visita");
    } else {
      toast.success("Visita confirmada com sucesso!");
      fetchRetornos();
    }
  };

  const handleRemarcar = async (id: string) => {
    if (!clienteId || !fence.ready || !retornos.some(r => r.id === id)) return;
    const current = fence.capture();
    const { error } = await supabase
      .from("portal_solicitacoes")
      .update({ confirmacao_produtor: "remarcacao_solicitada" })
      .eq("id", id)
      .eq("cliente_id", clienteId); // Segurança adicional

    if (!current()) return;
    if (error) {
      toast.error("Erro ao solicitar remarcação");
    } else {
      toast.info("Solicitação de remarcação enviada");
      fetchRetornos();
    }
  };

  if (clLoading || loading) return <div className="animate-pulse p-8 text-muted-foreground">Carregando agenda...</div>;

  const renderStatus = (status: string) => {
    switch (status) {
      case "confirmada":
        return <Badge className="bg-green-100 text-green-700 border-green-200">Confirmado</Badge>;
      case "remarcacao_solicitada":
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Remarcação pedida</Badge>;
      default:
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Aguardando confirmação</Badge>;
    }
  };

  const actions = (id: string, currentStatus: string) => (
    <div className="flex gap-2 w-full">
      <Button 
        size="sm" 
        className="flex-1 bg-primary hover:bg-primary/90" 
        disabled={currentStatus === "confirmada"}
        onClick={(e) => { e.stopPropagation(); handleConfirmar(id); }}
      >
        <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar
      </Button>
      <Button 
        size="sm" 
        variant="outline" 
        className="flex-1"
        disabled={currentStatus === "remarcacao_solicitada"}
        onClick={(e) => { e.stopPropagation(); handleRemarcar(id); }}
      >
        <Clock className="h-4 w-4 mr-1" /> Remarcar
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha Agenda"
        description="Acompanhe e confirme as visitas técnicas agendadas"
      />

      {retornos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
            <p className="text-muted-foreground">Nenhuma visita agendada para os próximos dias.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Próximos Retornos Técnicos
            </CardTitle>
          </CardHeader>
          <CardContent className={isMobile ? "p-4" : "p-0"}>
             <ResponsiveTable
                mobileCards={
                  retornos.map((r) => (
                    <MobileCard
                      key={r.id}
                      title={`Visita: ${r.fazendas?.nome || "Fazenda"}`}
                      subtitle={r.talhoes?.nome || "Talhão"}
                      status={renderStatus(r.confirmacao_produtor)}
                      content={[
                        { label: "Data Prevista", value: formatDateTimeDisplay(r.data_prevista_atendimento) },
                        { label: "Motivo", value: r.descricao?.split(".")[0] || "Acompanhamento" },
                      ]}
                      actions={actions(r.id, r.confirmacao_produtor)}
                    />
                  ))
                }
             >
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Data/Hora</TableHead>
                     <TableHead>Fazenda</TableHead>
                     <TableHead>Talhão</TableHead>
                     <TableHead>Motivo</TableHead>
                     <TableHead>Confirmação</TableHead>
                     <TableHead className="text-right">Ações</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {retornos.map((r) => (
                     <TableRow key={r.id}>
                       <TableCell className="font-medium">
                         {formatDateTimeDisplay(r.data_prevista_atendimento)}
                       </TableCell>
                       <TableCell>{r.fazendas?.nome}</TableCell>
                       <TableCell>{r.talhoes?.nome}</TableCell>
                       <TableCell className="max-w-[200px] truncate">{r.descricao?.split(".")[0]}</TableCell>
                       <TableCell>{renderStatus(r.confirmacao_produtor)}</TableCell>
                       <TableCell className="text-right">
                         <div className="flex gap-2 justify-end">
                            <Button 
                              size="sm" 
                              variant={r.confirmacao_produtor === 'confirmada' ? 'secondary' : 'default'}
                              disabled={r.confirmacao_produtor === 'confirmada'}
                              onClick={() => handleConfirmar(r.id)}
                            >
                              Confirmar
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              disabled={r.confirmacao_produtor === 'remarcacao_solicitada'}
                              onClick={() => handleRemarcar(r.id)}
                            >
                              Remarcar
                            </Button>
                         </div>
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             </ResponsiveTable>
          </CardContent>
        </Card>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
        <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-bold mb-1">Sobre a confirmação:</p>
          <p>Ao confirmar, o consultor recebe um alerta imediato. Caso solicite a remarcação, entraremos em contato para ajustar o melhor horário para sua operação.</p>
        </div>
      </div>
    </div>
  );
}
