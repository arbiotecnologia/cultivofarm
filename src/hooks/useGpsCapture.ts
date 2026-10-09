import { useCallback, useEffect, useRef, useState } from "react";
import { captureHighAccuracyPosition } from "@/lib/geo";

type GpsState =
  | { status: "idle" }
  | { status: "getting"; secondsLeft: number; bestAcc: number | null }
  | { status: "ok"; lat: number; lng: number; accuracy: number }
  | { status: "error"; message: string };

export function useGpsCapture() {
  const [gps, setGps] = useState<GpsState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    const old = controller.current;
    controller.current = null;
    old?.abort();
  }, []);
  useEffect(() => cancel, [cancel]);
  const captureGps = useCallback(async () => {
    cancel();
    const current = new AbortController();
    controller.current = current;
    setGps({ status: "getting", secondsLeft: 8, bestAcc: null });
    try {
      const fix = await captureHighAccuracyPosition((bestAcc, secondsLeft) => {
        if (controller.current === current) setGps({ status: "getting", secondsLeft, bestAcc });
      }, current.signal);
      if (controller.current === current) setGps({ status: "ok", lat: fix.lat, lng: fix.lng, accuracy: fix.acc });
    } catch (err) {
      if (controller.current === current) setGps({ status: "error", message: err instanceof Error ? err.message : "GPS indisponível" });
    } finally {
      if (controller.current === current) controller.current = null;
    }
  }, [cancel]);
  return { gps, captureGps, cancelGps: cancel };
}