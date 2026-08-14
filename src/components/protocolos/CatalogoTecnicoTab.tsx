import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RevisaoTecnicaPanel } from "./RevisaoTecnicaPanel";
import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
import { CatalogoKpis } from "@/components/catalogo/CatalogoKpis";
import { useCatalogoUnificado } from "@/hooks/useCatalogoUnificado";
import { useTabParam } from "@/lib/navigation/useTabParam";

const SUB_TABS = ["catalogo", "revisao"] as const;

export function CatalogoTecnicoTab() {
  const { data: rows = [] } = useCatalogoUnificado("admin");
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
        <CatalogoKpis rows={rows} />

        <CatalogoCardsGrid scope="admin" />
      </TabsContent>
    </Tabs>
  );
}
