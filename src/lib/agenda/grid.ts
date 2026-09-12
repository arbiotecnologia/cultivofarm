/**
 * Limites canônicos da grade da Agenda Técnica.
 *
 * Um único lugar define até onde a grade desenha e até onde o arrastar/soltar
 * pode reagendar. Isso impede o defeito em que uma visita era movida para um
 * horário (ex.: 19:30) que a própria grade não conseguia exibir depois.
 */
export const HOUR_START = 7;
/** Última hora cheia desenhada e último horário aceito no reagendamento. */
export const HOUR_END = 19;
export const SLOT_HEIGHT = 48; // px por hora
export const TOTAL_HEIGHT = (HOUR_END - HOUR_START + 1) * SLOT_HEIGHT;

/** Último minuto aceito na última hora da grade (19:00, nunca 19:30). */
export const LAST_SLOT_MINUTES = 0;

/** O horário cabe na grade desenhada? */
export function isWithinGridRange(date: Date): boolean {
  const hour = date.getHours() + date.getMinutes() / 60;
  return hour >= HOUR_START && hour <= HOUR_END + LAST_SLOT_MINUTES / 60;
}

/**
 * Converte a posição vertical do drop em hora/minuto válidos, sempre dentro
 * dos limites da grade. Snap de 30 minutos, exceto na última hora.
 */
export function resolveDropSlot(offsetY: number): { hour: number; minutes: number } {
  const fraction = Math.max(0, offsetY) / SLOT_HEIGHT;
  let hour = Math.floor(fraction) + HOUR_START;
  let minutes = fraction % 1 >= 0.5 ? 30 : 0;

  if (hour < HOUR_START) {
    hour = HOUR_START;
    minutes = 0;
  }
  if (hour >= HOUR_END) {
    hour = HOUR_END;
    minutes = LAST_SLOT_MINUTES;
  }
  return { hour, minutes };
}

/** Data final do reagendamento, garantidamente visível na grade. */
export function resolveDropDate(day: Date, offsetY: number): Date {
  const { hour, minutes } = resolveDropSlot(offsetY);
  const d = new Date(day);
  d.setHours(hour, minutes, 0, 0);
  return d;
}
