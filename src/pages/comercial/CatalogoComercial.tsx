import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
import { CatalogoKpis } from "@/components/catalogo/CatalogoKpis";
import { useCatalogoUnificado } from "@/hooks/useCatalogoUnificado";

export default function CatalogoComercial() {
  const { data: rows = [] } = useCatalogoUnificado("interno");

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Catálogo Comercial</h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada de produtos e microrganismos — mesmas fichas técnicas do painel do administrador, em modo leitura.
        </p>
      </div>

      <CatalogoKpis rows={rows} />

      <CatalogoCardsGrid scope="interno" />
    </div>
  );
}

