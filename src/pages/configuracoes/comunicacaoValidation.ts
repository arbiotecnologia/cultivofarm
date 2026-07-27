import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(255);
const e164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Telefone deve estar em E.164 (ex.: +5511999999999)");

export function parseCsv(v: string): string[] {
  return v.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

export function validateEmailsCsv(raw: string): { ok: true; value: string[] } | { ok: false; error: string } {
  const list = parseCsv(raw);
  if (list.length === 0) return { ok: false, error: "Informe ao menos um e-mail." };
  if (list.length > 100) return { ok: false, error: "Máximo de 100 e-mails por atualização." };
  const invalid: string[] = [];
  const parsed: string[] = [];
  for (const item of list) {
    const r = emailSchema.safeParse(item);
    if (!r.success) invalid.push(item);
    else parsed.push(r.data);
  }
  if (invalid.length > 0) return { ok: false, error: `E-mails inválidos: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}` };
  return { ok: true, value: Array.from(new Set(parsed)) };
}

export function validatePhonesCsv(raw: string): { ok: true; value: string[] } | { ok: false; error: string } {
  const list = parseCsv(raw);
  if (list.length === 0) return { ok: false, error: "Informe ao menos um telefone." };
  if (list.length > 100) return { ok: false, error: "Máximo de 100 telefones por atualização." };
  const invalid: string[] = [];
  for (const item of list) if (!e164Schema.safeParse(item).success) invalid.push(item);
  if (invalid.length > 0) return { ok: false, error: `Telefones inválidos (use E.164): ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}` };
  return { ok: true, value: Array.from(new Set(list)) };
}

export const smtpSchema = z.object({
  host: z.string().trim().min(1, "Host obrigatório").max(253, "Host muito longo"),
  port: z
    .string()
    .trim()
    .min(1, "Porta obrigatória")
    .refine((v) => /^\d+$/.test(v), "Somente números")
    .refine((v) => {
      const n = Number(v);
      return n >= 1 && n <= 65535;
    }, "Porta entre 1 e 65535"),
  user: z.string().trim().min(1, "Usuário obrigatório").max(255),
  from: z.string().trim().email("Remetente deve ser um e-mail válido").max(255),
  password: z.string().max(1024).optional(),
});

export type SmtpFormValues = z.input<typeof smtpSchema>;
export type SmtpFieldErrors = Partial<Record<keyof SmtpFormValues, string>>;

export function whatsappSchemaFor(allowedVersions: string[]) {
  return z.object({
    phone_number_id: z
      .string()
      .trim()
      .min(1, "Phone Number ID obrigatório")
      .regex(/^\d{5,30}$/, "Somente dígitos (5–30)"),
    api_version: z
      .string()
      .trim()
      .min(1, "Versão obrigatória")
      .refine(
        (v) => allowedVersions.length === 0 || allowedVersions.includes(v),
        `Versão deve ser uma das suportadas: ${allowedVersions.join(", ") || "—"}`,
      ),
    access_token: z.string().max(4096).optional(),
  });
}

export type WhatsappFormValues = z.input<ReturnType<typeof whatsappSchemaFor>>;
export type WhatsappFieldErrors = Partial<Record<keyof WhatsappFormValues, string>>;

export const webhookSecretSchema = z
  .string()
  .trim()
  .min(16, "Mínimo de 16 caracteres")
  .max(512, "Máximo de 512 caracteres");

export function zodToFieldErrors<T extends z.ZodTypeAny>(err: z.ZodError<z.infer<T>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
