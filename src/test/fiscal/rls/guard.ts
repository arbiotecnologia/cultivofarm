/**
 * Fase Fiscal 3.0.1 — Guard anti-produção.
 * Bloqueia qualquer execução runtime contra o projeto real ou fora de staging.
 */
const PROD_PROJECT_REF = "navfzbwgwzruipouyfnk";

export interface GuardInput {
  pgUrl?: string | null;
  restUrl?: string | null;
  envMarker?: string | null; // FISCAL_TEST_ENV
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

export function assertStagingOnly(i: GuardInput): GuardResult {
  const pg = (i.pgUrl ?? "").toLowerCase();
  const rest = (i.restUrl ?? "").toLowerCase();
  if (!pg || !rest) return { ok: false, reason: "PGURL_STAGING/PGREST_STAGING ausente" };
  if (pg.includes(PROD_PROJECT_REF) || rest.includes(PROD_PROJECT_REF)) {
    return { ok: false, reason: `Detectado project ref de PRODUÇÃO (${PROD_PROJECT_REF})` };
  }
  if ((i.envMarker ?? "").toUpperCase() !== "STAGING") {
    return { ok: false, reason: "FISCAL_TEST_ENV deve ser STAGING" };
  }
  return { ok: true };
}

/**
 * Verificação runtime do marker table `public._fiscal_staging_marker`
 * (criado por 01-prepare.sql). Deve ser invocada pelo runner após conectar.
 */
export async function assertStagingMarker(query: (sql: string) => Promise<{ rows: unknown[] }>): Promise<GuardResult> {
  try {
    const { rows } = await query(
      "SELECT 1 FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1",
    );
    if (rows.length === 0) return { ok: false, reason: "marker _fiscal_staging_marker ausente" };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `falha ao verificar marker: ${(err as Error).message}` };
  }
}
