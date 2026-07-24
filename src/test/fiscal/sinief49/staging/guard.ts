/**
 * Fase SINIEF 4.0 — Guard anti-produção STAGING-ONLY para SINIEF 49/2025.
 *
 * Ref esperado (AR-Bio-TEMP): `ikaauvsflpmamgxmkhoq`.
 * Ref proibido (produção):    `navfzbwgwzruipouyfnk`.
 *
 * Regras:
 *  - FISCAL_TEST_ENV precisa ser exatamente "STAGING".
 *  - FISCAL_TEST_PROJECT_REF precisa ser exatamente `EXPECTED_STAGING_REF`.
 *  - PGURL_STAGING/PGREST_STAGING devem conter o ref esperado e NUNCA o ref
 *    de produção.
 *  - Configuração parcial → falha explícita.
 *  - Ausência total das variáveis → resolveSinief49GuardMode → "skip"
 *    (permitido apenas em testes locais; nunca em pipelines --execute).
 *  - Marker de banco: linha (marker='STAGING', project_ref=EXPECTED_STAGING_REF).
 *
 * NENHUMA função aqui abre conexão, faz I/O ou lê secret. O consumidor injeta o
 * query() já autenticado (service_role apenas em staging).
 */
export const SINIEF49_PROD_PROJECT_REF = "navfzbwgwzruipouyfnk" as const;
export const SINIEF49_EXPECTED_STAGING_REF = "ikaauvsflpmamgxmkhoq" as const;

export const SINIEF49_REQUIRED_ENV_VARS = [
  "FISCAL_TEST_ENV",
  "FISCAL_TEST_PROJECT_REF",
  "PGURL_STAGING",
  "PGREST_STAGING",
] as const;
export type Sinief49RequiredEnvVar = (typeof SINIEF49_REQUIRED_ENV_VARS)[number];

export interface Sinief49GuardInput {
  envMarker?: string | null;   // FISCAL_TEST_ENV
  projectRef?: string | null;  // FISCAL_TEST_PROJECT_REF
  pgUrl?: string | null;       // PGURL_STAGING
  restUrl?: string | null;     // PGREST_STAGING
}

export type Sinief49GuardResult =
  | { ok: true }
  | { ok: false; reason: string };

function includesRef(value: string, ref: string): boolean {
  return value.toLowerCase().includes(ref.toLowerCase());
}

/**
 * Modo do guard baseado em quantas variáveis estão presentes.
 *  - "skip"     → nenhuma variável (permite testes locais darem skip explícito).
 *  - "enforce"  → alguma variável presente; regras estritas se aplicam.
 */
export function resolveSinief49GuardMode(
  source: Record<string, string | undefined> = process.env,
): "skip" | "enforce" {
  const present = SINIEF49_REQUIRED_ENV_VARS.filter(
    (k) => (source[k] ?? "").trim() !== "",
  );
  return present.length === 0 ? "skip" : "enforce";
}

export function loadSinief49GuardInput(
  source: Record<string, string | undefined> = process.env,
): Sinief49GuardInput {
  return {
    envMarker: source.FISCAL_TEST_ENV ?? null,
    projectRef: source.FISCAL_TEST_PROJECT_REF ?? null,
    pgUrl: source.PGURL_STAGING ?? null,
    restUrl: source.PGREST_STAGING ?? null,
  };
}

export function assertSinief49StagingOnly(
  i: Sinief49GuardInput,
): Sinief49GuardResult {
  const marker = (i.envMarker ?? "").trim().toUpperCase();
  if (marker !== "STAGING") {
    return { ok: false, reason: "FISCAL_TEST_ENV deve ser exatamente 'STAGING'" };
  }
  const ref = (i.projectRef ?? "").trim();
  if (!ref) return { ok: false, reason: "FISCAL_TEST_PROJECT_REF ausente" };
  if (ref === SINIEF49_PROD_PROJECT_REF) {
    return {
      ok: false,
      reason: `FISCAL_TEST_PROJECT_REF aponta para PRODUÇÃO (${SINIEF49_PROD_PROJECT_REF})`,
    };
  }
  if (ref !== SINIEF49_EXPECTED_STAGING_REF) {
    return {
      ok: false,
      reason: `FISCAL_TEST_PROJECT_REF (${ref}) diverge do staging esperado (${SINIEF49_EXPECTED_STAGING_REF})`,
    };
  }
  const pg = (i.pgUrl ?? "").trim();
  const rest = (i.restUrl ?? "").trim();
  if (!pg || !rest) {
    return { ok: false, reason: "PGURL_STAGING/PGREST_STAGING ausentes" };
  }
  if (includesRef(pg, SINIEF49_PROD_PROJECT_REF) || includesRef(rest, SINIEF49_PROD_PROJECT_REF)) {
    return {
      ok: false,
      reason: `PGURL/PGREST contêm o ref de PRODUÇÃO (${SINIEF49_PROD_PROJECT_REF})`,
    };
  }
  if (!includesRef(pg, ref) || !includesRef(rest, ref)) {
    return {
      ok: false,
      reason: `PGURL/PGREST não correspondem ao ref esperado (${ref})`,
    };
  }
  return { ok: true };
}

/**
 * Confere marker `public._fiscal_staging_marker` (marker='STAGING' e
 * project_ref = ref esperado). O consumidor injeta `query`.
 */
export async function assertSinief49StagingMarker(
  query: (sql: string) => Promise<{ rows: Array<{ marker?: unknown; project_ref?: unknown }> }>,
  expectedRef: string = SINIEF49_EXPECTED_STAGING_REF,
): Promise<Sinief49GuardResult> {
  if (!expectedRef || expectedRef === SINIEF49_PROD_PROJECT_REF) {
    return { ok: false, reason: `expectedRef inválido: ${expectedRef}` };
  }
  try {
    const { rows } = await query(
      "SELECT marker, project_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1",
    );
    if (rows.length === 0) {
      return { ok: false, reason: "marker _fiscal_staging_marker ausente" };
    }
    const r = rows[0];
    if (String(r.marker) !== "STAGING") {
      return { ok: false, reason: `marker inesperado: ${String(r.marker)}` };
    }
    if (String(r.project_ref) !== expectedRef) {
      return {
        ok: false,
        reason: `project_ref do marker (${String(r.project_ref)}) difere do esperado (${expectedRef})`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `falha ao verificar marker: ${(err as Error).message}` };
  }
}
