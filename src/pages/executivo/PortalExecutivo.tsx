import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExecutivoPermissionGate } from "@/components/executivo/ExecutivoPermissionGate";
import { ExecutivoHeader } from "@/components/executivo/ExecutivoHeader";
import { ExecutivoFiltros } from "@/components/executivo/ExecutivoFiltros";
import { ExecutivoResumoCards } from "@/components/executivo/ExecutivoResumoCards";
import { ExecutivoSaudeOperacional } from "@/components/executivo/ExecutivoSaudeOperacional";
import { ExecutivoGargalos } from "@/components/executivo/ExecutivoGargalos";
import { ExecutivoTimeline } from "@/components/executivo/ExecutivoTimeline";
import { ExecutivoAtalhos } from "@/components/executivo/ExecutivoAtalhos";
import { ExecutivoFinanceiroResumo } from "@/components/executivo/financeiro/ExecutivoFinanceiroResumo";
import { ExecutivoClientesResumo } from "@/components/executivo/clientes/ExecutivoClientesResumo";
import { ExecutivoAlertasResumo } from "@/components/executivo/alertas/ExecutivoAlertasResumo";
import { ExecutivoRelatorios } from "@/components/executivo/relatorios/ExecutivoRelatorios";
import { useExecutivoResumo, type ExecutivoFiltros as Filtros } from "@/hooks/useExecutivoResumo";
import { useExecutivoGargalos } from "@/hooks/useExecutivoGargalos";
import { useExecutivoTimeline } from "@/hooks/useExecutivoTimeline";

export default function PortalExecutivo() {
  const [filtros, setFiltros] = useState<Filtros>({ periodo: "30_dias" });

  const resumoQ = useExecutivoResumo(filtros);
  const gargalosQ = useExecutivoGargalos(filtros, 10);
  const timelineQ = useExecutivoTimeline(filtros, 20);

  const refreshAll = () => {
    resumoQ.refetch();
    gargalosQ.refetch();
    timelineQ.refetch();
  };

  const saude = resumoQ.data?.saude_operacional;

  return (
    <ExecutivoPermissionGate>
      <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
        <ExecutivoHeader
          periodo={filtros.periodo ?? "30_dias"}
          ultimaAtualizacao={resumoQ.data?.gerado_em}
          isFetching={resumoQ.isFetching || gargalosQ.isFetching || timelineQ.isFetching}
          onRefresh={refreshAll}
        />

        <ExecutivoFiltros filtros={filtros} onChange={setFiltros} />

        <Tabs defaultValue="operacional" className="w-full">
          <TabsList>
            <TabsTrigger value="operacional">Operacional</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            <TabsTrigger value="clientes">Clientes &amp; Fazendas</TabsTrigger>
            <TabsTrigger value="alertas">Alertas &amp; Ações</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
            <TabsTrigger value="gargalos">Gargalos</TabsTrigger>
          </TabsList>

          <TabsContent value="operacional" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3">
                <ExecutivoResumoCards
                  resumo={resumoQ.data?.resumo}
                  indisponiveis={resumoQ.data?.dados_indisponiveis ?? []}
                  isLoading={resumoQ.isLoading}
                />
              </div>
              <div>
                <ExecutivoSaudeOperacional
                  score={saude?.score ?? 0}
                  classificacao={saude?.classificacao ?? "sem_dados"}
                  motivos={saude?.motivos ?? []}
                />
              </div>
            </div>
            <ExecutivoTimeline eventos={timelineQ.data?.items ?? []} indisponiveis={timelineQ.data?.dados_indisponiveis ?? []} motivo={timelineQ.data?.motivo_indisponibilidade} hasError={timelineQ.isError} isLoading={timelineQ.isLoading} />
          </TabsContent>

          <TabsContent value="financeiro" className="mt-4">
            <ExecutivoFinanceiroResumo filtros={filtros} />
          </TabsContent>

          <TabsContent value="clientes" className="mt-4">
            <ExecutivoClientesResumo filtros={filtros} />
          </TabsContent>

          <TabsContent value="alertas" className="mt-4">
            <ExecutivoAlertasResumo filtros={filtros} />
          </TabsContent>

          <TabsContent value="relatorios" className="mt-4">
            <ExecutivoRelatorios filtrosBase={filtros} />
          </TabsContent>

          <TabsContent value="gargalos" className="mt-4">
            <ExecutivoGargalos gargalos={gargalosQ.data?.items ?? []} indisponiveis={gargalosQ.data?.dados_indisponiveis ?? []} motivo={gargalosQ.data?.motivo_indisponibilidade} hasError={gargalosQ.isError} isLoading={gargalosQ.isLoading} />
          </TabsContent>
        </Tabs>

        <ExecutivoAtalhos />
      </div>
    </ExecutivoPermissionGate>
  );
}
