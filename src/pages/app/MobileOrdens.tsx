import { formatDateDisplay } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  aprovada: "Aprovada",
  programada: "Programada",
  em_producao: "Em Produção",
  em_cq: "Controle Qualidade",
  envase: "Envase",
  pronto_entrega: "Pronto Entrega",
  entregue: "Entregue",
  finalizada: "Finalizada",
};

const STATUS_COLORS: Record<string, string> = {
  aberta: "bg-blue-100 text-blue-700",
  aprovada: "bg-emerald-100 text-emerald-700",
  programada: "bg-purple-100 text-purple-700",
  em_producao: "bg-sky-100 text-sky-700",
  em_cq: "bg-amber-100 text-amber-700",
  envase: "bg-orange-100 text-orange-700",
  pronto_entrega: "bg-teal-100 text-teal-700",
  entregue: "bg-green-100 text-green-700",
  finalizada: "bg-muted text-muted-foreground",
};

export default function MobileOrdens() {
  const { role } = useAuth();
  const { clienteId } = usePortalCliente();
  const isProdutor = role === "cliente_produtor";

  const { data: ordens, isLoading } = useQuery({
    queryKey: ["mobile-ordens-list", isProdutor ? clienteId : "all"],
    enabled: !isProdutor || !!clienteId,
    queryFn: async () => {
      let q = supabase
        .from("ordens_servico")
        .select("*, clientes(nome), fazendas(nome), talhoes(nome), produtos(nome)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (isProdutor && clienteId) q = q.eq("cliente_id", clienteId);
      const { data } = await q;
      return data || [];
    },
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-foreground">Ordens de Serviço</h1>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : ordens?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma OS encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordens?.map((os) => (
            <Card key={os.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground text-sm">
                    {(os.produtos as any)?.nome || "Produto"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(os.clientes as any)?.nome} • {(os.fazendas as any)?.nome} • {(os.talhoes as any)?.nome}
                  </p>
                </div>
                <Badge className={`text-[10px] ${STATUS_COLORS[os.status] || ""}`} variant="secondary">
                  {STATUS_LABELS[os.status] || os.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {os.volume_total_ml && <span>{os.volume_total_ml} mL</span>}
                {os.area_hectares && <span>{os.area_hectares} ha</span>}
                {os.data_programada && (
                  <span>
                    {formatDateDisplay(os.data_programada)}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
