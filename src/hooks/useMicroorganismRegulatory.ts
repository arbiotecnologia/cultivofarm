/**
 * Fase F2 — Hooks do cadastro regulatório e fiscal auditável de microrganismos.
 *
 * Princípio inegociável desta fase: NADA é presumido. Estes hooks apenas
 * transportam fatos e decisões humanas. Nenhuma classificação (NCM, CEST,
 * CFOP, CST/CSOSN, origem, GTIN, uCom/uTrib, fator de conversão) é inferida
 * no cliente a partir de espécie, nome comercial ou prática de mercado.
 *
 * Tipos: as relações e RPCs desta fase pertencem ao catálogo canônico do
 * banco de staging. Quando o cliente gerado ainda não lista essas RPCs,
 * este hook usa uma fronteira local estreita com nomes enumerados.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertGlobalCatalogWriteBlocked } from "@/lib/catalogo/globalCatalogWriteContainment";
import type { Database, Json } from "@/integrations/supabase/cultivofarm.types";


export type RegulatoryLayer = "TECHNICAL" | "REGULATORY";

export interface RegulatoryPendency {
  code: string;
  field: string;
  layer: RegulatoryLayer;
  message: string;
  items?: string[];
}

export interface RegulatoryNotApplicable {
  item_key: string;
  justification: string | null;
}

export type DossierStatus =
  | "NONE"
  | "DRAFT"
  | "PENDING_REVIEW"
  | "VALIDATED"
  | "BLOCKED";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ChecklistState = "PENDING" | "CONFIRMED" | "NOT_APPLICABLE";

export const REGULATORY_CHECKLIST_KEYS = [
  "FINALIDADE_REGULATORIA",
  "CEPA",
  "FORMULACAO",
  "GARANTIA_ROTULO",
  "REGISTRO_MAPA",
  "TITULAR_FABRICANTE",
  "NCM_CEST_TIPI",
  "GTIN",
  "UNIDADE_CONVERSAO",
  "ORIGEM",
  "CFOP",
  "TRIBUTACAO",
] as const;

export type ChecklistKey = (typeof REGULATORY_CHECKLIST_KEYS)[number];

export const CHECKLIST_LABELS: Record<ChecklistKey, string> = {
  FINALIDADE_REGULATORIA: "Finalidade regulatória",
  CEPA: "Cepa / estirpe",
  FORMULACAO: "Formulação",
  GARANTIA_ROTULO: "Composição e garantia de rótulo",
  REGISTRO_MAPA: "Registro MAPA / SIPEAGRO",
  TITULAR_FABRICANTE: "Titular / fabricante",
  NCM_CEST_TIPI: "NCM / CEST fundamentado na TIPI",
  GTIN: "GTIN",
  UNIDADE_CONVERSAO: "Unidade comercial, tributável e fator",
  ORIGEM: "Origem da mercadoria",
  CFOP: "CFOP",
  TRIBUTACAO: "Tributação (CST / CSOSN)",
};

export const REGULATORY_CATEGORY_OPTIONS = [
  { value: "INOCULANTE", label: "Inoculante" },
  { value: "BIOFERTILIZANTE", label: "Biofertilizante" },
  { value: "AGENTE_CONTROLE_BIOLOGICO", label: "Agente de controle biológico" },
  { value: "REMEDIADOR", label: "Remediador / bioinsumo ambiental" },
  { value: "INSUMO_USO_PROPRIO", label: "Insumo para uso próprio (on farm)" },
  { value: "OUTRO", label: "Outro (justificar)" },
] as const;

export const MAPA_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Registro ativo" },
  { value: "IN_PROGRESS", label: "Em processo de registro" },
  { value: "EXPIRED", label: "Registro vencido" },
  { value: "SUSPENDED", label: "Registro suspenso" },
  { value: "NOT_APPLICABLE", label: "Não aplicável (exige justificativa)" },
] as const;

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "ROTULO", label: "Rótulo" },
  { value: "LAUDO", label: "Laudo" },
  { value: "CERTIFICADO_ANALISE", label: "Certificado de análise" },
  { value: "FICHA_TECNICA", label: "Ficha técnica" },
  { value: "ATO_REGISTRO", label: "Ato de registro" },
  { value: "PARECER_CONTABIL", label: "Parecer contábil" },
  { value: "OUTRO", label: "Outro" },
] as const;

export interface RegulatoryFacts {
  dossier_id: string;
  version: number;
  status: Exclude<DossierStatus, "NONE">;
  blocked_reason: string | null;
  regulatory_category: string | null;
  strain: string | null;
  formulation: string | null;
  label_guarantee: string | null;
  mapa_status: string | null;
  mapa_registration_number: string | null;
  mapa_holder: string | null;
  mapa_valid_until: string | null;
  mapa_not_applicable_reason: string | null;
  published_ncm: string | null;
  published_cest: string | null;
  review_technical: ReviewStatus;
  review_regulatory: ReviewStatus;
  review_fiscal: ReviewStatus;
  has_label_document: boolean;
  has_report_document: boolean;
  expired_documents: number;
  ncm_approved: boolean;
  ncm_candidates: number;
  checklist_total: number;
  checklist_pending: string[];
  checklist_confirmed: number;
  presentations_total: number;
  presentations_units_unconfirmed: number;
  presentations_gtin_unconfirmed: number;
}

export interface RegulatoryOverviewRow {
  microorganism_id: string;
  codigo: string | null;
  nome: string;
  tipo: string | null;
  ativo: boolean;
  concentracao_label: string | null;
  facts: RegulatoryFacts | null;
  checklist_total: number;
  checklist_confirmed: number;
  checklist_pending: number;
  progress_pct: number;
  dossier_status: DossierStatus;
  profile_status: string | null;
  fiscally_ready: boolean;
  technical_ready: boolean;
  regulatory_ready: boolean;
  quarantined: boolean;
  pendencies: RegulatoryPendency[];
  not_applicable: RegulatoryNotApplicable[];
}

export interface RegulatoryDossierRow {
  id: string;
  microorganism_id: string;
  version: number;
  status: Exclude<DossierStatus, "NONE">;
  regulatory_category: string | null;
  strain_code: string | null;
  strain_name: string | null;
  formulation: string | null;
  label_guarantee: string | null;
  mapa_status: string | null;
  mapa_registration_number: string | null;
  mapa_holder: string | null;
  mapa_valid_until: string | null;
  mapa_not_applicable_reason: string | null;
  technical_review_status: ReviewStatus;
  regulatory_review_status: ReviewStatus;
  fiscal_review_status: ReviewStatus;
  published_ncm: string | null;
  published_cest: string | null;
  blocked_reason: string | null;
  notes: string | null;
  updated_at: string | null;
}

export interface RegulatoryPresentationRow {
  id: string;
  volume_ml: number;
  label: string;
  origin_note: string;
  commercial_unit: string | null;
  taxable_unit: string | null;
  conversion_factor: number | null;
  units_confirmed: boolean;
  gtin: string | null;
  gtin_absent: boolean;
  gtin_confirmed: boolean;
}

export interface RegulatoryNcmCandidateRow {
  id: string;
  ncm: string;
  cest: string | null;
  justification: string;
  confidence: string | null;
  status: "PROPOSED" | "APPROVED" | "REJECTED";
  decision_reason: string | null;
  source_url: string | null;
  consulted_at: string | null;
  created_at: string | null;
}

export interface RegulatoryDocumentRow {
  id: string;
  doc_type: string;
  title: string;
  storage_path: string;
  content_sha256: string;
  issuer: string | null;
  issued_at: string | null;
  valid_until: string | null;
  source_url: string | null;
  uploaded_at: string | null;
}

export interface RegulatoryChecklistRow {
  id: string;
  item_key: ChecklistKey;
  state: ChecklistState;
  justification: string | null;
  decided_at: string | null;
}

export interface RegulatorySnapshotRow {
  version: number;
  published_at: string;
  snapshot_sha256: string;
}

export interface RegulatoryHistoryRow {
  action: string;
  changed_at: string;
  changed_by: string | null;
  table_name: string;
}

export interface RegulatoryDossierDetail {
  dossier: RegulatoryDossierRow;
  presentations: RegulatoryPresentationRow[];
  ncm_candidates: RegulatoryNcmCandidateRow[];
  documents: RegulatoryDocumentRow[];
  checklist: RegulatoryChecklistRow[];
  history: RegulatoryHistoryRow[];
  snapshots: RegulatorySnapshotRow[];
  gate: { pendencies?: RegulatoryPendency[] } | null;
}

export const REGULATORY_KEYS = {
  root: ["fiscal", "microorganism-regulatory"] as const,
  overview: () => [...REGULATORY_KEYS.root, "overview"] as const,
  detail: (microId: string | null) =>
    [...REGULATORY_KEYS.root, "detail", microId] as const,
} as const;

export function isRegulatoryPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; status?: number; message?: string };
  if (e.code === "42501" || e.code === "PGRST301") return true;
  if (e.status === 401 || e.status === 403) return true;
  if (typeof e.message === "string" && /REGULATORY_FORBIDDEN|permission|denied|rls/i.test(e.message)) {
    return true;
  }
  return false;
}

/**
 * Chamada tipada às RPCs regulatórias. O nome da função e o formato dos
 * argumentos são validados pelo compilador contra os tipos gerados do
 * staging — nenhum cast de cliente é usado aqui.
 */
