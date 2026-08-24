/**
 * Fase H7e — Identidade do certificado A1 (ICP-Brasil) x CNPJ do emitente.
 *
 * Helper PURO e reutilizável (sem I/O, sem segredos) para extrair, server-side,
 * o CNPJ do titular de um certificado X.509 ICP-Brasil e classificar o tipo de
 * titular (PJ vs PF/e-CPF).
 *
 * Precedência adotada (fail-closed):
 *   1. SubjectAlternativeName / otherName OID 2.16.76.1.3.3 — CNPJ da pessoa
 *      jurídica titular (fonte oficial ICP-Brasil, DOC-ICP-04).
 *   2. Subject serialNumber (OID 2.5.4.5) quando contiver exatamente 14 dígitos.
 *   3. Subject CN no padrão ICP-Brasil de PJ "RAZAO SOCIAL:CNPJ" (sufixo
 *      `:` + 14 dígitos). Nunca uma sequência solta de 14 dígitos.
 *
 * Se apenas o otherName de pessoa física (2.16.76.1.3.1 — e-CPF) estiver
 * presente, o titular é PF e é REJEITADO para emissão PJ.
 *
 * Nenhum CNPJ é registrado em log; quem consome deve devolver apenas os códigos
 * estáveis exportados aqui.
 */
import { validateCnpjAlpha } from "./cnpj.ts";

/** OID 2.16.76.1.3.3 (CNPJ da PJ titular) em DER: 06 05 60 4C 01 03 03. */
const OID_PJ_CNPJ = [0x06, 0x05, 0x60, 0x4c, 0x01, 0x03, 0x03];
/** OID 2.16.76.1.3.1 (dados do titular e-CPF) em DER: 06 05 60 4C 01 03 01. */
const OID_PF_HOLDER = [0x06, 0x05, 0x60, 0x4c, 0x01, 0x03, 0x01];
/** OID 2.16.76.1.3.4 (dados do responsável do e-CNPJ, contém CPF). */
const OID_PJ_RESPONSIBLE = [0x06, 0x05, 0x60, 0x4c, 0x01, 0x03, 0x04];

export type CertHolderErrorCode =
  | "CERT_CNPJ_NOT_FOUND"
  | "CERT_CNPJ_INVALID"
  | "CERT_HOLDER_IS_INDIVIDUAL";

export type CertHolderResult =
  | { ok: true; cnpj: string; source: "san_icp_pj" | "subject_serial_number" | "subject_cn" }
  | { ok: false; code: CertHolderErrorCode };

export interface CertHolderInput {
  /** Bytes DER do valor da extensão subjectAltName (quando disponível). */
  sanBytes?: Uint8Array | null;
  /** CN do subject. */
  subjectCn?: string | null;
  /** serialNumber do subject (OID 2.5.4.5). */
  subjectSerialNumber?: string | null;
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

function indexOfSeq(hay: Uint8Array, needle: number[], from = 0): number {
  outer: for (let i = from; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Lê o TLV imediatamente após `pos`, aceitando um wrapper [0] EXPLICIT. */
function readTaggedAscii(bytes: Uint8Array, pos: number): string | null {
  let p = pos;
  for (let depth = 0; depth < 3 && p + 2 <= bytes.length; depth++) {
    const tag = bytes[p];
    let len = bytes[p + 1];
    let hdr = 2;
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n === 0 || n > 4 || p + 2 + n > bytes.length) return null;
      len = 0;
      for (let i = 0; i < n; i++) len = len * 256 + bytes[p + 2 + i];
      hdr = 2 + n;
    }
    if (p + hdr + len > bytes.length) return null;
    // Tags de conteúdo textual/octeto: retorna o conteúdo.
    if (tag === 0x04 || tag === 0x0c || tag === 0x13 || tag === 0x16 || tag === 0x12) {
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[p + hdr + i]);
      return s;
    }
    // Wrapper construído ([0], SEQUENCE): desce um nível.
    if ((tag & 0x20) !== 0 || (tag & 0xc0) === 0x80) {
      p = p + hdr;
      continue;
    }
    return null;
  }
  return null;
}

export interface IcpBrasilSanFields {
  pjCnpj?: string;
  hasPfHolder: boolean;
  hasPjResponsible: boolean;
}

/** Varre o subjectAltName procurando os otherName ICP-Brasil relevantes. */
export function extractIcpBrasilSanFields(sanBytes: Uint8Array | null | undefined): IcpBrasilSanFields {
  const out: IcpBrasilSanFields = { hasPfHolder: false, hasPjResponsible: false };
  if (!sanBytes || sanBytes.length === 0) return out;

  const pj = indexOfSeq(sanBytes, OID_PJ_CNPJ);
  if (pj >= 0) {
    const raw = readTaggedAscii(sanBytes, pj + OID_PJ_CNPJ.length);
    if (raw) {
      const digits = onlyDigits(raw);
      if (digits.length === 14) out.pjCnpj = digits;
    }
  }
  out.hasPfHolder = indexOfSeq(sanBytes, OID_PF_HOLDER) >= 0;
  out.hasPjResponsible = indexOfSeq(sanBytes, OID_PJ_RESPONSIBLE) >= 0;
  return out;
}

/**
 * Resolve o CNPJ do titular. Fail-closed: sem CNPJ inequívoco e válido,
 * retorna código estável de rejeição.
 */
export function resolveCertificateHolderCnpj(input: CertHolderInput): CertHolderResult {
  const san = extractIcpBrasilSanFields(input.sanBytes);

  // 1) Fonte oficial ICP-Brasil.
  if (san.pjCnpj) {
    return validateCnpjAlpha(san.pjCnpj)
      ? { ok: true, cnpj: san.pjCnpj, source: "san_icp_pj" }
      : { ok: false, code: "CERT_CNPJ_INVALID" };
  }

  // Titular é pessoa física (e-CPF) e não há CNPJ de PJ => rejeita.
  if (san.hasPfHolder && !san.hasPjResponsible) {
    return { ok: false, code: "CERT_HOLDER_IS_INDIVIDUAL" };
  }

  // 2) Subject serialNumber com exatamente 14 dígitos.
  const sn = onlyDigits(String(input.subjectSerialNumber ?? ""));
  if (sn.length === 14) {
    return validateCnpjAlpha(sn)
      ? { ok: true, cnpj: sn, source: "subject_serial_number" }
      : { ok: false, code: "CERT_CNPJ_INVALID" };
  }

  // 3) CN no padrão PJ "RAZAO SOCIAL:CNPJ".
  const cn = String(input.subjectCn ?? "").trim();
  const m = /:\s*(\d{14})\s*$/.exec(cn);
  if (m) {
    return validateCnpjAlpha(m[1])
      ? { ok: true, cnpj: m[1], source: "subject_cn" }
      : { ok: false, code: "CERT_CNPJ_INVALID" };
  }

  // CN de e-CPF costuma trazer ":" + 11 dígitos (CPF) => PF explícita.
  if (/:\s*\d{11}\s*$/.test(cn)) {
    return { ok: false, code: "CERT_HOLDER_IS_INDIVIDUAL" };
  }

  return { ok: false, code: "CERT_CNPJ_NOT_FOUND" };
}
