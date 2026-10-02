import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20261002020825_6f7efb7f-fd4c-4bc1-8dcc-ccec421cd9ed.sql";

const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim();

describe("D51.2-C — bootstrap fail-closed de communication_provider_settings", () => {
  it("insere somente o singleton id=1 e preserva qualquer linha concorrente", () => {
    expect(normalized).toMatch(
      /INSERT INTO public\.communication_provider_settings\s*\([\s\S]+\)\s*VALUES\s*\([\s\S]+\)\s*ON CONFLICT \(id\) DO NOTHING;/i,
    );
    expect(normalized).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it("explicita os defaults fail-closed e não configura provider ou segredo", () => {
    const columnsMatch = normalized.match(
      /INSERT INTO public\.communication_provider_settings\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*ON CONFLICT/is,
    );
    expect(columnsMatch).not.toBeNull();
    if (!columnsMatch) return;

    const columns = columnsMatch[1].split(",").map((value) => value.trim());
    const values = columnsMatch[2].split(",").map((value) => value.trim().toLowerCase());
    expect(values).toHaveLength(columns.length);

    const inserted = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    expect(inserted).toMatchObject({
      id: "1",
      test_mode_enabled: "true",
      delivery_enabled: "false",
      email_delivery_enabled: "false",
      whatsapp_delivery_enabled: "false",
      inapp_delivery_enabled: "false",
      whatsapp_webhook_enabled: "false",
      smtp_host: "null",
      smtp_port: "null",
      smtp_user: "null",
      smtp_from: "null",
      secret_smtp_password: "null",
      updated_by: "null",
    });
    expect(inserted.allowed_emails).toBe("array[]::text[]");
    expect(inserted.allowed_phones).toBe("array[]::text[]");
    expect(inserted.secret_whatsapp_access_token).toBe("null");
    expect(inserted.secret_whatsapp_app_secret).toBe("null");
    expect(inserted.secret_whatsapp_verify_token).toBe("null");
  });

  it("não toca no Vault, em permissões, políticas ou funções", () => {
    expect(normalized).not.toMatch(/\bvault\.|\bGRANT\b|\bREVOKE\b|\bPOLICY\b|\bFUNCTION\b/i);
  });
});