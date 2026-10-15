import { formatDateDisplay } from "@/lib/date-utils";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";

const STATUS_LABELS: Record<string, string> = {
  finalizado: "Finalizado",
  enviado_aprovacao: "Em Aprovação",
  aprovado: "Aprovado",
  convertido_os: "Convertido em OS",
  arquivado: "Arquivado",
};

export default function PortalRegistros() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { clienteId, loading: cl } = usePortalCliente();
  const { data: registros = [], isLoading: loading } = useScopedPortalQuery({
    queryKey: ["portal-registros", clienteId], enabled: !!clienteId,
    queryFn: async (signal) => {
    const { data, error } = await supabase.from("registros_consultor")
      .select("*, fazendas(nome), talhoes(nome)")
      .eq("cliente_id", clienteId ?? "")
      .neq("status", "rascunho")
      .order("data_vistoria", { ascending: false }).abortSignal(signal);
    if (error) throw error;
    return data || [];
    }
  });

  if (cl || loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Registros Técnicos"
        description="Histórico de vistorias e monitoramento de campo"
      />

      {registros.length === 0 ? (
        <p className="text-muted-foreground">Nenhum registro técnico disponível.</p>
      ) : (
        <Card>
          <CardContent className={isMobile ? "p-4" : "p-0"}>
            <ResponsiveTable
              mobileCards={
                registros.map((r) => (
                  <div key={r.id} onClick={() => navigate(`/portal/registros/${r.id}`)} role="button" className="cursor-pointer">
                    <MobileCard
                      title={r.problema_principal || "Vistoria Técnica"}
                      subtitle={`${(r.fazendas as any)?.nome} • ${(r.talhoes as any)?.nome}`}
                      status={
                        <Badge variant={r.nivel_pressao === "severo" || r.nivel_pressao === "alto" ? "destructive" : "secondary"} className="text-[10px]">
                          {r.nivel_pressao || "N/A"}
                        </Badge>
                      }
                      content={[
                        { label: "Data", value: formatDateDisplay(r.data_vistoria) },
                        { label: "Status", value: STATUS_LABELS[r.status] || r.status },
                      ]}
                    />
                  </div>
                ))
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Fazenda</TableHead>
                    <TableHead>Talhão</TableHead>
                    <TableHead>Problema</TableHead>
                    <TableHead>Pressão</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.map((r) => (
                    <TableRow key={r.id} onClick={() => navigate(`/portal/registros/${r.id}`)} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>{formatDateDisplay(r.data_vistoria)}</TableCell>
                      <TableCell>{(r.fazendas as any)?.nome}</TableCell>
                      <TableCell>{(r.talhoes as any)?.nome}</TableCell>
                      <TableCell>{r.problema_principal || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={r.nivel_pressao === "severo" || r.nivel_pressao === "alto" ? "destructive" : "secondary"}>
                          {r.nivel_pressao || "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell>{STATUS_LABELS[r.status] || r.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ResponsiveTable>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
