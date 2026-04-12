'use strict';

const DOLAR_FALLBACK = 1200; // tasa de emergencia si la API falla

/**
 * Obtiene la cotización del dólar oficial (venta) desde dolarapi.com.
 * Si falla por cualquier motivo, retorna el valor de fallback.
 *
 * @returns {Promise<number>}
 */
const fetchCotizacion = async () => {
  try {
    const resp = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) throw new Error(`dolarapi status ${resp.status}`);
    const d = await resp.json();
    const rate = Number(d?.venta);
    return Number.isFinite(rate) && rate > 0 ? rate : DOLAR_FALLBACK;
  } catch {
    return DOLAR_FALLBACK;
  }
};

module.exports = { fetchCotizacion, DOLAR_FALLBACK };
