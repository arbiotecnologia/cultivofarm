import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Layers, Search, ChevronRight, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";

export default function MobileFazendas() {
  const [search, setSearch] = useState("");
  const [selectedFazenda, setSelectedFazenda] = useState<string | null>(null);
  const navigate = useNavigate();
  const { role } = useAuth();
  const { clienteId } = usePortalCliente();
  const isProdutor = role === "cliente_produtor";

  const { data: fazendas, isLoading } = useQuery({
    queryKey: ["mobile-fazendas-list", isProdutor ? clienteId : "all"],
    enabled: !isProdutor || !!clienteId,
    queryFn: async () => {
      let q = supabase
        .from("fazendas")
        .select("*, clientes(nome)")
        .order("nome");
      if (isProdutor && clienteId) q = q.eq("cliente_id", clienteId);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: talhoes } = useQuery({
    queryKey: ["mobile-talhoes-fazenda", selectedFazenda],
    queryFn: async () => {
      const { data } = await supabase
        .from("talhoes")
        .select("*, culturas(nome)")
        .eq("fazenda_id", selectedFazenda!)
        .order("nome");
      return data || [];
    },
    enabled: !!selectedFazenda,
  });

  const filteredFazendas = fazendas?.filter(
    (f) =>
      f.nome.toLowerCase().includes(search.toLowerCase()) ||
      (f.clientes as any)?.nome?.toLowerCase().includes(search.toLowerCase()) ||
      f.municipio?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedFazendaData = fazendas?.find((f) => f.id === selectedFazenda);

  if (selectedFazenda) {
    return (
      <div className="p-4 space-y-4">
        <button
          onClick={() => setSelectedFazenda(null)}
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <div>
          <h1 className="text-xl font-bold text-foreground">{selectedFazendaData?.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {selectedFazendaData?.municipio && `${selectedFazendaData.municipio}`}
            {selectedFazendaData?.estado && ` - ${selectedFazendaData.estado}`}
          </p>
          {selectedFazendaData?.area_total && (
            <Badge variant="secondary" className="mt-1">
              {selectedFazendaData.area_total} ha
            </Badge>
          )}
        </div>

        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Talhões ({talhoes?.length || 0})
        </h2>

        <div className="space-y-2">
          {talhoes?.map((talhao) => (
            <Card
              key={talhao.id}
              className="p-3 active:bg-muted transition-colors cursor-pointer"
              onClick={() => navigate(`/app/talhao/${talhao.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Layers className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{talhao.nome}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {talhao.area_hectares && <span>{talhao.area_hectares} ha</span>}
                      {(talhao.culturas as any)?.nome && (
                        <Badge variant="outline" className="text-[10px] h-4">
                          {(talhao.culturas as any).nome}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
          {talhoes?.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum talhão cadastrado
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-foreground">Fazendas</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar fazenda, cliente ou município..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFazendas?.map((fazenda) => (
            <Card
              key={fazenda.id}
              className="p-3 cursor-pointer active:bg-muted transition-colors"
              onClick={() => setSelectedFazenda(fazenda.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex flex-col">
                      <p className="font-medium text-foreground">{fazenda.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {fazenda.codigo_referencia && <span className="font-mono text-[9px] mr-1">[{fazenda.codigo_referencia}]</span>}
                        {(fazenda.clientes as any)?.nome}
                        {fazenda.municipio && ` • ${fazenda.municipio}`}
                      </p>
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
          {filteredFazendas?.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhuma fazenda encontrada
            </p>
          )}
        </div>
      )}
    </div>
  );
}
