export interface BrasilAPI_CNPJ {
  cnpj: string;
  identificador_matriz_filial: number;
  descricao_matriz_filial: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: number;
  descricao_situacao_cadastral: string;
  data_situacao_cadastral: string;
  motivo_situacao_cadastral: number;
  nome_cidade_exterior?: string;
  codigo_pais?: number;
  nome_pais?: string;
  codigo_natureza_juridica: number;
  data_inicio_atividade: string;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  descricao_tipo_de_logradouro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  uf: string;
  municipio: string;
  ddd_telefone_1: string;
  ddd_telefone_2?: string;
  ddd_fax?: string;
  qualificacao_do_responsavel: number;
  capital_social: number;
  porte: string;
  descricao_porte: string;
  opcao_pelo_simples: boolean;
  data_opcao_pelo_simples?: string;
  data_exclusao_do_simples?: string;
  opcao_pelo_mei: boolean;
  situacao_especial: string;
  data_situacao_especial?: string;
}

export const fetchCNPJ = async (cnpj: string): Promise<BrasilAPI_CNPJ> => {
  const clean = cnpj.replace(/\D/g, "");
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
  if (!response.ok) throw new Error("CNPJ não encontrado");
  return response.json();
};
