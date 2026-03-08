const supabase = require('../services/supabase');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Convierte un string de tiempo "HH:MM" o "HH:MM:SS" a minutos totales desde las 00:00
 */
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convierte minutos a un string "HH:MM"
 */
function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Obtiene interseccion de disponibilidad entre dos jugadores de al menos 90 minutos (1.5 horas).
 */
function encontrarHuecoComun(disp1, disp2) {
  if (!disp1 || !disp2 || disp1.length === 0 || disp2.length === 0) return null;

  for (let d1 of disp1) {
    for (let d2 of disp2) {
      if (d1.dia_semana === d2.dia_semana) {
        
        const start1 = timeToMinutes(d1.hora_inicio);
        const end1 = timeToMinutes(d1.hora_fin);
        const start2 = timeToMinutes(d2.hora_inicio);
        const end2 = timeToMinutes(d2.hora_fin);

        const commonStart = Math.max(start1, start2);
        const commonEnd = Math.min(end1, end2);

        // Validar si el bloque interseccion abarca al menos 90 minutos
        if (commonEnd - commonStart >= 90) {
          return { 
            dia_semana: d1.dia_semana, 
            hora_inicio: minutesToTime(commonStart), 
            hora_fin: minutesToTime(commonEnd) 
          };
        }
      }
    }
  }
  return null; // Sin hueco de 90 minutos
}

/**
 * Genera el orden correcto del bracket asegurando que los Top Seeds (1 y 2)
 * solo se encuentren en la final.
 */
function generarBracket(seeds) {
   const size = seeds.length; // Debe ser potencia de 2
   if (size === 1) return [0]; // Indice si el tornero de 1 (edge case)

   // Arrancamos el bracket para 2
   let brackets = [1, 2];

   // Lo expandimos de 2 en 2 multiplicando hasta emparejar size (ej 2->4->8->16)
   // La fórmula mágica para bracket de tenis invertido
   while (brackets.length < size) {
     const nextBrackets = [];
     const nextSize = brackets.length * 2;
     const sumObj = nextSize + 1;
     
     for (let i = 0; i < brackets.length; i++) {
        // Enlaza [A, (NextSize+1 - A)]
        nextBrackets.push(brackets[i]);
        nextBrackets.push(sumObj - brackets[i]);
     }
     brackets = nextBrackets;
   }
   
   // Los brackets son el ORDEN. Ej [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
   // Devuelvo en pares para hacer cruce. Los índices reales de array son bracket val - 1
   const matches = [];
   for (let i = 0; i < size; i += 2) {
      matches.push([brackets[i] - 1, brackets[i+1] - 1]);
   }
   
   return matches;
}

