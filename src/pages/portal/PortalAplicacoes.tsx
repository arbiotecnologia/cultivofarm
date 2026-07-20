import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { AplicacaoCard } from "@/components/aplicacao/AplicacaoCard";
import { Sprout } from "lucide-react";

export default function PortalAplicacoes() {
  const { clienteId, loading: cl } = usePortalCliente();
  const [aplicacoes, setAplicacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clienteId) return;
    (async () => {
      setLoading(true);
      const { data: osList } = await supabase
        .from("ordens_servico")
        .select("id, fazendas(nome), talhoes(nome), produtos(nome, dose_ml_ha)")
        .eq("cliente_id", clienteId);
      if (!osList?.length) { setAplicacoes([]); setLoading(false); return; }
      const osMap = Object.fromEntries(osList.map((o: any) => [o.id, o]));
      const { data } = await supabase.from("aplicacoes")
        .select("*")
        .in("ordem_servico_id", osList.map((o) => o.id))
        .eq("is_latest", true) // No portal do produtor, mostramos apenas o estado atual
        .order("data_aplicacao", { ascending: false });
      setAplicacoes((data || []).map((a: any) => ({ ...a, os: osMap[a.ordem_servico_id] })));
      setLoading(false);
    })();
  }, [clienteId]);

  if (cl || loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sprout className="h-6 w-6 text-primary" />Aplicações Realizadas</h1>
        <p className="text-sm text-muted-foreground mt-1">Acompanhe o manejo executado em suas fazendas, com evidências e detalhes técnicos.</p>
      </div>

      {aplicacoes.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 italic border border-dashed rounded-lg">
          Nenhuma aplicação registrada ainda.
        </div>
      ) : (
        <div className="grid gap-4">
          {aplicacoes.map((a) => (
            <AplicacaoCard key={a.id} aplicacao={a} doseRecomendada={a.os?.produtos?.dose_ml_ha} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground italic border-t pt-4">
        ⚖️ Informações apresentadas com base em prescrição agronômica vigente. Para alterações de manejo, consulte sua equipe técnica responsável.
      </p>
    </div>
  );
}
