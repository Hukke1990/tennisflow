const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'dummy_key';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const nombresFalsos = [
  "Roger Federer",
  "Rafael Nadal",
  "Novak Djokovic",
  "Andy Murray",
  "Carlos Alcaraz",
  "Jannik Sinner",
  "Daniil Medvedev",
  "Alexander Zverev"
];

async function generarData() {
  console.log('Iniciando script de poblado de base de datos...');

  const torneo_id = '80aa40d8-f99f-4ff3-af3b-75d621d6d137'; // ID hardcodeado de "Torneo Test 02"
  console.log(`📌 Torneo objetivo ID: ${torneo_id}`);

  const idsMuestra = [
    "0f0b2dcd-e0a5-40d9-9099-a9a84701c4cd",
    "28f9b77f-f8a3-4471-8f7d-ef6b75a2b769",
    "680f7bbb-ed19-4e6f-b3fc-45d63c7d1135",
    "2120455c-ea72-420a-9b2e-da0d35b82dbc",
    "12acb91f-4c38-4ab5-9023-b0f0db9d708d",
    "907208c5-262c-46e4-88ce-8892bb9625e0",
    "f102e428-8332-4085-8a10-f5e60f08b70b",
    "99d8af9e-9c1f-4c1d-88dc-f117b20adce4"
  ];

  console.log(`📌 Actualizando nombres y ELO de los perfiles recién creados...`);
  
  for (let i = 0; i < idsMuestra.length; i++) {
    // Usamos UPSERT para crear en `perfiles` si el trigger de Supabase no lo hizo, o actualizar si ya exsiten
    const { error: perfilErr } = await supabase.from('perfiles').upsert({
       id: idsMuestra[i],
       nombre_completo: nombresFalsos[i],
       ranking_elo: Math.floor(1000 + (Math.random() * 800)),
       es_admin: false
    });
    if (perfilErr) console.log("Advertencia guardando perfil:", perfilErr.message);
  }

  console.log(`📌 Limpiando y creando franjas horarias aleatorias...`);
  
  // Limpiamos disponibilidades previas e inscripciones
  await supabase.from('disponibilidad_jugador').delete().in('jugador_id', idsMuestra);
  await supabase.from('inscripciones').delete().eq('torneo_id', torneo_id);
  
  const disponibilidadesNuevas = [];
  const inscripcionesNuevas = [];

  for (let id of idsMuestra) {
    // Les damos alta disponibilidad a casi todos para que el algortimo no falle fácil (Lunes a Viernes de 18 a 22hs)
    for (let dia = 1; dia <= 5; dia++) {
       disponibilidadesNuevas.push({
         jugador_id: id,
         dia_semana: dia,
         hora_inicio: '18:00',
         hora_fin: '22:00'
       });
    }

    // Y los anotamos de una vez al torneo con el pago validado
    inscripcionesNuevas.push({
      torneo_id: torneo_id,
      jugador_id: id,
      estado: 'confirmada',
      pago_confirmado: true
    });
  }

  const { error: errorDispo } = await supabase.from('disponibilidad_jugador').insert(disponibilidadesNuevas);
  if (errorDispo) {
    console.error('❌ Error guardando disponibilidades:', errorDispo);
    return;
  }

  const { error: errorInsc } = await supabase.from('inscripciones').insert(inscripcionesNuevas);
  if (errorInsc) {
    console.error('❌ Error guardando inscripciones:', errorInsc);
    return;
  }

  console.log('✅ ¡Script Completado! Los 8 jugadores están inscritos, con disponibilidad asignada y listos para sortear.');
}

generarData();
