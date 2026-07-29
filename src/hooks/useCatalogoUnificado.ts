import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CatalogoUnificadoRow {
  id: string;
  tipo: "produto" | "microrganismo";
  nome: string;
  subtitulo: string | null;
  codigo: string | null;
  funcao: string | null;
  ativo: boolean;
  b2b_enabled: boolean;
  ficha_status: string | null;
  ficha_resumo: string | null;
  explicacao_b2b: string | null;
  explicacao_produtor: string | null;
  mecanismo_acao: string | null;
  beneficios_agronomicos: string | null;
  explicacao_tecnica: string | null;
  composicao_count?: number;
  fontes_count: number;
  alvos_count: number;
  raw: any;
}

export type CatalogoScope = "admin" | "b2b" | "interno";

export function useCatalogoUnificado(scope: CatalogoScope = "interno") {
  return useQuery({
    queryKey: ["catalogo-unificado", scope],
    queryFn: async (): Promise<CatalogoUnificadoRow[]> => {
      const [prod, micro, prodProf, microProf, formul, sources, microTargets, prodTargets] = await Promise.all([
        supabase.from("produtos").select("id,nome,codigo,tipo,descricao,modo_acao,funcao_completa,ativo,b2b_enabled").order("nome"),
        supabase.from("microrganismos").select("id,nome,nome_cientifico,tipo,funcao_agronomica,descricao,observacoes,ativo,b2b_enabled").order("nome"),
        supabase.from("product_technical_profiles").select("produto_id,status_validacao,resumo_curto,explicacao_b2b,explicacao_produtor,explicacao_tecnica"),
        supabase.from("microorganism_technical_profiles").select("microrganismo_id,status_validacao,resumo_curto,explicacao_b2b,explicacao_produtor,mecanismo_acao,beneficios_agronomicos,explicacao_tecnica"),
        supabase.from("formulacoes").select("produto_id"),
        supabase.from("catalog_technical_sources" as any).select("entidade_tipo,entidade_id"),
        supabase.from("microorganism_targets").select("microrganismo_id").eq("ativo", true),
        supabase.from("product_target_recommendations").select("produto_id").eq("ativo", true),
      ]);
      const ppMap = new Map((prodProf.data ?? []).map((x: any) => [x.produto_id, x]));
      const mpMap = new Map((microProf.data ?? []).map((x: any) => [x.microrganismo_id, x]));
      const compMap = new Map<string, number>();
      (formul.data ?? []).forEach((f: any) => compMap.set(f.produto_id, (compMap.get(f.produto_id) ?? 0) + 1));
      const sourceMap = new Map<string, number>();
      ((sources.data ?? []) as any[]).forEach((s: any) => {
        const tipoBase = s.entidade_tipo === "ficha_produto" ? "produto"
          : s.entidade_tipo === "ficha_microrganismo" ? "microrganismo"
          : s.entidade_tipo;
        const key = `${tipoBase}:${s.entidade_id}`;
        sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
      });
      const microTargetMap = new Map<string, number>();
      (microTargets.data ?? []).forEach((t: any) => microTargetMap.set(t.microrganismo_id, (microTargetMap.get(t.microrganismo_id) ?? 0) + 1));
      const prodTargetMap = new Map<string, number>();
      (prodTargets.data ?? []).forEach((t: any) => prodTargetMap.set(t.produto_id, (prodTargetMap.get(t.produto_id) ?? 0) + 1));

      // No escopo B2B, o conteúdo de ficha só pode aparecer quando a ficha está
      // aprovada — mesma regra aplicada pelas RPCs canônicas
      // get_partner_catalog_secure / get_partner_catalog_tecnico_secure.
      const isB2B = scope === "b2b";
      const gate = <T,>(status: string | null | undefined, value: T): T | null =>
        !isB2B || status === "aprovado" ? value : null;

      const produtos: CatalogoUnificadoRow[] = (prod.data ?? []).map((p: any) => {
        const pp = ppMap.get(p.id) as any;
        const st = pp?.status_validacao ?? null;
        return {
          id: p.id, tipo: "produto", nome: p.nome, subtitulo: p.tipo, codigo: p.codigo,
          funcao: p.funcao_completa, ativo: p.ativo, b2b_enabled: p.b2b_enabled,
          ficha_status: st,
          ficha_resumo: gate(st, pp?.resumo_curto ?? p.descricao ?? null),
          explicacao_b2b: gate(st, pp?.explicacao_b2b ?? null),
          explicacao_produtor: gate(st, pp?.explicacao_produtor ?? null),
          mecanismo_acao: null,
          beneficios_agronomicos: null,
          // Texto técnico interno nunca é exposto no escopo B2B.
          explicacao_tecnica: isB2B ? null : (pp?.explicacao_tecnica ?? null),
          composicao_count: compMap.get(p.id) ?? 0,
          fontes_count: sourceMap.get(`produto:${p.id}`) ?? 0,
          alvos_count: prodTargetMap.get(p.id) ?? 0,
          raw: isB2B ? { ...p, modo_acao: null } : p,
        };
      });
      const micros: CatalogoUnificadoRow[] = (micro.data ?? []).map((m: any) => {
        const mp = mpMap.get(m.id) as any;
        const st = mp?.status_validacao ?? null;
        return {
          id: m.id, tipo: "microrganismo", nome: m.nome, subtitulo: m.nome_cientifico, codigo: null,
          funcao: m.funcao_agronomica, ativo: m.ativo, b2b_enabled: m.b2b_enabled,
          ficha_status: st,
          ficha_resumo: gate(st, mp?.resumo_curto ?? m.descricao ?? null),
          explicacao_b2b: gate(st, mp?.explicacao_b2b ?? null),
          explicacao_produtor: gate(st, mp?.explicacao_produtor ?? null),
          mecanismo_acao: gate(st, mp?.mecanismo_acao ?? null),
          beneficios_agronomicos: gate(st, mp?.beneficios_agronomicos ?? null),
          explicacao_tecnica: isB2B ? null : (mp?.explicacao_tecnica ?? null),
          fontes_count: sourceMap.get(`microrganismo:${m.id}`) ?? 0,
          alvos_count: microTargetMap.get(m.id) ?? 0,
          raw: m,
        };
      });
      const all = [...produtos, ...micros];
      if (isB2B) {
        return all.filter((r) => r.ativo && r.b2b_enabled);
      }
      return all;

    },
  });
}

export function catalogoRevisionPending(r: CatalogoUnificadoRow): string[] {
  const pend: string[] = [];
  if (!r.ficha_resumo) pend.push("Pendente de resumo");
  if (r.tipo === "microrganismo" && !r.mecanismo_acao) pend.push("Pendente de mecanismo");
  if (r.tipo === "microrganismo" && !r.beneficios_agronomicos) pend.push("Pendente de benefícios");
  if (!r.explicacao_tecnica) pend.push("Pendente de texto técnico");
  if (!r.explicacao_produtor) pend.push("Pendente de texto produtor");
  if (r.b2b_enabled && !r.explicacao_b2b) pend.push("Pendente de texto B2B");
  if (r.alvos_count === 0) pend.push("Pendente de alvos");
  if (r.fontes_count === 0) pend.push("Pendente de fonte");
  return pend;
}
