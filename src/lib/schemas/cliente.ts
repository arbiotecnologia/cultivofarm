import { validateCPF_CNPJ } from "@/lib/validators/cpfCnpj";
import { z } from "zod";
import { inscricaoEstadualCadastroSchema } from "./inscricaoEstadualCadastro";

export const clienteSchema = z.object({
  tipo_pessoa: z.enum(["fisica", "juridica"]),
  razao_social: z.string().optional(),
  nome_fantasia: z.string().min(2, "Nome fantasia deve ter pelo menos 2 caracteres"),
  nome: z.string().default(""), // Preenchido automaticamente a partir de nome_fantasia
  cpf_cnpj: z.string().optional().refine(v => !v || validateCPF_CNPJ(v), "CPF/CNPJ inválido"),
  inscricao_estadual: inscricaoEstadualCadastroSchema.optional(),
  inscricao_municipal: z.string().optional(),
  telefone: z.string().optional(),
  telefones: z.array(z.string()).default([]),
  telefones_adicionais: z.array(z.object({ value: z.string() })).optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  site: z.string().url("Site inválido").optional().or(z.literal("")),
  segmento: z.string().optional(),
  status_cliente: z.enum(["prospect", "ativo", "inativo", "bloqueado_financeiro"]),
  tags: z.array(z.string()).default([]),
  observacoes: z.string().optional(),
  
  // Endereço
  endereco_cep: z.string().optional(),
  endereco_logradouro: z.string().optional(),
  endereco_numero: z.string().optional(),
  endereco_complemento: z.string().optional(),
  endereco_bairro: z.string().optional(),
  endereco_municipio: z.string().optional(),
  endereco_estado: z.string().optional(),
  endereco_latitude: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "number") return v;
      const n = Number(v);
      return isNaN(n) ? null : n;
    },
    z.number().nullable().optional()
  ),
  endereco_longitude: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "number") return v;
      const n = Number(v);
      return isNaN(n) ? null : n;
    },
    z.number().nullable().optional()
  ),
  
  // Cobrança
  cobranca_mesmo_endereco: z.boolean().default(true),
  cobranca_cep: z.string().optional(),
  cobranca_logradouro: z.string().optional(),
  cobranca_numero: z.string().optional(),
  cobranca_complemento: z.string().optional(),
  cobranca_bairro: z.string().optional(),
  cobranca_municipio: z.string().optional(),
  cobranca_estado: z.string().optional(),
  
  // Financeiro
  contato_financeiro_nome: z.string().optional(),
  contato_financeiro_email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  contato_financeiro_telefone: z.string().optional(),
  limite_credito: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "number") return v;
      const n = Number(String(v).replace(/\D/g, "")) / 100;
      return isNaN(n) ? null : n;
    },
    z.number().nullable().optional()
  ),
   condicao_pagamento: z.string().optional(),
  condicao_pagamento_valor: z.string().optional(),
  condicao_pagamento_unidade: z.string().optional(),
  banco_nome: z.string().optional(),
  banco_agencia: z.string().optional(),
  banco_conta: z.string().optional(),
  banco_tipo_conta: z.string().optional(),
  banco_pix_chave: z.string().optional(),
  banco_pix_tipo: z.string().optional(),
});

export type ClienteSchema = z.infer<typeof clienteSchema>;
