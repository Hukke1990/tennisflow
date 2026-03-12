import React, { useState } from 'react';
import axios from 'axios';

const diasSemana = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

export default function DisponibilidadForm({ jugadorId }) {
  const [horarios, setHorarios] = useState([]);
  const [status, setStatus] = useState({ loading: false, error: null, success: false });

  const agregarFila = () => {
    setHorarios([...horarios, { dia_semana: 1, hora_inicio: '08:00', hora_fin: '10:00' }]);
  };

  const eliminarFila = (index) => {
    const nuevosHorarios = [...horarios];
    nuevosHorarios.splice(index, 1);
    setHorarios(nuevosHorarios);
  };

  const handleChange = (index, campo, valor) => {
    const nuevosHorarios = [...horarios];
    nuevosHorarios[index][campo] = valor;
    setHorarios(nuevosHorarios);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: null, success: false });

    // Validaciones basicas: hora_inicio < hora_fin
    for (let h of horarios) {
      if (h.hora_inicio >= h.hora_fin) {
        setStatus({ loading: false, error: 'Asegúrate de que la hora de inicio sea menor a la de fin en todas las franjas.', success: false });
        return;
      }
    }

    try {
      await axios.post('http://localhost:3000/api/disponibilidad', {
        jugador_id: jugadorId, 
        horarios: horarios.map(h => ({
          ...h,
          dia_semana: parseInt(h.dia_semana, 10)
        }))
      });
      setStatus({ loading: false, error: null, success: true });
    } catch (err) {
      setStatus({ 
        loading: false, 
        error: err.response?.data?.error || 'Ocurrió un error al guardar tu disponibilidad. Intenta nuevamente.', 
        success: false 
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md mt-10">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Mi Disponibilidad Horaria</h2>

      <form onSubmit={handleSubmit}>
        {horarios.length === 0 ? (
          <p className="text-gray-500 italic mb-4">No has agregado franjas horarias aún. Selecciona 'Agregar Franja Horaria' para empezar.</p>
        ) : (
          <div className="space-y-4 mb-6">
            {horarios.map((horario, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-4 items-center bg-gray-50 p-4 rounded-md border border-gray-200">
                
                <div className="w-full sm:w-1/3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Día</label>
                  <select
                    value={horario.dia_semana}
                    onChange={(e) => handleChange(index, 'dia_semana', e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    {diasSemana.map((dia) => (
                      <option key={dia.value} value={dia.value}>{dia.label}</option>
                    ))}
                  </select>
                </div>

                <div className="w-full sm:w-1/4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                  <input
                    type="time"
                    value={horario.hora_inicio}
                    onChange={(e) => handleChange(index, 'hora_inicio', e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="w-full sm:w-1/4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                  <input
                    type="time"
                    value={horario.hora_fin}
                    onChange={(e) => handleChange(index, 'hora_fin', e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="w-full sm:w-auto mt-6 sm:mt-5 text-center sm:text-left">
                  <button
                    type="button"
                    onClick={() => eliminarFila(index)}
                    className="text-red-600 hover:text-red-800 font-medium px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded transition-colors text-sm"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {status.error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md border border-red-200 text-sm">
            {status.error}
          </div>
        )}

        {status.success && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md border border-green-200 text-sm">
            ¡Disponibilidad guardada con éxito!
          </div>
        )}

        <div className="flex justify-between items-center border-t border-gray-200 pt-6">
          <button
            type="button"
            onClick={agregarFila}
            className="px-4 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition-colors font-medium text-sm"
          >
            + Agregar Franja Horaria
          </button>

          <button
            type="submit"
            disabled={status.loading || horarios.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm disabled:opacity-50"
          >
            {status.loading ? 'Guardando...' : 'Guardar Disponibilidad'}
          </button>
        </div>
      </form>
    </div>
  );
}
