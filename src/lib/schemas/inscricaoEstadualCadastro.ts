import { z } from "zod";
import { validateIE } from "@/lib/fiscal/ie";

// Cadastro não certifica DV/UF: mantém limites sintáticos sem máscara destrutiva.
export const inscricaoEstadualCadastroSchema = z.string().trim().max(20, "Inscrição estadual deve ter no máximo 20 caracteres")
  .refine((value) => !value || /^[A-Za-z0-9./ -]+$/.test(value), "Use letras, números, espaços, pontos, barras ou hífens")
  .refine((value) => !value || /[A-Za-z0-9]/.test(value), "Informe a inscrição estadual ou ISENTO");

export function normalizeInscricaoEstadualCadastro(value: string | null | undefined): string | null {
  const raw = inscricaoEstadualCadastroSchema.parse(value ?? "");
  return raw ? raw.replace(/[./ -]/g, "").toUpperCase() : null;
}

export function inscricaoEstadualCadastroWarning(uf: string | null | undefined, value: string): string | null {
  if (!inscricaoEstadualCadastroSchema.safeParse(value).success) return null;
  const result = validateIE(uf, value, { allowIsento: true });
  return result.ok ? null : "Confira a inscrição estadual e a UF. Essa divergência não impede o cadastro.";
}