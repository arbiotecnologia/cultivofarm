/**
 * Fase Corretiva Final — Testes dos feature guards internos do Portal Mobile.
 *
 * Cobre TechnicalFeatureGuard e ProducerFeatureGuard, incluindo:
 * - loading (auth / contextos)
 * - sessão ausente
 * - admin passthrough
 * - autorização válida
 * - papéis cruzados negados
 * - erro da RPC
 * - transições loading → autorizado / negado
 * - ausência de flash de conteúdo
 * - ordem estável dos hooks
 * - auditoria chamada exatamente uma vez para o contexto correto
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

type AuthState = {
  user: { id: string } | null;
  roles: string[];
  primaryRole: string | null;
  loading: boolean;
};

const authState: AuthState = {
  user: { id: "u1" },
  roles: [],
  primaryRole: null,
  loading: false,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ ...authState, role: authState.primaryRole, session: null, profile: null }),
}));

type ContextsState = {
  data: {
    has_b2b_access: boolean;
    has_technical_access: boolean;
    available_contexts: string[];
    default_context: string | null;
    must_select_context: boolean;
  } | undefined;
  isLoading: boolean;
  isError: boolean;
};

const contextsState: ContextsState = {
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/useAvailableContexts", () => ({
  useAvailableContexts: () => contextsState,
}));

const logSpy = vi.fn();
vi.mock("@/lib/accessAuditLog", () => ({
  logAccessDeniedOnce: (...args: unknown[]) => logSpy(...args),
  routeGroupFromPath: (p: string) => p.split("/").filter(Boolean).slice(0, 2).join("/"),
}));

import { TechnicalFeatureGuard } from "@/components/guards/TechnicalFeatureGuard";
import { ProducerFeatureGuard } from "@/components/guards/ProducerFeatureGuard";

function resetState() {
  authState.user = { id: "u1" };
  authState.roles = [];
  authState.primaryRole = null;
  authState.loading = false;
  contextsState.data = {
    has_b2b_access: false,
    has_technical_access: false,
    available_contexts: [],
    default_context: null,
    must_select_context: false,
  };
  contextsState.isLoading = false;
  contextsState.isError = false;
  logSpy.mockReset();
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetState();
  errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const msg = args.map(String).join(" ");
    if (
      msg.includes("Rendered more hooks") ||
      msg.includes("change in the order of Hooks") ||
      msg.includes("Rendered fewer hooks")
    ) {
      throw new Error("Rules of Hooks violation: " + msg);
    }
  });
});
afterEach(() => {
  errorSpy.mockRestore();
  cleanup();
});

function renderGuard(
  Guard: React.ComponentType<{ children: React.ReactNode }>,
  path: string
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/app/*"
          element={<Guard><div>CONTENT_OK</div></Guard>}
        />
        <Route path="/sem-permissao" element={<div>SEM_PERMISSAO</div>} />
        <Route path="/app/login" element={<div>APP_LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// TechnicalFeatureGuard
// ---------------------------------------------------------------------------
describe("TechnicalFeatureGuard", () => {
  it("mostra loader enquanto auth carrega", () => {
    authState.loading = true;
    renderGuard(TechnicalFeatureGuard, "/app/registrar");
    expect(screen.queryByText("CONTENT_OK")).not.toBeInTheDocument();
    expect(screen.queryByText("SEM_PERMISSAO")).not.toBeInTheDocument();
  });

  it("mostra loader enquanto contextos carregam", () => {
    contextsState.isLoading = true;
    renderGuard(TechnicalFeatureGuard, "/app/registrar");
    expect(screen.queryByText("CONTENT_OK")).not.toBeInTheDocument();
  });

  it("redireciona para /app/login sem sessão", () => {
    authState.user = null;
    renderGuard(TechnicalFeatureGuard, "/app/registrar");
    expect(screen.getByText("APP_LOGIN")).toBeInTheDocument();
  });

  it("libera administrador sem has_technical_access", () => {
    authState.roles = ["administrador"];
    contextsState.data!.has_technical_access = false;
    renderGuard(TechnicalFeatureGuard, "/app/registrar");
    expect(screen.getByText("CONTENT_OK")).toBeInTheDocument();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("libera técnico autorizado pela RPC", () => {
    authState.roles = ["consultor_tecnico"];
    contextsState.data!.has_technical_access = true;
    renderGuard(TechnicalFeatureGuard, "/app/checkin");
    expect(screen.getByText("CONTENT_OK")).toBeInTheDocument();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["/app/registrar"],
    ["/app/checkin"],
    ["/app/visita/novo"],
    ["/app/catalogo"],
  ])("bloqueia produtor puro em %s e loga uma única vez como technical", (path) => {
    authState.roles = ["cliente_produtor"];
    contextsState.data!.has_technical_access = false;
    renderGuard(TechnicalFeatureGuard, path);
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe("technical");
  });

  it("bloqueia parceiro B2B puro sem acesso técnico", () => {
    authState.roles = ["parceiro_b2b"];
    contextsState.data!.has_technical_access = false;
    contextsState.data!.has_b2b_access = true;
    renderGuard(TechnicalFeatureGuard, "/app/registrar");
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("bloqueia quando a RPC retorna erro", () => {
    authState.roles = ["consultor_tecnico"];
    contextsState.isError = true;
    contextsState.data = undefined;
    renderGuard(TechnicalFeatureGuard, "/app/registrar");
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("transição loading → autorizado mantém ordem dos hooks", () => {
    contextsState.isLoading = true;
    const { rerender } = renderGuard(TechnicalFeatureGuard, "/app/registrar");
    contextsState.isLoading = false;
    authState.roles = ["consultor_tecnico"];
    contextsState.data!.has_technical_access = true;
    rerender(
      <MemoryRouter initialEntries={["/app/registrar"]}>
        <Routes>
          <Route
            path="/app/*"
            element={<TechnicalFeatureGuard><div>CONTENT_OK</div></TechnicalFeatureGuard>}
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("CONTENT_OK")).toBeInTheDocument();
  });

  it("transição loading → negado não vaza conteúdo", () => {
    contextsState.isLoading = true;
    const { rerender } = renderGuard(TechnicalFeatureGuard, "/app/registrar");
    expect(screen.queryByText("CONTENT_OK")).not.toBeInTheDocument();
    contextsState.isLoading = false;
    authState.roles = ["parceiro_b2b"];
    contextsState.data!.has_technical_access = false;
    rerender(
      <MemoryRouter initialEntries={["/app/registrar"]}>
        <Routes>
          <Route
            path="/app/*"
            element={<TechnicalFeatureGuard><div>CONTENT_OK</div></TechnicalFeatureGuard>}
          />
          <Route path="/sem-permissao" element={<div>SEM_PERMISSAO</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText("CONTENT_OK")).not.toBeInTheDocument();
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ProducerFeatureGuard
// ---------------------------------------------------------------------------
describe("ProducerFeatureGuard", () => {
  it("mostra loader enquanto auth carrega", () => {
    authState.loading = true;
    renderGuard(ProducerFeatureGuard, "/app/recomendacoes");
    expect(screen.queryByText("CONTENT_OK")).not.toBeInTheDocument();
  });

  it("redireciona para login sem sessão", () => {
    authState.user = null;
    renderGuard(ProducerFeatureGuard, "/app/recomendacoes");
    expect(screen.getByText("APP_LOGIN")).toBeInTheDocument();
  });

  it("libera administrador", () => {
    authState.roles = ["administrador"];
    renderGuard(ProducerFeatureGuard, "/app/recomendacoes");
    expect(screen.getByText("CONTENT_OK")).toBeInTheDocument();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["/app/recomendacoes"],
    ["/app/entregas"],
    ["/app/solicitar"],
  ])("libera produtor autorizado em %s sem chamar auditoria", (path) => {
    authState.roles = ["cliente_produtor"];
    renderGuard(ProducerFeatureGuard, path);
    expect(screen.getByText("CONTENT_OK")).toBeInTheDocument();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("libera produtor + técnico", () => {
    authState.roles = ["cliente_produtor", "consultor_tecnico"];
    renderGuard(ProducerFeatureGuard, "/app/recomendacoes");
    expect(screen.getByText("CONTENT_OK")).toBeInTheDocument();
  });

  it("bloqueia técnico puro e loga uma única vez como producer", () => {
    authState.roles = ["consultor_tecnico"];
    renderGuard(ProducerFeatureGuard, "/app/recomendacoes");
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe("producer");
  });

  it("bloqueia B2B sem papel produtor", () => {
    authState.roles = ["parceiro_b2b"];
    renderGuard(ProducerFeatureGuard, "/app/entregas");
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
  });

  it("ignora manipulação de active_portal_context via storage", () => {
    // Simula tentativa de forjar contexto no sessionStorage — deve ser ignorada.
    sessionStorage.setItem("active_portal_context", "producer");
    authState.roles = ["parceiro_b2b"];
    renderGuard(ProducerFeatureGuard, "/app/solicitar");
    expect(screen.getByText("SEM_PERMISSAO")).toBeInTheDocument();
    sessionStorage.removeItem("active_portal_context");
  });
});
