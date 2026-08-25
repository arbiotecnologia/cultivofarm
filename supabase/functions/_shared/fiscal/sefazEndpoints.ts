/**
 * FASE H7 — Registro versionado de Web Services da SEFAZ e guard duro de ambiente.
 *
 * Regras absolutas:
 *   - Em staging (tpAmb=2 / HOMOLOGATION) somente hosts de HOMOLOGAÇÃO são
 *     alcançáveis. Qualquer host de produção => fail-closed (`SEFAZ_PRODUCTION_HOST_BLOCKED`).
 *   - A emissão de produção está desabilitada no projeto inteiro; por isso o
 *     mapa de produção existe apenas para ser RECONHECIDO e BLOQUEADO, nunca
 *     para ser usado.
 *   - Nenhum schema/endpoint é baixado ou descoberto em runtime: o registro é
 *     estático e versionado no repositório.
 *
 * Fonte: Portal Nacional da NF-e — relação de Web Services por UF (SEFAZ-MG,
 * NF-e 4.00, modelo 55). Revalidar antes de qualquer promoção a produção.
 */

export type SefazService =
  | "NFeStatusServico4"
  | "NFeAutorizacao4"
  | "NFeRetAutorizacao4"
  | "NFeConsultaProtocolo4"
  | "NFeRecepcaoEvento4"
  | "NFeInutilizacao4";

/** tpAmb da NF-e: '1' = produção, '2' = homologação. */
export type TpAmb = "1" | "2";

export const SEFAZ_MG_HOMOLOGATION_HOST = "hnfe.fazenda.mg.gov.br";
export const SEFAZ_MG_PRODUCTION_HOST = "nfe.fazenda.mg.gov.br";

const MG_HOMOLOGATION: Record<SefazService, string> = {
  NFeStatusServico4: `https://${SEFAZ_MG_HOMOLOGATION_HOST}/nfe2/services/NFeStatusServico4`,
  NFeAutorizacao4: `https://${SEFAZ_MG_HOMOLOGATION_HOST}/nfe2/services/NFeAutorizacao4`,
  NFeRetAutorizacao4: `https://${SEFAZ_MG_HOMOLOGATION_HOST}/nfe2/services/NFeRetAutorizacao4`,
  NFeConsultaProtocolo4: `https://${SEFAZ_MG_HOMOLOGATION_HOST}/nfe2/services/NFeConsultaProtocolo4`,
  NFeRecepcaoEvento4: `https://${SEFAZ_MG_HOMOLOGATION_HOST}/nfe2/services/NFeRecepcaoEvento4`,
  NFeInutilizacao4: `https://${SEFAZ_MG_HOMOLOGATION_HOST}/nfe2/services/NFeInutilizacao4`,
};

/** Hosts de produção conhecidos — presentes SOMENTE para bloqueio explícito. */
export const SEFAZ_PRODUCTION_HOSTS: readonly string[] = [
  SEFAZ_MG_PRODUCTION_HOST,
  "nfe.svrs.rs.gov.br",
  "www.sefazvirtual.fazenda.gov.br",
  "nfe.fazenda.gov.br",
];

export class SefazEndpointError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SefazEndpointError";
  }
}

function hostOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SefazEndpointError("SEFAZ_ENDPOINT_INVALID_URL", "URL de Web Service inválida.");
  }
  if (parsed.protocol !== "https:") {
    throw new SefazEndpointError("SEFAZ_ENDPOINT_NOT_TLS", "Web Service da SEFAZ exige HTTPS.");
  }
  return parsed.hostname.toLowerCase();
}

/**
 * Guard duro: valida a URL antes de qualquer requisição de transporte.
 * Fail-closed — só libera hosts de homologação e apenas com tpAmb='2'.
 */
export function assertSefazEndpointAllowed(url: string, tpAmb: TpAmb): void {
  const host = hostOf(url);

  if (SEFAZ_PRODUCTION_HOSTS.includes(host)) {
    throw new SefazEndpointError(
      "SEFAZ_PRODUCTION_HOST_BLOCKED",
      "Host de produção da SEFAZ bloqueado: o ambiente fiscal está restrito a homologação.",
    );
  }
  if (tpAmb !== "2") {
    throw new SefazEndpointError(
      "SEFAZ_PRODUCTION_DISABLED",
      "Transmissão só é permitida com tpAmb=2 (homologação).",
    );
  }
  if (host !== SEFAZ_MG_HOMOLOGATION_HOST) {
    throw new SefazEndpointError(
      "SEFAZ_HOST_NOT_ALLOWLISTED",
      "Host não consta na allowlist de homologação da SEFAZ-MG.",
    );
  }
}

/** Resolve o endpoint de homologação de um serviço, já validado pelo guard. */
export function resolveSefazEndpoint(service: SefazService, tpAmb: TpAmb): string {
  if (tpAmb !== "2") {
    throw new SefazEndpointError(
      "SEFAZ_PRODUCTION_DISABLED",
      "Emissão de produção desabilitada neste projeto.",
    );
  }
  const url = MG_HOMOLOGATION[service];
  if (!url) {
    throw new SefazEndpointError("SEFAZ_SERVICE_UNKNOWN", `Serviço SEFAZ desconhecido: ${service}`);
  }
  assertSefazEndpointAllowed(url, tpAmb);
  return url;
}

export const SEFAZ_MG_HOMOLOGATION_ENDPOINTS: Readonly<Record<SefazService, string>> = MG_HOMOLOGATION;
