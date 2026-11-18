import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, FileCheck2, AlertTriangle, BookOpen, ShoppingCart } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { MicroorganismTechnicalProfileDialog } from "./MicroorganismTechnicalProfileDialog";
import { ProductTechnicalProfileDialog } from "./ProductTechnicalProfileDialog";
import { TechnicalProfileStatusBadge } from "./TechnicalProfileStatusBadge";
import { useTabParam } from "@/lib/navigation/useTabParam";
import { consultarCatalogo } from "@/lib/catalogoQueries";
import { CatalogoQueryErrorState } from "@/components/catalogo/CatalogoQueryErrorState";

const REV_TABS = ["micro", "prod"] as const;

interface Item {
  id: string;
  tipo: "produto" | "microrganismo";
  grupo: "revisao" | "rascunho_conteudo";
  nome: string;
  subtitulo: string | null;
  funcao: string | null;
  b2b_enabled: boolean;
  status: string | null;
  alvos: number;
  fontes: number;
  pendencias: string[];
  pronta: boolean;
  updated_at: string | null;
  raw: any;
}

export function RevisaoTecnicaPanel() {
  const [openMicro, setOpenMicro] = useState<any | null>(null);
  const [openProd, setOpenProd] = useState<any | null>(null);
  const [rev, setRev] = useTabParam("rev", REV_TABS, "micro");

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["catalogo-tecnico-revisao"],
    queryFn: async (): Promise<Item[]> => {
      const [prod, micro, prodProf, microProf, formul, sources, microTargets, prodTargets] = await consultarCatalogo([
        (supabase as any).from("produtos").select("id,nome,codigo,tipo,descricao,funcao_completa,ativo,b2b_enabled").eq("ativo", true).order("nome"),
        (supabase as any).from("microrganismos").select("id,nome,nome_cientifico,tipo,funcao_agronomica,descricao,observacoes,ativo,b2b_enabled").eq("ativo", true).order("nome"),
        (supabase as any).from("product_technical_profiles").select("id,produto_id,status_validacao,resumo_curto,explicacao_b2b,explicacao_produtor,explicacao_tecnica,beneficio_combinado,cuidados_aplicacao,updated_at"),
        (supabase as any).from("microorganism_technical_profiles").select("id,microrganismo_id,status_validacao,resumo_curto,explicacao_b2b,explicacao_produtor,mecanismo_acao,beneficios_agronomicos,explicacao_tecnica,cuidados_aplicacao,observacoes_regulatorias,updated_at"),
        (supabase as any).from("formulacoes").select("produto_id"),
        (supabase as any).from("catalog_technical_sources" as any).select("entidade_tipo,entidade_id"),
        (supabase as any).from("microorganism_targets").select("microrganismo_id").eq("ativo", true),
        (supabase as any).from("product_target_recommendations").select("produto_id").eq("ativo", true),
      ]);
      const ppMap = new Map((prodProf.data ?? []).map((x: any) => [x.produto_id, x]));
      const mpMap = new Map((microProf.data ?? []).map((x: any) => [x.microrganismo_id, x]));
      const compMap = new Map<string, number>();
      (formul.data ?? []).forEach((f: any) => compMap.set(f.produto_id, (compMap.get(f.produto_id) ?? 0) + 1));
      const sourceMap = new Map<string, number>();
      ((sources.data ?? []) as any[]).forEach((s: any) => {
        const k = `${s.entidade_tipo}:${s.entidade_id}`;
        sourceMap.set(k, (sourceMap.get(k) ?? 0) + 1);
      });
      const mt = new Map<string, number>();
      (microTargets.data ?? []).forEach((t: any) => mt.set(t.microrganismo_id, (mt.get(t.microrganismo_id) ?? 0) + 1));
      const pt = new Map<string, number>();
      (prodTargets.data ?? []).forEach((t: any) => pt.set(t.produto_id, (pt.get(t.produto_id) ?? 0) + 1));

      const items: Item[] = [];

      (micro.data ?? []).forEach((m: any) => {
        const p = mpMap.get(m.id) as any;
        if (!p) return;
        const hasConteudo = !!(p.resumo_curto || p.mecanismo_acao || p.beneficios_agronomicos || p.explicacao_tecnica || p.explicacao_produtor);
        let grupo: "revisao" | "rascunho_conteudo" | null = null;
        if (p.status_validacao === "em_revisao") grupo = "revisao";
        else if (p.status_validacao === "rascunho" && hasConteudo) grupo = "rascunho_conteudo";
        if (!grupo) return;
        const alvos = mt.get(m.id) ?? 0;
        const fontes = (sourceMap.get(`microrganismo:${m.id}`) ?? 0) + (p.id ? (sourceMap.get(`ficha_microrganismo:${p.id}`) ?? 0) : 0);
        const pend: string[] = [];
        if (!p.resumo_curto) pend.push("Resumo");
        if (!p.mecanismo_acao) pend.push("Mecanismo");
        if (!p.beneficios_agronomicos) pend.push("Benefícios");
        if (!p.explicacao_tecnica) pend.push("Texto técnico");
        if (!p.explicacao_produtor) pend.push("Texto produtor");
        if (m.b2b_enabled && !p.explicacao_b2b) pend.push("Texto B2B");
        if (!p.cuidados_aplicacao) pend.push("Cuidados");
        if (!p.observacoes_regulatorias) pend.push("Regulatórias");
        if (alvos === 0) pend.push("Alvos");
        if (fontes === 0) pend.push("Fontes");
        items.push({
          id: m.id, tipo: "microrganismo", grupo, nome: m.nome, subtitulo: m.nome_cientifico,
          funcao: m.funcao_agronomica, b2b_enabled: !!m.b2b_enabled, status: p.status_validacao,
          alvos, fontes, pendencias: pend, pronta: pend.length === 0, updated_at: p.updated_at, raw: m,
        });
      });

      (prod.data ?? []).forEach((pr: any) => {
        const p = ppMap.get(pr.id) as any;
        if (!p) return;
        const hasConteudo = !!(p.resumo_curto || p.beneficio_combinado || p.explicacao_tecnica || p.explicacao_produtor);
        let grupo: "revisao" | "rascunho_conteudo" | null = null;
        if (p.status_validacao === "em_revisao") grupo = "revisao";
        else if (p.status_validacao === "rascunho" && hasConteudo) grupo = "rascunho_conteudo";
        if (!grupo) return;
        const alvos = pt.get(pr.id) ?? 0;
        const fontes = (sourceMap.get(`produto:${pr.id}`) ?? 0) + (p.id ? (sourceMap.get(`ficha_produto:${p.id}`) ?? 0) : 0);
        const comp = compMap.get(pr.id) ?? 0;
        const pend: string[] = [];
        if (!p.resumo_curto) pend.push("Resumo");
        if (!p.beneficio_combinado) pend.push("Benefício combinado");
        if (!p.explicacao_tecnica) pend.push("Texto técnico");
        if (!p.explicacao_produtor) pend.push("Texto produtor");
        if (pr.b2b_enabled && !p.explicacao_b2b) pend.push("Texto B2B");
        if (!p.cuidados_aplicacao) pend.push("Cuidados");
        if (comp === 0) pend.push("Composição");
        if (alvos === 0) pend.push("Alvos");
        if (fontes === 0) pend.push("Fontes");
        items.push({
          id: pr.id, tipo: "produto", grupo, nome: pr.nome, subtitulo: pr.tipo,
          funcao: pr.funcao_completa, b2b_enabled: !!pr.b2b_enabled, status: p.status_validacao,
          alvos, fontes, pendencias: pend, pronta: pend.length === 0, updated_at: p.updated_at, raw: pr,
        });
      });

      return items;
    },
  });

  type FiltroKey = "todos" | "prontas" | "sem_fonte" | "sem_alvo" | "b2b_sem_texto" | "rascunhos";
  const [filtro, setFiltro] = useState<FiltroKey>("todos");

  const items = data ?? [];
  const emRevisaoItems = items.filter((i) => i.grupo === "revisao");
  const rascunhoItems = items.filter((i) => i.grupo === "rascunho_conteudo");
  const kpis = useMemo(() => ({
    emRevisao: emRevisaoItems.length,
    prontas: emRevisaoItems.filter((i) => i.pronta).length,
    semFonte: emRevisaoItems.filter((i) => i.fontes === 0).length,
    semAlvo: emRevisaoItems.filter((i) => i.alvos === 0).length,
    b2bSemTexto: emRevisaoItems.filter((i) => i.b2b_enabled && i.pendencias.includes("Texto B2B")).length,
    semComposicao: emRevisaoItems.filter((i) => i.tipo === "produto" && i.pendencias.includes("Composição")).length,
  }), [emRevisaoItems]);

  const baseList = filtro === "rascunhos" ? rascunhoItems : emRevisaoItems;
  const filtered = useMemo(() => {
    switch (filtro) {
      case "prontas": return baseList.filter((i) => i.pronta);
      case "sem_fonte": return baseList.filter((i) => i.fontes === 0);
      case "sem_alvo": return baseList.filter((i) => i.alvos === 0);
      case "b2b_sem_texto": return baseList.filter((i) => i.b2b_enabled && i.pendencias.includes("Texto B2B"));
      default: return baseList;
    }
  }, [baseList, filtro]);

  const micros = filtered.filter((i) => i.tipo === "microrganismo");
  const produtos = filtered.filter((i) => i.tipo === "produto");

  const filtros: { key: FiltroKey; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: emRevisaoItems.length },
    { key: "prontas", label: "Prontas p/ aprovação", count: kpis.prontas },
    { key: "sem_fonte", label: "Pendência de fonte", count: kpis.semFonte },
    { key: "sem_alvo", label: "Pendência de alvo", count: kpis.semAlvo },
    { key: "b2b_sem_texto", label: "B2B sem texto", count: kpis.b2bSemTexto },
    { key: "rascunhos", label: "Rascunhos com conteúdo", count: rascunhoItems.length },
  ];

  if (error) return <CatalogoQueryErrorState error={error} retry={refetch} busy={isFetching} />;
  if (isLoading) return <p role="status">Carregando revisão técnica…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={FileCheck2} label="Em revisão" value={kpis.emRevisao} />
        <Kpi icon={FileCheck2} label="Prontas p/ aprovação" value={kpis.prontas} tone="success" />
        <Kpi icon={BookOpen} label="Sem fonte" value={kpis.semFonte} tone="warn" />
        <Kpi icon={AlertTriangle} label="Sem alvo" value={kpis.semAlvo} tone="warn" />
        <Kpi icon={ShoppingCart} label="B2B sem texto" value={kpis.b2bSemTexto} tone="warn" />
        <Kpi icon={AlertTriangle} label="Produtos s/ composição" value={kpis.semComposicao} tone="danger" />
      </div>

      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filtro === f.key ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setFiltro(f.key)}
          >
            {f.label} <span className="ml-1.5 opacity-70">({f.count})</span>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Tabs value={rev} onValueChange={setRev}>
          <TabsList>
            <TabsTrigger value="micro">Microrganismos ({micros.length})</TabsTrigger>
            <TabsTrigger value="prod">Produtos ({produtos.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="micro" className="pt-3">
            <ItemList items={micros} onOpen={(i) => setOpenMicro(i.raw)} />
          </TabsContent>
          <TabsContent value="prod" className="pt-3">
            <ItemList items={produtos} onOpen={(i) => i.tipo === "microrganismo" ? setOpenMicro(i.raw) : setOpenProd(i.raw)} />
          </TabsContent>
        </Tabs>
      )}

      <MicroorganismTechnicalProfileDialog
        open={!!openMicro}
        onOpenChange={(v) => { if (!v) { setOpenMicro(null); refetch(); } }}
        micro={openMicro}
      />
      <ProductTechnicalProfileDialog
        open={!!openProd}
        onOpenChange={(v) => { if (!v) { setOpenProd(null); refetch(); } }}
        produto={openProd}
      />
    </div>
  );
}

