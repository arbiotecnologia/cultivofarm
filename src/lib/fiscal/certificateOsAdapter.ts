/**
 * Fase Fiscal 3.16 — Adaptador do bridge de certificado do SO.
 *
 * Detecta a presença do conector nativo. Se ausente, retorna estado
 * "unavailable" com mensagem em pt-BR. Nunca simula certificado.
 */
import type {
  FiscalOsBridge,
  FiscalOsBridgeStatus,
  FiscalOsCertificateMetadata,
} from "@/types/fiscalCertificateBridge";

export function getOsBridge(): FiscalOsBridge | null {
  if (typeof window === "undefined") return null;
  const b = window.ARBioFiscalCertificateBridge;
  if (!b || typeof b.isAvailable !== "function") return null;
  try {
    if (!b.isAvailable()) return null;
  } catch {
    return null;
  }
  return b;
}

export async function probeOsBridge(): Promise<FiscalOsBridgeStatus> {
  const b = getOsBridge();
  if (!b) {
    return {
      available: false,
      error:
        "Conector nativo ARBio não detectado. Instale o conector futuro para acessar o repositório de certificados do sistema operacional.",
    };
  }
  try {
    return await b.getStatus();
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : "Falha ao consultar o conector nativo.",
    };
  }
}

/** Retorna somente metadados sanitizados; nunca inclui material sensível. */
export async function listOsCertificatesSafe(): Promise<FiscalOsCertificateMetadata[]> {
  const b = getOsBridge();
  if (!b) return [];
  const raw = await b.listCertificates();
  return raw.map(sanitize);
}

function sanitize(meta: FiscalOsCertificateMetadata): FiscalOsCertificateMetadata {
  return {
    alias: String(meta.alias),
    subject_name: String(meta.subject_name),
    issuer_name: String(meta.issuer_name),
    serial_number: String(meta.serial_number),
    valid_from: String(meta.valid_from),
    valid_until: String(meta.valid_until),
    fingerprint_sha256: String(meta.fingerprint_sha256).toLowerCase(),
    key_usage: Array.isArray(meta.key_usage) ? meta.key_usage.map(String) : undefined,
  };
}
