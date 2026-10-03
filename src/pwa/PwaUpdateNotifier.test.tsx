import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PwaUpdateNotifier } from "./PwaUpdateNotifier";
import {
  PWA_UPDATE_STATE_EVENT,
  requestStaleBuildRecovery,
  type PwaUpdateSnapshot,
} from "./registerSW";

const emit = (detail: PwaUpdateSnapshot) => {
  act(() => window.dispatchEvent(new CustomEvent(PWA_UPDATE_STATE_EVENT, { detail })));
};

describe("PwaUpdateNotifier", () => {
  beforeEach(() => window.localStorage.clear());

  it("mostra aviso não bloqueante e permite adiar sem afetar formulário", () => {
    render(<><input aria-label="Campo preservado" defaultValue="não perder" /><PwaUpdateNotifier /></>);
    act(() => { void requestStaleBuildRecovery(); });
    emit({ status: "prompt", version: "v1", staleBuild: false });
    expect(screen.getByText("Nova versão disponível")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar agora" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adiar" }));
    expect(screen.queryByText("Nova versão disponível")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Campo preservado")).toHaveValue("não perder");
    expect(document.body.style.overflow).toBe("");
  });

  it("não renderiza badge depois de adiar", () => {
    render(<PwaUpdateNotifier />);
    act(() => {
      window.localStorage.setItem("pwa:deferred-update", JSON.stringify({ version: "v1", deferredAt: new Date().toISOString() }));
    });
    emit({ status: "prompt", version: "v1", staleBuild: false });
    fireEvent.click(screen.getByRole("button", { name: "Adiar" }));
    expect(screen.queryByRole("button", { name: "Atualizar agora" })).not.toBeInTheDocument();
    expect(document.querySelector(".fixed.bottom-\\[calc\\(5\\.5rem")).toBeNull();
  });

  it("estado applying usa progresso local sem overlay", () => {
    render(<PwaUpdateNotifier />);
    act(() => { void requestStaleBuildRecovery(); });
    emit({ status: "applying", version: "v1", staleBuild: false });
    expect(screen.getByText("Abrindo a nova versão…")).toBeInTheDocument();
    expect(screen.queryByText("Aguarde, a página será recarregada automaticamente.")).not.toBeInTheDocument();
    expect(document.querySelector(".fixed.inset-0")).toBeNull();
  });

  it("mantém o aviso responsivo com safe-area", () => {
    render(<PwaUpdateNotifier />);
    act(() => { void requestStaleBuildRecovery(); });
    emit({ status: "prompt", version: "v1", staleBuild: false });
    const alert = screen.getByRole("status", { name: "Atualização do Cultivo Farm" });
    expect(alert.className).toContain("safe-area-inset-bottom");
    expect(alert.className).toContain("sm:bottom-5");
  });
});