function ItemList({ items, onOpen }: { items: Item[]; onOpen: (i: Item) => void }) {
  if (items.length === 0) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma ficha em revisão.</CardContent></Card>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((i) => (
        <Card key={`${i.tipo}-${i.id}`} className="hover:border-primary/40 transition">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[9px] uppercase">{i.tipo}</Badge>
                  {i.b2b_enabled && <Badge className="text-[9px] bg-blue-600">B2B</Badge>}
                  <TechnicalProfileStatusBadge status={i.status} />
                </div>
                <div className="font-semibold truncate mt-1">{i.nome}</div>
                {i.subtitulo && <div className="text-xs italic text-muted-foreground truncate">{i.subtitulo}</div>}
              </div>
            </div>
            {i.funcao && <p className="text-xs text-muted-foreground line-clamp-2">{i.funcao}</p>}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Alvos: <strong className={i.alvos === 0 ? "text-amber-700" : "text-foreground"}>{i.alvos}</strong></span>
              <span>·</span>
              <span>Fontes: <strong className={i.fontes === 0 ? "text-amber-700" : "text-foreground"}>{i.fontes}</strong></span>
              {i.updated_at && (<><span>·</span><span>{formatDateTimeDisplay(i.updated_at)}</span></>)}
            </div>
            <div className="flex flex-wrap gap-1">
              {i.pronta ? (
                <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-800 bg-emerald-50">Pronta para aprovação</Badge>
              ) : i.pendencias.map((p) => (
                <Badge key={p} variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50">{p}</Badge>
              ))}
            </div>
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={() => onOpen(i)}>Revisar e aprovar</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone?: "success" | "warn" | "danger" }) {
  const cls =
    tone === "success" ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    tone === "warn" ? "text-amber-700 bg-amber-50 border-amber-200" :
    tone === "danger" ? "text-rose-700 bg-rose-50 border-rose-200" :
    "text-slate-700 bg-slate-50 border-slate-200";
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
