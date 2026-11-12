import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, cleanup } from "@testing-library/react";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";
import { buildUpdatePayload, rowToFormValues, companyFiscalFormSchema, ALLOWED_STATUSES } from "@/lib/fiscal/companyFiscalValidation";
import type { CompanyFiscalRow } from "@/hooks/useFiscalCompanySettings";

const actor = vi.hoisted(() => ({ role: "administrador", roles: ["administrador"], user: { id: "actor-a" }, profile: { user_id: "actor-a", organization_id: "org-a", ativo: true }, loading: false, authzReady: true, authzEpoch: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => actor }));
vi.mock("@/components/fiscal/FiscalCatalogCombobox", () => ({ default: () => null }));
vi.mock("@/components/fiscal/NatureOperationCombobox", () => ({ default: () => null }));
vi.mock("@/components/fiscal/CompanyCnaeFields", () => ({ CompanyCnaeFields: () => null, default: () => null }));
vi.mock("@/components/fiscal/CnpjLookupButton", () => ({ CnpjLookupButton: () => null }));
vi.mock("@/components/fiscal/certificados/CertificadoDigitalSecao", () => ({ default: () => null }));
vi.mock("@/components/fiscal/homologacao/HomologacaoSecao", () => ({ default: () => null }));
vi.mock("@/components/fiscal/RtcCompanyCard", () => ({ RtcCompanyCard: () => null }));
import FiscalEmpresa from "@/pages/configuracoes/FiscalEmpresa";

let row: CompanyFiscalRow;
let writes: Array<{ url: URL; body: Record<string, unknown> }>;
let failure: string | null;
let requests: string[];
const fixture = (): CompanyFiscalRow => ({
  id: "fiscal-a", organization_id: "org-a", legal_name: "AR Bio FICTÍCIA — SEM USO FISCAL",
  cnpj: "11222333000181", state_registration: "ISENTO", configuration_status: "DRAFT", configuration_version: 7,
  fiscal_environment: "HOMOLOGATION", fiscal_provider: "NONE", nfe_enabled: false, nfse_enabled: false,
  production_enabled: false, accounting_validated_at: null, is_active: true,
} as CompanyFiscalRow);

