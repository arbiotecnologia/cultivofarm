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
    expect(screen.getByRole("button", { name: "Nova versão disponível. Clique para atualizar." })).toBeInTheDocument();
    expect(screen.getByLabelText("Campo preservado")).toHaveValue("não perder");
    expect(document.body.style.overflow).toBe("");
  });

  it("badge acessível reabre opções e Continuar depois retorna ao badge", () => {
    render(<PwaUpdateNotifier />);
    act(() => { void requestStaleBuildRecovery(); });
    emit({ status: "deferred_badge", version: "v1", staleBuild: false });
    fireEvent.click(screen.getByRole("button", { name: "Nova versão disponível. Clique para atualizar." }));
    expect(screen.getByRole("button", { name: "Atualizar agora" })).toBeInTheDocument();
    emit({ status: "error", version: "v1", staleBuild: false, message: "Falhou" });
    fireEvent.click(screen.getByRole("button", { name: "Continuar depois" }));
    expect(screen.getByRole("button", { name: "Nova versão disponível. Clique para atualizar." })).toBeInTheDocument();
  });

  it("estado applying usa progresso local sem overlay", () => {
    render(<PwaUpdateNotifier />);
    act(() => { void requestStaleBuildRecovery(); });
    emit({ status: "applying", version: "v1", staleBuild: false });
    expect(screen.getByText("Preparando a nova versão…")).toBeInTheDocument();
    expect(screen.queryByText("Aguarde, a página será recarregada automaticamente.")).not.toBeInTheDocument();
    expect(document.querySelector(".fixed.inset-0")).toBeNull();
  });

  it("usa posição responsiva com safe-area", () => {
    render(<PwaUpdateNotifier />);
    act(() => { void requestStaleBuildRecovery(); });
    emit({ status: "deferred_badge", version: "v1", staleBuild: false });
    const badge = screen.getByRole("button", { name: "Nova versão disponível. Clique para atualizar." });
    expect(badge.className).toContain("safe-area-inset-bottom");
    expect(badge.className).toContain("sm:bottom-5");
  });
});