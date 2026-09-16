import { useMemo } from "react";
import { FileText, Sprout, FlaskConical, AlertTriangle, ShoppingCart, CheckCircle2, BookOpen } from "lucide-react";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";

/**
 * KPIs do Catálogo Cultivo Farm — fonte única compartilhada por
 * pela aba "Catálogo Técnico" de `/base-tecnica` (rota unificada; a antiga
 * `/comercial/catalogo` apenas redireciona).
 *
 * Os cálculos são exatamente os que existiam duplicados nos dois arquivos;
 * nada de filtro, dado ou ordem foi alterado nesta extração.
 */
export function computeCatalogoKpis(rows: CatalogoUnificadoRow[]) {
  return {
    ativosM: rows.filter((r) => r.tipo === "microrganismo" && r.ativo).length,
    ativosP: rows.filter((r) => r.tipo === "produto" && r.ativo).length,
    aprovadas: rows.filter((r) => r.ficha_status === "aprovado").length,
    incompletas: rows.filter(
      (r) => !r.ficha_status || r.ficha_status === "rascunho" || r.ficha_status === "em_revisao",
    ).length,
    b2bSemExpl: rows.filter(
      (r) => r.b2b_enabled && r.ativo && r.ficha_status === "aprovado" && !r.explicacao_b2b,
    ).length,
    semComp: rows.filter((r) => r.tipo === "produto" && r.ativo && (r.composicao_count ?? 0) === 0).length,
    semFonte: rows.filter((r) => r.ficha_status === "aprovado" && r.fontes_count === 0).length,
  };
}

export function CatalogoKpis({ rows }: { rows: CatalogoUnificadoRow[] }) {
  const kpis = useMemo(() => computeCatalogoKpis(rows), [rows]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
      <Kpi icon={FlaskConical} label="Microrganismos ativos" value={kpis.ativosM} />
      <Kpi icon={Sprout} label="Produtos ativos" value={kpis.ativosP} />
      <Kpi icon={CheckCircle2} label="Fichas aprovadas" value={kpis.aprovadas} tone="success" />
      <Kpi icon={FileText} label="Fichas incompletas" value={kpis.incompletas} tone="warn" />
      <Kpi icon={ShoppingCart} label="B2B sem texto" value={kpis.b2bSemExpl} tone="warn" />
      <Kpi icon={BookOpen} label="Aprovadas s/ fonte" value={kpis.semFonte} tone="warn" />
      <Kpi icon={AlertTriangle} label="Produtos s/ composição" value={kpis.semComp} tone="danger" />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone?: "success" | "warn" | "danger";
}) {
  const cls =
    tone === "success" ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    tone === "warn"    ? "text-amber-700  bg-amber-50  border-amber-200" :
    tone === "danger"  ? "text-rose-700   bg-rose-50   border-rose-200" :
                         "text-slate-700  bg-slate-50  border-slate-200";
  return (
    <div className={`border rounded-lg p-3 flex items-center gap-3 ${cls}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <div className="text-lg font-bold leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wide truncate">{label}</div>
      </div>
    </div>
  );
}
