const supabase = require('../services/supabase');

const cargarResultado = async (req, res) => {
  try {
    const { id: partido_id } = req.params;
    const { ganador_id } = req.body;

    if (!ganador_id) {
      return res.status(400).json({ error: 'Debes enviar el id del ganador.' });
    }

    // 1. Obtener y verificar el partido actual
    const { data: partidoActual, error: errPA } = await supabase
      .from('partidos')
      .select('*')
      .eq('id', partido_id)
      .single();

    if (errPA || !partidoActual) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    if (partidoActual.ganador_id) {
      return res.status(400).json({ error: 'El resultado de este partido ya fue cargado' });
    }

    if (partidoActual.jugador1_id !== ganador_id && partidoActual.jugador2_id !== ganador_id) {
      return res.status(400).json({ error: 'El ganador no pertenece a este partido' });
    }

    // 2. Actualizar ganador del partido actual
    const { error: errUpdate } = await supabase
      .from('partidos')
      .update({ ganador_id, estado: 'finalizado' })
      .eq('id', partido_id);

    if (errUpdate) throw errUpdate;

    // 3. Lógica para avanzar de ronda (si no es la final)
    if (partidoActual.ronda_orden > 2) {
      const nextRondaOrden = partidoActual.ronda_orden / 2;
      
      // Mapear nombre de ronda
      const nombreRonda = nextRondaOrden === 2 ? 'Final' 
        : nextRondaOrden === 4 ? 'Semifinal' 
        : nextRondaOrden === 8 ? 'Cuartos de Final' 
        : 'Octavos de Final';

      // 1. Buscamos un partido abierto que necesite Jugador 1
      const { data: q1 } = await supabase
         .from('partidos')
         .select('id, jugador1_id, jugador2_id')
         .eq('torneo_id', partidoActual.torneo_id)
         .eq('ronda_orden', nextRondaOrden)
         .is('jugador1_id', null)
         .order('id', { ascending: true })
         .limit(1);

      if (q1 && q1.length > 0) {
         await supabase.from('partidos').update({ jugador1_id: ganador_id }).eq('id', q1[0].id);
      } else {
         // 2. Buscamos un partido que tenga J1 pero no tenga J2
         const { data: q2 } = await supabase
            .from('partidos')
            .select('id')
            .eq('torneo_id', partidoActual.torneo_id)
            .eq('ronda_orden', nextRondaOrden)
            .not('jugador1_id', 'is', null)
            .is('jugador2_id', null)
            .order('id', { ascending: true })
            .limit(1);
         
         if (q2 && q2.length > 0) {
            await supabase.from('partidos').update({ jugador2_id: ganador_id }).eq('id', q2[0].id);
         } else {
            // 3. No existe slot: creamos uno nuevo con j1 = ganador
            await supabase.from('partidos').insert({
               torneo_id: partidoActual.torneo_id,
               ronda: nombreRonda,
               ronda_orden: nextRondaOrden,
               jugador1_id: ganador_id,
               jugador2_id: null,
               estado: 'programado'
            });
         }
      }
    } else {
       // Acabó la final. Podemos marcar torneo finalizado
       await supabase.from('torneos').update({ estado: 'finalizado' }).eq('id', partidoActual.torneo_id);
    }

    res.json({ message: 'Resultado cargado exitosamente. Ganador avanzado de ronda.' });

  } catch (err) {
    console.error('Error al cargar resultado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  cargarResultado
};
