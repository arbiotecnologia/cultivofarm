/**
 * Whitelist explícita dos campos enviados em `p_dados` para
 * `rpc_cockpit_criar_entrega_v1`.
 *
 * Somente estes campos são persistidos: qualquer campo fora da lista é
 * descartado de propósito. `volume_entregue_ml` NÃO entra aqui — o volume é
 * calculado e gravado exclusivamente pelo servidor.
 */
export const CAMPOS_DADOS_ENTREGA = [
  "cliente_id",
  "tipo_entrega",
  "grupo_entrega_id",
  "data_saida",
  "motorista",
  "motorista_telefone",
  "motorista_documento",
  "veiculo",
  "veiculo_placa",
  "veiculo_tipo",
  "hora_saida_prevista",
  "data_chegada_prevista",
  "hora_chegada_prevista",
  "destinatario_nome",
  "destinatario_telefone",
  "destinatario_whatsapp",
  "endereco_origem",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_complemento",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_uf",
  "endereco_cep",
  "endereco_referencia",
] as const;

export type CampoDadosEntrega = (typeof CAMPOS_DADOS_ENTREGA)[number];

const TIPOS_ENTREGA = ["motorista", "retirada"] as const;
const ORIGENS_ENDERECO = ["cadastro", "personalizado"] as const;

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return valor == null ? null : null;
  const limpo = valor.trim();
  return limpo.length ? limpo : null;
}

/** Monta o `p_dados` da RPC com whitelist e normalização dos enums. */
export function montarDadosEntrega(origem: any): Record<CampoDadosEntrega, any> {
  const dados = {} as Record<CampoDadosEntrega, any>;

  for (const campo of CAMPOS_DADOS_ENTREGA) {
    dados[campo] = textoOuNulo(origem?.[campo]);
  }

  // IDs preservam o valor bruto (uuid) quando presentes.
  dados.cliente_id = origem?.cliente_id ?? null;
  dados.grupo_entrega_id = origem?.grupo_entrega_id ?? null;

  const tipo = origem?.tipo_entrega;
  dados.tipo_entrega = (TIPOS_ENTREGA as readonly string[]).includes(tipo) ? tipo : "motorista";

  const endOrigem = origem?.endereco_origem;
  dados.endereco_origem = (ORIGENS_ENDERECO as readonly string[]).includes(endOrigem)
    ? endOrigem
    : "cadastro";

  return dados;
}

export type RespostaCriarEntrega = { entrega_id: string; replay: boolean; message?: string };

/**
 * A entrega só é considerada gravada quando o servidor devolve
 * `success === true` e um `entrega_id`. Resposta incompleta é falha.
 */
export function validarRespostaCriarEntrega(data: any): RespostaCriarEntrega {
  const entregaId = typeof data?.entrega_id === "string" ? data.entrega_id.trim() : "";
  if (data?.success !== true || !entregaId) {
    throw new Error(
      "Não foi possível confirmar o registro da entrega. Atualize a lista e tente novamente.",
    );
  }
  return {
    entrega_id: entregaId,
    replay: data?.replay === true,
    message: typeof data?.message === "string" ? data.message : undefined,
  };
}
