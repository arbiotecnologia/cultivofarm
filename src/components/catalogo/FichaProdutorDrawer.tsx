import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLogCatalogAccess, type CatalogOrigem } from "@/hooks/useLogCatalogAccess";
import { useEmbalagensPorItem, formatEmbalagens } from "@/hooks/useEmbalagensPorItem";
import { useCatalogoVolumes, formatVolumesCatalogo } from "@/hooks/useCatalogoVolumes";
import { brl } from "@/lib/financial/format";
import {
  DOSES_POR_LITRO,
  formatarCustoHa,
  formatarMoeda,
  LABEL_CUSTO_HA,
  AVISO_CUSTO_HA_VARIAVEL,
} from "@/lib/catalogo/formatUnidades";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
  tipo: "produto" | "microrganismo";
  origem?: CatalogOrigem;
}

interface Ficha {
  nome: string;
  subtitulo?: string | null;
  resumo_curto: string | null;
  explicacao_produtor: string | null;
  indicacoes_uso: string | null;
  cuidados_aplicacao: string | null;
  beneficio: string | null;
  ativo: boolean;
  aprovada: boolean;
  valor_dose_brl?: number | null;
  valor_litro_brl?: number | null;
  dose_ml_ha?: number | null;
  valor_ha_brl?: number | null;
}

