/**
 * controllers/perfilController.js
 *
 * Controller ultra-liviano: solo lee req, llama service, devuelve res.
 * Toda la lógica de negocio y validaciones están en services/perfilService.js.
 * Toda la lógica de acceso a datos está en repositories/perfilRepository.js.
 */

'use strict';

const perfilService         = require('../services/perfilService');
const { handleError }       = require('../utils/errors');
const { resolveClubId, resolveClubIdOptional } = require('../utils/reqUtils');
const logger                = require('../services/logger');

/**
 * GET /api/perfil/:id?club_id=...
 * Obtiene el perfil público de un jugador.
 */
const obtenerPerfil = async (req, res) => {
  try {
    const { id } = req.params;
    const { clubId, error: clubError } = resolveClubId(req);
    if (clubError) return res.status(400).json({ error: clubError });

    const data = await perfilService.getPerfil(id, clubId);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

/**
 * PUT /api/perfil/:id
 * Actualiza el perfil (campos permitidos según rol).
 */
const actualizarPerfil = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await perfilService.actualizarPerfil(id, req.body, req.authUser);
    return res.json({ message: 'Perfil actualizado correctamente', perfil: data });
  } catch (err) {
    return handleError(res, err, logger);
  }
};

/**
 * GET /api/perfil/count?club_id=...
 * Cuenta jugadores activos del club.
 */
const contarJugadoresPorClub = async (req, res) => {
  try {
    const { clubId, error: clubError } = resolveClubIdOptional(req);
    if (clubError) return res.status(400).json({ error: clubError });
    if (!clubId)   return res.status(400).json({ error: 'club_id requerido' });

    const count = await perfilService.contarJugadores(clubId);
    return res.json({ count });
  } catch (err) {
    return handleError(res, err, logger);
  }
};

module.exports = { obtenerPerfil, actualizarPerfil, contarJugadoresPorClub };
