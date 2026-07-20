import { supabase } from "@/integrations/supabase/client";

export type DepCounts = Record<string, number>;

const DEP_LABELS: Record<string, string> = {
  fazendas: "fazendas",
  talhoes: "talhões",
  ordens_servico: "ordens de serviço",
  ordens_servico_onfarm: "OS on-farm",
  registros_consultor: "visitas técnicas",
  portal_solicitacoes: "solicitações",
  entregas: "entregas",
  alertas_agronomicos: "alertas",
  clima_dados: "dados climáticos",
  usuarios: "usuários vinculados",
};

export function totalDeps(deps: DepCounts | null | undefined): number {
  if (!deps) return 0;
  return Object.values(deps).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function describeDeps(deps: DepCounts | null | undefined): string {
  if (!deps) return "";
  return Object.entries(deps)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${v} ${DEP_LABELS[k] || k}`)
    .join(", ");
}

type Entidade = "cliente" | "fazenda" | "talhão";

const ROUTES: Record<Entidade, Partial<Record<string, (id: string) => string>>> = {
  cliente: {
    fazendas: (id) => `/fazendas?cliente=${id}`,
    talhoes: (id) => `/talhoes?cliente=${id}`,
    ordens_servico: (id) => `/ordens-servico?cliente=${id}`,
    ordens_servico_onfarm: (id) => `/ordens-servico?cliente=${id}&tipo=onfarm`,
    registros_consultor: (id) => `/consultor-tecnico?cliente=${id}`,
    portal_solicitacoes: (id) => `/solicitacoes?cliente=${id}`,
    entregas: (id) => `/entregas?cliente=${id}`,
    usuarios: (id) => `/configuracoes?tab=usuarios&cliente=${id}`,
  },
  fazenda: {
    talhoes: (id) => `/talhoes?fazenda=${id}`,
    ordens_servico: (id) => `/ordens-servico?fazenda=${id}`,
    ordens_servico_onfarm: (id) => `/ordens-servico?fazenda=${id}&tipo=onfarm`,
    registros_consultor: (id) => `/consultor-tecnico?fazenda=${id}`,
    portal_solicitacoes: (id) => `/solicitacoes?fazenda=${id}`,
    alertas_agronomicos: (id) => `/monitoramento-alertas?fazenda=${id}`,
    clima_dados: (id) => `/previsao-agronomica?fazenda=${id}`,
  },
  "talhão": {
    ordens_servico: (id) => `/ordens-servico?talhao=${id}`,
    ordens_servico_onfarm: (id) => `/ordens-servico?talhao=${id}&tipo=onfarm`,
    registros_consultor: (id) => `/consultor-tecnico?talhao=${id}`,
    portal_solicitacoes: (id) => `/solicitacoes?talhao=${id}`,
    alertas_agronomicos: (id) => `/monitoramento-alertas?talhao=${id}`,
  },
};

export function getDepRoute(entidade: Entidade, key: string, id: string): string | null {
  const fn = ROUTES[entidade]?.[key];
  return fn ? fn(id) : null;
}

export function depLabel(key: string): string {
  return DEP_LABELS[key] || key;
}

export async function checkClienteDeps(id: string): Promise<DepCounts> {
  const { data, error } = await supabase.rpc("check_cliente_dependencies", { _cliente_id: id });
  if (error) throw error;
  return (data as DepCounts) || {};
}

export async function checkFazendaDeps(id: string): Promise<DepCounts> {
  const { data, error } = await supabase.rpc("check_fazenda_dependencies", { _fazenda_id: id });
  if (error) throw error;
  return (data as DepCounts) || {};
}

export async function checkTalhaoDeps(id: string): Promise<DepCounts> {
  const { data, error } = await supabase.rpc("check_talhao_dependencies", { _talhao_id: id });
  if (error) throw error;
  return (data as DepCounts) || {};
}