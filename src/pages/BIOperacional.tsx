import { useBIOperacional } from "@/hooks/useBIOperacional";
import { BIFiltrosGlobais } from "@/components/bi/BIFiltrosGlobais";
import { BICardKPI } from "@/components/bi/BICardKPI";
import { BIGargalosTable } from "@/components/bi/BIGargalosTable";
import { BIErrorState } from "@/components/bi/BIErrorState";
import { BIVisitasResumo } from "@/components/bi/visitas/BIVisitasResumo";
import { BIRecomendacoesResumo } from "@/components/bi/visitas/BIRecomendacoesResumo";
import { BIVisitasPorFazenda } from "@/components/bi/visitas/BIVisitasPorFazenda";
import { BIConversaoResumo } from "@/components/bi/conversao/BIConversaoResumo";
import { BILaboratorioResumo } from "@/components/bi/laboratorio/BILaboratorioResumo";
import { BIEntregasResumo } from "@/components/bi/entregas/BIEntregasResumo";
import { BIEntregasPorFazenda } from "@/components/bi/entregas/BIEntregasPorFazenda";
import { BIPermissionGate } from "@/components/bi/BIPermissionGate";
import { BIHeader } from "@/components/bi/BIHeader";
import { BIExportButton } from "@/components/bi/BIExportButton";
import { BIDrillDownModal } from "@/components/bi/modal/BIDrillDownModal";
import { BIEstoqueTab } from "@/components/bi/estoque/BIEstoqueTab";
import { 
  BI_VISITAS_HEADERS, 
  BI_LABORATORIO_HEADERS, 
  BI_ENTREGAS_HEADERS, 
  BI_GARGALOS_HEADERS 
} from "@/lib/biExport";

import { 
  BarChart3, 
  Users, 
  FlaskConical, 
  Truck, 
  Clock,
  FileCheck2,
  Zap,
  Box,
  PackageSearch,
  AlertTriangle,
  Timer,
  LayoutGrid,
  Warehouse
} from "lucide-react";







import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useCallback } from "react";

