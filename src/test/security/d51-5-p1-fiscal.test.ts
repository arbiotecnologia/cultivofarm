import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const sefaz = read("supabase/functions/fiscal-sefaz-transport/index.ts");
const xml = read("supabase/functions/fiscal-xml-engine/index.ts");
const upload = read("supabase/functions/fiscal-certificate-upload/index.ts");
const revoke = read("supabase/functions/fiscal-certificate-revoke/index.ts");
const diagnostics = read("supabase/functions/fiscal-binding-diagnostics/index.ts");

describe("D51.5 P1 — isolamento fiscal antes do service role", () => {
  it("valida run, evento e invoice antes de Storage, certificado e transporte", () => {
    expect(sefaz).toContain('admin.rpc("h15_service_actor_run_access"');
    expect(sefaz).toContain('admin.rpc("h15_service_actor_event_access"');
    expect(sefaz).toContain('admin.rpc("h15_service_actor_invoice_access"');
    const authorizeBranch = sefaz.slice(sefaz.indexOf('action === "authorize"'));
    const eventBranch = sefaz.slice(sefaz.indexOf("const eventId ="));
    expect(authorizeBranch.indexOf('h15_service_actor_run_access')).toBeLessThan(authorizeBranch.indexOf('.from("fiscal_xml_runs")'));
    expect(eventBranch.indexOf('h15_service_actor_event_access')).toBeLessThan(eventBranch.indexOf('.from("v_fiscal_sefaz_event_state")'));
  });

  it("protege geração e URL assinada de XML por ownership server-side", () => {
    expect(xml).toContain('admin.rpc("h15_service_actor_run_access"');
    expect(xml).toContain('admin.rpc("h15_service_actor_invoice_access"');
    expect(xml.indexOf('h15_service_actor_run_access')).toBeLessThan(xml.indexOf("createSignedUrl"));
    expect(xml.indexOf('h15_service_actor_invoice_access')).toBeLessThan(xml.indexOf('rpc_fiscal_xml_prepare_v1'));
  });

  it("protege upload e revogação de certificado pela empresa do ator", () => {
    expect(upload).toContain('admin.rpc("h15_service_actor_company_access"');
    expect(upload.indexOf('h15_service_actor_company_access')).toBeLessThan(upload.indexOf('.storage.from("fiscal-certificates")'));
    expect(revoke).toContain('admin.rpc("h15_service_actor_company_access"');
    expect(revoke.indexOf('h15_service_actor_company_access')).toBeLessThan(revoke.indexOf('from("fiscal_certificate_material")'));
  });

  it("não expõe diagnóstico fiscal sem sessão tenant ativa", () => {
    expect(diagnostics).toContain('authed.rpc("h15_actor_organization")');
    expect(diagnostics.indexOf('h15_actor_organization')).toBeLessThan(diagnostics.indexOf('if (req.method === "GET") return json(base'));
  });
});