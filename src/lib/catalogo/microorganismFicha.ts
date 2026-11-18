import { z } from "zod";
import type { DocumentaryEvidence } from "./documentarySuggestions";
import { parseTenantCatalogAck } from "./tenantCatalogRoots";
export const MICRO_ROOT_FIELDS = [
  "codigo",
  "nome",
  "nome_cientifico",
  "tipo",
  "fornecedor",
  "funcao_agronomica",
  "concentracao_ufc_ml",
  "concentracao_label",
  "descricao",
  "observacoes",
] as const;
export const MICRO_EXTRA_FIELDS = [
  "sinonimos",
  "cepa",
  "origem",
  "apresentacao",
  "culturas_uso",
  "alvos_uso",
  "documentos_pendentes",
] as const;
export const MICRO_CONTENT_FIELDS = [
  "resumo_curto",
  "mecanismo_acao",
  "beneficios_agronomicos",
  "explicacao_tecnica",
  "explicacao_produtor",
  "explicacao_b2b",
  "indicacoes_uso",
  "cuidados_aplicacao",
  "compatibilidade",
  "armazenamento",
  "observacoes_regulatorias",
] as const;
export const MICRO_SECTIONS = [
  "Identificação",
  "Características técnicas",
  "Uso agronômico",
  "Conteúdo do catálogo",
  "Fiscal e regulatório",
  "Fontes e histórico",
] as const;
export type MicroFichaRow = {
  id: string;
  nome: string;
  descricao: string | null;
  updated_at: string | null;
  owner_organization_id?: string | null;
  nome_cientifico?: string | null;
  tipo?: string;
  [key: string]: unknown;
};
export function microDraft(
  row: Record<string, unknown> | null,
  profile?: Record<string, unknown> | null,
): Record<string, string> {
  return Object.fromEntries(
    [...MICRO_ROOT_FIELDS, ...MICRO_EXTRA_FIELDS, ...MICRO_CONTENT_FIELDS].map(
      (f) => [
        f,
        String(
          (MICRO_CONTENT_FIELDS as readonly string[]).includes(f)
            ? (profile?.[f] ?? "")
            : (row?.[f] ?? (f === "tipo" ? "bacteria" : "")),
        ),
      ],
    ),
  );
}
export function microPayload(
  values: Record<string, string>,
  baseline: Record<string, string>,
) {
  const changed = (fields: readonly string[]) =>
    Object.fromEntries(
      fields
        .filter((f) => values[f] !== baseline[f])
        .map((f) => [f, values[f]?.trim() || null]),
    );
  const root = changed(MICRO_ROOT_FIELDS);
  if ("concentracao_ufc_ml" in root && root.concentracao_ufc_ml !== null) {
    const number = Number(root.concentracao_ufc_ml);
    if (!Number.isFinite(number) || number <= 0)
      throw new Error("Concentração UFC/mL deve ser positiva e finita.");
  }
  return {
    root,
    extra: changed(MICRO_EXTRA_FIELDS),
    content: changed(MICRO_CONTENT_FIELDS),
  };
}
type Rpc = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
};
export type MicroChild = {
  kind: "crop" | "target" | "source";
  id: string | null;
  updated_at: string | null;
  fields: Record<string, unknown>;
};
export async function saveMicroFicha(
  client: Rpc,
  id: string | null,
  version: string | null,
  profileVersion: string | null,
  values: Record<string, string>,
  baseline: Record<string, string>,
  evidence: DocumentaryEvidence[],
  key: string,
  children: MicroChild[] = [],
) {
  if (!values.nome?.trim()) throw new Error("Informe o nome.");
  if (id && !version)
    throw new Error("Versão observada ausente; recarregue a ficha.");
  const payload = microPayload(values, baseline);
  if (!id)
    payload.root = {
      ...payload.root,
      nome: values.nome.trim(),
      tipo: values.tipo || "bacteria",
    };
  const { data, error } = await client.rpc(
    "tenant_microorganism_ficha_save_v1",
    {
      p_id: id,
      p_expected_updated_at: version,
      p_expected_profile_updated_at: profileVersion,
      p_payload: children.length ? { ...payload, children } : payload,
      p_evidence: evidence,
      p_key: key,
    },
  );
  if (error)
    throw Object.assign(
      new Error(
        error.code === "PT409"
          ? "A ficha mudou ou a tentativa divergiu. Rascunho preservado; confira a versão antes de salvar."
          : error.code === "42501"
            ? "Sem permissão para salvar esta ficha."
            : error.code === "PGRST202"
              ? "O contrato completo da ficha aguarda instalação revisada. Nada foi salvo; rascunho preservado."
              : "Não foi possível salvar a ficha; rascunho preservado.",
      ),
      { serverCode: error.code },
    );
  return parseTenantCatalogAck(data, id);
}

