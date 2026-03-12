import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatearFecha = (fecha) => format(fecha, "d 'de' MMM yyyy, HH:mm", { locale: es });

export function getInscripcionWindowState(torneo, now = new Date()) {
  const inicioInscripcion = toDateOrNull(torneo?.fecha_inicio_inscripcion);
  const cierreInscripcion = toDateOrNull(torneo?.fecha_cierre_inscripcion);

  // Compatibilidad con torneos legacy que no tengan ventana configurada.
  if (!inicioInscripcion && !cierreInscripcion) {
    return {
      canRegister: true,
      reason: 'legacy_without_window',
      buttonLabel: null,
      message: null,
    };
  }

  if (inicioInscripcion && cierreInscripcion && inicioInscripcion > cierreInscripcion) {
    return {
      canRegister: false,
      reason: 'invalid_window',
      buttonLabel: 'Inscripcion no habilitada',
      message: 'La ventana de inscripcion de este torneo es invalida.',
    };
  }

  if (inicioInscripcion && now < inicioInscripcion) {
    return {
      canRegister: false,
      reason: 'before_start',
      buttonLabel: 'Inscripciones proximamente',
      message: `Inscripciones abiertas desde ${formatearFecha(inicioInscripcion)}.`,
    };
  }

  if (cierreInscripcion && now > cierreInscripcion) {
    return {
      canRegister: false,
      reason: 'after_end',
      buttonLabel: 'Inscripcion cerrada',
      message: `La inscripcion cerro el ${formatearFecha(cierreInscripcion)}.`,
    };
  }

  if (cierreInscripcion) {
    return {
      canRegister: true,
      reason: 'open',
      buttonLabel: null,
      message: `Inscripciones abiertas hasta ${formatearFecha(cierreInscripcion)}.`,
    };
  }

  return {
    canRegister: true,
    reason: 'open_without_end',
    buttonLabel: null,
    message: null,
  };
}
