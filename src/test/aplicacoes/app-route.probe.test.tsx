import { describe, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/hooks/useAuth", async () => {
  const React = await import("react");
  return {
    useAuth: () => ({ user: { id: "u1", email: "a@b.c" }, session: { user: { id: "u1" } }, role: "administrador", roles: ["administrador"], loading: false, signOut: vi.fn() }),
    AuthProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

describe("rota /aplicacoes no App", () => {
  it("monta", async () => {
    window.history.pushState({}, "", "/aplicacoes");
    const App = (await import("@/App")).default;
    render(<App />);
    await new Promise((r) => setTimeout(r, 3000));
    const main = document.querySelector("main");
    console.log("MAINTEXT>>>", (main?.textContent || "SEM MAIN").slice(0, 600), "<<<");
  }, 60000);
});
