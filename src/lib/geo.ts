/**
 * Helpers para geolocalização e integração com mapas
 */

export const GPS_MAX_DURATION_MS = 8000;
export const GPS_TARGET_ACCURACY_M = 30;

/** Observation only: callers decide whether/when to persist. */
export function captureHighAccuracyPosition(
  onProgress: (bestAcc: number | null, secondsLeft: number) => void,
  signal: AbortSignal,
  opts = { maxDuration: GPS_MAX_DURATION_MS, targetAccuracy: GPS_TARGET_ACCURACY_M },
): Promise<{ lat: number; lng: number; acc: number }> {
  return new Promise((resolve, reject) => {
    const geo = navigator.geolocation;
    if (!geo) { reject(new Error("Geolocalização não disponível neste dispositivo.")); return; }
    let best: { lat: number; lng: number; acc: number } | null = null;
    let watchId: number | null = null;
    let finished = false;
    let lastError: string | null = null;
    const startedAt = Date.now();
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      if (watchId !== null) geo.clearWatch(watchId);
      clearTimeout(deadline);
      clearInterval(tick);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (best) resolve(best);
      else reject(new Error(lastError || "Não foi possível obter coordenadas em 8 segundos. Tente novamente ou justifique sem GPS."));
    };
    const abort = () => finish(new Error("Captura cancelada pelo usuário."));
    // Start the global deadline BEFORE asking the browser (permission dialog included).
    const deadline = setTimeout(() => finish(), opts.maxDuration);
    const tick = setInterval(() => {
      if (!finished) onProgress(best?.acc ?? null, Math.max(0, Math.ceil((opts.maxDuration - (Date.now() - startedAt)) / 1000)));
    }, 250);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    onProgress(null, Math.ceil(opts.maxDuration / 1000));
    try {
      watchId = geo.watchPosition((pos) => {
        if (finished) return;
        if (Date.now() - startedAt >= opts.maxDuration) { finish(); return; }
        const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
        if (![lat, lng, acc].every(Number.isFinite) || acc < 0 || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        if (!best || acc < best.acc) best = { lat, lng, acc };
        onProgress(best.acc, Math.max(0, Math.ceil((opts.maxDuration - (Date.now() - startedAt)) / 1000)));
        if (best.acc <= opts.targetAccuracy) finish();
      }, (err) => {
        if (finished) return;
        lastError = err.code === 1 ? "Permissão de localização negada. Justifique para continuar sem GPS." : "GPS indisponível. Tente novamente ou justifique sem GPS.";
        if (err.code === 1) finish();
        // Transient errors may recover; never discard a valid fix.
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: opts.maxDuration });
      // A synchronous fake/browser callback may finish before the watch ID is returned.
      if (finished) geo.clearWatch(watchId);
    } catch {
      finish(new Error("Não foi possível iniciar o GPS. Justifique para continuar sem GPS."));
    }
  });
}

/**
 * Obtém a posição atual do dispositivo
 */
export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada pelo navegador"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  });
};

/**
 * Tenta extrair latitude e longitude de uma URL do Google Maps
 */
export const parseGoogleMapsUrl = (url: string): { lat: number; lng: number } | null => {
  if (!url) return null;

  try {
    // 1. Decodifica a URL caso venha com caracteres especiais encodados
    const decodedUrl = decodeURIComponent(url);

    // 2. Regex para formato @lat,lng (comum em URLs de navegação e visualização)
    const regexAt = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const matchAt = decodedUrl.match(regexAt);
    if (matchAt) return { lat: parseFloat(matchAt[1]), lng: parseFloat(matchAt[2]) };

    // 3. Regex para parâmetros de consulta comuns: q, query, ll, center
    const regexParams = /[?&](q|query|ll|center|cbll)=(-?\d+\.\d+),(-?\d+\.\d+)/;
    const matchParams = decodedUrl.match(regexParams);
    if (matchParams) return { lat: parseFloat(matchParams[2]), lng: parseFloat(matchParams[3]) };

    // 4. Regex para formato de place ID / embed: !3dlat!4dlng
    const regexPlace = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;
    const matchPlace = decodedUrl.match(regexPlace);
    if (matchPlace) return { lat: parseFloat(matchPlace[1]), lng: parseFloat(matchPlace[2]) };

    // 5. Regex genérica para encontrar dois decimais separados por vírgula no final ou meio da URL
    const regexGeneric = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/;
    const matchGeneric = decodedUrl.match(regexGeneric);
    if (matchGeneric) return { lat: parseFloat(matchGeneric[1]), lng: parseFloat(matchGeneric[2]) };

  } catch (e) {
    console.error("Erro ao processar URL do Google Maps:", e);
  }

  return null;
};

/**
 * Gera URL de busca/navegação do Google Maps
 */
export const getGoogleMapsUrl = (lat: number, lng: number) => {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

/**
 * Gera URL de navegação do Waze
 */
export const getWazeUrl = (lat: number, lng: number) => {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
};

/**
 * Retorna o link para um iframe de visualização pública (sem necessidade de API Key)
 */
export const getPublicMapEmbedUrl = (lat: number, lng: number) => {
  if (!lat || !lng) return "";
  return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
};
