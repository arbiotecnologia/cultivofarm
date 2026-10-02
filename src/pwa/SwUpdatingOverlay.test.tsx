import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwUpdatingOverlay } from "./SwUpdatingOverlay";
import { finishUpdate, PWA_UPDATING_END, PWA_UPDATING_START } from "./registerSW";

describe("SwUpdatingOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    finishUpdate("test-reset");
  });

  afterEach(() => {
    finishUpdate("test-cleanup");
    vi.useRealTimers();
  });

  it("abre no início e fecha no encerramento", () => {
    render(<SwUpdatingOverlay />);
    act(() => window.dispatchEvent(new CustomEvent(PWA_UPDATING_START)));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => window.dispatchEvent(new CustomEvent(PWA_UPDATING_END)));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("remove o bloqueio visual após o timeout próprio", () => {
    render(<SwUpdatingOverlay />);
    act(() => window.dispatchEvent(new CustomEvent(PWA_UPDATING_START)));
    expect(document.body.style.overflow).toBe("hidden");
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});