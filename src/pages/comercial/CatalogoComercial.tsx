import { useMemo } from "react";
import { CatalogoCardsGrid } from "@/components/catalogo/CatalogoCardsGrid";
import { useCatalogoUnificado } from "@/hooks/useCatalogoUnificado";
import { FileText, Sprout, FlaskConical, AlertTriangle, ShoppingCart, CheckCircle2, BookOpen } from "lucide-react";

export default function CatalogoComercial() {
  const { data: rows = [] } = useCatalogoUnificado("interno");

  const kpis = useMemo(() => {
    const ativosM = rows.filter((r) => r.tipo === "microrganismo" && r.ativo).length;
    const ativosP = rows.filter((r) => r.tipo === "produto" && r.ativo).length;
    const aprovadas = rows.filter((r) => r.ficha_status === "aprovado").length;
    const incompletas = rows.filter((r) => !r.ficha_status || r.ficha_status === "rascunho" || r.ficha_status === "em_revisao").length;
    const b2bSemExpl = rows.filter((r) => r.b2b_enabled && r.ativo && r.ficha_status === "aprovado" && !r.explicacao_b2b).length;
    const semComp = rows.filter((r) => r.tipo === "produto" && r.ativo && (r.composicao_count ?? 0) === 0).length;
    const semFonte = rows.filter((r) => r.ficha_status === "aprovado" && r.fontes_count === 0).length;
    return { ativosM, ativosP, aprovadas, incompletas, b2bSemExpl, semComp, semFonte };
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Catálogo Comercial</h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada de produtos e microrganismos — mesmas fichas técnicas do painel do administrador, em modo leitura.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <Kpi icon={FlaskConical} label="Microrganismos ativos" value={kpis.ativosM} />
        <Kpi icon={Sprout} label="Produtos ativos" value={kpis.ativosP} />
        <Kpi icon={CheckCircle2} label="Fichas aprovadas" value={kpis.aprovadas} tone="success" />
        <Kpi icon={FileText} label="Fichas incompletas" value={kpis.incompletas} tone="warn" />
        <Kpi icon={ShoppingCart} label="B2B sem texto" value={kpis.b2bSemExpl} tone="warn" />
        <Kpi icon={BookOpen} label="Aprovadas s/ fonte" value={kpis.semFonte} tone="warn" />
        <Kpi icon={AlertTriangle} label="Produtos s/ composição" value={kpis.semComp} tone="danger" />
      </div>

      <CatalogoCardsGrid scope="interno" />
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone?: "success" | "warn" | "danger" }) {
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
