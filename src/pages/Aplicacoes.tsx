import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Sprout, Calendar, User, FlaskConical, Wind, Camera, AlertTriangle } from "lucide-react";
import { ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { AplicacaoFormDialog } from "@/components/aplicacao/AplicacaoFormDialog";
import { AplicacaoCard } from "@/components/aplicacao/AplicacaoCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateDisplay } from "@/lib/date-utils";


export default function Aplicacoes() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: aplicacoes = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["aplicacoes", showHistory],
    queryFn: async () => {
      let query = supabase
        .from("aplicacoes")
        .select("*, ordens_servico(id, clientes(nome), fazendas(nome), talhoes(nome), produtos(nome, dose_ml_ha))")
        .order("data_aplicacao", { ascending: false })
        .order("versao", { ascending: false })
        .limit(showHistory ? 300 : 200);
      
      if (!showHistory) {
        query = query.eq("is_latest", true);
      }
      
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((a: any) => ({ ...a, os: a.ordens_servico }));
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Aplicações em Campo</h1>
          <p className="text-sm text-muted-foreground">Registro técnico, evidências e fechamento do ciclo</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => setShowHistory(!showHistory)} className="w-full sm:w-auto">
            {showHistory ? "Ocultar Histórico" : "Ver Histórico"}
          </Button>
          <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />Registrar Aplicação
          </Button>
        </div>
      </div>

      {open && <AplicacaoFormDialog open={open} onOpenChange={setOpen} />}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sprout className="h-5 w-5" />Aplicações Realizadas</CardTitle></CardHeader>
        <CardContent className={isMobile ? "p-3" : "p-0 sm:p-6 sm:pt-0"}>
          {isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar as aplicações.
                {(error as Error)?.message ? ` (${(error as Error).message})` : ""}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
            </div>
          ) : isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Carregando aplicações…</div>
          ) : (
          <ResponsiveTable
            mobileCards={
              aplicacoes.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 italic border border-dashed rounded-lg">Nenhuma aplicação registrada</div>
              ) : (
                aplicacoes.map((a: any) => (
                  <MobileCard
                    key={a.id}
                    title={a.os?.clientes?.nome || "Cliente —"}
                    subtitle={`${a.os?.fazendas?.nome || ""} • ${a.os?.talhoes?.nome || ""}`}
                    content={[
                      { label: "Data", value: formatDateDisplay(a.data_aplicacao), icon: <Calendar className="h-3 w-3" /> },
                      { label: "Dose", value: `${a.dose_aplicada || "—"} mL/ha`, icon: <FlaskConical className="h-3 w-3" /> },
                      { label: "Responsável", value: a.responsavel || "—", icon: <User className="h-3 w-3" /> },
                      { label: "Clima", value: a.condicoes_climaticas || "—", icon: <Wind className="h-3 w-3" /> },
                    ]}
                    onClick={() => setDetalhe(a)}
                  />
                ))
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fazenda / Talhão</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Dose</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aplicacoes.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhuma aplicação registrada</TableCell></TableRow>
                 ) : aplicacoes.map((a: any) => (
                  <TableRow key={a.id} className={`cursor-pointer hover:bg-muted/40 ${!a.is_latest ? "opacity-60 grayscale-[0.5]" : ""}`} onClick={() => setDetalhe(a)}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{formatDateDisplay(a.data_aplicacao)}</span>
                        {a.versao > 1 && <span className="text-[10px] text-muted-foreground font-semibold">v{a.versao}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{a.os?.clientes?.nome}</TableCell>
                    <TableCell className="text-xs">{a.os?.fazendas?.nome} / {a.os?.talhoes?.nome}</TableCell>
                    <TableCell>{a.os?.produtos?.nome || "—"}</TableCell>
                    <TableCell className="font-mono">{a.dose_aplicada || "—"} mL/ha</TableCell>
                    <TableCell>{a.area_aplicada_ha || "—"} ha</TableCell>
                    <TableCell>{a.responsavel || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" title="Evidências"><Camera className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ResponsiveTable>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={() => setDetalhe(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes da Aplicação</DialogTitle></DialogHeader>
          {detalhe && <AplicacaoCard aplicacao={detalhe} doseRecomendada={detalhe.os?.produtos?.dose_ml_ha} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
