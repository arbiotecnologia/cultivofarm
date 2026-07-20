import { Badge } from "@/components/ui/badge";
import type { ProductComposicao } from "@/hooks/useProductProfile";

interface Props {
  composicao: ProductComposicao[];
}

export function ProductFormulaBenefits({ composicao }: Props) {
  if (composicao.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
        Composição microbiológica pendente. Cadastre as formulações na aba "Composição" do produto.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {composicao.map((c, i) => (
        <div key={i} className="border rounded-md p-3">
          {c.microrganismo ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{c.microrganismo.nome}</div>
                  {c.microrganismo.nome_cientifico && (
                    <div className="text-xs italic text-muted-foreground">{c.microrganismo.nome_cientifico}</div>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px] uppercase">{c.microrganismo.tipo}</Badge>
              </div>
              {c.microrganismo.funcao_agronomica && (
                <div className="text-xs text-muted-foreground mt-1">{c.microrganismo.funcao_agronomica}</div>
              )}
              <div className="flex gap-3 mt-2 text-[11px] font-mono text-muted-foreground">
                {c.volume_ml != null && <span>Vol.: {c.volume_ml} mL</span>}
                {c.proporcao != null && <span>Proporção: {c.proporcao}%</span>}
              </div>
            </>
          ) : c.insumo_nome ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{c.insumo_nome}</div>
                <div className="text-xs text-muted-foreground">Insumo / matéria-prima</div>
              </div>
              <div className="text-[11px] font-mono">{c.volume_ml ?? 0} mL · {c.proporcao ?? 0}%</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Componente sem vínculo</div>
          )}
        </div>
      ))}
    </div>
  );
}
