export const validateCPF = (cpf: string) => {
  const cleanCPF = cpf.replace(/\D/g, "");
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1+$/.test(cleanCPF)) return false;
  
  let sum = 0;
  let remainder;
  
  for (let i = 1; i <= 9; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;
  
  sum = 0;
  for (let i = 1; i <= 10; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;
  
  return true;
};

import { validateCnpjAlpha, unmaskCnpjAlpha } from "@/lib/fiscal/cnpjAlpha";

/**
 * Fase Fiscal 3.19 — Aceita CNPJ numérico (legado) OU alfanumérico
 * (IN RFB 2.229/2024, vigente a partir de 07/2026). DV segue a regra
 * oficial (ASCII − 48) módulo-11.
 */
export const validateCNPJ = (cnpj: string) => validateCnpjAlpha(cnpj);

export const validateCPF_CNPJ = (val: string) => {
  const cleanCnpj = unmaskCnpjAlpha(val);
  // Se contém letra, só pode ser CNPJ alfanumérico.
  if (/[A-Z]/.test(cleanCnpj)) return validateCnpjAlpha(cleanCnpj);
  const cleanDigits = val.replace(/\D/g, "");
  if (cleanDigits.length === 11) return validateCPF(cleanDigits);
  if (cleanDigits.length === 14) return validateCnpjAlpha(cleanDigits);
  return false;
};

