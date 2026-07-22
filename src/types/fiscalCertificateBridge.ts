/**
 * Fase Fiscal 3.16 — Contrato do bridge de certificado do sistema operacional.
 *
 * O navegador NUNCA enumera diretamente o Windows/macOS. Um conector nativo
 * futuro (extensão instalada pelo usuário) expõe
 * `window.ARBioFiscalCertificateBridge` com métodos ESTRITAMENTE de
 * metadados sanitizados. Nenhum método retorna material criptográfico
 * sensível. `signDigest` NÃO faz parte desta fase.
 */

export interface FiscalOsCertificateMetadata {
  /** Alias único no repositório do SO (opaco ao aplicativo). */
  alias: string;
  /** Subject (CN, O, OU) já formatado como string legível. */
  subject_name: string;
  issuer_name: string;
  /** Serial em hex minúsculo. */
  serial_number: string;
  valid_from: string; // ISO
  valid_until: string; // ISO
  /** SHA-256 da DER do certificado, hex minúsculo (64 chars). */
  fingerprint_sha256: string;
  key_usage?: string[];
}

export interface FiscalOsBridgeStatus {
  available: boolean;
  version?: string;
  selected_alias?: string | null;
  error?: string;
}

export interface FiscalOsBridge {
  isAvailable(): boolean;
  listCertificates(): Promise<FiscalOsCertificateMetadata[]>;
  selectCertificate(alias: string): Promise<FiscalOsCertificateMetadata>;
  getStatus(): Promise<FiscalOsBridgeStatus>;
}

declare global {
  interface Window {
    ARBioFiscalCertificateBridge?: FiscalOsBridge;
  }
}

export {};
