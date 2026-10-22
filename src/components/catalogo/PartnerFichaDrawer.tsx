import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatarMoeda } from "@/lib/catalogo/formatUnidades";

/** Approved canonical RPC projection only: no hooks, enrichment reads or grants. */
export function PartnerFichaDrawer({ item, open, onOpenChange }: {
  item: CatalogoUnificadoRow | null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const fields = item ? [
    ["O que é", item.ficha_resumo], ["Para que serve", item.explicacao_produtor],
    ["Explicação B2B", item.explicacao_b2b], ["Função", item.funcao],
    ["Quais benefícios pode trazer", item.beneficios_agronomicos],
    ["Quando costuma ser usado", item.raw.indicacoes_uso],
    ["Cuidados básicos", item.raw.cuidados_aplicacao], ["Mecanismo de ação", item.mecanismo_acao],
  ] : [];
  return <Sheet open={open && !!item} onOpenChange={onOpenChange}>
    <SheetContent className="w-full sm:max-w-md overflow-y-auto">
      <SheetHeader><SheetTitle>{item?.nome}</SheetTitle><SheetDescription>{item?.subtitulo}</SheetDescription></SheetHeader>
      {item?.ficha_status === "aprovado" ? <div className="space-y-4 mt-4 text-sm">
        {fields.filter(([, value]) => typeof value === "string" && value.trim()).map(([label, value]) =>
          <section key={label}><h3 className="font-semibold">{label}</h3><p className="whitespace-pre-wrap">{value}</p></section>)}
        {typeof item.raw.dose_ml_ha === "number" && <p>Dose (mL/ha): {item.raw.dose_ml_ha}</p>}
        {([ ["Valor por litro", item.raw.valor_litro_brl], ["Valor da dose (100 mL)", item.raw.valor_dose_brl],
          ["Valor por hectare", item.raw.valor_ha_brl] ] as const).filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([label, value]) => <p key={label}>{label}: {formatarMoeda(value)}</p>)}
        <p>Alvos / culturas: {item.alvos_count}</p>
      </div> : <p className="mt-4 text-sm text-muted-foreground">Ficha técnica em validação.</p>}
    </SheetContent>
  </Sheet>;
}