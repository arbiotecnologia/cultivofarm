import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Layers, Droplets, Wind } from "lucide-react";
import { HistoricoTalhao } from "@/components/talhoes/HistoricoTalhao";

export default function TalhaoHistorico() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: talhao, isLoading } = useQuery({
    queryKey: ["talhao-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("talhoes")
        .select("*, fazendas(nome, municipio, estado, clientes(nome)), culturas(nome)")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{talhao?.nome || (isLoading ? "Carregando..." : "Talhão")}</h1>
          {talhao && (
            <p className="text-sm text-muted-foreground">
              {(talhao.fazendas as any)?.nome} • {(talhao.fazendas as any)?.clientes?.nome}
            </p>
          )}
        </div>
      </div>

      {talhao && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{talhao.area_hectares ?? "—"} ha</span>
            </div>
            {(talhao.culturas as any)?.nome && (
              <Badge variant="secondary">{(talhao.culturas as any).nome}</Badge>
            )}
            {talhao.tipo_manejo_agua === 'irrigado' ? (
              <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 gap-1">
                <Droplets className="h-3 w-3" /> Irrigado
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Wind className="h-3 w-3" /> Sequeiro
              </Badge>
            )}
            {(talhao.fazendas as any)?.municipio && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {(talhao.fazendas as any).municipio}
                {(talhao.fazendas as any).estado ? `/${(talhao.fazendas as any).estado}` : ""}
              </div>
            )}
            {talhao.historico_pragas && (
              <p className="text-xs text-muted-foreground basis-full">
                <span className="font-medium">Histórico de Pragas e doenças:</span> {talhao.historico_pragas}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {id && <HistoricoTalhao talhaoId={id} />}
    </div>
  );
}