type RegulatoryFunctions = Database["public"]["Functions"];
type GeneratedRegulatoryFn = Extract<
  keyof RegulatoryFunctions,
  `rpc_regulatory_${string}` | "rpc_microorganism_regulatory_overview"
>;
type RegulatoryFn =
  | GeneratedRegulatoryFn
  | "rpc_microorganism_regulatory_overview"
  | "rpc_regulatory_dossier_detail"
  | "rpc_regulatory_dossier_ensure_draft"
  | "rpc_regulatory_dossier_update_draft"
  | "rpc_regulatory_presentation_upsert"
  | "rpc_regulatory_ncm_candidate_add"
  | "rpc_regulatory_ncm_candidate_decide"
  | "rpc_regulatory_checklist_set"
  | "rpc_regulatory_document_register"
  | "rpc_regulatory_dossier_submit"
  | "rpc_regulatory_review_decide"
  | "rpc_regulatory_dossier_publish"
  | "rpc_regulatory_dossier_block"
  | "rpc_regulatory_dossier_new_version";

type RegulatoryRpcValue = Json | Record<string, Json | undefined> | undefined;
type RegulatoryRpcArgs = Record<string, RegulatoryRpcValue>;
type RegulatoryRpcError = { code?: string; status?: number; message?: string };
type RegulatoryRpcClient = {
  rpc: (fn: RegulatoryFn, args: RegulatoryRpcArgs) => Promise<{
    data: Json | string | null;
    error: RegulatoryRpcError | null;
  }>;
};

