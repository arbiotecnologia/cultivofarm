/**
 * Fase Fiscal 3.16 / 3.16.2-B — Schemas Zod do wizard de rascunho NF-e/NFS-e.
 *
 * Sem `any`/`as unknown as`. Validação por etapa; agregador final.
 * Restringe a status DRAFT/HOMOLOGATION e provider NONE.
 *
 * 3.16.2-B: itens passam a carregar `fiscal_profile_snapshot` e
 * `tax_snapshot` sanitizados; o servidor recomputa/valida e persiste.
 */
import { z } from "zod";

export const INVOICE_TYPES = ["NFE", "NFSE"] as const;
// Contrato do banco (`chk_fi_document_model`) aceita apenas NFE | NFSE | OTHER.
// A UI pode exibir rótulos pt-BR como "NF-e (55)", mas o valor técnico enviado
// para `rpc_fiscal_draft_save` DEVE ser NFE ou NFSE. Nunca 55/57/65.
export const DOCUMENT_MODELS = ["NFE", "NFSE"] as const;
export const ENVIRONMENTS = ["HOMOLOGATION", "NOT_CONFIGURED"] as const;
export const DRAFT_STATUSES = ["DRAFT", "HOMOLOGATION"] as const;

export const documentoStepSchema = z.object({
  invoice_type: z.enum(INVOICE_TYPES),
  document_model: z.enum(DOCUMENT_MODELS),
  environment: z.enum(ENVIRONMENTS).default("NOT_CONFIGURED"),
  natureza_operacao: z.string().trim().max(200).optional(),
  finalidade: z.string().trim().max(60).optional(),
  presenca: z.string().trim().max(60).optional(),
  consumidor_final: z.boolean().optional(),
  series: z.string().trim().min(1).max(10),
  issue_date: z.string().trim().min(1),
  receivable_id: z.string().uuid().optional().nullable(),
  delivery_id: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(4000).optional(),
});

export const destinatarioStepSchema = z.object({
  customer_id: z.string().uuid("Selecione um cliente"),
  customer_document: z.string().trim().min(11).max(14),
  customer_snapshot: z.record(z.string(), z.unknown()).default({}),
});

const jsonRecord = z.record(z.string(), z.unknown()).default({});

export const itemSchema = z.object({
  item_kind: z.enum(["PRODUCT", "SERVICE"]),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive(),
  commercial_unit: z.string().trim().min(1).max(10),
  unit_value: z.number().nonnegative(),
  gross_value: z.number().nonnegative(),
  discount_value: z.number().nonnegative().default(0),
  net_value: z.number().nonnegative(),
  source_item_type: z.string().trim().max(60).optional(),
  source_item_id: z.string().uuid().optional().nullable(),
  // Campos fiscais/tributários pt-BR — recomputados no servidor.
  ncm: z.string().trim().max(10).optional().default(""),
  cest: z.string().trim().max(10).optional().default(""),
  cfop: z.string().trim().max(6).optional().default(""),
  origin_code: z.string().trim().max(2).optional().default(""),
  icms_cst: z.string().trim().max(4).optional().default(""),
  icms_csosn: z.string().trim().max(4).optional().default(""),
  ipi_cst: z.string().trim().max(4).optional().default(""),
  pis_cst: z.string().trim().max(4).optional().default(""),
  cofins_cst: z.string().trim().max(4).optional().default(""),
  lc116_item: z.string().trim().max(10).optional().default(""),
  cnae: z.string().trim().max(10).optional().default(""),
  municipal_taxation_code: z.string().trim().max(20).optional().default(""),
  iss_rate: z.number().min(0).max(100).optional(),
  iss_withheld: z.boolean().optional().default(false),
  // Snapshots opacos por item (server valida ausência de segredo)
  fiscal_profile_snapshot: jsonRecord,
  tax_snapshot: jsonRecord,
  /**
   * SOMENTE entradas do operador (ex.: `{ ICMS: { baseReductionPct: 60 } }`).
   * Nunca base, alíquota ou valor calculado — o servidor recusa outras chaves.
   */
  tax_input_snapshot: z
    .record(
      z.string(),
      z
        .object({
          baseReductionPct: z.number().min(0).max(100),
          baseReductionReason: z.string().max(240).optional(),
        })
        .strict(),
    )
    .default({}),
});

export const itensStepSchema = z.object({
  items: z.array(itemSchema).min(1, "Adicione pelo menos um item"),
});

export const tributosStepSchema = z.object({
  discount_total: z.number().nonnegative().default(0),
  freight: z.number().nonnegative().default(0),
  insurance: z.number().nonnegative().default(0),
  other_expenses: z.number().nonnegative().default(0),
});

export const rascunhoSchema = documentoStepSchema
  .merge(destinatarioStepSchema)
  .merge(itensStepSchema)
  .merge(tributosStepSchema)
  .extend({
    status: z.enum(DRAFT_STATUSES).default("DRAFT"),
    provider: z.literal("NONE").default("NONE"),
  });

export type RascunhoFormValues = z.infer<typeof rascunhoSchema>;
export type RascunhoItem = z.infer<typeof itemSchema>;

export function emptyRascunho(): RascunhoFormValues {
  return {
    invoice_type: "NFE",
    document_model: "NFE",
    environment: "NOT_CONFIGURED",
    series: "1",
    issue_date: new Date().toISOString().slice(0, 10),
    customer_id: "",
    customer_document: "",
    customer_snapshot: {},
    items: [],
    discount_total: 0,
    freight: 0,
    insurance: 0,
    other_expenses: 0,
    status: "DRAFT",
    provider: "NONE",
  };
}
