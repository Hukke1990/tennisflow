/**
 * useHaptic — Vibración nativa para SetGo.
 *
 * Usa la Navigator.vibrate() API cuando está disponible
 * (Android Chrome, Firefox; silenciosamente ignorada en iOS/desktop).
 *
 * Patrones predefinidos:
 *  - point   → pulso corto (punto anotado)
 *  - undo    → doble pulso (deshacer)
 *  - start   → pulso medio (iniciar partido)
 *  - finish  → patrón de victoria (finalizar partido)
 *  - confirm → pulso suave (acción confirmada)
 */

const PATTERNS = {
  point:   [20],
  undo:    [10, 30, 10],
  start:   [40],
  finish:  [20, 30, 60],
  confirm: [15],
};

/**
 * Dispara una vibración. Se puede llamar fuera de componentes React.
 * @param {'point'|'undo'|'start'|'finish'|'confirm'|number[]} type
 */
export const buzz = (type = 'point') => {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  const pattern = Array.isArray(type) ? type : (PATTERNS[type] ?? PATTERNS.point);
  try {
    navigator.vibrate(pattern);
  } catch (_) {
    // Silencioso si el dispositivo rechaza la llamada.
  }
};

/**
 * Hook que expone buzz() para uso en componentes.
 * @returns {{ buzz: typeof buzz }}
 */
export function useHaptic() {
  return { buzz };
}
