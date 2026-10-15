import { formatDateDisplay } from "@/lib/date-utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { labelEntrega } from "@/lib/portal/statusAcompanhamento";

export interface PortalEntregasProps {
  embedded?: boolean;
}

export default function PortalEntregas({ embedded = false }: PortalEntregasProps = {}) {
  const { clienteId, loading: cl } = usePortalCliente();
  const isMobile = useIsMobile();

  const { data: entregas = [], isLoading: loading } = useScopedPortalQuery({
    queryKey: ["portal-entregas", clienteId], enabled: !!clienteId,
    queryFn: async signal => {
      const { data, error } = await supabase.from("entregas")
        .select("*, ordens_servico(numero_os, produtos(nome))")
        .eq("cliente_id", clienteId ?? "")
        .order("created_at", { ascending: false }).abortSignal(signal);
      if (error) throw error;
      return data || [];
    }
  });

  if (cl || loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  if (entregas.length === 0) {
    return (
      <div className="space-y-6">
        {!embedded && <h1 className="text-2xl font-bold">Entregas</h1>}
        <p className="text-muted-foreground text-center py-12 border border-dashed rounded-lg">
          Nenhuma entrega registrada para acompanhamento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!embedded && <h1 className="text-2xl font-bold">Entregas</h1>}

      {isMobile ? (
        <div className="space-y-3">
          {entregas.map((e) => {
            const produto = (e.ordens_servico as any)?.produtos?.nome ?? "Bioinsumo";
            return (
              <Card key={e.id} data-testid="entrega-card">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate">{produto}</span>
                    <Badge variant={e.status === "entregue" ? "default" : "secondary"}>
                      {labelEntrega(e.status)}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                    <span>Saída: {e.data_saida ? formatDateDisplay(e.data_saida) : "-"}</span>
                    <span>Motorista: {e.motorista || "-"}</span>
                    <span className="col-span-2">Veículo: {e.veiculo || "-"}</span>
                    {"observacoes" in e && typeof e.observacoes === "string" && e.observacoes && (
                      <span className="col-span-2 italic">"{e.observacoes}"</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Data Saída</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entregas.map((e) => (
                  <TableRow key={e.id} data-testid="entrega-row">
                    <TableCell>{(e.ordens_servico as any)?.produtos?.nome || "-"}</TableCell>
                    <TableCell>{e.data_saida ? formatDateDisplay(e.data_saida) : "-"}</TableCell>
                    <TableCell>{e.motorista || "-"}</TableCell>
                    <TableCell>{e.veiculo || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "entregue" ? "default" : "secondary"}>
                        {labelEntrega(e.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
