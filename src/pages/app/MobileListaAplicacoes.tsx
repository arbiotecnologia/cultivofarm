import { formatDateDisplay } from "@/lib/date-utils";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, FlaskConical, MapPin, Search, History, Edit } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePortalCliente } from "@/hooks/usePortalCliente";

export default function MobileListaAplicacoes() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { clienteId } = usePortalCliente();
  const isProdutor = role === "cliente_produtor";
  const [searchTerm, setSearchTerm] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const { data: aplicacoes, isLoading } = useQuery({
    queryKey: ["mobile-aplicacoes-list", isProdutor ? clienteId : "all", showHistory],
    queryFn: async () => {
      let q = supabase
        .from("aplicacoes")
        .select("*, ordens_servico(id, clientes(nome), fazendas(nome), talhoes(nome), produtos(nome, dose_ml_ha))")
        .order("data_aplicacao", { ascending: false })
        .order("versao", { ascending: false });
      
      if (!showHistory) {
        q = q.eq("is_latest", true);
      }
      
      if (isProdutor && clienteId) {
        q = q.eq("ordens_servico.cliente_id", clienteId);
      }
      
      const { data } = await q;
      return (data || []).map((a: any) => ({ ...a, os: a.ordens_servico }));
    },
  });

  const filtered = aplicacoes?.filter(a => 
    a.os?.clientes?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.os?.fazendas?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.os?.talhoes?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.os?.produtos?.nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-muted-foreground"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-bold">Histórico de Aplicações</h1>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por fazenda, talhão ou produto..." 
            className="pl-9 h-11"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full h-10 gap-2"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="h-4 w-4" />
          {showHistory ? "Ocultar versões anteriores" : "Ver histórico completo"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground italic">
          Nenhuma aplicação encontrada.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered?.map((a) => (
            <Card key={a.id} className={`p-4 space-y-3 ${!a.is_latest ? "opacity-60 bg-muted/30" : ""}`}>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{a.os?.produtos?.nome || "Produto"}</span>
                    {a.versao > 1 && <Badge variant="outline" className="text-[10px] h-4">v{a.versao}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {a.os?.fazendas?.nome} · {a.os?.talhoes?.nome}
                  </p>
                </div>
                {a.is_latest && !isProdutor && (
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/app/aplicacoes?rectifyId=${a.id}`)}>
                    <Edit className="h-4 w-4 mr-1" /> Retificar
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 p-2 rounded flex flex-col">
                  <span className="text-muted-foreground uppercase text-[9px]">Dose Aplicada</span>
                  <span className="font-semibold">{a.dose_aplicada} mL/ha</span>
                </div>
                <div className="bg-muted/50 p-2 rounded flex flex-col">
                  <span className="text-muted-foreground uppercase text-[9px]">Área</span>
                  <span className="font-semibold">{a.area_aplicada_ha} ha</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateDisplay(a.data_aplicacao)}
                </div>
                <div className="flex items-center gap-1">
                  <FlaskConical className="h-3 w-3" />
                  {a.responsavel || "Responsável não inf."}
                </div>
              </div>

              {a.motivo_retificacao && (
                <div className="text-[10px] bg-amber-50 p-2 rounded border border-amber-100 italic">
                  Motivo: {a.motivo_retificacao}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}