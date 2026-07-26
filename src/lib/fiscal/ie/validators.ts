/**
 * Validação sintática e por dígito verificador (DV) de Inscrição Estadual
 * das 27 UFs brasileiras. Baseado nos algoritmos publicados pelas SEFAZ
 * (Convênio ICMS 57/95 + normas específicas). Aceita o literal "ISENTO"
 * quando `allowIsento: true`.
 *
 * Retorno: discriminated union para uso direto em formulários.
 */
import { IE_PATTERNS } from "./patterns";

export type IEValidationResult =
  | { ok: true; value: string | null; error?: never }
  | { ok: false; value?: never; error: string };

export interface ValidateIEOptions {
  allowIsento?: boolean;
  required?: boolean;
  fieldLabel?: string;
}

const isNumeric = (s: string) => /^\d+$/.test(s);

/** Cálculo de DV módulo 11 com pesos arbitrários. Retorna 0 quando resto ≤ 1. */
function mod11(digits: number[], weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += (digits[i] ?? 0) * weights[i];
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** Extrai dígitos de string curta. */
const D = (s: string): number[] => s.split("").map((c) => Number(c));

// ---------------------- Algoritmos por UF ----------------------

function vAC(ie: string): boolean {
  if (ie.length !== 13 || ie.slice(0, 2) !== "01") return false;
  const d = D(ie);
  const w1 = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv1 = mod11(d.slice(0, 11), w1);
  if (dv1 !== d[11]) return false;
  return mod11(d.slice(0, 12), w2) === d[12];
}

function vAL(ie: string): boolean {
  if (ie.length !== 9 || ie.slice(0, 2) !== "24") return false;
  const d = D(ie);
  const w = [9, 8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 8; i++) s += d[i] * w[i];
  let dv = (s * 10) % 11;
  if (dv === 10) dv = 0;
  return dv === d[8];
}

function vAP(ie: string): boolean {
  if (ie.length !== 9 || ie.slice(0, 2) !== "03") return false;
  const d = D(ie);
  const w = [9, 8, 7, 6, 5, 4, 3, 2];
  const n = parseInt(ie.slice(0, 8), 10);
  let p = 0;
  let dAdd = 0;
  if (n >= 3000001 && n <= 3017000) { p = 5; dAdd = 0; }
  else if (n >= 3017001 && n <= 3019022) { p = 9; dAdd = 1; }
  else { p = 0; dAdd = 0; }
  let s = p;
  for (let i = 0; i < 8; i++) s += d[i] * w[i];
  const r = s % 11;
  let dv = 11 - r;
  if (dv === 10) dv = 0;
  if (dv === 11) dv = dAdd;
  return dv === d[8];
}

function vAM(ie: string): boolean {
  if (ie.length !== 9) return false;
  const d = D(ie);
  const w = [9, 8, 7, 6, 5, 4, 3, 2];
  return mod11(d.slice(0, 8), w) === d[8];
}

function vBA(ie: string): boolean {
  if (ie.length !== 8 && ie.length !== 9) return false;
  const d = D(ie);
  // Determina módulo por segundo (8 dígitos) ou terceiro (9 dígitos) dígito.
  const chk = ie.length === 8 ? ie[0] : ie[1];
  const mod = /[0-6]/.test(chk) ? 10 : 11;
  const w2Len = ie.length - 1; // pesos p/ DV1
  const w1 = Array.from({ length: w2Len - 1 }, (_, i) => w2Len - i); // pesos DV2 base
  // DV2 é calculado com todos exceto o último; DV1 com todos exceto os dois últimos.
  const w2 = Array.from({ length: ie.length - 2 }, (_, i) => ie.length - 1 - i);
  const w1all = Array.from({ length: ie.length - 1 }, (_, i) => ie.length - i);
  const s2 = w2.reduce((acc, w, i) => acc + w * d[i], 0);
  let dv2 = mod === 10 ? s2 % 10 : (11 - (s2 % 11));
  if (mod === 11 && dv2 >= 10) dv2 = 0;
  if (dv2 !== d[ie.length - 2]) return false;
  const s1 = w1all.reduce((acc, w, i) => acc + w * (i === ie.length - 2 ? dv2 : d[i]), 0);
  let dv1 = mod === 10 ? s1 % 10 : (11 - (s1 % 11));
  if (mod === 11 && dv1 >= 10) dv1 = 0;
  return dv1 === d[ie.length - 1];
}

function vCE(ie: string): boolean {
  if (ie.length !== 9) return false;
  const d = D(ie);
  return mod11(d.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) === d[8];
}

function vDF(ie: string): boolean {
  if (ie.length !== 13) return false;
  const d = D(ie);
  const w1 = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  if (mod11(d.slice(0, 11), w1) !== d[11]) return false;
  return mod11(d.slice(0, 12), w2) === d[12];
}

function vES(ie: string): boolean {
  if (ie.length !== 9) return false;
  const d = D(ie);
  return mod11(d.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) === d[8];
}

function vGO(ie: string): boolean {
  if (ie.length !== 9) return false;
  if (!["10", "11", "15"].includes(ie.slice(0, 2))) return false;
  const d = D(ie);
  const s = [9, 8, 7, 6, 5, 4, 3, 2].reduce((a, w, i) => a + w * d[i], 0);
  const r = s % 11;
  let dv: number;
  if (r === 0) dv = 0;
  else if (r === 1) {
    const n = parseInt(ie.slice(0, 8), 10);
    dv = n >= 10103105 && n <= 10119997 ? 1 : 0;
  } else dv = 11 - r;
  return dv === d[8];
}

function vMA(ie: string): boolean {
  if (ie.length !== 9 || ie.slice(0, 2) !== "12") return false;
  const d = D(ie);
  return mod11(d.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) === d[8];
}

function vMG(ie: string): boolean {
  if (ie.length !== 13) return false;
  // 1) Insere "0" na 4ª posição (índice 3).
  const base = ie.slice(0, 3) + "0" + ie.slice(3, 11);
  const w = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const p = Number(base[i]) * w[i];
    sum += p >= 10 ? Math.floor(p / 10) + (p % 10) : p;
  }
  const dv1 = ((Math.ceil(sum / 10) * 10) - sum) % 10;
  if (dv1 !== Number(ie[11])) return false;
  const w2 = [3, 2, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  const s2 = w2.reduce((a, x, i) => a + x * Number(ie[i]), 0);
  const r = s2 % 11;
  const dv2 = r < 2 ? 0 : 11 - r;
  return dv2 === Number(ie[12]);
}

function vMS(ie: string): boolean {
  if (ie.length !== 9 || ie.slice(0, 2) !== "28") return false;
  const d = D(ie);
  return mod11(d.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) === d[8];
}

function vMT(ie: string): boolean {
  if (ie.length !== 11) return false;
  const d = D(ie);
  return mod11(d.slice(0, 10), [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === d[10];
}

function vPA(ie: string): boolean {
  if (ie.length !== 9 || ie.slice(0, 2) !== "15") return false;
  const d = D(ie);
  return mod11(d.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) === d[8];
}

function vPB(ie: string): boolean {
  if (ie.length !== 9) return false;
  const d = D(ie);
  let dv = mod11(d.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv === 10) dv = 0;
  return dv === d[8];
}

function vPE(ie: string): boolean {
  if (ie.length !== 9) return false;
  const d = D(ie);
  const w1 = [8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 7; i++) s += d[i] * w1[i];
  let dv1 = 11 - (s % 11);
  if (dv1 > 9) dv1 = 0;
  if (dv1 !== d[7]) return false;
  const w2 = [9, 8, 7, 6, 5, 4, 3, 2];
  let s2 = 0;
  for (let i = 0; i < 8; i++) s2 += d[i] * w2[i];
  let dv2 = 11 - (s2 % 11);
  if (dv2 > 9) dv2 = 0;
  return dv2 === d[8];
}

function vPI(ie: string): boolean {
  if (ie.length !== 9) return false;
  const d = D(ie);
  return mod11(d.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) === d[8];
}

function vPR(ie: string): boolean {
  if (ie.length !== 10) return false;
  const d = D(ie);
  const dv1 = mod11(d.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]);
  if (dv1 !== d[8]) return false;
  const dv2 = mod11(d.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]);
  return dv2 === d[9];
}

function vRJ(ie: string): boolean {
  if (ie.length !== 8) return false;
  const d = D(ie);
  return mod11(d.slice(0, 7), [2, 7, 6, 5, 4, 3, 2]) === d[7];
}

function vRN(ie: string): boolean {
  if ((ie.length !== 9 && ie.length !== 10) || ie.slice(0, 2) !== "20") return false;
  const d = D(ie);
  const bodyLen = ie.length - 1;
  const w = Array.from({ length: bodyLen }, (_, i) => bodyLen + 1 - i);
  let s = 0;
  for (let i = 0; i < bodyLen; i++) s += d[i] * w[i];
  let dv = (s * 10) % 11;
  if (dv === 10) dv = 0;
  return dv === d[bodyLen];
}

function vRO(ie: string): boolean {
  if (ie.length !== 14) return false;
  const d = D(ie);
  const w = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return mod11(d.slice(0, 13), w) === d[13];
}

function vRR(ie: string): boolean {
  if (ie.length !== 9 || ie.slice(0, 2) !== "24") return false;
  const d = D(ie);
  const w = [1, 2, 3, 4, 5, 6, 7, 8];
  const s = w.reduce((a, x, i) => a + x * d[i], 0);
  return (s % 9) === d[8];
}

function vRS(ie: string): boolean {
  if (ie.length !== 10) return false;
  const d = D(ie);
  const w = [2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 9; i++) s += d[i] * w[i];
  const r = s % 11;
  const dv = r < 2 ? 0 : 11 - r;
  return dv === d[9];
}

function vSC(ie: string): boolean {
  if (ie.length !== 9) return false;
  const d = D(ie);
  return mod11(d.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) === d[8];
}

function vSE(ie: string): boolean {
  if (ie.length !== 9) return false;
  const d = D(ie);
  const w = [9, 8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 8; i++) s += d[i] * w[i];
  let dv = 11 - (s % 11);
  if (dv > 9) dv = 0;
  return dv === d[8];
}

function vSPIndustrial(ie: string): boolean {
  if (ie.length !== 12) return false;
  const d = D(ie);
  const w1 = [1, 3, 4, 5, 6, 7, 8, 10];
  let s1 = 0;
  for (let i = 0; i < 8; i++) s1 += d[i] * w1[i];
  const dv1 = s1 % 11 % 10;
  if (dv1 !== d[8]) return false;
  const w2 = [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  let s2 = 0;
  for (let i = 0; i < 11; i++) s2 += d[i] * w2[i];
  const dv2 = s2 % 11 % 10;
  return dv2 === d[11];
}

function vSPProdutor(ieRaw: string): boolean {
  // Formato: P + 8 dígitos + DV + 3 dígitos = 13 caracteres.
  const s = ieRaw.toUpperCase();
  if (!/^P\d{12}$/.test(s)) return false;
  const digits = s.slice(1).split("").map(Number);
  const w = [1, 3, 4, 5, 6, 7, 8, 10];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += digits[i] * w[i];
  const dv = sum % 11 % 10;
  return dv === digits[8];
}

function vTO(ie: string): boolean {
  if (ie.length !== 9 && ie.length !== 11) return false;
  let base: string;
  if (ie.length === 11) {
    const tipo = ie.slice(2, 4);
    if (!["01", "02", "03", "99"].includes(tipo)) return false;
    base = ie.slice(0, 2) + ie.slice(4, 10);
  } else {
    base = ie.slice(0, 8);
  }
  const d = D(base + ie.slice(-1));
  const w = [9, 8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 8; i++) s += d[i] * w[i];
  const r = s % 11;
  const dv = r < 2 ? 0 : 11 - r;
  return dv === Number(ie.slice(-1));
}

const VALIDATORS: Record<string, (ie: string) => boolean> = {
  AC: vAC, AL: vAL, AP: vAP, AM: vAM, BA: vBA, CE: vCE, DF: vDF, ES: vES,
  GO: vGO, MA: vMA, MG: vMG, MS: vMS, MT: vMT, PA: vPA, PB: vPB, PE: vPE,
  PI: vPI, PR: vPR, RJ: vRJ, RN: vRN, RO: vRO, RR: vRR, RS: vRS, SC: vSC,
  SE: vSE, SP: vSPIndustrial, TO: vTO,
};

/**
 * Valida IE conforme UF. Aceita "ISENTO" (case-insensitive) quando
 * `allowIsento: true`. Retorna dígitos normalizados quando válido.
 */
export function validateIE(
  uf: string | null | undefined,
  value: string | null | undefined,
  opts: ValidateIEOptions = {},
): IEValidationResult {
  const label = opts.fieldLabel ?? "Inscrição estadual";
  const raw = String(value ?? "").trim();

  if (raw === "") {
    if (opts.required) return { ok: false, error: `${label} é obrigatória.` };
    return { ok: true, value: null };
  }

  if (opts.allowIsento && raw.toUpperCase() === "ISENTO") {
    return { ok: true, value: "ISENTO" };
  }

  const ufKey = String(uf ?? "").trim().toUpperCase();
  if (!ufKey) {
    return { ok: false, error: `${label}: selecione o Estado (UF) antes de validar.` };
  }

  const pattern = IE_PATTERNS[ufKey];
  const validator = VALIDATORS[ufKey];
  if (!pattern || !validator) {
    return { ok: false, error: `${label}: UF "${ufKey}" não reconhecida.` };
  }

  // SP produtor rural aceita prefixo "P".
  if (ufKey === "SP" && /^P/i.test(raw)) {
    if (!vSPProdutor(raw)) {
      return {
        ok: false,
        error: `${label} inválida para SP (produtor rural). Exemplo: P011004243002.`,
      };
    }
    return { ok: true, value: raw.toUpperCase() };
  }

  const digits = raw.replace(/\D/g, "");
  if (!isNumeric(digits) || !pattern.digits.includes(digits.length)) {
    return {
      ok: false,
      error: `${label} inválida para ${ufKey}: esperado ${pattern.digits.join(" ou ")} dígitos. Ex.: ${pattern.example}.`,
    };
  }

  if (!validator(digits)) {
    return {
      ok: false,
      error: `${label} inválida para ${ufKey} (dígito verificador incorreto). Ex.: ${pattern.example}.`,
    };
  }

  return { ok: true, value: digits };
}
