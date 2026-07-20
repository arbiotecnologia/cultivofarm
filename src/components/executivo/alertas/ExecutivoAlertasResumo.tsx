import { useState } from "react";
import { useExecutivoAlertasResumo } from "@/hooks/useExecutivoAlertasResumo";
import { useExecutivoAlertasPrioridades } from "@/hooks/useExecutivoAlertasPrioridades";
import { useExecutivoPlanoAcao } from "@/hooks/useExecutivoPlanoAcao";
import { useExecutivoResponsaveisPendencias } from "@/hooks/useExecutivoResponsaveisPendencias";
import { ExecutivoAlertasCards } from "./ExecutivoAlertasCards";
import { ExecutivoSLAResumo } from "./ExecutivoSLAResumo";
import { ExecutivoPrioridades } from "./ExecutivoPrioridades";
import { ExecutivoPlanoAcao } from "./ExecutivoPlanoAcao";
import { ExecutivoResponsaveisPendencias } from "./ExecutivoResponsaveisPendencias";
import type { ExecutivoFiltros } from "@/hooks/useExecutivoResumo";

interface Props {
  filtros: ExecutivoFiltros;
}

export function ExecutivoAlertasResumo({ filtros }: Props) {
  const [respFiltro, setRespFiltro] = useState<string | null>(null);
  const filtrosEfetivos = respFiltro
    ? { ...filtros, responsavel_id: respFiltro }
    : filtros;

  const resumoQ = useExecutivoAlertasResumo(filtros);
  const prioridadesQ = useExecutivoAlertasPrioridades(filtrosEfetivos, 15);
  const planoQ = useExecutivoPlanoAcao(filtros, 20);
  const respQ = useExecutivoResponsaveisPendencias(filtros, 10);

  const saude = resumoQ.data?.saude_alertas;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <ExecutivoAlertasCards
            resumo={resumoQ.data?.resumo}
            indisponiveis={(resumoQ.data?.dados_indisponiveis ?? []).map((d: any) =>
              typeof d === "string" ? d : d?.indicador
            ).filter(Boolean)}
            isLoading={resumoQ.isLoading}
          />
        </div>
        <div>
          <ExecutivoSLAResumo
            score={saude?.score ?? 0}
            classificacao={saude?.classificacao ?? "sem_dados"}
            motivos={saude?.motivos ?? []}
          />
        </div>
      </div>

      {respFiltro && (
        <div className="flex items-center justify-between bg-muted/40 border rounded p-2 text-xs">
          <span>Filtrando prioridades por responsável.</span>
          <button className="text-primary underline" onClick={() => setRespFiltro(null)}>Limpar</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ExecutivoPrioridades prioridades={prioridadesQ.data ?? []} isLoading={prioridadesQ.isLoading} />
        <ExecutivoPlanoAcao acoes={planoQ.data ?? []} isLoading={planoQ.isLoading} />
      </div>

      <ExecutivoResponsaveisPendencias
        responsaveis={respQ.data?.responsaveis ?? []}
        observacao={respQ.data?.observacao ?? undefined}
        isLoading={respQ.isLoading}
        onFiltrar={setRespFiltro}
      />
    </div>
  );
}
