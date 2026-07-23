/**
 * Fase H4-A1 — Testes do foco de campo via deep-link `?campo=<id>`.
 *
 * Cobre:
 *  - alvo presente => foco, scroll e destaque temporário
 *  - alvo ausente => fallback silencioso (sem exceção)
 *  - chave não permitida => rejeitada (allow-list)
 *  - o hook consome o parâmetro `campo` após aplicar
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import {
  focusFieldById,
  useFiscalFieldFocus,
} from "@/lib/fiscal/useFiscalFieldFocus";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("focusFieldById", () => {
  it("focaliza e destaca temporariamente um campo presente e permitido", () => {
    const input = document.createElement("input");
    input.id = "cnpj";
    document.body.appendChild(input);
    input.scrollIntoView = vi.fn();

    const ok = focusFieldById("cnpj");
    expect(ok).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.classList.contains("ring-2")).toBe(true);
    expect(input.classList.contains("ring-primary")).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(input.classList.contains("ring-2")).toBe(false);
    expect(input.classList.contains("ring-primary")).toBe(false);
  });

  it("chave fora da allow-list => rejeita (fallback seguro)", () => {
    const el = document.createElement("input");
    el.id = "campo_arbitrario";
    document.body.appendChild(el);
    expect(focusFieldById("campo_arbitrario")).toBe(false);
    expect(document.activeElement).not.toBe(el);
  });

  it("alvo ausente => retorna false sem lançar", () => {
    // 'phone' está na allow-list mas não existe no DOM
    expect(() => focusFieldById("phone")).not.toThrow();
    expect(focusFieldById("phone")).toBe(false);
  });
});

function Harness({ tab, ready }: { tab: string; ready: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  useFiscalFieldFocus({ tab, ready, searchParams, setSearchParams });
  // Marker para inspeção do estado da URL
  useEffect(() => {
    document.body.setAttribute("data-current-campo", searchParams.get("campo") ?? "");
  });
  return null;
}

describe("useFiscalFieldFocus", () => {
  it("aplica foco quando `campo` está presente e alvo existe, e consome o parâmetro", () => {
    const input = document.createElement("input");
    input.id = "fiscal_email";
    input.scrollIntoView = vi.fn();
    document.body.appendChild(input);

    render(
      <MemoryRouter initialEntries={["/x?aba=empresa&campo=fiscal_email"]}>
        <Harness tab="empresa" ready={true} />
      </MemoryRouter>,
    );

    // O efeito enfileira setTimeout(60ms) antes de focar.
    vi.advanceTimersByTime(80);
    expect(document.activeElement).toBe(input);
    expect(document.body.getAttribute("data-current-campo")).toBe("");
  });

  it("sem `campo` => nada acontece", () => {
    render(
      <MemoryRouter initialEntries={["/x?aba=empresa"]}>
        <Harness tab="empresa" ready={true} />
      </MemoryRouter>,
    );
    vi.advanceTimersByTime(200);
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });

  it("dados não prontos => aguarda (não busca alvo)", () => {
    const input = document.createElement("input");
    input.id = "cnpj";
    input.scrollIntoView = vi.fn();
    document.body.appendChild(input);

    render(
      <MemoryRouter initialEntries={["/x?aba=empresa&campo=cnpj"]}>
        <Harness tab="empresa" ready={false} />
      </MemoryRouter>,
    );
    vi.advanceTimersByTime(200);
    expect(document.activeElement).not.toBe(input);
  });

  it("alvo ausente => consome o parâmetro sem quebrar (fallback)", () => {
    render(
      <MemoryRouter initialEntries={["/x?aba=empresa&campo=cnpj"]}>
        <Harness tab="empresa" ready={true} />
      </MemoryRouter>,
    );
    vi.advanceTimersByTime(200);
    expect(document.body.getAttribute("data-current-campo")).toBe("");
  });
});
