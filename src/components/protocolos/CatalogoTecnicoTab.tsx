import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RevisaoTecnicaPanel } from "./RevisaoTecnicaPanel";
import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
import { CatalogoKpis } from "@/components/catalogo/CatalogoKpis";
import { useCatalogoUnificado } from "@/hooks/useCatalogoUnificado";
import { useTabParam } from "@/lib/navigation/useTabParam";
import { CatalogoQueryErrorState } from "@/components/catalogo/CatalogoQueryErrorState";

const SUB_TABS = ["catalogo", "revisao"] as const;

export function CatalogoTecnicoTab() {
  const { data: rows = [], error, isLoading, isFetching, refetch } = useCatalogoUnificado("admin");
  const [sub, setSub] = useTabParam("sub", SUB_TABS, "catalogo");

  return (
    <Tabs value={sub} onValueChange={setSub} className="space-y-4">
      <TabsList>
        <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
        <TabsTrigger value="revisao">Revisão Técnica</TabsTrigger>
      </TabsList>
      <TabsContent value="revisao" className="space-y-4">
        <RevisaoTecnicaPanel />
      </TabsContent>
      <TabsContent value="catalogo" className="space-y-4">
        {error ? <CatalogoQueryErrorState error={error} retry={refetch} busy={isFetching} /> :
          isLoading ? <p role="status">Carregando catálogo…</p> : <>
            <CatalogoKpis rows={rows} />
            <CatalogoCardsGrid scope="admin" />
          </>}
      </TabsContent>
    </Tabs>
  );
}