const generarSorteo = async (req, res) => {
  try {
    const { id: torneo_id } = req.params;

    const { data: torneo, error: errT } = await supabase.from('torneos').select('*').eq('id', torneo_id).single();
    if (errT || !torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    // Verificar que no existan partidos ya generados para este torneo
    const { count: partidosExistentes } = await supabase
      .from('partidos')
      .select('*', { count: 'exact', head: true })
      .eq('torneo_id', torneo_id);
    
    if (partidosExistentes && partidosExistentes > 0) {
      return res.status(400).json({ 
        error: 'Este torneo ya tiene un sorteo generado. Para regenerarlo, primero elimina los partidos existentes desde el panel de Supabase.' 
      });
    }

    // 1. Obtener inscritos CON PAGO CONFIRMADO
    const { data: inscritos, error: errI } = await supabase
      .from('inscripciones')
      .select(`
        jugador_id,
        perfiles ( id, nombre_completo, ranking_elo )
      `)
      .eq('torneo_id', torneo_id)
      .eq('estado', 'confirmada')
      .eq('pago_confirmado', true);

    if (errI) {
      console.error('Error al obtener inscripciones:', errI);
      return res.status(500).json({ error: 'Error al obtener inscripciones', details: errI.message });
    }
    
    if (inscritos.length < 2) {
      return res.status(400).json({ error: 'Se requiere un mínimo de 2 jugadores con pago confirmado.' });
    }

    // Obtener los IDs de los jugadores inscritos
    const jugadorIds = inscritos.map(i => i.jugador_id);

    // Obtener disponibilidades de todos los jugadores de una vez
    const { data: disponibilidades, error: errD } = await supabase
      .from('disponibilidad_jugador')
      .select('jugador_id, dia_semana, hora_inicio, hora_fin')
      .in('jugador_id', jugadorIds);

    if (errD) {
      console.error('Error al obtener disponibilidades:', errD);
      return res.status(500).json({ error: 'Error al obtener disponibilidades' });
    }

    // Mapear disponibilidades por jugador_id para acceso rápido
    const dispPorJugador = {};
    for (const d of (disponibilidades || [])) {
      if (!dispPorJugador[d.jugador_id]) dispPorJugador[d.jugador_id] = [];
      dispPorJugador[d.jugador_id].push(d);
    }

    // 2. Ordenar por Ranking ELO (Mayor a Menor) para sembrar
    const jugadoresOrdenados = inscritos.map(i => ({
      ...i,
      disponibilidad_jugador: dispPorJugador[i.jugador_id] || []
    })).sort((a, b) => 
      (b.perfiles.ranking_elo || 1200) - (a.perfiles.ranking_elo || 1200)
    );

    // 3. Rellenar con BYEs hasta ser potencia de 2 (2, 4, 8, 16, 32)
    let n = jugadoresOrdenados.length;
    let bracketSize = 2;
    while (bracketSize < n) bracketSize *= 2;

    const completados = [...jugadoresOrdenados];
    const byesNeeded = bracketSize - n;
    
    // Anadimos objetos "BYE" fantasma al final del array
    for (let i = 0; i < byesNeeded; i++) {
       completados.push({ isBye: true });
    }

    // 4. Formatear semilla y encriptar Bracket
    // Convertimos la lista plana completados a un arreglo de cruces perfectos de tipo [Seed A vs Seed B]
    const paresDeBracketIdces = generarBracket(completados);

    // Determinar nombre ronda
    let nombreRonda = 'Primera Ronda';
    if (bracketSize === 2) nombreRonda = 'Final';
    else if (bracketSize === 4) nombreRonda = 'Semifinal';
    else if (bracketSize === 8) nombreRonda = 'Cuartos de Final';
    else if (bracketSize === 16) nombreRonda = 'Octavos de Final';

    // Obtener canchas disponibles para asignar al random
    const { data: canchas } = await supabase.from('canchas').select('id').eq('esta_disponible', true);

    const matchesToInsert = [];

    // Recorrer los pares matemáticos
    for (let par of paresDeBracketIdces) {
       const j1 = completados[par[0]];
       const j2 = completados[par[1]];
       
       let fecha_hora = null;
       let cancha_id = null;
       let notas = null;
       let jugador1_id = null;
       let jugador2_id = null;
       let ganador_id = null;

       // Lógica de validación
       if (j1.isBye && j2.isBye) {
           // Skip o tratar como ronda cancelada
           continue; 
       } else if (j2.isBye) {
           // Jugador 1 avanza directo (Gana por WT / BYE)
           jugador1_id = j1.jugador_id;
           ganador_id = j1.jugador_id;
           notas = "Avanza por BYE";
       } else if (j1.isBye) {
           // Jugador 2 avanza directo
           jugador2_id = j2.jugador_id;
           ganador_id = j2.jugador_id;
           notas = "Avanza por BYE";
       } else {
           // Partido normal entre dos jugadores reales
           jugador1_id = j1.jugador_id;
           jugador2_id = j2.jugador_id;
           
           // Matchmaking de 90 mins
           const hueco = encontrarHuecoComun(j1.disponibilidad_jugador, j2.disponibilidad_jugador);
           
           if (hueco) {
               // Asignar Cancha Dummy
               if (canchas && canchas.length > 0) {
                 cancha_id = canchas[Math.floor(Math.random() * canchas.length)].id;
               }

               // Asignar Fecha Dummy al dia de la semana que encaje
               const baseDate = new Date(torneo.fecha_inicio);
               const currentDay = baseDate.getDay();
               const daysToAdd = (hueco.dia_semana - currentDay + 7) % 7;
               baseDate.setDate(baseDate.getDate() + daysToAdd);
               
               const [hours, mins] = hueco.hora_inicio.split(':');
               baseDate.setHours(parseInt(hours, 10), parseInt(mins, 10), 0, 0);

               fecha_hora = baseDate.toISOString();
           } else {
               // Falló Matchmaking >= 90 mins
               fecha_hora = null; 
               notas = "Conflicto de horarios";
           }
       }

       matchesToInsert.push({
         torneo_id,
         ronda: nombreRonda,
         ronda_orden: bracketSize,
         jugador1_id,
         jugador2_id,
         ganador_id,
         fecha_hora,
         cancha_id,
         estado: ganador_id ? 'finalizado' : 'programado',
         notas
       });
    }

    // Insertar en la tabla partidos
    const { data: partidosInsertados, error: errP } = await supabase
      .from('partidos')
      .insert(matchesToInsert)
      .select();

    if (errP) {
      console.error('Error insertando partidos:', errP);
      return res.status(500).json({ error: 'Error al generar el cuadro de torneo.' });
    }

    // Actualizar estado del torneo a 'en_progreso'
    await supabase.from('torneos').update({ estado: 'en_progreso' }).eq('id', torneo_id);

    return res.json({ 
      message: 'Sorteo generado exitosamente considerando ELO, BYEs y conflicto de horarios.', 
      ronda: nombreRonda,
      partidos: partidosInsertados
    });

  } catch (err) {
    console.error('Error en sorteo alg:', err);
    res.status(500).json({ error: 'Error interno de servidor' });
  }
};

const obtenerCuadroTorneo = async (req, res) => {
  try {
    const torneoId = req.params.id;

    if (!UUID_REGEX.test(torneoId)) {
      return res.status(400).json({ error: 'El torneoId es invalido.' });
    }

    const { data: torneo, error: torneoError } = await supabase
      .from('torneos')
      .select('id')
      .eq('id', torneoId)
      .single();

    if (torneoError || !torneo) {
      return res.status(404).json({ error: 'Torneo no encontrado' });
    }

    const { data: partidosRaw, error } = await supabase
      .from('partidos')
      .select('id, ronda, ronda_orden, fecha_hora, notas, ganador_id, jugador1_id, jugador2_id, cancha_id')
      .eq('torneo_id', torneoId)
      .order('ronda_orden', { ascending: false })
      .order('fecha_hora', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    if (error) {
      console.error('Error al obtener cuadro:', {
        torneoId,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return res.status(500).json({ error: 'Error al obtener cuadro' });
    }

    if (!partidosRaw || partidosRaw.length === 0) {
      console.info('Cuadro consultado sin partidos:', { torneoId, cantidadPartidos: 0 });
      return res.status(200).json([]);
    }

    const jugadorIds = [...new Set(
      partidosRaw
        .flatMap((p) => [p.jugador1_id, p.jugador2_id])
        .filter(Boolean),
    )];

    const canchaIds = [...new Set(partidosRaw.map((p) => p.cancha_id).filter(Boolean))];

    let perfilesRaw = [];
    if (jugadorIds.length > 0) {
      const profileSelectOptions = [
        'id, nombre_completo, ranking_elo, ranking_elo_singles, ranking_elo_dobles',
        'id, nombre_completo, ranking_elo, ranking_elo_singles',
        'id, nombre_completo, ranking_elo',
        'id, nombre_completo, ranking_elo_singles, ranking_elo_dobles',
        'id, nombre_completo, ranking_elo_singles',
        'id, nombre_completo, ranking_elo_dobles',
        'id, nombre_completo',
      ];

      let perfilesError = null;

      for (const selectColumns of profileSelectOptions) {
        const { data: perfilesData, error: currentError } = await supabase
          .from('perfiles')
          .select(selectColumns)
          .in('id', jugadorIds);

        if (!currentError) {
          perfilesRaw = perfilesData || [];
          perfilesError = null;
          break;
        }

        perfilesError = currentError;

        const isMissingColumn = currentError.code === '42703' || /column .* does not exist/i.test(currentError.message || '');
        if (!isMissingColumn) {
          break;
        }
      }

      if (perfilesError) {
        console.error('Error al obtener perfiles para cuadro:', {
          torneoId,
          message: perfilesError.message,
          details: perfilesError.details,
          hint: perfilesError.hint,
          code: perfilesError.code,
        });
        return res.status(500).json({ error: 'Error al obtener cuadro' });
      }
    }

    let canchasRaw = [];
    if (canchaIds.length > 0) {
      const { data: canchasData, error: canchasError } = await supabase
        .from('canchas')
        .select('id, nombre')
        .in('id', canchaIds);

      if (canchasError) {
        console.error('Error al obtener canchas para cuadro:', {
          torneoId,
          message: canchasError.message,
          details: canchasError.details,
          hint: canchasError.hint,
          code: canchasError.code,
        });
        return res.status(500).json({ error: 'Error al obtener cuadro' });
      }

      canchasRaw = canchasData || [];
    }

    const perfilById = new Map(
      perfilesRaw.map((p) => {
        const rankingBase = p.ranking_elo ?? p.ranking_elo_singles ?? p.ranking_elo_dobles ?? null;
        return [
          p.id,
          {
            id: p.id,
            nombre_completo: p.nombre_completo,
            ranking_elo: rankingBase,
          },
        ];
      }),
    );

    const canchaById = new Map(
      canchasRaw.map((c) => [
        c.id,
        {
          nombre: c.nombre ?? null,
        },
      ]),
    );

    const data = partidosRaw.map((p) => ({
      id: p.id,
      ronda: p.ronda,
      ronda_orden: p.ronda_orden,
      fecha_hora: p.fecha_hora,
      notas: p.notas ?? null,
      ganador_id: p.ganador_id,
      cancha: p.cancha_id ? (canchaById.get(p.cancha_id) || null) : null,
      jugador1: p.jugador1_id ? (perfilById.get(p.jugador1_id) || null) : null,
      jugador2: p.jugador2_id ? (perfilById.get(p.jugador2_id) || null) : null,
    }));

    console.info('Cuadro obtenido correctamente:', { torneoId, cantidadPartidos: data.length });

    return res.status(200).json(data);
  } catch (err) {
    console.error('Error inesperado al obtener cuadro:', {
      torneoId: req.params.id,
      message: err.message,
      stack: err.stack,
    });
    return res.status(500).json({ error: 'Error al obtener cuadro' });
  }
};

module.exports = {
  generarSorteo,
  obtenerCuadroTorneo
};
