// Integração REAL AuthProvider + AuthzEpochBoundary + hooks consumidores da
// foundation de cache (mesma identidade), com fake clock e promises
// controladas. Gate AUTHZ_CACHE_FOUNDATION_ENABLED mockado como TRUE —
// produção permanece false até revisão.
//
// Cobre (revisão c787cd9e): vínculo muda mantendo uid/org/role; duas sessões
// sem Broadcast; lease expira em aba oculta; offline durante fetch; resposta
// atrasada; A→B→A; erro + retry; volta de foco; remount limpa rascunhos/
// seleção/objectURLs; regressão de usuário INTERNO (sem monitor).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

const U1 = "00000000-0000-4000-8000-00000000c001";
const ORG = "00000000-0000-4000-8000-0000000000e1";

// Fila de respostas controladas do fingerprint RPC.
type FpResult = { eligible: boolean; fingerprint: string | null; server_remaining_ms?: unknown };
let fpQueue: Array<() => Promise<FpResult>> = [];
let fpCalls = 0;
const nextFp = (r: FpResult) => fpQueue.push(async () => r);
const deferredFp = () => {
  let resolve!: (r: FpResult) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<FpResult>((res, rej) => { resolve = res; reject = rej; });
  fpQueue.push(() => promise);
  return { resolve, reject };
};

let currentRoles: string[] = ["cliente_produtor"];

const chain = (result: unknown) => {
  const o: Record<string, unknown> = {};
  o.eq = () => o;
  o.abortSignal = () => o;
  o.maybeSingle = async () => result;
  o.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return o;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrls: (...args: unknown[]) => signedRead(...args) }) },
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { user: { id: U1 } } }, error: null }),
      signOut: async () => ({}),
    },
    from: (table: string) => ({
      select: () =>
        chain(
          table === "profiles"
            ? {
                data: {
                  id: "p1",
                  user_id: U1,
                  nome: "Produtor",
                  email: null,
                  ativo: true,
                  senha_provisoria: false,
                  organization_id: ORG,
                  cliente_id: "c1",
                },
                error: null,
              }
            : { data: currentRoles.map((role) => ({ role })), error: null },
        ),
    }),
    rpc: async (name: string) => {
      if (name !== "get_my_authz_fingerprint") throw new Error(`rpc inesperada: ${name}`);
      fpCalls += 1;
      const next = fpQueue.shift();
      if (!next) throw new Error("sem resposta de fingerprint enfileirada");
      const r = await next();
      return { data: r, error: null };
    },
  },
}));

vi.mock("@/lib/authz/authzEpochGate", () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: false, OPERATOR_CONTEXT_MONITOR_ENABLED: false, CONSULTANT_CONTEXT_MONITOR_ENABLED: false, MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: false, AUTHZ_CACHE_ROLLOUT_SCOPE: "external-fingerprint", PRODUCER_CONTEXT_MONITOR_ENABLED: false, FINANCIAL_CONTEXT_MONITOR_ENABLED: false }));
vi.mock("@/lib/portalBroadcast", () => ({
  subscribePortalEvents: () => () => {},
  broadcastPortalEvent: () => {},
}));
vi.mock("@/lib/activePortalContext", () => ({ clearActivePortalContext: vi.fn() }));

import { AuthProvider } from "@/hooks/useAuth";
import { AuthzEpochBoundary } from "@/components/authz/AuthzEpochBoundary";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";

const portalRead = vi.fn<() => Promise<string>>();
const signedRead = vi.fn();

// Consumidor sensível: conta mounts/unmounts e simula rascunho + objectURL
// limpos no unmount (como fazem os consumidores reais).
const stats = { mounts: 0, unmounts: 0, revokedUrls: 0, draftsCleared: 0 };
function Sensitive() {
  const query = useScopedPortalQuery({ queryKey: ["authz-sensitive"], queryFn: portalRead });
  const signed = useSignedUrls(["a.png"]);
  useEffect(() => {
    stats.mounts += 1;
    const fakeUrl = `blob:fake-${stats.mounts}`;
    return () => {
      stats.unmounts += 1;
      stats.revokedUrls += 1; // URL.revokeObjectURL(fakeUrl) no consumidor real
      stats.draftsCleared += 1;
      void fakeUrl;
    };
  }, []);
  return <div>conteúdo sensível<span>{query.data}</span><span>{signed.urls["a.png"]}</span></div>;
}

