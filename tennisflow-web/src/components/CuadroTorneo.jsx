import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const API_URL = 'http://localhost:3000';

const extractPartidos = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.partidos)) return payload.partidos;
  if (Array.isArray(payload?.cuadro)) return payload.cuadro;
  return [];
};

export default function CuadroTorneo({ torneoId }) {
  const [partidos, setPartidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (torneoId) fetchCuadro();
  }, [torneoId]);

  const fetchCuadro = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await axios.get(`${API_URL}/api/torneos/${torneoId}/cuadro`);
      setPartidos(extractPartidos(data));
    } catch (err) {
      console.error('Error al cargar cuadro:', err);
      const status = err?.response?.status;
      const backendMsg = err?.response?.data?.error;

      if (status === 404) {
        setError('Todavia no existe cuadro para este torneo. Genera el sorteo primero.');
      } else if (status === 500) {
        setError(backendMsg || 'Error interno del backend al obtener el cuadro (500).');
      } else {
        setError(backendMsg || 'No se pudo cargar el cuadro en este momento.');
      }
      setPartidos([]);
    } finally {
      setLoading(false);
    }
  };

  // Agrupar los partidos por ronda
  const rondas = partidos.reduce((acc, partido) => {
    if (!acc[partido.ronda_orden]) acc[partido.ronda_orden] = [];
    acc[partido.ronda_orden].push(partido);
    return acc;
  }, {});

  // Ordenar las llaves de rondas (ej: 16 (Oct), 8 (Cua), 4 (Semi), 2 (Final)) en orden descendente
  const bracketOrder = Object.keys(rondas).sort((a, b) => b - a);

  if (!torneoId) return <div className="text-gray-500">Selecciona un torneo para ver el cuadro.</div>;
  if (loading) return <div className="animate-spin h-8 w-8 border-b-2 border-blue-600 mx-auto mt-10"></div>;
  if (error) return <div className="text-red-500 font-medium">{error}</div>;
  if (partidos.length === 0) return <div className="text-gray-500 mt-4">El sorteo aún no se ha generado para este torneo.</div>;

  return (
    <div className="w-full overflow-x-auto bg-gray-50 p-6 rounded-2xl border border-gray-200 mt-6">
      <h3 className="text-2xl font-bold text-gray-800 mb-8 tracking-tight">Cruce de Partidos Generado</h3>
      
      <div className="flex space-x-12 min-w-max">
        {bracketOrder.map((rondaOrden, colIndex) => {
          const partidosDeLaRonda = rondas[rondaOrden];
          // Obtener nombre de la ronda del primer partido
          const nombreRonda = partidosDeLaRonda[0].ronda;

          return (
            <div key={rondaOrden} className="flex flex-col justify-around w-72 space-y-6">
              <h4 className="text-center font-bold text-blue-800 bg-blue-100 rounded-full py-2 shadow-sm uppercase tracking-wider text-xs mb-4">
                {nombreRonda}
              </h4>
              
              {partidosDeLaRonda.map((p, matchIndex) => (
                <div 
                   key={p.id} 
                   className="relative bg-white border-2 border-gray-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all duration-200"
                >
                   {/* Fecha y Cancha Header */}
                   <div className="bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 flex justify-between items-center rounded-t-lg border-b border-gray-200">
                     <span>
                       {p.fecha_hora ? format(new Date(p.fecha_hora), "MMM d, HH:mm", { locale: es }) : 'TBD'}
                     </span>
                     <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-[10px] truncate max-w-[100px]" title={p.cancha?.nombre}>
                       {p.cancha?.nombre || 'Sin Cancha'}
                     </span>
                   </div>

                   {/* Jugador 1 */}
                   <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center space-x-2 truncate">
                         {p.jugador1 ? (
                           <>
                             <span className="font-bold text-gray-800 truncate">{p.jugador1.nombre_completo}</span>
                             <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 rounded-md font-mono border border-blue-100">{p.jugador1.ranking_elo} ELO</span>
                           </>
                         ) : <span className="text-gray-400 italic font-medium">Por definir</span>}
                      </div>
                   </div>

                   {/* VS Badge */}
                   <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-3 bg-white border border-gray-200 text-[10px] font-bold text-gray-400 px-1.5 rounded-full z-10 w-6 h-6 flex items-center justify-center shadow-sm">
                     VS
                   </div>

                   {/* Jugador 2 */}
                   <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center space-x-2 truncate">
                         {p.jugador2 ? (
                           <>
                             <span className="font-bold text-gray-800 truncate">{p.jugador2.nombre_completo}</span>
                             <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 rounded-md font-mono border border-blue-100">{p.jugador2.ranking_elo} ELO</span>
                           </>
                         ) : <span className="text-gray-400 italic font-medium">Por definir</span>}
                      </div>
                   </div>
                   
                   {/* Conector lógico visual entre rondas */}
                   {colIndex < bracketOrder.length - 1 && (
                      <>
                        <div className="absolute top-1/2 right-[-24px] w-6 border-b-2 border-gray-300"></div>
                        {(matchIndex % 2 === 0) && (
                          <div className="absolute top-1/2 right-[-24px] w-0 h-full border-r-2 border-gray-300"></div>
                        )}
                        {(matchIndex % 2 !== 0) && (
                          <div className="absolute bottom-1/2 right-[-24px] w-0 h-full border-r-2 border-gray-300"></div>
                        )}
                      </>
                   )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