/**
 * Contenção P1 (migration 20261014195911 global_catalog_regulatory_write_containment):
 * dossiês regulatórios são catálogo GLOBAL. Somente leituras overview/detail chegam à rede;
 * qualquer outra RPC falha antes da chamada. Writer SA regulatório auditado é pendente.
 */
export const REGULATORY_READ_RPCS: ReadonlySet<string> = new Set([
  "rpc_microorganism_regulatory_overview",
  "rpc_regulatory_dossier_detail",
]);

async function regulatoryRpc<K extends RegulatoryFn>(
  fn: K,
  args: RegulatoryRpcArgs,
): Promise<Json | string | null> {
  if (!REGULATORY_READ_RPCS.has(fn)) assertGlobalCatalogWriteBlocked();
  const rpcClient: RegulatoryRpcClient = supabase as never;
  const { data, error } = await rpcClient.rpc(fn, args);
  if (error) {
    if (isRegulatoryPermissionError(error)) throw new Error("permission_denied");
    throw new Error(error.message || "regulatory_rpc_failed");
  }
  return data;
}

/**
 * Leitura de payload `Json` retornado por RPC. Conversão explícita e única:
 * o contrato do payload é validado pelos testes de contrato da fase.
 */
function fromJson<T>(payload: Json | null): T | null {
  return payload === null || payload === undefined ? null : (payload as T);
}

