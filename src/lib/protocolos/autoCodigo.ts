// IMPORTANTE: as funções `gerarProximoCodigo*` aqui são apenas para PREVIEW
// de UI (sugestão exibida no input). A geração definitiva é feita por trigger
// no servidor (`set_codigo_produto` / `set_codigo_microrganismo`) — basta
// enviar `codigo: null` no insert que o banco preenche atomicamente, evitando
// corridas de chave duplicada.
import { supabase } from "@/integrations/supabase/client";

export const PREFIXOS_MICRO: Record<string, string> = {
  bacteria: "BAC",
  fungo: "FUN",
  levedura: "LEV",
  consorcio: "CON",
};

export const PREFIXOS_PRODUTO: Record<string, string> = {
  solo: "SOLO",
  inseticida: "INS",
  fungicida: "FUNG",
  inoculante: "INO",
  solubilizador: "SOLB",
};

function proximoNumero(codigos: (string | null)[], prefixo: string): number {
  const re = new RegExp(`^${prefixo}-(\\d+)$`, "i");
  let max = 0;
  for (const c of codigos) {
    if (!c) continue;
    const m = c.trim().match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

export async function gerarProximoCodigoMicro(tipo: string): Promise<string> {
  const prefixo = PREFIXOS_MICRO[tipo];
  if (!prefixo) return "";
  const { data } = await supabase
    .from("microrganismos")
    .select("codigo")
    .ilike("codigo", `${prefixo}-%`);
  return `${prefixo}-${proximoNumero((data ?? []).map((r: any) => r.codigo), prefixo)}`;
}

export async function gerarProximoCodigoProduto(tipo: string): Promise<string> {
  const prefixo = PREFIXOS_PRODUTO[tipo];
  if (!prefixo) return "";
  const { data } = await supabase
    .from("produtos")
    .select("codigo")
    .ilike("codigo", `${prefixo}-%`);
  return `${prefixo}-${proximoNumero((data ?? []).map((r: any) => r.codigo), prefixo)}`;
}

/**
 * Verifica se um código segue o padrão automático (qualquer um dos prefixos).
 * Usado para decidir se devemos sobrescrever a sugestão quando o tipo muda.
 */
export function ehCodigoAutomatico(codigo: string, prefixosMap: Record<string, string>): boolean {
  if (!codigo) return true;
  const prefixos = Object.values(prefixosMap);
  return prefixos.some((p) => new RegExp(`^${p}-\\d+$`, "i").test(codigo.trim()));
}