export default function BIOperacional() {
  const { 
    loading, 
    error, 
    lastUpdated, 
    filtros, 
    setFiltros, 
    indicadoresVisitas, 
    indicadoresRecomendacoes, 
    indicadoresLaboratorio, 
    indicadoresQualidade, 
    indicadoresEntregas, 
    indicadoresEstoque,
    indicadoresTempo,
    dadosGargalos,
    visitasPorConsultor,
    visitasPorCliente,
    visitasPorFazenda,
    visitasCriticas,
    oportunidadesParadas,
    gargalosConversao,
    laboratorioPorStatus,
    laboratorioPorProduto,
    laboratorioPorCliente,
    osCriticas,
    indicadoresEntregasDetalhados,
    entregasPorCliente,
    entregasPorFazenda,
    osFinalizaveis,
    entregasCriticas,
    rawVisitas,
    rawEsteira,
    estoquePorProdutoReal,
    rawMovimentacoes,
    role,
    detalheAtivo,
    abrirDetalhe,
    fecharDetalhe,
    dadosDetalhe,
    resumoEsteira,
    resumoVisitas,
    ativarDetalhados,
    refetch,
  } = useBIOperacional();

  // Cards da Visão Geral vêm das RPCs agregadas (fallback para o cálculo antigo em caso de acesso restrito).
  const kpiSolicitacoesAbertas = resumoVisitas?.solicitacoes_abertas ?? indicadoresVisitas.solicitacoesAbertas;
  const kpiEmProducao = resumoEsteira?.por_status?.em_producao ?? indicadoresLaboratorio.emProducao;
  const kpiProntoEntrega = resumoEsteira?.por_status?.pronto_entrega ?? indicadoresLaboratorio.prontoEntrega;
  const kpiEntregaPendente = resumoEsteira?.por_status?.entrega_pendente ?? indicadoresLaboratorio.entregaPendente;


  const indicadoresEstoqueMemo = useMemo(() => ({
    volumeSolicitado: indicadoresEstoque.volumeSolicitado,
    volumeProduzidoReal: indicadoresEstoque.volumeProduzidoReal,
    volumeEmEstoqueReal: indicadoresEstoque.volumeEmEstoqueReal,
    volumeReservadoReal: indicadoresEstoque.volumeReservadoReal,
    volumeDisponivelReal: indicadoresEstoque.volumeDisponivelReal,
    volumeEntregueReal: indicadoresEstoque.volumeEntregueReal,
    volumeSolicitadoEntregue: indicadoresEstoque.volumeSolicitadoEntregue,
  }), [indicadoresEstoque]);







  if (role === "cliente_produtor" || role === "financeiro") {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600">Acesso Negado</h2>
        <p className="text-muted-foreground mt-2">Você não possui permissão para acessar o BI Operacional.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <BIErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  const handleTabChange = (value: string) => {
    if (value !== "visao-geral") ativarDetalhados();
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 bg-slate-50/50 min-h-screen">
      <BIHeader 
        lastUpdated={lastUpdated} 
        loading={loading} 
        onUpdate={() => refetch()} 
      />



      <BIFiltrosGlobais filtros={filtros} onFiltrosChange={setFiltros} />

      <Tabs defaultValue="visao-geral" className="w-full" onValueChange={handleTabChange}>

        <TabsList className="w-full justify-start bg-white p-1 h-12 border shadow-sm mb-6 overflow-x-auto overflow-y-hidden flex-nowrap max-w-full">
          <TabsTrigger value="visao-geral" className="data-[state=active]:bg-primary data-[state=active]:text-white gap-2 h-full text-xs font-bold uppercase">
            <BarChart3 className="h-4 w-4" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="visitas" className="data-[state=active]:bg-primary data-[state=active]:text-white gap-2 h-full text-xs font-bold uppercase">
            <Users className="h-4 w-4" /> Visitas Técnicas
          </TabsTrigger>
          <TabsTrigger value="conversao" className="data-[state=active]:bg-primary data-[state=active]:text-white gap-2 h-full text-xs font-bold uppercase">
            <Zap className="h-4 w-4" /> Conversão
          </TabsTrigger>
          <TabsTrigger value="laboratorio" className="data-[state=active]:bg-primary data-[state=active]:text-white gap-2 h-full text-xs font-bold uppercase">
            <FlaskConical className="h-4 w-4" /> Laboratório
          </TabsTrigger>
          <TabsTrigger value="entregas" className="data-[state=active]:bg-primary data-[state=active]:text-white gap-2 h-full text-xs font-bold uppercase">
            <Truck className="h-4 w-4" /> Entregas & Estoque
          </TabsTrigger>
          <TabsTrigger value="recomendacoes" className="data-[state=active]:bg-primary data-[state=active]:text-white gap-2 h-full text-xs font-bold uppercase">
            <FileCheck2 className="h-4 w-4" /> Recomendações & OS
          </TabsTrigger>
          <TabsTrigger value="estoque" className="data-[state=active]:bg-primary data-[state=active]:text-white gap-2 h-full text-xs font-bold uppercase">
            <Warehouse className="h-4 w-4" /> Estoque
          </TabsTrigger>



        </TabsList>

        <TabsContent value="visao-geral" className="space-y-6">
          <BIPermissionGate section="visao_geral">

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <BICardKPI 
              titulo="Solicitações Abertas" 
              valor={kpiSolicitacoesAbertas} 
              loading={loading}
              icone={Clock}
              descricao="Aguardando agendamento ou visita inicial"
            />
            <BICardKPI 
              titulo="Em Produção" 
              valor={kpiEmProducao} 
              loading={loading}
              icone={FlaskConical}
              descricao="Lotes ativos em fabricação laboratorial"
            />
            <BICardKPI 
              titulo="Pronto para Entrega" 
              valor={kpiProntoEntrega} 
              loading={loading}
              icone={PackageSearch}
              descricao="Produtos envasados e disponíveis em estoque"
            />
            <BICardKPI 
              titulo="Entregas Pendentes" 
              valor={kpiEntregaPendente} 
              loading={loading}
              icone={Truck}
              variant="warning"
              descricao="Produtos expedidos aguardando confirmação"
            />
          </div>


          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Gargalos Críticos Identificados
                </h3>
                <BIExportButton 
                  data={dadosGargalos} 
                  headers={BI_GARGALOS_HEADERS} 
                  filenamePrefix="gargalos" 
                  label="Exportar Gargalos"
                  variant="ghost"
                  className="h-8 text-[10px]"
                  section="gargalos"
                />

              </div>
              <BIGargalosTable dados={dadosGargalos.slice(0, 5)} loading={loading} />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                <Timer className="h-5 w-5 text-primary" />
                Eficiência (Tempos Médios)
              </h3>
              <div className="space-y-3">
                <BICardKPI 
                  titulo="Solicitação → Check-in" 
                  valor={indicadoresTempo.solicitacaoAteCheckin?.toFixed(1) || null} 
                  sufixo="h"
                  loading={loading}
                  descricao="Tempo desde o portal até a chegada na fazenda"
                />
                <BICardKPI 
                  titulo="Check-in → Finalização" 
                  valor={indicadoresTempo.checkinAteFinalizacao?.toFixed(1) || null} 
                  sufixo="h"
                  loading={loading}
                  descricao="Duração média das visitas técnicas"
                />
                <BICardKPI 
                  titulo="OS → Entrega" 
                  valor={indicadoresTempo.osAteEntrega?.toFixed(1) || null} 
                  sufixo="h"
                  loading={loading}
                  descricao="Lead time total do laboratório até o cliente"
                />
              </div>
            </div>
            </div>
          </BIPermissionGate>
        </TabsContent>


        <TabsContent value="visitas" className="space-y-6">
          <BIPermissionGate section="visitas_tecnicas">
            <div className="flex justify-end mb-4">
              <BIExportButton 
                data={rawVisitas} 
                headers={BI_VISITAS_HEADERS} 
                filenamePrefix="visitas" 
                label="Exportar Todas as Visitas"
                section="visitas_tecnicas"
              />

            </div>
            <BIVisitasResumo 
              indicadores={indicadoresVisitas}
              indicadoresRecomendacoes={indicadoresRecomendacoes}
              indicadoresTempo={indicadoresTempo}
              visitasPorConsultor={visitasPorConsultor}
              visitasPorCliente={visitasPorCliente}
              visitasCriticas={visitasCriticas}
              loading={loading}
              onConsultorClick={(id, nome) => abrirDetalhe("consultor", id, nome, "visitas")}
              onClienteClick={(id, nome) => abrirDetalhe("cliente", id, nome, "visitas")}
            />
            <div className="space-y-4">
              <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-primary" />
                Visitas por Fazenda
              </h3>
              <BIVisitasPorFazenda 
                dados={visitasPorFazenda} 
                loading={loading} 
                onRowClick={(id, nome) => abrirDetalhe("fazenda", id, nome, "visitas")}
              />
            </div>
          </BIPermissionGate>
        </TabsContent>



        <TabsContent value="conversao" className="space-y-6">
          <BIPermissionGate section="conversao">
            <div className="flex justify-end mb-4">
              <BIExportButton 
                data={rawVisitas.filter(v => v.possui_recomendacao)} 
                headers={BI_VISITAS_HEADERS} 
                filenamePrefix="conversao" 
                label="Exportar Conversão"
                section="conversao"
              />
            </div>
            <BIConversaoResumo 

              indicadores={indicadoresRecomendacoes}
              indicadoresTempo={indicadoresTempo}
              conversaoPorConsultor={visitasPorConsultor}
              conversaoPorCliente={visitasPorCliente}
              oportunidadesParadas={oportunidadesParadas}
              gargalosConversao={gargalosConversao}
              loading={loading}
            />
          </BIPermissionGate>
        </TabsContent>



        <TabsContent value="recomendacoes" className="space-y-6">
          <BIPermissionGate section="conversao">
            <div className="space-y-4">
              <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-primary" />
                Eficiência das Recomendações
              </h3>
              <BIRecomendacoesResumo indicadores={indicadoresRecomendacoes} loading={loading} />
            </div>
          </BIPermissionGate>
        </TabsContent>


        <TabsContent value="laboratorio" className="space-y-6">
          <BIPermissionGate section="laboratorio">
            <div className="flex justify-end mb-4">
              <BIExportButton 
                data={rawEsteira} 
                headers={BI_LABORATORIO_HEADERS} 
                filenamePrefix="laboratorio" 
                label="Exportar Esteira Laboratorial"
                section="laboratorio"
              />

            </div>
            <BILaboratorioResumo 
              indicadores={indicadoresLaboratorio}
              indicadoresQualidade={indicadoresQualidade}
              indicadoresTempo={indicadoresTempo}
              laboratorioPorStatus={laboratorioPorStatus}
              laboratorioPorProduto={laboratorioPorProduto}
              laboratorioPorCliente={laboratorioPorCliente}
              osCriticas={osCriticas}
              gargalosLaboratorio={[]}
              loading={loading}
              onProdutoClick={(nome) => {
                const match = rawEsteira.find((e: any) => e.produto_nome === nome && e.produto_id);
                if (match?.produto_id) abrirDetalhe("produto", match.produto_id, nome, "esteira");
              }}
              onClienteClick={(nome) => {
                const match = rawEsteira.find((e: any) => e.cliente_nome === nome && e.cliente_id);
                if (match?.cliente_id) abrirDetalhe("cliente", match.cliente_id, nome, "esteira");
              }}
            />
          </BIPermissionGate>
        </TabsContent>




        <TabsContent value="entregas" className="space-y-6">
          <BIPermissionGate section="entregas">
            <div className="flex justify-end mb-4">
              <BIExportButton 
                data={rawEsteira.filter(e => !!e.entrega_id || !!e.data_entrega)} 
                headers={BI_ENTREGAS_HEADERS} 
                filenamePrefix="entregas" 
                label="Exportar Logística e Entregas"
                section="entregas"
              />

            </div>
            <BIEntregasResumo 
              indicadores={indicadoresEntregasDetalhados}
              indicadoresEstoque={indicadoresEstoqueMemo}
              entregasPorCliente={entregasPorCliente}
              estoquePorProduto={estoquePorProdutoReal}

              entregasCriticas={entregasCriticas}
              osFinalizaveis={osFinalizaveis}
              loading={loading}
            />
            <div className="space-y-4">
              <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-primary" />
                Entregas por Fazenda
              </h3>
              <BIEntregasPorFazenda 
                dados={entregasPorFazenda} 
                loading={loading}
                onRowClick={(id, nome) => abrirDetalhe("fazenda", id, nome, "esteira")}
              />
            </div>
          </BIPermissionGate>
        </TabsContent>

        <TabsContent value="estoque" className="space-y-6">
          <BIPermissionGate section="estoque">
            <BIEstoqueTab
              indicadoresEstoque={indicadoresEstoqueMemo}
              estoquePorProduto={estoquePorProdutoReal}
              rawMovimentacoes={rawMovimentacoes}
              loading={loading}
            />
          </BIPermissionGate>
        </TabsContent>

      </Tabs>

      {detalheAtivo && (
        <BIDrillDownModal
          open={!!detalheAtivo}
          onClose={fecharDetalhe}
          tipo={detalheAtivo.tipo}
          id={detalheAtivo.id}
          nome={detalheAtivo.nome}
          dados={dadosDetalhe}
          origem={detalheAtivo.origem}
        />
      )}
    </div>
  );
}
