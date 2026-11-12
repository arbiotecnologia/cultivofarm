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
let history: Array<Record<string, unknown>>;
const fixture = (): CompanyFiscalRow => ({
  id: "fiscal-a", organization_id: "org-a", legal_name: "AR Bio FICTÍCIA — SEM USO FISCAL",
  cnpj: "11222333000181", state_registration: "ISENTO", configuration_status: "DRAFT", configuration_version: 7,
  fiscal_environment: "HOMOLOGATION", fiscal_provider: "NONE", nfe_enabled: false, nfse_enabled: false,
  production_enabled: false, accounting_validated_at: null, is_active: true,
} as CompanyFiscalRow);

beforeEach(() => {
  row = fixture(); writes = []; requests = []; failure = null; history = [];
  Object.assign(actor, { role: "administrador", roles: ["administrador"], user: { id: "actor-a" }, profile: { user_id: "actor-a", organization_id: "org-a", ativo: true }, authzEpoch: 0 });
  // Canonical SDK and actual hook remain real; only fetch is replaced. No network is permitted.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    requests.push(url.pathname);
    expect(url.hostname).toBe("swzpzcwiasxmjutrmvkm.supabase.co");
    if (url.pathname === "/rest/v1/company_fiscal_pis_cofins_history") {
      if ((init?.method ?? "GET") !== "GET") throw new Error("HISTORY_IS_READ_ONLY");
      const ok = url.searchParams.get("organization_id") === `eq.${row.organization_id}`;
      return new Response(JSON.stringify(ok ? history : []), { headers: { "content-type": "application/json" } });
    }
    if (url.pathname !== "/rest/v1/company_fiscal_settings") throw new Error("UNEXPECTED_NETWORK_PATH");
    const method = init?.method ?? "GET";
    const tenant = url.searchParams.get("organization_id");
    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      writes.push({ url, body });
      if (failure) return new Response(JSON.stringify({ code: failure, message: "Synthetic rejection" }), { status: 400, headers: { "content-type": "application/json" } });
      if (tenant !== `eq.${row.organization_id}` || url.searchParams.get("id") !== `eq.${row.id}` || url.searchParams.get("configuration_version") !== `eq.${row.configuration_version}`) return new Response("null", { headers: { "content-type": "application/json" } });
      const prev = row;
      row = { ...row, ...body } as CompanyFiscalRow;
      // Espelha o gatilho: registra só quando regime/data mudam.
      if ("pis_cofins_regime_effective_from" in prev && (prev.pis_cofins_regime !== row.pis_cofins_regime || prev.pis_cofins_regime_effective_from !== row.pis_cofins_regime_effective_from)) {
        history.unshift({ id: `h${history.length}`, old_regime: prev.pis_cofins_regime ?? null, new_regime: row.pis_cofins_regime ?? null, old_effective_from: prev.pis_cofins_regime_effective_from ?? null, new_effective_from: row.pis_cofins_regime_effective_from ?? null, changed_by: "actor-a", changed_at: "2026-11-12T14:00:00Z" });
      }
    }
    return new Response(JSON.stringify(tenant === `eq.${row.organization_id}` ? row : null), { headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const open = () => renderWithProviders(<FiscalEmpresa />, { route: "/configuracoes/fiscal/empresa" });
const form = async () => { await screen.findByTestId("fiscal-empresa-page"); await waitFor(() => expect(screen.getByLabelText("Razão social")).toHaveValue(row.legal_name)); };

describe("Início da vigência PIS/COFINS na aba Empresa", () => {
  it("legado sem coluna: campo desabilitado e PATCH não envia a data", async () => {
    open(); await form();
    expect(screen.getByLabelText("Início da vigência")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Razão social"), { target: { value: "AR Bio FICTÍCIA revisada" } });
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(row.configuration_version).toBe(8));
    expect(writes[0]?.body).not.toHaveProperty("pis_cofins_regime_effective_from");
  });
  it("salva data informada com CAS, reabre e mostra histórico sem duplicar ao salvar igual", async () => {
    Object.assign(row, { pis_cofins_regime: null, pis_cofins_regime_effective_from: null });
    const mounted = open(); await form();
    expect(screen.getByLabelText("Início da vigência")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Regime de PIS/COFINS"), { target: { value: "CUMULATIVO" } });
    fireEvent.change(screen.getByLabelText("Início da vigência"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(row.configuration_version).toBe(8));
    expect(writes[0]?.url.searchParams.get("configuration_version")).toBe("eq.7");
    expect(writes[0]?.body.pis_cofins_regime_effective_from).toBe("2026-01-01");
    expect(row.configuration_status).toBe("DRAFT");
    mounted.unmount(); open(); await form();
    expect(screen.getByLabelText("Início da vigência")).toHaveValue("2026-01-01");
    expect(await screen.findByText("Início da vigência: sem data → 01/01/2026")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Razão social"), { target: { value: "AR Bio FICTÍCIA revisada" } });
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(row.configuration_version).toBe(9));
    expect(history).toHaveLength(1);
  });
});

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
      expect(requests.every((path) => path === "/rest/v1/company_fiscal_settings" || path === "/rest/v1/company_fiscal_pis_cofins_history")).toBe(true);
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
describe("Auditoria Central Fiscal — UF, Não informado, legados e botão único", () => {
  it("UF única abre selecionada com situação salva; false ≠ ausente", async () => {
    Object.assign(row, { uf_accreditations: [{ uf: "MG", accredited: false, meta: "x" }] });
    open(); await form();
    expect(screen.getByLabelText("UF do credenciamento")).toHaveValue("MG");
    expect(screen.getByLabelText("Aptidão declarada")).toHaveValue("no");
  });
  it("várias UFs: nada pré-selecionado, editar carrega a UF certa, nova UF em branco, pendente até salvar", async () => {
    Object.assign(row, { uf_accreditations: [{ uf: "SP", accredited: true, note: "n" }, { uf: "MG", meta: 1 }] });
    open(); await form();
    expect(screen.getByLabelText("UF do credenciamento")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Editar credenciamento MG" }));
    expect(screen.getByLabelText("Aptidão declarada")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Editar credenciamento SP" }));
    expect(screen.getByLabelText("Aptidão declarada")).toHaveValue("yes");
    fireEvent.change(screen.getByLabelText("UF do credenciamento"), { target: { value: "RJ" } });
    expect(screen.getByLabelText("Aptidão declarada")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Registrar declaração" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("UF do credenciamento"), { target: { value: "SP" } });
    fireEvent.change(screen.getByLabelText("Aptidão declarada"), { target: { value: "no" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar declaração" }));
    expect(screen.getByLabelText("UF do credenciamento")).toHaveValue("SP");
    expect(screen.getByTestId("accreditations-pending")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(row.configuration_version).toBe(8));
    expect(writes[0]?.body.uf_accreditations).toEqual([{ uf: "SP", accredited: false, note: "n" }, { uf: "MG", meta: 1 }]);
    await waitFor(() => expect(screen.queryByTestId("accreditations-pending")).toBeNull());
    expect(screen.getByLabelText("UF do credenciamento")).toHaveValue("SP");
  });
  it("selects opcionais mostram Não informado; salvar outro campo preserva zero, legado numérico, null e ausência", async () => {
    Object.assign(row, { country_code: null, nfe_configuration: { presence_indicator: 1, freight_modality: "0", danfe_layout: "LEGADO_X", default_finality: null }, nfse_configuration: { iss_rate: 0, rps_type: 7 } });
    open(); await form();
    expect(screen.getByLabelText("Código do país")).toHaveValue("");
    fireEvent.click(screen.getByRole("tab", { name: "NF-e" }));
    expect(await screen.findByLabelText("Modo de numeração")).toHaveValue("");
    expect(screen.getByLabelText("Modo de contingência")).toHaveValue("");
    expect(screen.getByLabelText("Indicador de presença")).toHaveValue("1");
    expect(screen.getByLabelText("Modalidade de frete")).toHaveValue("0");
    expect(screen.getByLabelText("Layout DANFE")).toHaveValue("LEGADO_X");
    expect(screen.getByRole("switch", { name: "Consumidor final padrão" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "NFS-e" }));
    expect(await screen.findByLabelText("Tipo RPS")).toHaveValue("7");
    expect(screen.getByLabelText("Regime especial de tributação")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Série RPS"), { target: { value: "A1" } });
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body.nfe_configuration).toEqual({ presence_indicator: 1, freight_modality: "0", danfe_layout: "LEGADO_X", default_finality: null });
    expect(writes[0]?.body.nfse_configuration).toEqual({ iss_rate: 0, rps_type: 7, rps_series: "A1" });
    expect(writes[0]?.body).not.toHaveProperty("country_code");
  });
  it("Não informado remove só a chave escolhida", async () => {
    Object.assign(row, { nfe_configuration: { presence_indicator: "2", contingency_mode: "DISABLED" } });
    open(); await form();
    fireEvent.click(screen.getByRole("tab", { name: "NF-e" }));
    fireEvent.change(await screen.findByLabelText("Indicador de presença"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("fiscal-empresa-save"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body.nfe_configuration).toEqual({ contingency_mode: "DISABLED" });
  });
  it("botão único só em Empresa/NF-e/NFS-e/Integração", async () => {
    open(); await form();
    expect(screen.queryByTestId("fiscal-empresa-save-draft")).toBeNull();
    for (const [name, visible] of [["NF-e", true], ["NFS-e", true], ["Integração e segurança", true], ["Reforma Tributária 2026", false], ["Certificado digital", false], ["Revisão", false], ["Empresa", true]] as const) {
      fireEvent.click(screen.getByRole("tab", { name }));
      await waitFor(() => expect(!!screen.queryByTestId("fiscal-empresa-save")).toBe(visible));
    }
  });
});
