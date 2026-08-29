/**
 * H7i — Gates estáticos da ingestão segura do certificado A1 (.pfx).
 *
 * Verifica que:
 *  - o repositório ignora material criptográfico (*.pfx, *.p12, *.key…);
 *  - nenhum material sensível está versionado;
 *  - a Edge Function canônica de upload mantém senha apenas em memória,
 *    não a persiste e não a devolve ao cliente;
 *  - o binding de frontend continua apontando para o staging autorizado.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const SENSITIVE_EXT = /\.(pfx|p12|jks|keystore)$/i;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (["node_modules", ".git", "dist", ".lovable"].includes(entry)) continue;
    const rel = `${dir}/${entry}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

describe("H7i — ingestão segura do certificado A1", () => {
  it("gitignore cobre material criptográfico", () => {
    const gi = read(".gitignore");
    for (const pattern of ["*.pfx", "*.p12", "*.key", "*.jks", "*.keystore"]) {
      expect(gi).toContain(pattern);
    }
  });

  it("nenhum arquivo de certificado está presente na árvore do projeto", () => {
    const offenders = walk("src")
      .concat(walk("supabase"), walk("restoration"), walk("scripts"))
      .filter((f) => SENSITIVE_EXT.test(f));
    expect(offenders).toEqual([]);
  });

  it("upload trata a senha apenas em memória e nunca a retorna", () => {
    const fn = read("supabase/functions/fiscal-certificate-upload/index.ts");
    // senha zerada após uso (defesa contra retenção em memória/erro)
    expect(fn).toMatch(/password\s*=\s*""/);
    // nunca ecoada em resposta
    expect(fn).not.toMatch(/password\s*[,:]\s*password/);
    // não é gravada em coluna
    expect(fn).not.toMatch(/encrypted_password|password_iv/);
    // bucket privado canônico + master key server-side
    expect(fn).toContain("fiscal-certificates");
    expect(fn).toContain("FISCAL_CERTIFICATE_MASTER_KEY");
    // admin-only
    expect(fn).toContain("has_role");
  });

  it("binding de frontend permanece no staging autorizado", () => {
    const client = read("src/integrations/supabase/client.ts");
    expect(client).toContain("https://ikaauvsflpmamgxmkhoq.supabase.co");
    expect(client).not.toContain("navfzbwgwzruipouyfnk");
    const toml = read("supabase/config.toml");
    expect(toml).toContain('project_id = "ikaauvsflpmamgxmkhoq"');
  });
});
