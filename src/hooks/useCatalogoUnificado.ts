import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { consultarCatalogo } from "@/lib/catalogoQueries";
import { useTenantHiddenIds, type TenantHiddenState } from "@/hooks/useTenantCatalogVisibility";
import { postgrestInList, TenantVisibilityError } from "@/lib/catalogo/tenantCatalogVisibility";

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

/**
 * FASE 27B — colunas explícitas por consulta. Nunca usar SELECT *:
 * o catálogo interno agrega dados técnicos e comerciais e o payload
 * precisa permanecer previsível.
 */
export const PRODUTOS_SELECT =
  "id,nome,codigo,tipo,descricao,modo_acao,funcao_completa,ativo,b2b_enabled";
export const MICROORGANISMOS_SELECT =
  "id,nome,codigo,nome_cientifico,tipo,funcao_agronomica,descricao,observacoes,ativo,b2b_enabled";
export const PRODUCT_PROFILES_SELECT =
  "produto_id,status_validacao,resumo_curto,explicacao_b2b,explicacao_produtor,explicacao_tecnica";
export const MICRO_PROFILES_SELECT =
  "microrganismo_id,status_validacao,resumo_curto,explicacao_b2b,explicacao_produtor,mecanismo_acao,beneficios_agronomicos,explicacao_tecnica";
export const FORMULACOES_SELECT = "produto_id";
export const SOURCES_SELECT = "entidade_tipo,entidade_id";
export const MICRO_TARGETS_SELECT = "microrganismo_id";
export const PRODUCT_TARGETS_SELECT = "produto_id";

/** Cache conservador: catálogo muda pouco durante uma sessão de trabalho. */
export const CATALOGO_UNIFICADO_STALE_TIME = 120_000;
export const CATALOGO_UNIFICADO_GC_TIME = 10 * 60_000;

/** `true` apenas para o escopo do parceiro B2B. */
export function catalogoIsB2BScope(scope: CatalogoScope): boolean {
  return scope === "b2b";
}

/**
 * No escopo B2B o conteúdo de ficha só pode aparecer quando a ficha está
 * aprovada — mesma regra aplicada pelas RPCs canônicas
 * get_partner_catalog_secure / get_partner_catalog_tecnico_secure.
 */
export function catalogoGateB2B<T>(
  scope: CatalogoScope,
  status: string | null | undefined,
  value: T,
): T | null {
  if (!catalogoIsB2BScope(scope)) return value;
  return status === "aprovado" ? value : null;
}

/** O parceiro B2B só enxerga itens ativos e liberados para B2B. */
export function catalogoShouldShowB2BRow(r: CatalogoUnificadoRow): boolean {
  return r.ativo && r.b2b_enabled;
}

/** Normaliza `ficha_produto`/`ficha_microrganismo` para a entidade base. */
export function catalogoBuildSourceKey(
  entidadeTipo: string,
  entidadeId: string,
): string {
  const base =
    entidadeTipo === "ficha_produto"
      ? "produto"
      : entidadeTipo === "ficha_microrganismo"
        ? "microrganismo"
        : entidadeTipo;
  return `${base}:${entidadeId}`;
}

/** Conta linhas agrupadas por uma chave simples. */
export function buildCountMap(
  rows: any[] | null | undefined,
  keyField: string,
): Map<string, number> {
  const map = new Map<string, number>();
  (rows ?? []).forEach((r: any) => {
    const key = r?.[keyField];
    if (key == null) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  });
  return map;
}

/** Indexa linhas por uma chave de identidade (perfis técnicos). */
function buildIndexMap(rows: any[] | null | undefined, keyField: string) {
  const map = new Map<string, any>();
  (rows ?? []).forEach((r: any) => {
    if (r?.[keyField] != null) map.set(r[keyField], r);
  });
  return map;
}

/**
 * Ocultação por empresa vale para os catálogos NOVOS internos (`admin`/`interno`) e é aplicada no servidor
 * (filtro `not in` na consulta). O escopo B2B ainda NÃO aplica: a empresa fornecedora precisa vir do vínculo
 * comercial validado (recorte pendente). Sem empresa (plataforma) → catálogo global sem filtro de empresa.
 */
