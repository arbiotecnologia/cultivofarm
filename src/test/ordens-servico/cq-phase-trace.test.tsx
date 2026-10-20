import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OSDetalhesDialog, manualCQPhase } from "@/components/ordens-servico/OSDetalhesDialog";

// Sessão/leitor FAKE: prova apenas o estado visual do detalhe; o core CQ continua a autoridade.
const f = vi.hoisted(() => ({ roles: ["gestor"], current: true, epoch: 0, trace: null as any, completed: null as null | (() => void), phase: "" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: f.roles, user: { id: "u" } }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ get ready() { return f.current; }, scope: String(f.epoch), capture: () => () => true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/cockpit/GerarLoteDialog", () => ({ GerarLoteDialog: () => null }));
vi.mock("@/components/cockpit/RegistrarCQDialog", () => ({
  RegistrarCQDialog: ({ phase, onCompleted }: { phase: string; onCompleted: () => void }) => { f.phase = phase; f.completed = onCompleted; return <div>cq-dialog-{phase}</div>; },
}));
vi.mock("@/components/ordens-servico/RastreabilidadeProducaoTab", async () => {
  const { useEffect } = await import("react");
  return { RastreabilidadeProducaoTab: ({ onItem, refreshKey }: { onItem?: (i: unknown) => void; refreshKey?: number }) => {
    useEffect(() => { onItem?.(f.trace); }, [onItem, refreshKey]); return null; } };
});

const OS = "00000000-0000-4000-8000-000000000001";
const base = { os_id: OS, origem_os: "manual", programacao_id: "pp", lote_id: "lt", codigo_lote: "LT-1", numero_os: "OS-1" };
const os = { id: OS, origem: "manual", status: "programada", numero_os: "OS-1", produto_id: "p", clientes: { nome: "C" } };
const view = (extra: object = {}) => render(<OSDetalhesDialog os={{ ...os, ...extra }} open onOpenChange={() => {}} />);
const badge = (text: string) => screen.getByText(text);
beforeEach(() => { f.roles = ["gestor"]; f.current = true; f.epoch = 0; f.completed = null; f.phase = ""; });

describe("manualCQPhase", () => {
  it.each([
    ["programada", "em_producao", "send"], ["programada", "programada", "send"],
    ["em_cq", "aguardando_cq", "record"], ["em_cq", "em_cq", "record"],
    ["em_cq", "cq_aprovado", null], ["em_cq", "cq_reprovado", null], ["programada", "cq_aprovado", null],
    ["programada", "aguardando_cq", null], ["envase", "em_envase", null], ["aprovada", null, null],
  ])("OS %s + esteira %s -> %s", (s, e, r) => expect(manualCQPhase({ status_os: s, status_esteira_oficial: e })).toBe(r));
  it("sem leitura não oferece ação", () => expect(manualCQPhase(null)).toBeNull());
});

describe("OSDetalhesDialog — badge e ação CQ pela leitura atual", () => {
  it("badge segue trace em_cq mesmo com OS da lista ainda programada", () => {
    f.trace = { ...base, status_os: "em_cq", status_esteira_oficial: "aguardando_cq" };
    view(); expect(badge("EM CQ")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar CQ" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar para CQ" })).toBeNull();
  });
  it("resultado final (cq_aprovado) não oferece registrar nem enviar", () => {
    f.trace = { ...base, status_os: "em_cq", status_esteira_oficial: "cq_aprovado" };
    view(); expect(badge("EM CQ")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar CQ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar para CQ" })).toBeNull();
  });
  it("trace de outra OS é descartado: badge usa fallback da OS e nenhuma ação", () => {
    f.trace = { ...base, os_id: "outra", status_os: "em_cq", status_esteira_oficial: "aguardando_cq" };
    view(); expect(badge("PROGRAMADA")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /CQ/ })).toBeNull();
  });
  it("sem trace preserva fallback do status da OS", () => {
    f.trace = null; view({ status: "aprovada" }); expect(badge("APROVADA")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /CQ/ })).toBeNull();
  });
  it("envio -> conclusão -> releitura em_cq oferece só registrar; aprovação final fecha o diálogo", () => {
    f.trace = { ...base, status_os: "programada", status_esteira_oficial: "em_producao" };
    view(); fireEvent.click(screen.getByRole("button", { name: "Enviar para CQ" }));
    expect(f.phase).toBe("send");
    f.trace = { ...base, status_os: "em_cq", status_esteira_oficial: "aguardando_cq" };
    act(() => f.completed?.());
    expect(badge("EM CQ")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar para CQ" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Registrar CQ" }));
    expect(screen.getByText("cq-dialog-record")).toBeTruthy();
    f.trace = { ...base, status_os: "em_cq", status_esteira_oficial: "cq_aprovado" };
    act(() => f.completed?.());
    expect(screen.queryByText(/cq-dialog/)).toBeNull();
    expect(screen.queryByRole("button", { name: /CQ/ })).toBeNull();
  });
  it("escopo de acesso trocado descarta trace e ação", () => {
    f.trace = { ...base, status_os: "em_cq", status_esteira_oficial: "aguardando_cq" };
    const r = view(); expect(screen.getByRole("button", { name: "Registrar CQ" })).toBeTruthy();
    f.current = false; f.epoch = 1; f.trace = null;
    r.rerender(<OSDetalhesDialog os={os} open onOpenChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /CQ/ })).toBeNull();
  });
});
