import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { canEnableNfseHomologationSend, nfseHomologationSendBlockers } from "@/lib/fiscal/nfseHomologationSend";
import { buildUpdatePayload, rowToFormValues } from "@/lib/fiscal/companyFiscalValidation";
import type { CompanyFiscalRow } from "@/hooks/useFiscalCompanySettings";

const actor = vi.hoisted(() => ({ role: "administrador", roles: ["administrador"], user: { id: "actor-a" }, profile: { user_id: "actor-a", organization_id: "org-a", ativo: true }, loading: false, authzReady: true, authzEpoch: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => actor }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: true, scope: "s", capture: () => () => true }) }));
import { useSetNfseHomologationSend } from "@/hooks/useFiscalCompanySettings";

const eligible = (): CompanyFiscalRow => ({
  id: "fiscal-a", organization_id: "org-a", configuration_version: 3, fiscal_environment: "HOMOLOGATION",
  nfse_provider: "NFSE_NACIONAL", nfse_configuration: { environment: "HOMOLOGATION", enabled_for_preparation: false },
  production_enabled: false, nfse_credential_ref: "ref-ficticia", nfse_enabled: false, is_active: true,
} as unknown as CompanyFiscalRow);

let dbRow: CompanyFiscalRow;
let patches: Array<Record<string, unknown>>;

function matches(row: Record<string, unknown>, url: URL): boolean {
  for (const [k, v] of url.searchParams) {
    if (k === "select") continue;
    const val = k === "nfse_configuration->>environment" ? (row.nfse_configuration as Record<string, unknown>)?.environment : row[k];
    const s = val === null || val === undefined ? null : String(val);
    if (v.startsWith("eq.") && s !== v.slice(3)) return false;
    if (v.startsWith("neq.") && s === v.slice(4)) return false;
    if (v === "not.is.null" && s === null) return false;
  }
  return true;
}

beforeEach(() => {
  dbRow = eligible(); patches = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    expect(url.hostname).toBe("swzpzcwiasxmjutrmvkm.supabase.co");
    if (url.pathname !== "/rest/v1/company_fiscal_settings" || init?.method !== "PATCH") throw new Error("UNEXPECTED");
    const body = JSON.parse(String(init.body));
    patches.push(body);
    if (!matches(dbRow as unknown as Record<string, unknown>, url)) return new Response("null", { headers: { "content-type": "application/json" } });
    dbRow = { ...dbRow, ...body };
    return new Response(JSON.stringify(dbRow), { headers: { "content-type": "application/json" } });
  }));
});

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

describe("Envio de NFS-e em homologação", () => {
  it("elegível só com NFSE_NACIONAL, ambientes HOMOLOGATION, produção off e referência", () => {
    expect(canEnableNfseHomologationSend(eligible())).toBe(true);
    expect(nfseHomologationSendBlockers({ ...eligible(), nfse_provider: "MUNICIPAL" })).toEqual(["provider_not_nfse_nacional"]);
    expect(nfseHomologationSendBlockers({ ...eligible(), fiscal_environment: "PRODUCTION" })).toEqual(["fiscal_environment_not_homologation"]);
    expect(nfseHomologationSendBlockers({ ...eligible(), nfse_configuration: { environment: "PRODUCTION" } })).toEqual(["nfse_environment_not_homologation"]);
    expect(nfseHomologationSendBlockers({ ...eligible(), production_enabled: true })).toEqual(["production_enabled"]);
    expect(nfseHomologationSendBlockers({ ...eligible(), nfse_credential_ref: " " })).toEqual(["credential_ref_missing"]);
  });

  it("enabled_for_preparation não libera envio", () => {
    const r = { ...eligible(), nfse_configuration: { enabled_for_preparation: true } };
    expect(canEnableNfseHomologationSend(r)).toBe(false);
  });

  it("salvamento geral nunca liga e desliga se deixar de ser elegível", () => {
    const v = rowToFormValues(eligible());
    expect(buildUpdatePayload({ ...v, nfse_enabled: true }, v)).not.toHaveProperty("nfse_enabled");
    expect(buildUpdatePayload({ ...v, nfse_provider: "MUNICIPAL" }, v).nfse_enabled).toBe(false);
  });

  it("liga com CAS e grava apenas nfse_enabled/versão", async () => {
    const { result } = renderHook(() => useSetNfseHomologationSend(), { wrapper });
    const saved = await result.current.mutateAsync({ id: "fiscal-a", expectedVersion: 3, enabled: true, savedRow: eligible() });
    expect(saved.nfse_enabled).toBe(true);
    expect(patches).toEqual([{ nfse_enabled: true, configuration_version: 4 }]);
    expect(dbRow.nfse_credential_ref).toBe("ref-ficticia");
  });

  it("banco recusa quando a linha salva diverge do estado local", async () => {
    dbRow = { ...eligible(), fiscal_environment: "PRODUCTION" } as CompanyFiscalRow;
    const { result } = renderHook(() => useSetNfseHomologationSend(), { wrapper });
    await expect(result.current.mutateAsync({ id: "fiscal-a", expectedVersion: 3, enabled: true, savedRow: eligible() })).rejects.toThrow("conflict");
    expect(dbRow.nfse_enabled).toBe(false);
  });

  it("não envia requisição quando a linha salva é inelegível", async () => {
    const { result } = renderHook(() => useSetNfseHomologationSend(), { wrapper });
    await expect(result.current.mutateAsync({ id: "fiscal-a", expectedVersion: 3, enabled: true, savedRow: { ...eligible(), production_enabled: true } as CompanyFiscalRow })).rejects.toThrow("not_eligible");
    expect(patches).toHaveLength(0);
  });

  it("desligar é sempre permitido", async () => {
    dbRow = { ...eligible(), nfse_enabled: true, production_enabled: true } as CompanyFiscalRow;
    const { result } = renderHook(() => useSetNfseHomologationSend(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    const saved = await result.current.mutateAsync({ id: "fiscal-a", expectedVersion: 3, enabled: false, savedRow: dbRow });
    expect(saved.nfse_enabled).toBe(false);
  });
});
