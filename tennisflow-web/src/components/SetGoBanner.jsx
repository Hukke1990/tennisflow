/**
 * SetGoBanner — banner "Powered by SetGo" visible solo para el plan Básico.
 */
import { useState } from 'react';
import { useClub } from '../context/ClubContext';
import PlanesModal from './PlanesModal';

export default function SetGoBanner() {
  const { clubPlan = 'basico' } = useClub();
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Solo visible para plan básico
  if (clubPlan !== 'basico' || dismissed) return null;

  return (
    <>
      <div className="w-full bg-gradient-to-r from-[#0a0f1e] to-[#111827] border-t border-white/10 px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-bold text-white shrink-0">
            Set<span className="text-[#A6CE39]">Go</span>
          </span>
          <span className="text-gray-400 truncate">
            Estás en el plan <span className="text-white font-medium">Básico</span> — Actualizá para desbloquear más funciones.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setModalOpen(true)}
            className="text-[#A6CE39] hover:text-white font-semibold text-xs px-3 py-1.5 rounded-lg border border-[#A6CE39]/30 hover:border-[#A6CE39]/60 hover:bg-[#A6CE39]/10 transition-all"
          >
            ⭐ Ver planes
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-600 hover:text-gray-400 text-xs px-2 py-1 rounded transition-colors"
            aria-label="Cerrar banner"
          >
            ✕
          </button>
        </div>
      </div>

      <PlanesModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

