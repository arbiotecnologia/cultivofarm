import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const m = vi.hoisted(() => ({
  invoke: vi.fn(), toast: vi.fn(), sign: vi.fn(),
  auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0 },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => m.auth }));
vi.mock("sonner", () => ({ toast: { error: m.toast, success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: m.invoke },
  storage: { from: () => ({ createSignedUrl: m.sign, createSignedUrls: m.sign }) },
  rpc: vi.fn(),
} }));
vi.mock("@/hooks/useFiscalXmlEngine", async (orig) => {
  const real = await orig<typeof import("@/hooks/useFiscalXmlEngine")>();
  return { ...real,
    useFiscalXmlStatus: () => ({ data: { runs: [run] }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
    useGenerateFiscalXml: () => ({ mutateAsync: vi.fn(), isPending: false }) };
});
const RUN = "22222222-2222-4222-8222-222222222222";
const run = { runId: RUN, runVersion: 1, state: "SIGNED", schemaVersion: "4.00", environmentCode: "2", accessKey: "K",
  payloadSha256: "p", unsignedSha256: "u", signedSha256: "s", hasUnsigned: true, hasSigned: true, validation: {}, signature: {} };
import { GeracaoXmlNfeSecao } from "@/components/fiscal/documentos/GeracaoXmlNfeSecao";
import { loadFiscalXmlArtifact, FISCAL_XML_MAX_BYTES } from "@/hooks/useFiscalXmlEngine";

const click = vi.fn();
beforeEach(() => {
  m.auth.user.id = "A"; m.auth.profile.user_id = "A"; m.auth.profile.organization_id = "OA";
  m.auth.roles = ["administrador"]; m.auth.authzReady = true; m.auth.authzEpoch = 0;
  m.invoke.mockReset().mockResolvedValue({ data: new Blob(["<NFe/>"], { type: "application/octet-stream" }), error: null });
  m.toast.mockReset(); m.sign.mockReset(); click.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:owned") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "open").mockImplementation(() => null);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
});
const btn = () => screen.getByTestId("fiscal-xml-download-signed");

it("prepara bytes autenticados e só entrega Blob no clique explícito, sem URL", async () => {
  render(<GeracaoXmlNfeSecao invoiceId="I" />);
  fireEvent.click(btn());
  await waitFor(() => expect(btn().dataset.ready).toBe("true"));
  expect(m.invoke).toHaveBeenCalledWith("fiscal-xml-engine", expect.objectContaining({ body: { action: "download", run_id: RUN, artifact: "signed" }, signal: expect.any(AbortSignal) }));
  expect(click).not.toHaveBeenCalled();
  fireEvent.click(btn());
  expect(click).toHaveBeenCalledTimes(1);
  expect(window.open).not.toHaveBeenCalled(); expect(m.sign).not.toHaveBeenCalled();
});

it("contrato antigo { url } é indisponível: nunca abre a URL (rollout fail-closed)", async () => {
  m.invoke.mockResolvedValue({ data: { url: "https://legacy.invalid/signed", expiresIn: 120 }, error: null });
  render(<GeracaoXmlNfeSecao invoiceId="I" />);
  fireEvent.click(btn());
  await waitFor(() => expect(m.toast).toHaveBeenCalled());
  expect(btn().dataset.ready).toBe("false");
  expect(window.open).not.toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("403/erro da Edge mostra erro neutro e permite nova tentativa autorizada", async () => {
  m.invoke.mockResolvedValueOnce({ data: null, error: new Error("permission_denied secret-detail") });
  render(<GeracaoXmlNfeSecao invoiceId="I" />);
  fireEvent.click(btn());
  await waitFor(() => expect(m.toast).toHaveBeenCalledWith("Não foi possível preparar o arquivo", { description: "Tente novamente." }));
  fireEvent.click(btn());
  await waitFor(() => expect(btn().dataset.ready).toBe("true"));
  expect(m.invoke).toHaveBeenCalledTimes(2);
});

for (const change of ["tenant", "roles", "epoch", "identity", "lease"] as const) {
  it(`mudança de ${change} durante a leitura aborta e descarta bytes tardios`, async () => {
    let resolve: (v: unknown) => void = () => {};
    let signal: AbortSignal | undefined;
    m.invoke.mockImplementation((_n: string, o: { signal: AbortSignal }) => { signal = o.signal; return new Promise(r => { resolve = r; }); });
    const h = render(<GeracaoXmlNfeSecao invoiceId="I" />);
    fireEvent.click(btn());
    await waitFor(() => expect(m.invoke).toHaveBeenCalled());
    if (change === "tenant") m.auth.profile.organization_id = "OB";
    if (change === "roles") m.auth.roles = ["consultor_tecnico"];
    if (change === "epoch") m.auth.authzEpoch = 1;
    if (change === "identity") { m.auth.user.id = "B"; m.auth.profile.user_id = "B"; }
    if (change === "lease") m.auth.authzReady = false;
    h.rerender(<GeracaoXmlNfeSecao invoiceId="I" />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolve({ data: new Blob(["late"]), error: null }); });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled(); expect(m.toast).not.toHaveBeenCalled();
  });
}

it("revogação após preparo revoga o Blob e bloqueia a entrega", async () => {
  const h = render(<GeracaoXmlNfeSecao invoiceId="I" />);
  fireEvent.click(btn());
  await waitFor(() => expect(btn().dataset.ready).toBe("true"));
  m.auth.profile.organization_id = "OB"; h.rerender(<GeracaoXmlNfeSecao invoiceId="I" />);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned");
  expect(btn().dataset.ready).toBe("false");
  expect(click).not.toHaveBeenCalled();
});

it("loader recusa vazio, acima do limite, chave inválida e sinal abortado", async () => {
  const s = () => new AbortController().signal;
  m.invoke.mockResolvedValueOnce({ data: new Blob([]), error: null });
  await expect(loadFiscalXmlArtifact(`${RUN}:signed`, s())).rejects.toThrow("Arquivo indisponível");
  m.invoke.mockResolvedValueOnce({ data: new Blob([new Uint8Array(FISCAL_XML_MAX_BYTES + 1)]), error: null });
  await expect(loadFiscalXmlArtifact(`${RUN}:signed`, s())).rejects.toThrow();
  await expect(loadFiscalXmlArtifact(`${RUN}:pdf`, s())).rejects.toThrow();
  const a = new AbortController(); a.abort();
  m.invoke.mockClear();
  await expect(loadFiscalXmlArtifact(`${RUN}:signed`, a.signal)).rejects.toThrow();
  expect(m.invoke).not.toHaveBeenCalled();
  const ok = await loadFiscalXmlArtifact(`${RUN}:unsigned`, s());
  expect(ok.type).toBe("application/xml");
});

it("fonte do frontend fiscal não emite nem consome URL assinada", () => {
  for (const f of ["src/hooks/useFiscalXmlEngine.ts", "src/components/fiscal/documentos/GeracaoXmlNfeSecao.tsx"]) {
    const src = readFileSync(f, "utf8");
    expect(src).not.toMatch(/createSignedUrl|window\.open|signedUrl|\.url\b/);
  }
});

it("tipo JSON binário é recusado sem Blob preparado", async () => {
  m.invoke.mockResolvedValue({ data: new Blob(['{"url":"legacy"}'], { type: "application/json" }), error: null });
  await expect(loadFiscalXmlArtifact(`${RUN}:signed`, new AbortController().signal)).rejects.toThrow("Arquivo indisponível");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("timeout de transporte que ignora abort libera retry e descarta resposta tardia", async () => {
  vi.useFakeTimers();
  try {
    let late: (v: unknown) => void = () => {};
    m.invoke.mockImplementationOnce(() => new Promise(r => { late = r; }));
    let failed = false;
    const old = loadFiscalXmlArtifact(`${RUN}:signed`, new AbortController().signal).catch(() => { failed = true; });
    await vi.advanceTimersByTimeAsync(15_001);
    expect(failed).toBe(true); await old;
    const retry = await loadFiscalXmlArtifact(`${RUN}:signed`, new AbortController().signal);
    expect(retry.type).toBe("application/xml"); expect(m.invoke).toHaveBeenCalledTimes(2);
    late({ data: new Blob(["late"], { type: "application/octet-stream" }), error: null });
    await Promise.resolve(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
it("abort explícito encerra mesmo quando transporte ignora sinal, sem retry automático", async () => {
  m.invoke.mockImplementation(() => new Promise(() => {}));
  const c = new AbortController();
  const p = loadFiscalXmlArtifact(`${RUN}:signed`, c.signal);
  c.abort();
  await expect(p).rejects.toThrow("Arquivo indisponível");
  expect(m.invoke).toHaveBeenCalledTimes(1);
});