beforeEach(() => {
  row = fixture(); writes = []; requests = []; failure = null;
  Object.assign(actor, { role: "administrador", roles: ["administrador"], user: { id: "actor-a" }, profile: { user_id: "actor-a", organization_id: "org-a", ativo: true }, authzEpoch: 0 });
  // Canonical SDK and actual hook remain real; only fetch is replaced. No network is permitted.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    requests.push(url.pathname);
    expect(url.hostname).toBe("swzpzcwiasxmjutrmvkm.supabase.co");
    if (url.pathname !== "/rest/v1/company_fiscal_settings") throw new Error("UNEXPECTED_NETWORK_PATH");
    const method = init?.method ?? "GET";
    const tenant = url.searchParams.get("organization_id");
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      writes.push({ url, body });
      if (failure) return new Response(JSON.stringify({ code: failure, message: "Synthetic rejection" }), { status: 400, headers: { "content-type": "application/json" } });
      if (tenant !== `eq.${row.organization_id}` || url.searchParams.get("id") !== `eq.${row.id}` || url.searchParams.get("configuration_version") !== `eq.${row.configuration_version}`) return new Response("null", { headers: { "content-type": "application/json" } });
      row = { ...row, ...body } as CompanyFiscalRow;
    }
    return new Response(JSON.stringify(tenant === `eq.${row.organization_id}` ? row : null), { headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const open = () => renderWithProviders(<FiscalEmpresa />, { route: "/configuracoes/fiscal/empresa" });
const form = async () => { await screen.findByTestId("fiscal-empresa-page"); await waitFor(() => expect(screen.getByLabelText("Razão social")).toHaveValue(row.legal_name)); };

describe("Contrato canônico de salvamento sem validação contábil", () => {
  it("AR Bio salva declaração MG, mantém SP/metadados e null; reabre sem atestado fictício", async () => {
    Object.assign(row, { tax_regime: "LUCRO_PRESUMIDO", crt: "3", configuration_status: "PENDING_ACCOUNTING", pis_cofins_regime: null, uf_accreditations: [{ uf: "SP", accredited: true, note: "preservar" }, { uf: "MG", accredited: false, evidence_ref: "original" }] });
    const mounted = open(); await form();
    expect(screen.getByLabelText("Regime de PIS/COFINS")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("UF do credenciamento"), { target: { value: "MG" } });
    fireEvent.change(screen.getByLabelText("Aptidão declarada"), { target: { value: "yes" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar declaração" }));
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(row.configuration_version).toBe(8));
    expect(writes[0]?.body.uf_accreditations).toEqual([{ uf: "SP", accredited: true, note: "preservar" }, { uf: "MG", accredited: true, evidence_ref: "original" }]);
    expect(row.pis_cofins_regime).toBeNull(); expect(row.configuration_status).toBe("PENDING_ACCOUNTING");
    expect(row.accounting_validated_at).toBeNull();
    mkdirSync("scripts/fiscal-company-save-20261112/evidence/accreditations", { recursive: true });
    writeFileSync("scripts/fiscal-company-save-20261112/evidence/accreditations/payload.json", JSON.stringify(writes[0]?.body, null, 2) + "\n");
    mounted.unmount(); open(); await form();
    expect(screen.getByLabelText("Regime de PIS/COFINS")).toHaveValue("");
    expect(row.uf_accreditations).toEqual(writes[0]?.body.uf_accreditations);
  });
  it("conflito mantém declaração e regime explicitamente escolhido sem rebase ou retry", async () => {
    Object.assign(row, { pis_cofins_regime: null, uf_accreditations: [{ uf: "SP", accredited: true }] });
    const mounted = open(); await form(); failure = "PT409";
    fireEvent.change(screen.getByLabelText("Regime de PIS/COFINS"), { target: { value: "MISTO" } });
    fireEvent.change(screen.getByLabelText("UF do credenciamento"), { target: { value: "MG" } });
    fireEvent.change(screen.getByLabelText("Aptidão declarada"), { target: { value: "yes" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar declaração" }));
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(writes).toHaveLength(1));
    row = { ...row, configuration_version: 9, pis_cofins_regime: "CUMULATIVO", uf_accreditations: [{ uf: "RJ", accredited: true }] };
    await mounted.client.invalidateQueries({ queryKey: ["fiscal", "company", "settings"] });
    expect(screen.getByLabelText("Regime de PIS/COFINS")).toHaveValue("MISTO");
    expect(writes).toHaveLength(1);
    failure = null; fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]?.url.searchParams.get("configuration_version")).toBe("eq.7");
    expect(writes[1]?.body.uf_accreditations).toEqual([{ uf: "SP", accredited: true }, { uf: "MG", accredited: true }]);
    expect(row.uf_accreditations).toEqual([{ uf: "RJ", accredited: true }]);
  });
  it("aceita exatamente os quatro estados informados e rejeita o valor causador", () => {
    expect(ALLOWED_STATUSES).toEqual(["DRAFT", "PENDING_ACCOUNTING", "VALIDATED", "BLOCKED"]);
    expect(companyFiscalFormSchema.safeParse({ configuration_status: "READY_FOR_HOMOLOGATION" }).success).toBe(false);
  });
  for (const status of ["DRAFT", "PENDING_ACCOUNTING", "VALIDATED", "BLOCKED"] as const) {
    it(`reabre ${status}, salva dados e mantém a revisão sem promover emissão`, async () => {
      row.configuration_status = status;
      row.accounting_validated_at = status === "VALIDATED" ? "2026-11-01T00:00:00Z" : null;
      const first = open(); await form();
      expect(screen.getByLabelText("Status de configuração")).toHaveValue(status);
      expect(screen.getByLabelText("Status de configuração")).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Razão social"), { target: { value: "AR Bio FICTÍCIA revisada" } });
      fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
      await waitFor(() => expect(row.configuration_version).toBe(8));
      expect(row.configuration_status).toBe(status);
      expect(row.accounting_validated_at).toBe(status === "VALIDATED" ? "2026-11-01T00:00:00Z" : null);
      expect(writes[0]?.body).not.toHaveProperty("configuration_status");
      expect(writes[0]?.body).not.toHaveProperty("accounting_validated_at");
      expect(writes[0]?.body).not.toHaveProperty("production_enabled");
      mkdirSync("scripts/fiscal-company-save-20261112/evidence/payloads", { recursive: true });
      writeFileSync(`scripts/fiscal-company-save-20261112/evidence/payloads/${status}.json`, JSON.stringify(writes[0]?.body, null, 2) + "\n");
      expect(row.nfe_enabled).toBe(false); expect(row.nfse_enabled).toBe(false);
      first.unmount(); open(); await form();
      expect(screen.getByLabelText("Razão social")).toHaveValue("AR Bio FICTÍCIA revisada");
      expect(requests.every((path) => path === "/rest/v1/company_fiscal_settings")).toBe(true);
    });
  }
  it("payload não concede revisão mesmo que adulterado e mantém todos os campos preparatórios", () => {
    const payload = buildUpdatePayload({ ...rowToFormValues(row), configuration_status: "VALIDATED", nfse_enabled: true, phone: "123", street: "Rua fictícia", configuration_notes: "rascunho", nfe_configuration: { custom: "preservado" } });
    expect(payload).not.toHaveProperty("configuration_status");
    expect(payload).toMatchObject({ phone: "123", street: "Rua fictícia", configuration_notes: "rascunho", nfe_configuration: { custom: "preservado" }, nfse_enabled: false, nfe_enabled: false });
  });
  for (const code of ["23514", "42501", "PT409"]) {
    it(`erro ${code} e refetch não perdem rascunho/revisão observada`, async () => {
      const mounted = open(); await form(); failure = code;
      fireEvent.change(screen.getByLabelText("Razão social"), { target: { value: "AR Bio rascunho retido" } });
      fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
      await waitFor(() => expect(writes).toHaveLength(1));
      row = { ...row, configuration_version: 9, legal_name: "alteração outra sessão" };
      await mounted.client.invalidateQueries({ queryKey: ["fiscal", "company", "settings"] });
      expect(screen.getByLabelText("Razão social")).toHaveValue("AR Bio rascunho retido");
      failure = null; fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
      await waitFor(() => expect(writes).toHaveLength(2));
      expect(writes[1]?.url.searchParams.get("configuration_version")).toBe("eq.7");
      expect(row.legal_name).toBe("alteração outra sessão");
    });
  }
  it("outro tenant não recebe configuração nem pode salvar rascunho anterior", async () => {
    Object.assign(row, { uf_accreditations: [{ uf: "MG", accredited: true }], pis_cofins_regime: null });
    const mounted = open(); await form();
    fireEvent.change(screen.getByLabelText("Razão social"), { target: { value: "rascunho A" } });
    actor.profile = { ...actor.profile, organization_id: "org-b" }; actor.authzEpoch += 1;
    mounted.rerender(<FiscalEmpresa />);
    await screen.findByTestId("fiscal-empresa-empty");
    expect(screen.queryByDisplayValue("rascunho A")).toBeNull();
    expect(screen.queryByLabelText("UF do credenciamento")).toBeNull();
    expect(writes).toHaveLength(0);
  });
  it("regime escolhido explicitamente pode voltar a null sem apagar credenciamentos", async () => {
    Object.assign(row, { pis_cofins_regime: "CUMULATIVO", uf_accreditations: [{ uf: "MG", accredited: true }] });
    open(); await form();
    fireEvent.change(screen.getByLabelText("Regime de PIS/COFINS"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(row.configuration_version).toBe(8));
    expect(row.pis_cofins_regime).toBeNull();
    expect(row.uf_accreditations).toEqual([{ uf: "MG", accredited: true }]);
  });
  for (const role of ["financeiro", "gestor", "gestor_comercial", "consultor_tecnico"]) {
    it(`${role} não despacha salvamento`, async () => {
      actor.role = role; actor.roles = [role]; open();
      if (["financeiro", "gestor"].includes(role)) await form();
      else await screen.findByTestId("fiscal-empresa-forbidden");
      expect(screen.queryByTestId("fiscal-empresa-save")).toBeNull();
      expect(writes).toHaveLength(0);
    });
  }
});