const rootSchema = z
  .object({
    id: z.string().uuid(),
    nome: z.string(),
    descricao: z.string().nullable(),
    updated_at: z.string().datetime({ offset: true }),
    owner_organization_id: z.string().uuid().nullable(),
  })
  .passthrough();
export const microChildSchema = z
  .object({
    id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
  })
  .passthrough();
const profileSchema = z
  .object({
    id: z.string().uuid(),
    microrganismo_id: z.string().uuid(),
    updated_at: z.string().datetime({ offset: true }),
  })
  .passthrough()
  .nullable();
const provenanceSchema = z.object({
  extra: z.object(Object.fromEntries(MICRO_EXTRA_FIELDS.map(field => [field, z.string().nullable().optional()]))).strict(),
  evidence: z.array(
    z.object({
      field: z.string(),
      value: z.string(),
      identity: z.object({ name: z.string() }).passthrough(),
      sources: z.array(
        z.object({
          url: z.string().url(),
          title: z.string(),
          excerpt: z.string(),
        }),
      ),
    }),
  ),
});
/** Same canonical RLS for global/read-only items; private supplement is own-only.
 * Double observed revision rejects torn root/profile reads, never rebases a draft.
 */
export async function fetchMicroFicha(
  client: { from: (table: string) => any; rpc: (...args: any[]) => any },
  id: string,
  org: string | null,
  signal: AbortSignal,
) {
  const readRoot = () =>
    client
      .from("microrganismos")
      .select("*")
      .eq("id", id)
      .abortSignal(signal)
      .single();
  const readProfile = () =>
    client
      .from("microorganism_technical_profiles")
      .select("*")
      .eq("microrganismo_id", id)
      .abortSignal(signal)
      .maybeSingle();
  const [firstRoot, firstProfile] = await Promise.all([
    readRoot(),
    readProfile(),
  ]);
  if (firstRoot.error || firstProfile.error)
    throw new Error(
      "Não foi possível consultar a ficha pela autorização vigente.",
    );
  const row = rootSchema.parse(firstRoot.data);
  const profile = profileSchema.parse(firstProfile.data);
  if (
    row.id !== id ||
    (row.owner_organization_id && row.owner_organization_id !== org) ||
    (profile && profile.microrganismo_id !== id)
  )
    throw new Error("Resposta fora do escopo da ficha.");
  let extra: Record<string, string | null> = {};
  let evidence: DocumentaryEvidence[] = [];
  if (org && row.owner_organization_id === org) {
    const result = await client
      .rpc("tenant_microorganism_ficha_read_v1", { p_id: id })
      .abortSignal(signal);
    if (result.error) {
      if (result.error.code !== "PGRST202" || !String(result.error.message ?? '').includes('tenant_microorganism_ficha_read_v1'))
        throw new Error("Não foi possível consultar os complementos da ficha.");
    } else {
      const parsed = provenanceSchema.parse(result.data);
      extra = parsed.extra;
      evidence = parsed.evidence as DocumentaryEvidence[];
    }
  }
  const [lastRoot, lastProfile] = await Promise.all([
    readRoot(),
    readProfile(),
  ]);
  if (lastRoot.error || lastProfile.error || signal.aborted)
    throw new Error("Consulta interrompida; nenhum dado adotado.");
  const checkedRoot = rootSchema.parse(lastRoot.data);
  const checkedProfile = profileSchema.parse(lastProfile.data);
  if (
    checkedRoot.id !== id ||
    checkedRoot.owner_organization_id !== row.owner_organization_id ||
    checkedRoot.updated_at !== row.updated_at ||
    checkedProfile?.id !== profile?.id ||
    checkedProfile?.updated_at !== profile?.updated_at
  )
    throw new Error(
      "A ficha mudou durante a consulta. Recarregue sem substituir seu rascunho.",
    );
  return { row: { ...row, ...extra }, profile, evidence };
}
