import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useGpsCapture } from "./useGpsCapture";

afterEach(() => { vi.useRealTimers(); });
it("recaptura/unmount cancelam watches/timers e cercam resposta antiga", async () => {
  vi.useFakeTimers();
  const callbacks: PositionCallback[] = [];
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    watchPosition: vi.fn((ok: PositionCallback) => { callbacks.push(ok); return callbacks.length; }), clearWatch,
  } });
  const { result, unmount } = renderHook(useGpsCapture);
  act(() => { void result.current.captureGps(); });
  act(() => { void result.current.captureGps(); });
  expect(clearWatch).toHaveBeenCalledWith(1);
  await act(async () => { await Promise.resolve(); });
  expect(result.current.gps.status).toBe("getting");
  unmount(); expect(clearWatch).toHaveBeenCalledWith(2); expect(vi.getTimerCount()).toBe(0);
});