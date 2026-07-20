import { formatDateDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";

const STATUS_LABELS: Record<string, string> = {
  separado: "Separado",
  em_rota: "Em Rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  separado: "bg-amber-100 text-amber-700",
  em_rota: "bg-blue-100 text-blue-700",
  entregue: "bg-emerald-100 text-emerald-700",
  cancelada: "bg-muted text-muted-foreground line-through",
};

export default function MobileEntregas() {
  const { role } = useAuth();
  const { clienteId } = usePortalCliente();
  const isProdutor = role === "cliente_produtor";

  const { data: entregas, isLoading } = useQuery({
    queryKey: ["mobile-entregas-list", isProdutor ? clienteId : "all"],
    enabled: !isProdutor || !!clienteId,
    queryFn: async () => {
      let q = supabase
        .from("entregas")
        .select("*, clientes(nome), ordens_servico(*, produtos(nome), fazendas(nome))")
        .order("created_at", { ascending: false })
        .limit(50);
      if (isProdutor && clienteId) q = q.eq("cliente_id", clienteId);
      const { data } = await q;
      return data || [];
    },
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-foreground">Entregas</h1>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : entregas?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma entrega</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entregas?.map((e) => (
            <Card key={e.id} className="p-3 space-y-1">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm text-foreground">
                    {(e.clientes as any)?.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(e.ordens_servico as any)?.produtos?.nome} • {(e.ordens_servico as any)?.fazendas?.nome}
                  </p>
                </div>
                <Badge className={`text-[10px] ${STATUS_COLORS[e.status] || ""}`} variant="secondary">
                  {STATUS_LABELS[e.status] || e.status}
                </Badge>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                {e.motorista && <span>🚛 {e.motorista}</span>}
                {e.data_saida && (
                  <span>{formatDateDisplay(e.data_saida)}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