export function FichaProdutorDrawer({ open, onOpenChange, itemId, tipo, origem = "portal_produtor" }: Props) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(false);
  const log = useLogCatalogAccess();
  const { data: embalagens } = useEmbalagensPorItem();
  const { data: volumesCat } = useCatalogoVolumes();
  const volumes = itemId
    ? (tipo === "produto"
        ? embalagens?.porProdutoId.get(itemId) ?? []
        : embalagens?.porMicrorganismoId.get(itemId) ?? [])
    : [];
  const volumesCatalogoItem = itemId
    ? (tipo === "produto"
        ? volumesCat?.porProdutoId.get(itemId) ?? []
        : volumesCat?.porMicrorganismoId.get(itemId) ?? [])
    : [];

  useEffect(() => {
    if (!open || !itemId) return;
    log({ entidade_tipo: tipo, entidade_id: itemId, origem });
    setLoading(true);
    (async () => {
      if (tipo === "microrganismo") {
        const [m, p] = await Promise.all([
          (supabase as any).from("vw_catalogo_ficha_microrganismos").select("nome,nome_cientifico,funcao_agronomica,ativo,valor_dose_brl,valor_litro_brl,dose_ml_ha").eq("id", itemId).maybeSingle(),
          supabase
            .from("microorganism_technical_profiles")
            .select("resumo_curto,explicacao_produtor,indicacoes_uso,cuidados_aplicacao,beneficios_agronomicos,status_validacao")
            .eq("microrganismo_id", itemId)
            .eq("status_validacao", "aprovado")
            .maybeSingle(),
        ]);
        setFicha(
          m.data
            ? {
                nome: m.data.nome,
                subtitulo: m.data.nome_cientifico,
                resumo_curto: p.data?.resumo_curto ?? null,
                explicacao_produtor: p.data?.explicacao_produtor ?? null,
                indicacoes_uso: p.data?.indicacoes_uso ?? null,
                cuidados_aplicacao: p.data?.cuidados_aplicacao ?? null,
                beneficio: p.data?.beneficios_agronomicos ?? null,
                ativo: m.data.ativo,
                aprovada: !!p.data,
                valor_dose_brl: (m.data as any).valor_dose_brl ?? null,
                valor_litro_brl: (m.data as any).valor_litro_brl ?? null,
                dose_ml_ha: (m.data as any).dose_ml_ha ?? null,
              }
            : null,
        );
      } else {
        const [pr, p] = await Promise.all([
          (supabase as any).from("vw_catalogo_ficha_produtos").select("nome,codigo,tipo,descricao,ativo,valor_dose_brl,valor_litro_brl,valor_ha_brl,dose_ml_ha").eq("id", itemId).maybeSingle(),
          supabase
            .from("product_technical_profiles")
            .select("resumo_curto,explicacao_produtor,indicacoes_uso,cuidados_aplicacao,beneficio_combinado,status_validacao")
            .eq("produto_id", itemId)
            .eq("status_validacao", "aprovado")
            .maybeSingle(),
        ]);
        setFicha(
          pr.data
            ? {
                nome: pr.data.nome,
                subtitulo: pr.data.codigo,
                resumo_curto: p.data?.resumo_curto ?? null,
                explicacao_produtor: p.data?.explicacao_produtor ?? null,
                indicacoes_uso: p.data?.indicacoes_uso ?? null,
                cuidados_aplicacao: p.data?.cuidados_aplicacao ?? null,
                beneficio: p.data?.beneficio_combinado ?? null,
                ativo: pr.data.ativo ?? true,
                aprovada: !!p.data,
                valor_dose_brl: (pr.data as any).valor_dose_brl ?? null,
                valor_litro_brl: (pr.data as any).valor_litro_brl ?? null,
                dose_ml_ha: (pr.data as any).dose_ml_ha ?? null,
                valor_ha_brl: (pr.data as any).valor_ha_brl ?? null,
              }
            : null,
        );
      }
      setLoading(false);
    })();
  }, [open, itemId, tipo, log, origem]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Entender este bioinsumo
            <Badge variant="outline" className="text-[10px]">{tipo}</Badge>
          </SheetTitle>
          {ficha && (
            <SheetDescription className="italic">{ficha.nome}{ficha.subtitulo ? ` · ${ficha.subtitulo}` : ""}</SheetDescription>
          )}
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !ficha ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Item não encontrado.</p>
        ) : !ficha.aprovada ? (
          <p className="text-sm text-muted-foreground py-10 text-center px-4 italic">
            Ficha técnica em validação pela Cultivo Farm. Consulte a equipe técnica para recomendação detalhada.
          </p>
        ) : (
          <div className="space-y-4 mt-4 text-sm">
            {ficha.resumo_curto && <Section title="O que é">{ficha.resumo_curto}</Section>}
            {ficha.explicacao_produtor && <Section title="Para que serve">{ficha.explicacao_produtor}</Section>}
            {ficha.beneficio && <Section title="Quais benefícios pode trazer">{ficha.beneficio}</Section>}
            {ficha.indicacoes_uso && <Section title="Quando costuma ser usado">{ficha.indicacoes_uso}</Section>}
            {ficha.cuidados_aplicacao && <Section title="Cuidados básicos">{ficha.cuidados_aplicacao}</Section>}
            {(ficha.valor_dose_brl != null || ficha.valor_litro_brl != null || ficha.valor_ha_brl != null) && (
              <Section title="Valores e volume">
                <div className="space-y-1">
                  {ficha.valor_litro_brl != null && (
                    <div>Valor por litro: <span className="font-semibold">{formatarMoeda(ficha.valor_litro_brl)}</span></div>
                  )}
                  {ficha.valor_dose_brl != null && (
                    <div>Valor da dose (100 mL): <span className="font-semibold">{formatarMoeda(ficha.valor_dose_brl)}</span></div>
                  )}
                  <div className="text-xs text-muted-foreground">1 litro rende {DOSES_POR_LITRO} doses de 100 mL.</div>
                  {(ficha.dose_ml_ha != null || ficha.valor_ha_brl != null) && (
                    <CustoHaLinha tipo={tipo} ficha={ficha} />
                  )}
                  <div className="text-[11px] text-muted-foreground italic">{AVISO_CUSTO_HA_VARIAVEL}</div>
                </div>
              </Section>
            )}
            {volumesCatalogoItem.length > 0 && <Section title="Volumes do catálogo">{formatVolumesCatalogo(volumesCatalogoItem)}</Section>}
            {volumes.length > 0 && <Section title="Formatos de entrega">{formatEmbalagens(volumes)}</Section>}
            <p className="text-[11px] text-muted-foreground italic border-t pt-3">
              As recomendações de bioinsumos exigem avaliação técnica e prescrição agronômica conforme cultura, alvo, ambiente, histórico da área e manejo adotado.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CustoHaLinha({ tipo, ficha }: { tipo: "produto" | "microrganismo"; ficha: Ficha }) {
  const custo = formatarCustoHa({
    tipo,
    doseMlHa: ficha.dose_ml_ha,
    valorHa: ficha.valor_ha_brl,
    valorDose: ficha.valor_dose_brl,
    valorLitro: ficha.valor_litro_brl,
  });
  return (
    <div>
      {LABEL_CUSTO_HA}: <span className="font-semibold">{custo.texto}</span>
      {custo.doseTexto && (
        <span className="text-xs text-muted-foreground"> ({custo.doseTexto})</span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      <div className="whitespace-pre-wrap">{children}</div>
    </div>
  );
}

