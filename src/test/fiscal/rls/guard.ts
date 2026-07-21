/**
 * Fase Fiscal 3.0.2-B — Guard anti-produção.
 *
 * Regras:
 *  - Nunca aceitar o ref do projeto principal em nenhuma variável.
 *  - Nunca inferir "staging" sem FISCAL_TEST_PROJECT_REF explícito.
 *  - PGURL_STAGING e PGREST_STAGING devem conter o mesmo ref esperado.
 *  - assertStagingMarker exige linha marker='STAGING' + project_ref = esperado.
 */
export const PROD_PROJECT_REF = "navfzbwgwzruipouyfnk";

export interface GuardInput {
  pgUrl?: string | null;
  restUrl?: string | null;
  envMarker?: string | null;       // FISCAL_TEST_ENV
  projectRef?: string | null;      // FISCAL_TEST_PROJECT_REF
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

function containsRef(s: string, ref: string): boolean {
  return s.toLowerCase().includes(ref.toLowerCase());
}

export function assertStagingOnly(i: GuardInput): GuardResult {
  const marker = (i.envMarker ?? "").toUpperCase();
  if (marker !== "STAGING") {
    return { ok: false, reason: "FISCAL_TEST_ENV deve ser exatamente 'STAGING'" };
  }
  const ref = (i.projectRef ?? "").trim();
  if (!ref) return { ok: false, reason: "FISCAL_TEST_PROJECT_REF ausente" };
  if (ref === PROD_PROJECT_REF) {
    return { ok: false, reason: `FISCAL_TEST_PROJECT_REF aponta para PRODUÇÃO (${PROD_PROJECT_REF})` };
  }
  const pg = i.pgUrl ?? "";
  const rest = i.restUrl ?? "";
  if (!pg || !rest) return { ok: false, reason: "PGURL_STAGING/PGREST_STAGING ausentes" };
  if (containsRef(pg, PROD_PROJECT_REF) || containsRef(rest, PROD_PROJECT_REF)) {
    return { ok: false, reason: `PGURL/PGREST contêm o ref de PRODUÇÃO (${PROD_PROJECT_REF})` };
  }
  if (!containsRef(pg, ref) || !containsRef(rest, ref)) {
    return { ok: false, reason: `PGURL/PGREST não correspondem ao ref esperado (${ref})` };
  }
  return { ok: true };
}

/**
 * Verifica marker em banco:
 *   SELECT marker, project_ref FROM public._fiscal_staging_marker
 * A linha deve ter marker='STAGING' e project_ref = expectedRef.
 */
export async function assertStagingMarker(
  query: (sql: string) => Promise<{ rows: Array<{ marker?: unknown; project_ref?: unknown }> }>,
  expectedRef: string,
): Promise<GuardResult> {
  if (!expectedRef || expectedRef === PROD_PROJECT_REF) {
    return { ok: false, reason: `expectedRef inválido: ${expectedRef}` };
  }
  try {
    const { rows } = await query(
      "SELECT marker, project_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1",
    );
    if (rows.length === 0) return { ok: false, reason: "marker _fiscal_staging_marker ausente" };
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
