/**
 * Helpers para geolocalização e integração com mapas
 */

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
