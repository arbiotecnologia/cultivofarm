import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureHighAccuracyPosition } from "./geo";

let success: PositionCallback;
let failure: PositionErrorCallback;
const clearWatch = vi.fn();
const watchPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback, _opts?: PositionOptions) => {
  success = ok; failure = fail; return 7;
});
const sample = (acc: number, lat = 1): GeolocationPosition => ({
  coords: { latitude: lat, longitude: 2, accuracy: acc, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) },
  timestamp: Date.now(),
  toJSON: () => ({}),
});
const error = (code: number): GeolocationPositionError => ({ code, message: "fake", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition, clearWatch } });
});
afterEach(() => { vi.useRealTimers(); });
describe("captura ativa de GPS", () => {
  it("mantém a melhor leitura e encerra exatamente em 8s", async () => {
    const progress = vi.fn(); const p = captureHighAccuracyPosition(progress, new AbortController().signal);
    success(sample(400)); success(sample(80, 3)); success(sample(900, 4));
    await vi.advanceTimersByTimeAsync(7999);
    expect(clearWatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ lat: 3, lng: 2, acc: 80 });
    expect(clearWatch).toHaveBeenCalledWith(7); expect(vi.getTimerCount()).toBe(0);
    expect(watchPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
  });
  it("encerra cedo ao atingir 30m", async () => {
    const p = captureHighAccuracyPosition(vi.fn(), new AbortController().signal);
    success(sample(30)); expect((await p).acc).toBe(30);
    expect(clearWatch).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("deadline global funciona sem callbacks", async () => {
    const p = captureHighAccuracyPosition(vi.fn(), new AbortController().signal);
    const assertion = expect(p).rejects.toThrow("8 segundos");
    await vi.advanceTimersByTimeAsync(8000); await assertion;
    expect(clearWatch).toHaveBeenCalledWith(7); expect(vi.getTimerCount()).toBe(0);
  });
  it("negação de permissão limpa recursos e permite justificativa", async () => {
    const p = captureHighAccuracyPosition(vi.fn(), new AbortController().signal);
    failure(error(1)); await expect(p).rejects.toThrow("Justifique");
    expect(vi.getTimerCount()).toBe(0); expect(clearWatch).toHaveBeenCalledWith(7);
  });
  it("erro posterior não descarta fix válido", async () => {
    const p = captureHighAccuracyPosition(vi.fn(), new AbortController().signal);
    success(sample(90)); failure(error(2));
    await vi.advanceTimersByTimeAsync(8000); expect((await p).acc).toBe(90);
  });
  it("erro transitório pode recuperar antes do prazo", async () => {
    const p = captureHighAccuracyPosition(vi.fn(), new AbortController().signal);
    failure(error(2)); success(sample(20)); expect((await p).acc).toBe(20);
  });
  it("abort limpa recursos e ignora callbacks tardios", async () => {
    const controller = new AbortController(); const progress = vi.fn();
    const p = captureHighAccuracyPosition(progress, controller.signal);
    controller.abort(); await expect(p).rejects.toThrow("cancelada");
    const count = progress.mock.calls.length; success(sample(10)); failure(error(2));
    expect(progress).toHaveBeenCalledTimes(count); expect(vi.getTimerCount()).toBe(0);
  });
  it("ignora leitura inválida sem fabricar posição", async () => {
    const p = captureHighAccuracyPosition(vi.fn(), new AbortController().signal);
    success(sample(-1)); success(sample(5, NaN));
    const assertion = expect(p).rejects.toThrow("coordenadas");
    await vi.advanceTimersByTimeAsync(8000); await assertion;
  });
  it("callback síncrono também limpa watch retornado", async () => {
    watchPosition.mockImplementationOnce((ok) => { ok(sample(10)); return 9; });
    expect((await captureHighAccuracyPosition(vi.fn(), new AbortController().signal)).acc).toBe(10);
    expect(clearWatch).toHaveBeenCalledWith(9); expect(vi.getTimerCount()).toBe(0);
  });
});