function renderPortal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <AuthzEpochBoundary>
          <Sensitive />
        </AuthzEpochBoundary>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe("foundation de cache — integração AuthProvider + boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fpQueue = [];
    fpCalls = 0;
    portalRead.mockReset().mockResolvedValue("consulta atual");
    signedRead.mockReset().mockResolvedValue({ data: [{ path: "a.png", signedUrl: "https://example.invalid/current" }], error: null });
    currentRoles = ["cliente_produtor"];
    stats.mounts = 0;
    stats.unmounts = 0;
    stats.revokedUrls = 0;
    stats.draftsCleared = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("perfil externo: pending ESCONDE conteúdo; resposta válida exibe", async () => {
    const d = deferredFp();
    renderPortal();
    await flush(); // auth carrega; monitor inicia pending
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
    expect(screen.getByText("Verificando seu acesso")).toBeTruthy();
    await act(async () => {
      d.resolve({ eligible: true, fingerprint: "fpA" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
    expect(stats.mounts).toBe(1);
  });

  it("vínculo muda mantendo uid/org/role: época nova REMONTA e limpa rascunho/URL", async () => {
    nextFp({ eligible: true, fingerprint: "fpA" });
    nextFp({ eligible: true, fingerprint: "fpB" }); // revogação/troca de vínculo
    renderPortal();
    await flush();
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000); // poll seguinte
    });
    // Remount por época: unmount limpou rascunho e objectURL antes de exibir.
    expect(stats.unmounts).toBe(1);
    expect(stats.revokedUrls).toBe(1);
    expect(stats.draftsCleared).toBe(1);
    expect(stats.mounts).toBe(2);
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
  });

  it("aba oculta: lease de 15s expira mesmo em estado valid e esconde dados", async () => {
    nextFp({ eligible: true, fingerprint: "fpA" });
    renderPortal();
    await flush();
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001); // sem poll (oculta) — lease vence
    });
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
    expect(screen.getByText("Sessão de acesso pausada")).toBeTruthy();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("offline durante fetch: expira imediatamente e resposta em voo NÃO reabre", async () => {
    const d = deferredFp();
    renderPortal();
    await flush(); // pending, fetch em voo
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("Sessão de acesso pausada")).toBeTruthy();
    await act(async () => {
      d.resolve({ eligible: true, fingerprint: "fpA" }); // resposta antiga
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
  });

  it("resposta atrasada além da lease não reabre dados", async () => {
    const d = deferredFp();
    renderPortal();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001); // lease vence antes da resposta
    });
    await act(async () => {
      d.resolve({ eligible: true, fingerprint: "fpA" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
  });

  it("A→B→A: cada mudança de fingerprint remonta o conteúdo", async () => {
    nextFp({ eligible: true, fingerprint: "fpA" });
    nextFp({ eligible: true, fingerprint: "fpB" });
    nextFp({ eligible: true, fingerprint: "fpA" }); // ABA
    renderPortal();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(stats.mounts).toBe(3);
    expect(stats.unmounts).toBe(2);
    expect(stats.revokedUrls).toBe(2);
  });

  it("erro na revalidação: esconde, mostra Tentar novamente e recupera", async () => {
    nextFp({ eligible: true, fingerprint: "fpA" });
    fpQueue.push(async () => {
      throw new Error("rede");
    });
    nextFp({ eligible: true, fingerprint: "fpA" });
    renderPortal();
    await flush();
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000); // poll falha
    });
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
    const retry = screen.getByRole("button", { name: "Tentar novamente" });
    await act(async () => {
      fireEvent.click(retry);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
  });

  it("volta de foco revalida antes de mostrar", async () => {
    nextFp({ eligible: true, fingerprint: "fpA" });
    const d = deferredFp();
    renderPortal();
    await flush();
    const callsBefore = fpCalls;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fpCalls).toBe(callsBefore + 1);
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
    expect(stats.unmounts).toBe(1);
    await act(async () => { d.resolve({ eligible: true, fingerprint: "fpA" }); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
  });

  it("hooks reais descartam consulta e URL antigas após offline e retry da mesma identidade", async () => {
    let resolveQuery: ((value: string) => void) | undefined;
    let resolveSigned: ((value: unknown) => void) | undefined;
    portalRead.mockImplementationOnce(() => new Promise(resolve => { resolveQuery = resolve; }));
    signedRead.mockImplementationOnce(() => new Promise(resolve => { resolveSigned = resolve; }));
    nextFp({ eligible: true, fingerprint: "fpA" });
    nextFp({ eligible: true, fingerprint: "fpB" });
    renderPortal();
    await flush();
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      resolveQuery?.("consulta obsoleta");
      resolveSigned?.({ data: [{ path: "a.png", signedUrl: "https://example.invalid/stale" }], error: null });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText("consulta obsoleta")).toBeNull();
    expect(screen.queryByText("https://example.invalid/stale")).toBeNull();
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
  });

  it("sessão única sem Broadcast: revogação no servidor é percebida no próprio poll", async () => {
    nextFp({ eligible: true, fingerprint: "fpA" });
    renderPortal();
    await flush();
    // Este teste monta UMA única sessão: prova apenas que ela não depende de
    // BroadcastChannel — sem nenhum evento cross-tab, revalida sozinha no
    // próximo poll. Isolamento entre duas sessões reais NÃO é coberto aqui.
    nextFp({ eligible: false, fingerprint: null }); // vínculo revogado no servidor
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
    expect(screen.getByText("Sessão de acesso pausada")).toBeTruthy();
  });

  it.each([
    ["string", "15000"],
    ["objeto", { ms: 15000 }],
    ["booleano", true],
  ])("RPC com server_remaining_ms %s: conteúdo oculto, SEM fallback de lease local", async (_label, budget) => {
    // O fetcher NÃO pode rebaixar valor presente inválido para null (isso
    // concederia lease local indevida): repassa ao monitor, que falha fechado.
    nextFp({ eligible: true, fingerprint: "fpA", server_remaining_ms: budget });
    renderPortal();
    await flush();
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
    expect(screen.getByText("Sessão de acesso pausada")).toBeTruthy();
    // Sem fallback: nem após janelas de poll o conteúdo aparece.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.queryByText("conteúdo sensível")).toBeNull();
    expect(fpCalls).toBe(1); // nenhum poll foi agendado
  });

  it("regressão: usuário INTERNO não cria monitor nem chama o RPC", async () => {
    currentRoles = ["administrador"];
    renderPortal();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
    expect(fpCalls).toBe(0);
  });

  it("consultor técnico não é classificado como externo neste recorte", async () => {
    currentRoles = ["consultor_tecnico"];
    renderPortal();
    await flush();
    expect(fpCalls).toBe(0);
    expect(screen.getByText("conteúdo sensível")).toBeTruthy();
  });
});
