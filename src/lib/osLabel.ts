/**
 * Formata o identificador de uma Ordem de Serviço de forma amigável.
 * Usa o número humano (`numero_os` no formato OS-AAAA-NNNNNN) quando disponível,
 * e como fallback monta a partir dos primeiros 8 caracteres do UUID.
 */
export const formatOS = (
  os?: { numero_os?: string | null; id?: string | null } | null
): string => {
  if (!os) return "OS";
  if (os.numero_os) return os.numero_os;
  if (os.id) return `OS-${os.id.slice(0, 8).toUpperCase()}`;
  return "OS";
};

/** Versão que aceita apenas o id (útil quando só temos o UUID em mãos). */
export const formatOSFromId = (id?: string | null): string =>
  id ? `OS-${id.slice(0, 8).toUpperCase()}` : "OS";

/**
 * Origem da OS considerando o vínculo com pedido B2B (partner_orders).
 * Retorna "b2b" quando a OS foi originada de uma OP de parceiro,
 * caso contrário retorna "padrao".
 */
export const getOsOrigem = (
  os?: { partner_order_id?: string | null; partner_orders?: any } | null
): "b2b" | "padrao" => {
  if (!os) return "padrao";
  if (os.partner_order_id || os.partner_orders) return "b2b";
  return "padrao";
};

/**
 * Rótulo unificado para escolhas na UI de entrega.
 * Ex.: "OS-2026-000123 · OP OP-2026-0007 (Fazenda XPTO)" quando há OP B2B vinculada,
 * ou "OS-2026-000123 · Cliente Fulano" quando é OS padrão.
 */
export const formatOsOuOp = (
  os?: {
    numero_os?: string | null;
    id?: string | null;
    partner_orders?: {
      numero?: string | null;
      partner_accounts?: {
        nome_fantasia?: string | null;
        razao_social?: string | null;
      } | null;
    } | null;
    clientes?: { nome?: string | null } | null;
  } | null
): { osLabel: string; subtitulo: string; origem: "b2b" | "padrao" } => {
  const osLabel = formatOS(os);
  const origem = getOsOrigem(os);
  if (origem === "b2b" && os?.partner_orders) {
    const po = os.partner_orders;
    const pa = po.partner_accounts;
    const parceiro = pa?.nome_fantasia || pa?.razao_social || "Parceiro";
    const opNumero = po.numero ? `OP ${po.numero}` : "OP";
    return { osLabel, subtitulo: `${opNumero} · ${parceiro}`, origem };
  }
  return {
    osLabel,
    subtitulo: os?.clientes?.nome ?? "Cliente",
    origem,
  };
};
