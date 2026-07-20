import type { ExecutivoFiltros } from "@/hooks/useExecutivoResumo";
import { useExecutivoFinanceiroResumo } from "@/hooks/useExecutivoFinanceiroResumo";
import { useExecutivoFinanceiroGargalos } from "@/hooks/useExecutivoFinanceiroGargalos";
import { useExecutivoFinanceiroRanking } from "@/hooks/useExecutivoFinanceiroRanking";
import { ExecutivoFinanceiroCards } from "./ExecutivoFinanceiroCards";
import { ExecutivoFinanceiroRisco } from "./ExecutivoFinanceiroRisco";
import { ExecutivoFinanceiroGargalos } from "./ExecutivoFinanceiroGargalos";
import { ExecutivoFinanceiroRankingClientes } from "./ExecutivoFinanceiroRankingClientes";

interface Props {
  filtros: ExecutivoFiltros;
}

export function ExecutivoFinanceiroResumo({ filtros }: Props) {
  const resumoQ = useExecutivoFinanceiroResumo(filtros);
  const gargalosQ = useExecutivoFinanceiroGargalos(filtros, 10);
  const rankingQ = useExecutivoFinanceiroRanking(filtros, 10);

  const risco = resumoQ.data?.risco_financeiro;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <ExecutivoFinanceiroCards data={resumoQ.data} isLoading={resumoQ.isLoading} />
        </div>
        <div>
          <ExecutivoFinanceiroRisco
            score={risco?.score ?? 0}
            classificacao={risco?.classificacao ?? "sem_dados"}
            motivos={risco?.motivos ?? []}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExecutivoFinanceiroGargalos gargalos={gargalosQ.data ?? []} isLoading={gargalosQ.isLoading} />
        <ExecutivoFinanceiroRankingClientes ranking={rankingQ.data ?? []} isLoading={rankingQ.isLoading} />
      </div>
    </div>
  );
}
