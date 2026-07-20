import { useState } from "react";
import type { ExecutivoFiltros } from "@/hooks/useExecutivoResumo";
import { useExecutivoClientesResumo } from "@/hooks/useExecutivoClientesResumo";
import { useExecutivoClientesRanking } from "@/hooks/useExecutivoClientesRanking";
import { ExecutivoClientesCards } from "./ExecutivoClientesCards";
import { ExecutivoSaudeCarteira } from "./ExecutivoSaudeCarteira";
import { ExecutivoRankingClientes } from "./ExecutivoRankingClientes";
import { ExecutivoRankingFazendas } from "./ExecutivoRankingFazendas";
import { ExecutivoClienteDetalheDrawer } from "./ExecutivoClienteDetalheDrawer";
import { ExecutivoFazendaDetalheDrawer } from "./ExecutivoFazendaDetalheDrawer";

interface Props {
  filtros: ExecutivoFiltros;
}

export function ExecutivoClientesResumo({ filtros }: Props) {
  const resumoQ = useExecutivoClientesResumo(filtros);
  const rankingQ = useExecutivoClientesRanking(filtros, 10);

  const [clienteId, setClienteId] = useState<string | null>(null);
  const [fazendaId, setFazendaId] = useState<string | null>(null);

  const saude = resumoQ.data?.saude_carteira;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <ExecutivoClientesCards data={resumoQ.data} isLoading={resumoQ.isLoading} />
        </div>
        <div>
          <ExecutivoSaudeCarteira
            score={saude?.score ?? 0}
            classificacao={saude?.classificacao ?? "sem_dados"}
            motivos={saude?.motivos ?? []}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExecutivoRankingClientes
          ranking={rankingQ.data?.ranking_clientes ?? []}
          isLoading={rankingQ.isLoading}
          onSelect={setClienteId}
        />
        <ExecutivoRankingFazendas
          ranking={rankingQ.data?.ranking_fazendas ?? []}
          isLoading={rankingQ.isLoading}
          onSelect={setFazendaId}
        />
      </div>

      <ExecutivoClienteDetalheDrawer clienteId={clienteId} filtros={filtros} onClose={() => setClienteId(null)} />
      <ExecutivoFazendaDetalheDrawer fazendaId={fazendaId} filtros={filtros} onClose={() => setFazendaId(null)} />
    </div>
  );
}