export function useMicroorganismRegulatoryOverview(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: REGULATORY_KEYS.overview(),
    enabled: options?.enabled ?? true,
    queryFn: async (): Promise<RegulatoryOverviewRow[]> => {
      const payload = await regulatoryRpc(
        "rpc_microorganism_regulatory_overview",
        {},
      );
      return fromJson<RegulatoryOverviewRow[]>(payload) ?? [];
    },
  });
}

export function useRegulatoryDossierDetail(
  microorganismId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: REGULATORY_KEYS.detail(microorganismId),
    enabled: Boolean(microorganismId) && (options?.enabled ?? true),
    queryFn: async (): Promise<RegulatoryDossierDetail | null> => {
      if (!microorganismId) return null;
      const payload = await regulatoryRpc("rpc_regulatory_dossier_detail", {
        p_microorganism_id: microorganismId,
      });
      return fromJson<RegulatoryDossierDetail>(payload);
    },
  });
}


function requireMicroorganism(id: string | null): string {
  if (!id) throw new Error("microorganism_required");
  return id;
}

/** Invalida overview + detalhe após qualquer escrita regulatória. */
function useRegulatoryInvalidation(microorganismId: string | null) {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: REGULATORY_KEYS.overview() }),
      qc.invalidateQueries({ queryKey: REGULATORY_KEYS.detail(microorganismId) }),
      qc.invalidateQueries({ queryKey: ["fiscal", "microorganism-profiles"] }),
    ]);
  };
}

export interface DossierDraftPatch {
  [key: string]: Json | undefined;
  regulatory_category?: string | null;
  strain_code?: string | null;
  strain_name?: string | null;
  formulation?: string | null;
  label_guarantee?: string | null;
  mapa_status?: string | null;
  mapa_registration_number?: string | null;
  mapa_holder?: string | null;
  mapa_valid_until?: string | null;
  mapa_not_applicable_reason?: string | null;
  notes?: string | null;
}

export interface PresentationPatch {
  [key: string]: Json | undefined;
  commercial_unit?: string | null;
  taxable_unit?: string | null;
  conversion_factor?: number | null;
  units_confirmed?: boolean;
  gtin?: string | null;
  gtin_absent?: boolean;
  gtin_confirmed?: boolean;
}

/**
 * Mutations da Fase F2. Cada uma é um ATO HUMANO registrado em trilha de
 * auditoria no servidor; o cliente nunca decide nada sozinho.
 */