export function catalogoAppliesTenantVisibility(scope: CatalogoScope): boolean {
  return scope !== "b2b";
}

function hiddenKey(h: TenantHiddenState): string | null {
  if (h.status === "global") return "global";
  if (h.status === "ready") return `${h.scope.organizationId}|${h.scope.userId}|${h.ids.join(",")}`;
  return null;
}

/** Aplica exclusão no servidor; sem IDs, consulta inalterada. */
export function catalogoExcludeHidden<Q extends { not: (c: string, op: string, v: string) => Q }>(q: Q, ids: readonly string[]): Q {
  return ids.length ? q.not("id", "in", postgrestInList(ids)) : q;
}

export function useCatalogoUnificado(scope: CatalogoScope = "interno") {
  const applies = catalogoAppliesTenantVisibility(scope);
  const hp = useTenantHiddenIds("produto", applies);
  const hm = useTenantHiddenIds("microrganismo", applies);
  const kp = hiddenKey(hp);
  const km = hiddenKey(hm);
  const hiddenError = hp.status === "error" ? hp.message : hm.status === "error" ? hm.message : null;
  const ready = kp !== null && km !== null;
  const hiddenProd = hp.status === "ready" ? hp.ids : [];
  const hiddenMicro = hm.status === "ready" ? hm.ids : [];
  const query = useQuery({
    queryKey: ["catalogo-unificado", scope, kp, km],
    enabled: ready,
    staleTime: CATALOGO_UNIFICADO_STALE_TIME,
    gcTime: CATALOGO_UNIFICADO_GC_TIME,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CatalogoUnificadoRow[]> => {
      const [prod, micro, prodProf, microProf, formul, sources, microTargets, prodTargets] = await consultarCatalogo([
        catalogoExcludeHidden((supabase as any).from("produtos").select(PRODUTOS_SELECT), hiddenProd).order("nome"),
        catalogoExcludeHidden((supabase as any).from("microrganismos").select(MICROORGANISMOS_SELECT), hiddenMicro).order("nome"),
        (supabase as any).from("product_technical_profiles").select(PRODUCT_PROFILES_SELECT),
        (supabase as any).from("microorganism_technical_profiles").select(MICRO_PROFILES_SELECT),
        (supabase as any).from("formulacoes").select(FORMULACOES_SELECT),
        (supabase as any).from("catalog_technical_sources" as any).select(SOURCES_SELECT),
        (supabase as any).from("microorganism_targets").select(MICRO_TARGETS_SELECT).eq("ativo", true),
        (supabase as any).from("product_target_recommendations").select(PRODUCT_TARGETS_SELECT).eq("ativo", true),
      ]);

      const ppMap = buildIndexMap(prodProf.data, "produto_id");
      const mpMap = buildIndexMap(microProf.data, "microrganismo_id");
      const compMap = buildCountMap(formul.data, "produto_id");
      const microTargetMap = buildCountMap(microTargets.data, "microrganismo_id");
      const prodTargetMap = buildCountMap(prodTargets.data, "produto_id");

      const sourceMap = new Map<string, number>();
      ((sources.data ?? []) as any[]).forEach((s: any) => {
        const key = catalogoBuildSourceKey(s.entidade_tipo, s.entidade_id);
        sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
      });

      const isB2B = catalogoIsB2BScope(scope);
      const gate = <T,>(status: string | null | undefined, value: T): T | null =>
        catalogoGateB2B(scope, status, value);

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
          id: m.id, tipo: "microrganismo", nome: m.nome, subtitulo: m.nome_cientifico, codigo: m.codigo ?? null,
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
        return all.filter(catalogoShouldShowB2BRow);
      }
      return all;
    },
  });
  if (hiddenError) {
    // Fail-closed: sem preferências da empresa não listamos catálogo "sem filtro".
    return { ...query, data: undefined, isLoading: false, isError: true, error: new TenantVisibilityError(`Preferências da empresa indisponíveis: ${hiddenError}`) } as typeof query;
  }
  if (!ready) return { ...query, data: undefined, isLoading: true } as typeof query;
  return query;
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