export function useRegulatoryActions(microorganismId: string | null) {
  const invalidate = useRegulatoryInvalidation(microorganismId);

  const ensureDraft = useMutation({
    mutationFn: async (): Promise<string> =>
      String(await regulatoryRpc("rpc_regulatory_dossier_ensure_draft", {
        p_microorganism_id: requireMicroorganism(microorganismId),
      }) ?? ""),
    onSuccess: invalidate,
  });

  const updateDraft = useMutation({
    mutationFn: async (input: { dossierId: string; patch: DossierDraftPatch }) =>
      regulatoryRpc("rpc_regulatory_dossier_update_draft", {
        p_dossier_id: input.dossierId,
        p_patch: input.patch,
      }),
    onSuccess: invalidate,
  });

  const upsertPresentation = useMutation({
    mutationFn: async (input: {
      dossierId: string;
      volumeMl: number;
      patch: PresentationPatch;
    }) =>
      regulatoryRpc("rpc_regulatory_presentation_upsert", {
        p_dossier_id: input.dossierId,
        p_volume_ml: input.volumeMl,
        p_patch: input.patch,
      }),
    onSuccess: invalidate,
  });

  const addNcmCandidate = useMutation({
    mutationFn: async (input: {
      dossierId: string;
      ncm: string;
      justification: string;
      cest?: string | null;
      confidence?: string | null;
      sourceKey: string;
      sourceUrl?: string | null;
      consultedAt?: string | null;
    }) =>
      regulatoryRpc("rpc_regulatory_ncm_candidate_add", {
        p_dossier_id: input.dossierId,
        p_ncm: input.ncm,
        p_justification: input.justification,
        p_cest: input.cest ?? null,
        p_confidence: input.confidence ?? null,
        p_source_key: input.sourceKey,
        p_source_url: input.sourceUrl ?? null,
        p_consulted_at: input.consultedAt ?? null,
      }),
    onSuccess: invalidate,
  });

  const decideNcmCandidate = useMutation({
    mutationFn: async (input: {
      candidateId: string;
      approve: boolean;
      reason: string;
    }) =>
      regulatoryRpc("rpc_regulatory_ncm_candidate_decide", {
        p_candidate_id: input.candidateId,
        p_approve: input.approve,
        p_reason: input.reason,
      }),
    onSuccess: invalidate,
  });

  const setChecklist = useMutation({
    mutationFn: async (input: {
      dossierId: string;
      itemKey: ChecklistKey;
      state: ChecklistState;
      justification?: string | null;
      evidenceDocumentId?: string | null;
    }) =>
      regulatoryRpc("rpc_regulatory_checklist_set", {
        p_dossier_id: input.dossierId,
        p_item_key: input.itemKey,
        p_state: input.state,
        p_justification: input.justification ?? null,
        p_evidence_document_id: input.evidenceDocumentId ?? null,
      }),
    onSuccess: invalidate,
  });

  const registerDocument = useMutation({
    mutationFn: async (input: {
      dossierId: string;
      docType: string;
      title: string;
      storagePath: string;
      contentSha256: string;
      issuer?: string | null;
      issuedAt?: string | null;
      validUntil?: string | null;
      sourceKey?: string | null;
      sourceUrl?: string | null;
      consultedAt?: string | null;
      docVersion?: string | null;
    }) =>
      regulatoryRpc("rpc_regulatory_document_register", {
        p_dossier_id: input.dossierId,
        p_doc_type: input.docType,
        p_title: input.title,
        p_storage_path: input.storagePath,
        p_content_sha256: input.contentSha256,
        p_issuer: input.issuer ?? null,
        p_issued_at: input.issuedAt ?? null,
        p_valid_until: input.validUntil ?? null,
        p_source_key: input.sourceKey ?? null,
        p_source_url: input.sourceUrl ?? null,
        p_consulted_at: input.consultedAt ?? null,
        p_doc_version: input.docVersion ?? null,
      }),
    onSuccess: invalidate,
  });

  const submit = useMutation({
    mutationFn: async (dossierId: string) =>
      regulatoryRpc("rpc_regulatory_dossier_submit", { p_dossier_id: dossierId }),
    onSuccess: invalidate,
  });

  const reviewDecide = useMutation({
    mutationFn: async (input: {
      dossierId: string;
      layer: "TECHNICAL" | "REGULATORY" | "FISCAL";
      decision: "APPROVED" | "REJECTED";
      justification: string;
    }) =>
      regulatoryRpc("rpc_regulatory_review_decide", {
        p_dossier_id: input.dossierId,
        p_layer: input.layer,
        p_decision: input.decision,
        p_justification: input.justification,
      }),
    onSuccess: invalidate,
  });

  const publish = useMutation({
    mutationFn: async (dossierId: string) =>
      regulatoryRpc("rpc_regulatory_dossier_publish", { p_dossier_id: dossierId }),
    onSuccess: invalidate,
  });

  const block = useMutation({
    mutationFn: async (input: { dossierId: string; reason: string }) =>
      regulatoryRpc("rpc_regulatory_dossier_block", {
        p_dossier_id: input.dossierId,
        p_reason: input.reason,
      }),
    onSuccess: invalidate,
  });

  const newVersion = useMutation({
    mutationFn: async (reason: string) =>
      regulatoryRpc("rpc_regulatory_dossier_new_version", {
        p_microorganism_id: requireMicroorganism(microorganismId),
        p_reason: reason,
      }),
    onSuccess: invalidate,
  });

  return {
    ensureDraft,
    updateDraft,
    upsertPresentation,
    addNcmCandidate,
    decideNcmCandidate,
    setChecklist,
    registerDocument,
    submit,
    reviewDecide,
    publish,
    block,
    newVersion,
  };
}
