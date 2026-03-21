import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, BarChart2, Users, Zap, Star, Medal, ShieldCheck, ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import setGoMarkFallback from '../assets/setgo-mark.svg';

// ── Mock Player Card (Mi Ficha del Jugador) ───────────────────────────────────────────────────────
function MockPlayerCard() {
  return (
    <div className="relative w-full max-w-[280px] mx-auto rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#f0f2f5] text-slate-900">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0a0f1e]">
        <span className="text-[10px] text-slate-400 font-black tracking-wide">SetGo</span>
        <div className="flex gap-1">
          <div className="w-3 h-1 rounded-full bg-slate-700" />
          <div className="w-1 h-1 rounded-full bg-slate-700" />
        </div>
      </div>

      {/* ── Profile header banner ── */}
      <div className="relative h-[78px] bg-gradient-to-br from-[#0b2a4a] via-[#0e3d6e] to-[#1560a8] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_25%,rgba(166,206,57,0.10),transparent_55%)]" />
        <div className="absolute inset-y-0 left-[70px] right-3 flex flex-col justify-center">
          <p className="text-[6px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Mi Ficha de Jugador</p>
          <p className="text-[13px] font-black text-white leading-tight">Gastón Ramírez</p>
          <p className="text-[7px] text-blue-300/80">gaston@setgo.app</p>
        </div>
      </div>

      {/* ── Avatar overlapping header ── */}
      <div className="px-3 -mt-7 flex items-end gap-2 mb-1">
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-full ring-[2.5px] ring-white bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-xl" style={{ boxShadow: '0 0 0 2.5px white, 0 0 0 4px rgba(166,206,57,0.30)' }}>
            GR
          </div>
          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white" />
        </div>
        <div className="pb-1 flex flex-wrap gap-1">
          {['Singles 1a', 'Dobles 3a', 'Masculino'].map((pill) => (
            <span key={pill} className="rounded-full bg-white/20 border border-white/30 backdrop-blur-sm px-1.5 py-0.5 text-[7px] font-black text-white">
              {pill}
            </span>
          ))}
        </div>
      </div>

      {/* ── Ranking panels ── */}
      <div className="mx-3 grid grid-cols-2 rounded-xl overflow-hidden ring-1 ring-white/20 mb-2 shadow-md">
        <div className="flex flex-col items-center py-2.5 px-2 bg-gradient-to-br from-[#8a6218] via-[#c9a032] to-[#f0d778]">
          <div className="flex items-center gap-1 mb-1">
            <Star className="h-2.5 w-2.5 text-amber-900/70" fill="currentColor" />
            <p className="text-[7px] font-extrabold uppercase tracking-widest text-amber-900/70">Ranking Singles</p>
          </div>
          <p className="text-[18px] font-black text-amber-950 leading-none">---</p>
          <span className="mt-1 rounded-full bg-amber-950/20 px-2 py-0.5 text-[7px] font-black text-amber-950">Categoría 1a</span>
        </div>
        <div className="flex flex-col items-center py-2.5 px-2 bg-gradient-to-bl from-[#0e3157] via-[#1a5689] to-[#2f8ec6] border-l border-white/10">
          <div className="flex items-center gap-1 mb-1">
            <Trophy className="h-2.5 w-2.5 text-blue-200/60" />
            <p className="text-[7px] font-extrabold uppercase tracking-widest text-blue-200/70">Ranking Dobles</p>
          </div>
          <p className="text-[18px] font-black text-white leading-none">---</p>
          <span className="mt-1 rounded-full bg-white/15 px-2 py-0.5 text-[7px] font-black text-blue-100">Categoría 3a</span>
        </div>
      </div>

      {/* ── Rendimiento Actual ── */}
      <div className="mx-3 mb-2 rounded-xl bg-white border border-slate-200 p-2.5 shadow-sm">
        <p className="text-[7px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Rendimiento Actual</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Partidos Jugados', val: '24' },
            { label: 'Victorias',         val: '18' },
            { label: 'Efectividad',        val: '75%' },
          ].map(({ label, val }) => (
            <div key={label} className="text-center">
              <p className="text-[14px] font-black text-slate-900 leading-none">{val}</p>
              <p className="text-[7px] text-slate-500 font-medium mt-0.5 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="mx-3 mb-2 grid grid-cols-2 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        {['Mi Perfil', 'Mi Actividad'].map((tab, i) => (
          <div key={tab} className={`py-1.5 text-center text-[8px] font-black ${
            i === 0 ? 'bg-[#0e3d6e] text-white' : 'text-slate-400 bg-white'
          }`}>{tab}</div>
        ))}
      </div>

      {/* ── Datos columns ── */}
      <div className="mx-3 mb-3 grid grid-cols-2 gap-2">
        {/* Datos Personales */}
        <div className="rounded-xl bg-white border border-slate-200 p-2 shadow-sm">
          <p className="text-[7px] font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">Datos Personales</p>
          {[
            { label: 'Nombre', val: 'Gastón R.' },
            { label: 'Sexo',   val: 'Caballeros' },
            { label: 'Ciudad', val: 'Cdad. Uruguay' },
          ].map(({ label, val }) => (
            <div key={label} className="mb-1">
              <p className="text-[6px] text-slate-400 font-bold uppercase">{label}</p>
              <p className="text-[8px] font-black text-slate-700 truncate">{val}</p>
            </div>
          ))}
        </div>
        {/* Datos Técnicos */}
        <div className="rounded-xl bg-white border border-slate-200 p-2 shadow-sm">
          <p className="text-[7px] font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">Datos Técnicos</p>
          {[
            { label: 'Altura', val: '185 cm' },
            { label: 'Peso',   val: '82 kg'  },
            { label: 'Mano',   val: 'Diestro' },
            { label: 'Revés',  val: '1 mano'  },
          ].map(({ label, val }) => (
            <div key={label} className="mb-1">
              <p className="text-[6px] text-slate-400 font-bold uppercase">{label}</p>
              <p className="text-[8px] font-black text-slate-700">{val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Gradient Divider ────────────────────────────────────────────────────────────────────────────
function GradientDivider({ from = 'emerald' }) {
  const via = from === 'gold' ? 'via-[#d9b857]/35' : 'via-emerald-500/30';
  return (
    <div className={`my-0 h-px w-full bg-gradient-to-r from-transparent ${via} to-transparent`} />
  );
}

// ── Mock Ranking Screen ─────────────────────────────────────────────────────────────────────────
function MockRankingScreen() {
  // Dobles ranking data from screenshot
  const podium = [
    { pos: 2, ini: 'FM', name: 'Franco Medina',    comp: 'M. Lemos',   pts: 25, color: 'from-slate-500 to-slate-700', border: 'ring-slate-400/40', icon: '🥈' },
    { pos: 1, ini: 'AS', name: 'Agustin Sosa',     comp: 'T. Ojeda',   pts: 25, color: 'from-blue-500 to-indigo-600', border: 'ring-[#d9b857]/70',  icon: '🥇' },
    { pos: 3, ini: 'GP', name: 'Guillermo Palma',  comp: 'L. Vega',    pts: 25, color: 'from-blue-400 to-blue-600',   border: 'ring-amber-500/40',  icon: '🥉' },
  ];
  const rows = [
    { pos: 1, ini: 'AS', name: 'Agustin Sosa',    comp: 'Tomas Ojeda',   pts: 25, h: true  },
    { pos: 2, ini: 'FM', name: 'Franco Medina',   comp: 'Marcos Lemos',  pts: 25, h: false },
    { pos: 3, ini: 'GP', name: 'Guillermo Palma', comp: 'Luciano Vega',  pts: 25, h: false },
  ];

  return (
    <div className="w-full max-w-[280px] mx-auto rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#f0f2f5]">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0a0f1e]">
        <span className="text-[10px] text-slate-400 font-black tracking-wide">SetGo</span>
        <div className="flex gap-1">
          <div className="w-3 h-1 rounded-full bg-slate-700" />
          <div className="w-1 h-1 rounded-full bg-slate-700" />
        </div>
      </div>

      {/* ── Page header ── */}
      <div className="bg-white px-3 pt-2.5 pb-0 border-b border-slate-200">
        <p className="text-[13px] font-black text-slate-900">Rankings</p>
        <p className="text-[8px] text-blue-500 font-bold mb-2">Leaderboard de elite por puntos ELO</p>

        {/* Filtro Inteligente */}
        <div className="rounded-xl bg-[#0a1728] p-2 mb-2">
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <p className="text-[6px] font-extrabold uppercase tracking-[0.15em] text-slate-500">Filtros activos</p>
              <p className="text-[8px] font-black text-white">Filtro Inteligente</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[6px] font-black text-emerald-300 whitespace-nowrap">Dobles · 1a</span>
            </span>
          </div>
          <div className="flex gap-1">
            {[
              { label: 'MODALIDAD', val: 'Dobles',     active: true  },
              { label: 'SEXO',      val: 'Caballeros', active: false },
              { label: 'CATEGORÍA', val: '1a',         active: false },
            ].map(({ label, val, active }) => (
              <div key={label} className={`flex-1 rounded-lg border px-1.5 py-1 ${
                active ? 'border-emerald-500/40 bg-emerald-500/15' : 'border-white/[0.07] bg-white/[0.04]'
              }`}>
                <p className="text-[5px] font-extrabold uppercase tracking-wider text-slate-500">{label}</p>
                <p className={`text-[7px] font-black truncate ${active ? 'text-emerald-300' : 'text-slate-300'}`}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Podio de Honor ── */}
      <div className="bg-gradient-to-b from-[#0c1e38] to-[#081528] px-3 pt-2 pb-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-black text-white">Podio de Honor</p>
          <span className="text-[7px] font-extrabold text-slate-500 uppercase tracking-widest">TOP 3</span>
        </div>
        <div className="flex items-end justify-center gap-1.5">
          {podium.map(({ pos, ini, name, comp, pts, color, border, icon }) => (
            <div
              key={pos}
              className={`flex flex-col items-center rounded-xl border bg-[#0d1e35] px-1.5 py-2 ring-1 ${border} ${
                pos === 1 ? 'pb-3' : 'opacity-90'
              }`}
              style={{ width: pos === 1 ? '88px' : '74px' }}
            >
              <span className="text-sm leading-none mb-0.5">{icon}</span>
              {pos === 1 && <Trophy className="h-2.5 w-2.5 text-[#d9b857] mb-0.5" />}
              <p className="text-[6px] font-black text-slate-500 mb-1">#{pos}</p>
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[8px] font-black mb-0.5 shadow`}>
                {ini}
              </div>
              <p className="text-[10px] font-black text-white leading-none">{pts}</p>
              <p className="text-[6px] text-slate-500 font-bold">pts ELO</p>
              <p className="text-[7px] text-slate-300 font-black mt-0.5 text-center leading-none">{name}</p>
              <span className="mt-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 px-1.5 py-0.5 text-[6px] font-bold text-blue-300">
                + {comp}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabla de Posición ── */}
      <div className="bg-white">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200">
          <div>
            <p className="text-[8px] font-extrabold uppercase tracking-widest text-slate-600">Tabla de Posición</p>
            <p className="text-[7px] text-slate-400">32 jugadores encontrados</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-[#d9b857]/10 border border-[#d9b857]/40 px-1.5 py-0.5">
            <span className="w-1 h-1 rounded-full bg-[#d9b857] animate-pulse" />
            <span className="text-[7px] font-black text-[#d9b857]">Ranking en vivo</span>
          </span>
        </div>
        {/* Headers */}
        <div className="grid grid-cols-[24px_1fr_auto] gap-x-2 px-3 py-1 border-b border-slate-100">
          {['PUESTO', 'JUGADOR / COMPAÑERO', 'ELO'].map(h => (
            <p key={h} className="text-[6px] font-extrabold uppercase tracking-widest text-slate-400">{h}</p>
          ))}
        </div>
        {rows.map(({ pos, ini, name, comp, pts, h }) => (
          <div key={pos} className={`grid grid-cols-[24px_1fr_auto] gap-x-2 items-center px-3 py-1.5 border-b border-slate-100 last:border-0 ${
            h ? 'bg-[#d9b857]/5' : ''
          }`}>
            <span className={`text-[9px] font-black ${h ? 'text-[#d9b857]' : 'text-slate-400'}`}>#{pos}</span>
            <div className="flex items-start gap-1.5 min-w-0">
              <div className="w-5 h-5 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[7px] font-black mt-0.5">
                {ini}
              </div>
              <div className="min-w-0">
                <p className={`text-[8px] font-black truncate ${h ? 'text-[#d9b857]' : 'text-slate-800'}`}>{name}</p>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1 py-0.5">
                  <span className="text-[6px] font-black text-blue-600">+ {comp}</span>
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-[9px] font-black tabular-nums ${h ? 'text-[#d9b857]' : 'text-slate-700'}`}>{pts}</p>
              <p className="text-[6px] text-slate-400">ELO</p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

// ── Mock Torneos Screen (Cartelera) ───────────────────────────────────────────────────────────────────────
function MockTorneosScreen() {
  return (
    <div className="w-full max-w-[280px] mx-auto rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#f0f2f5]">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0a0f1e]">
        <span className="text-[10px] text-slate-400 font-black tracking-wide">SetGo</span>
        <div className="flex gap-1">
          <div className="w-3 h-1 rounded-full bg-slate-700" />
          <div className="w-1 h-1 rounded-full bg-slate-700" />
        </div>
      </div>

      {/* ── Page header ── */}
      <div className="bg-white px-3 pt-2.5 pb-2 border-b border-slate-200">
        <p className="text-[13px] font-black text-slate-900">Torneos</p>
        <p className="text-[8px] text-blue-500 font-bold mb-2">Cartelera de torneos, estado e inscripción</p>
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 mr-2">
            <span className="text-[7px] text-slate-400">Buscar por nombre, categoría...</span>
          </div>
          <div className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-[7px] text-slate-500 font-bold whitespace-nowrap">Más recientes</div>
        </div>
        <div className="flex gap-1">
          {['Todos (7)', 'Activos (7)', 'Inscripción Abierta (3)', 'Finalizados (0)'].map((t, i) => (
            <span key={t} className={`rounded-full px-1.5 py-0.5 text-[6px] font-extrabold whitespace-nowrap ${
              i === 0 ? 'bg-[#d9b857] text-slate-900' : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}>{t}</span>
          ))}
        </div>
      </div>

      {/* ── Tournament card 1 ── */}
      <div className="mx-2.5 mt-2.5 rounded-2xl overflow-hidden ring-1 ring-white/20 shadow-lg">
        <div className="relative h-[50px] bg-gradient-to-r from-[#0b2a4a] via-[#0e3d6e] to-[#b8861a] overflow-hidden">
          <svg className="absolute right-2 top-1 opacity-20" width="58" height="38" viewBox="0 0 60 40">
            <rect x="4" y="4" width="52" height="32" fill="none" stroke="white" strokeWidth="1.5" />
            <line x1="30" y1="4" x2="30" y2="36" stroke="white" strokeWidth="1" />
            <line x1="4" y1="20" x2="56" y2="20" stroke="white" strokeWidth="1" />
          </svg>
          <span className="absolute top-2 right-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[6px] font-black text-slate-800">EN_PROGRESO</span>
          <div className="absolute bottom-2 left-2.5">
            <p className="text-[6px] text-slate-400">viernes 27 de marzo, 2026 · 16:24</p>
            <p className="text-[10px] font-black text-white leading-tight">Categoria Primera Dobles</p>
          </div>
        </div>
        <div className="bg-[#0c1a2e] grid grid-cols-3 border-t border-white/[0.06]">
          {[
            { label: 'CATEGORÍA', val: 'Cat 1'     },
            { label: 'MODALIDAD', val: 'Dobles'    },
            { label: 'SEXO',      val: 'Masculino' },
            { label: 'SUPERFICIE',val: 'Mixta'     },
            { label: 'INICIO',    val: '27 mar'    },
            { label: 'COSTO',     val: '$10.000'   },
          ].map(({ label, val }) => (
            <div key={label} className="px-2 py-1.5">
              <p className="text-[5px] font-extrabold uppercase tracking-widest text-slate-600">{label}</p>
              <p className="text-[8px] font-black text-slate-200 truncate">{val}</p>
            </div>
          ))}
        </div>
        <div className="bg-[#0a1525] px-2.5 py-1.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[6px] text-slate-500 font-bold">Inscriptos confirmados</p>
            <span className="text-[7px] font-black text-slate-300">32</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500 to-[#a6ce39]" />
          </div>
          <p className="text-[6px] text-emerald-400/80 mt-1">Torneo en juego. Ver cuadro y cronograma en vivo.</p>
        </div>
        <div className="bg-[#0a1525] px-2.5 pb-2 grid grid-cols-3 gap-1.5">
          {[{ l: 'Inscriptos', v: '32' }, { l: 'Costo', v: '$10.000' }, { l: 'Pendientes', v: '0' }].map(({ l, v }) => (
            <div key={l} className="rounded-lg bg-[#07101e] border border-white/[0.07] p-1.5 text-center">
              <p className="text-[6px] text-slate-600 font-bold uppercase">{l}</p>
              <p className={`text-[10px] font-black ${v === '0' ? 'text-emerald-400' : 'text-slate-200'}`}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tournament card 2 (preview) ── */}
      <div className="mx-2.5 mt-1.5 mb-3 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow">
        <div className="relative h-[40px] bg-gradient-to-r from-[#0b2a4a] via-[#0e3d6e] to-[#b8861a] overflow-hidden">
          <svg className="absolute right-2 top-1 opacity-15" width="48" height="30" viewBox="0 0 60 40">
            <rect x="4" y="4" width="52" height="32" fill="none" stroke="white" strokeWidth="1.5" />
            <line x1="30" y1="4" x2="30" y2="36" stroke="white" strokeWidth="1" />
          </svg>
          <span className="absolute top-2 right-2 rounded-md bg-white/80 px-1.5 py-0.5 text-[6px] font-black text-slate-800">EN_PROGRESO</span>
          <div className="absolute bottom-1.5 left-2.5">
            <p className="text-[6px] text-slate-400">viernes 27 de marzo, 2026 · 15:22</p>
            <p className="text-[9px] font-black text-white leading-tight">Categoria Primera 24 Jugadores</p>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Mock Cuadro Screen (Bracket) ─────────────────────────────────────────────────────────────────────────
function MockCuadroScreen() {
  // Reusable player row
  const PR = ({ name, seed, winner, live }) => (
    <div className={`flex items-center gap-1 px-1.5 py-[4px] border-b border-white/[0.04] last:border-0 ${
      winner ? 'bg-[#0e2a46]' : live ? 'bg-[#071f0e]' : 'bg-[#07101e]'
    }`}>
      <div className={`relative w-3 h-3 rounded-full shrink-0 ${
        live ? 'bg-emerald-400 animate-pulse' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
      }`}>
        {seed && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#d9b857] flex items-center justify-center text-[4px] font-black text-slate-900">{seed}</span>
        )}
      </div>
      <span className={`text-[7px] font-bold flex-1 truncate ${
        winner ? 'text-white' : live ? 'text-emerald-300' : 'text-slate-500'
      }`}>{name}</span>
      {winner && <span className="text-[5px] font-black text-[#a6ce39]">W</span>}
    </div>
  );

  const MatchCard = ({ players, live, label }) => (
    <div className={`rounded-lg overflow-hidden ring-1 ${
      live ? 'ring-emerald-500/40' : 'ring-white/[0.06]'
    } mb-1`}>
      {players.map((p, i) => <PR key={i} {...p} />)}
      {label && (
        <div className={`px-1.5 py-0.5 text-center text-[6px] font-extrabold uppercase tracking-wider ${
          live ? 'bg-emerald-900/40 text-emerald-400' : 'bg-[#060d1c] text-slate-600'
        }`}>{label}</div>
      )}
    </div>
  );

  return (
    <div className="w-full max-w-[280px] mx-auto rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#07101e]">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#040c1a]">
        <span className="text-[10px] text-slate-400 font-black tracking-wide">SetGo</span>
        <div className="flex gap-1">
          <div className="w-3 h-1 rounded-full bg-slate-700" />
          <div className="w-1 h-1 rounded-full bg-slate-700" />
        </div>
      </div>

      <div className="bg-gradient-to-b from-[#0c1e38] to-[#07101e] px-3 pt-3 pb-4">

        {/* Tournament name */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[6px] font-extrabold uppercase tracking-[0.18em] text-slate-600">Cuadro de juego</p>
            <p className="text-[11px] font-black text-[#d9b857] leading-none">Copa Almafuerte 2026</p>
          </div>
          <span className="rounded-full bg-[#d9b857]/15 border border-[#d9b857]/30 px-2 py-0.5 text-[7px] font-black text-[#d9b857]">32 jug.</span>
        </div>

        {/* ─ 4-column bracket ─ */}
        <div className="flex items-start gap-0.5">

          {/* Col 1: Primera Ronda */}
          <div className="flex flex-col gap-1 flex-1">
            <p className="text-[6px] font-extrabold uppercase text-slate-600 text-center mb-0.5">1ra Ronda</p>
            <MatchCard players={[
              { name: 'S. Gómez',  seed: 1, winner: true  },
              { name: 'F. Ortiz',  seed: null, winner: false },
            ]} label="Programado" />
            <MatchCard players={[
              { name: 'F. Morales', winner: true  },
              { name: 'G. Ibarra',  winner: false },
            ]} label="Programado" />
            <MatchCard players={[
              { name: 'M. Cruz',   seed: 3 },
              { name: 'R. Dom.',   },
            ]} label="Programado" />
            <MatchCard players={[
              { name: 'P. Gutiérrez' },
              { name: 'T. Fernández' },
            ]} label="Programado" />
          </div>

          {/* Connector */}
          <div className="flex flex-col justify-around self-stretch pt-5 opacity-20 shrink-0 gap-[14px]">
            {[0,1,2,3].map(i => <div key={i} className="w-1 h-px bg-slate-400" />)}
          </div>

          {/* Col 2: Cuartos */}
          <div className="flex flex-col gap-1 flex-1">
            <p className="text-[6px] font-extrabold uppercase text-[#a6ce39]/70 text-center mb-0.5">Cuartos</p>
            <MatchCard players={[
              { name: 'S. Gómez',  seed: 1, winner: true },
              { name: 'F. Morales', winner: false },
            ]} label="Programado" />
            <MatchCard players={[
              { name: 'M. Cruz', seed: 3 },
              { name: 'Por def.' },
            ]} label="Programado" />
          </div>

          {/* Connector */}
          <div className="flex flex-col justify-around self-stretch pt-5 opacity-20 shrink-0 gap-5">
            {[0,1].map(i => <div key={i} className="w-1 h-px bg-slate-400" />)}
          </div>

          {/* Col 3: Semifinal */}
          <div className="flex flex-col gap-1 flex-1">
            <p className="text-[6px] font-extrabold uppercase text-slate-600 text-center mb-0.5">Semi</p>
            <MatchCard live players={[
              { name: 'S. Gómez', seed: 1, live: true  },
              { name: 'M. Cruz',   seed: 3, live: true  },
            ]} label="En curso" />
            <MatchCard players={[
              { name: 'Por def.' },
              { name: 'Por def.' },
            ]} label="Programado" />
          </div>

          {/* Connector */}
          <div className="flex flex-col justify-around self-stretch pt-5 opacity-20 shrink-0">
            <div className="w-1 h-px bg-slate-400" />
          </div>

          {/* Col 4: Gran Final */}
          <div className="flex flex-col justify-start flex-1">
            <p className="text-[5px] font-extrabold uppercase text-[#d9b857]/70 text-center mb-0.5">Gran Final</p>
            <div className="rounded-lg overflow-hidden ring-1 ring-[#d9b857]/30 bg-gradient-to-b from-[#1c1400] to-[#0d0c00] mt-1">
              <div className="px-1 py-2 flex flex-col items-center gap-0.5">
                <Trophy className="h-3.5 w-3.5 text-[#d9b857]/60" />
                <span className="text-[5px] font-black text-[#d9b857]/50 uppercase text-center leading-none">Por<br/>definir</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─ GRAN FINAL label ─ */}
        <div className="mt-2.5 flex flex-col items-center">
          <p className="text-[6px] uppercase tracking-[0.2em] text-slate-600 font-bold">Punto de Convergencia</p>
          <p className="text-[13px] font-black text-white tracking-wide leading-none">GRAN FINAL</p>
        </div>

        {/* Live banner */}
        <div className="mt-2.5 flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] font-black text-emerald-300">Partido en vivo</span>
          </div>
          <span className="text-[7px] text-emerald-400/70 font-bold">Cancha 1</span>
        </div>

        {/* Progress pills */}
        <div className="mt-2 flex items-center gap-1 justify-center">
          {['1ra', 'Octavos', 'Cuartos', 'Semi', 'Final'].map((r, i) => (
            <div key={r} className={`h-1 rounded-full ${
              i < 2 ? 'w-5 bg-[#a6ce39]/60'
              : i === 2 ? 'w-5 bg-[#a6ce39]/30 animate-pulse'
              : 'w-2.5 bg-white/10'
            }`} />
          ))}
        </div>
        <p className="text-center text-[6px] text-slate-600 mt-1">Cuartos en curso</p>
      </div>
    </div>
  );
}


// ── Mock Live Match Screen (Dashboard) ─────────────────────────────────────────────────────────
function MockLiveMatchScreen() {
  return (
    <div className="w-full max-w-[280px] mx-auto rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#f0f2f5]">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0a0f1e]">
        <span className="text-[10px] text-slate-400 font-black tracking-wide">SetGo</span>
        <div className="flex gap-1">
          <div className="w-3 h-1 rounded-full bg-slate-700" />
          <div className="w-1 h-1 rounded-full bg-slate-700" />
        </div>
      </div>

      {/* ── Club header card ── */}
      <div className="mx-2.5 mt-2 rounded-2xl overflow-hidden ring-1 ring-white/10">
        <div className="px-3 pt-2.5 pb-2.5 bg-gradient-to-r from-[#0b2340] to-[#0c2a4a]">
          <p className="text-[6px] font-extrabold uppercase tracking-[0.18em] text-[#a6ce39] mb-0.5">Club Activo</p>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <p className="text-[11px] font-black text-white leading-none">
              Tu club: <span className="text-[#a6ce39]">SetGo Demo</span>
            </p>
          </div>
          <p className="text-[7px] text-slate-400">¡Todo listo para tu próximo set! Revisá la actividad en vivo.</p>
        </div>

        {/* Live match card */}
        <div className="bg-[#0c1e38] border-t border-white/[0.06]">
          <div className="flex items-center justify-between px-2.5 py-1 bg-[#0a1a30]">
            <span className="text-[6px] text-slate-500 font-bold uppercase tracking-wide">Categoría Primera 24 Jug.</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[6px] text-slate-400 font-bold">Cancha 3</span>
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1 py-0.5">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[5px] font-black text-emerald-300">EN VIVO</span>
              </span>
            </div>
          </div>
          <div className="flex items-center px-2 py-1.5 gap-2">
            <div className="flex flex-col items-center w-10 shrink-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-[8px] font-black">LU</div>
              <p className="text-[7px] font-bold text-slate-300 text-center mt-0.5 leading-tight">L. Uribe</p>
              <span className="text-[5px] text-slate-600 font-bold border border-white/10 rounded px-1 mt-0.5">LOC</span>
            </div>
            <div className="flex-1">
              <div className="flex items-stretch rounded-lg overflow-hidden ring-1 ring-white/10 bg-[#071628]">
                <div className="flex-1 py-1 text-center">
                  <p className="text-[5px] text-slate-600 font-bold uppercase">SETS</p>
                  <p className="text-[8px] font-black text-slate-500">—</p>
                </div>
                <div className="px-2 py-1 bg-[#d9b857]/15 border-x border-[#d9b857]/20 text-center">
                  <p className="text-[5px] text-[#d9b857]/70 font-bold uppercase">GAME</p>
                  <p className="text-[13px] font-black text-[#d9b857] leading-none">0-0</p>
                </div>
                <div className="flex-1 py-1 text-center">
                  <p className="text-[5px] text-slate-600 font-bold uppercase">GAMES</p>
                  <p className="text-[8px] font-black text-slate-500">—</p>
                </div>
              </div>
              <p className="text-[5px] text-slate-600 text-center mt-0.5">Primer Set · 00:00</p>
            </div>
            <div className="flex flex-col items-center w-10 shrink-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[8px] font-black">RD</div>
              <p className="text-[7px] font-bold text-slate-300 text-center mt-0.5 leading-tight">R. Delgado</p>
              <span className="text-[5px] text-slate-600 font-bold border border-white/10 rounded px-1 mt-0.5">LOC</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI tiles 2×2 ── */}
      <div className="grid grid-cols-2 gap-1.5 px-2.5 py-2">
        {[
          { val: '2',   label: 'Partidos En Vivo',  bg: 'from-blue-700 to-blue-900',      icon: Zap      },
          { val: '2/4', label: 'Canchas Ocupadas',  bg: 'from-slate-600 to-slate-800',    icon: null     },
          { val: '8',   label: 'Torneos Activos',   bg: 'from-amber-600/90 to-amber-900', icon: Trophy   },
          { val: '--',  label: 'Tu Ranking',         bg: 'from-emerald-700 to-emerald-900',icon: BarChart2 },
        ].map(({ val, label, bg, icon: Icon }) => (
          <div key={label} className={`rounded-xl bg-gradient-to-br ${bg} p-2 ring-1 ring-white/[0.07] flex items-center gap-2`}>
            {Icon && <Icon className="h-3.5 w-3.5 text-white/50 shrink-0" />}
            <div>
              <p className="text-[14px] font-black text-white leading-none">{val}</p>
              <p className="text-[7px] text-white/50 font-bold leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Noticias Rápidas ── */}
      <div className="px-2.5 pb-2">
        <p className="text-[9px] font-black text-slate-800 mb-1.5">Noticias Rápidas</p>
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100">
          {[
            { icon: Zap,    color: 'text-emerald-500', msg: '2 partidos en vivo · Cat. Primera',   sub: '4 canchas monitoreadas'   },
            { icon: Trophy, color: 'text-[#d9b857]',   msg: 'Próximo torneo: Categoría Primera',   sub: 'Jue 19 mar · 21:00'       },
            { icon: Medal,  color: 'text-blue-400',    msg: 'Posición de ranking actualizándose',  sub: 'Sin racha activa'         },
          ].map(({ icon: Icon, color, msg, sub }) => (
            <div key={msg} className="flex items-start gap-2 px-2.5 py-1.5">
              <Icon className={`h-3 w-3 ${color} shrink-0 mt-0.5`} />
              <div className="min-w-0">
                <p className="text-[8px] font-bold text-slate-700 leading-tight truncate">{msg}</p>
                <p className="text-[7px] text-slate-400">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Canchas Ahora ── */}
      <div className="px-2.5 pb-3">
        <p className="text-[9px] font-black text-slate-800 mb-1.5">Canchas Ahora</p>
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-2.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-1.5">
            {[
              { name: 'Cancha 1', libre: true  },
              { name: 'Cancha 2', libre: true  },
              { name: 'Cancha 3', libre: false },
              { name: 'Cancha 4', libre: false },
            ].map(({ name, libre }) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${libre ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="text-[8px] font-bold text-slate-600">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-1 border-t border-slate-100">
            <span className="flex items-center gap-1 text-[7px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Disponible</span>
            <span className="flex items-center gap-1 text-[7px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Ocupada</span>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Features Carousel ───────────────────────────────────────────────────────────────────────
const CAROUSEL_SLIDES = [
  {
    id: 'live',
    badge: 'Control en Tiempo Real',
    badgeColor: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    title: 'Tu Club, en Tiempo Real',
    accent: 'text-blue-400',
    description:
      'Panel operativo con partidos en vivo, canchas ocupadas y torneos activos. Todo lo que pasa en el club, en una sola pantalla.',
    bullets: [
      'Partidos en vivo con marcador actualizado',
      'Estado de canchas y disponibilidad instantánea',
      'Métricas clave del club de un vistazo',
    ],
    bulletColor: 'bg-blue-400',
    icon: Zap,
    iconBg: 'bg-blue-500/15 text-blue-300',
    glow: 'from-blue-600/15 to-transparent',
    MockScreen: MockLiveMatchScreen,
  },
  {
    id: 'ranking',
    badge: 'Rankings Automaticos',
    badgeColor: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    title: 'Automatízá tu Ranking',
    accent: 'text-emerald-400',
    description:
      'Calculamos los puntos al instante, olvidate de los Excel. Historial, variaciones de posición y tendencias actualizadas después de cada torneo.',
    bullets: [
      'Cálculo automático post-torneo',
      'Historial de posiciones y variaciones',
      'Ranking separado por categoria y modalidad',
    ],
    bulletColor: 'bg-emerald-400',
    icon: BarChart2,
    iconBg: 'bg-emerald-500/15 text-emerald-300',
    glow: 'from-emerald-600/15 to-transparent',
    MockScreen: MockRankingScreen,
  },
  {
    id: 'profile',
    badge: 'Perfil de Jugador',
    badgeColor: 'border-[#a6ce39]/30 bg-[#a6ce39]/10 text-[#a6ce39]',
    title: 'Tu Perfil Profesional',
    accent: 'text-[#a6ce39]',
    description:
      'Estadísticas detalladas, Player Card dorada y comunidad activa. Cada jugador tiene su carta de presentación dentro del club.',
    bullets: [
      'Player Card con badge dorado para el Top 3',
      'Estadísticas de Singles y Dobles',
      'Tendencia de posición en tiempo real',
    ],
    bulletColor: 'bg-[#a6ce39]',
    icon: Medal,
    iconBg: 'bg-[#a6ce39]/15 text-[#a6ce39]',
    glow: 'from-[#a6ce39]/10 to-transparent',
    MockScreen: MockPlayerCard,
  },
  {
    id: 'torneos',
    badge: 'Cartelera de Torneos',
    badgeColor: 'border-[#d9b857]/30 bg-[#d9b857]/10 text-[#d9b857]',
    title: 'Inscribite y Competí',
    accent: 'text-[#d9b857]',
    description:
      'Navegá la cartelera de torneos activos, filtrá por categoría y confirmá tu inscripción en segundos.',
    bullets: [
      'Torneos filtrados por modalidad y categoría',
      'Estado en tiempo real: Activo, Inscripción Abierta, Finalizado',
      'Inscripción con un clic, sin papeles',
    ],
    bulletColor: 'bg-[#d9b857]',
    icon: Trophy,
    iconBg: 'bg-[#d9b857]/15 text-[#d9b857]',
    glow: 'from-[#d9b857]/10 to-transparent',
    MockScreen: MockTorneosScreen,
  },
  {
    id: 'cuadro',
    badge: 'Cuadros en Vivo',
    badgeColor: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    title: 'Seguí el Cuadro en Vivo',
    accent: 'text-emerald-400',
    description:
      'Sorteo automático, cuadro en tiempo real y partidos en vivo. Cerrá el torneo en minutos sin caos.',
    bullets: [
      'Sorteo automático con cabezas de serie',
      'Partidos en vivo con seguimiento de cancha',
      'Resultados transparentes para jugadores y público',
    ],
    bulletColor: 'bg-emerald-400',
    icon: Zap,
    iconBg: 'bg-emerald-500/15 text-emerald-300',
    glow: 'from-emerald-600/15 to-transparent',
    MockScreen: MockCuadroScreen,
  },
];

const AUTOPLAY_DELAY = 5000;

function FeaturesCarousel() {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const total = CAROUSEL_SLIDES.length;

  const goTo = useCallback((idx) => {
    if (animating) return;
    setAnimating(true);
    setActive(idx);
    setTimeout(() => setAnimating(false), 500);
  }, [animating]);

  const prev = useCallback(() => {
    setPaused(true);
    goTo((active - 1 + total) % total);
  }, [active, total, goTo]);

  const next = useCallback(() => {
    setPaused(true);
    goTo((active + 1) % total);
  }, [active, total, goTo]);

  // Auto-play
  useEffect(() => {
    if (paused) return;
    timerRef.current = setTimeout(() => {
      setActive((prev) => (prev + 1) % total);
    }, AUTOPLAY_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [active, paused, total]);

  const slide = CAROUSEL_SLIDES[active];
  const { MockScreen } = slide;

  // Touch / drag support
  const touchStart = useRef(null);
  const handleTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const delta = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) delta > 0 ? next() : prev();
    touchStart.current = null;
  };

  return (
    <section
      className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Section header */}
      <div className="mb-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#d9b857]/30 bg-[#d9b857]/10 px-4 py-1.5 text-xs font-semibold text-[#d9b857]">
          La plataforma que faltaba
        </span>
        <h2 className="mt-4 text-3xl font-black text-slate-100 sm:text-4xl">
          Todo lo que necesitas, en un solo lugar
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-slate-400">
          Diseñado para clubes que quieren profesionalizar su gestión sin complicaciones.
        </p>
      </div>

      {/* Carousel main card */}
      <div className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#060f24] via-[#0a1633] to-[#040b1f] overflow-hidden shadow-2xl shadow-black/50">
        {/* Glow layer that transitions with slide */}
        <div
          key={slide.id + '-glow'}
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${slide.glow} transition-opacity duration-700`}
        />

        <div className="relative grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-2 lg:gap-16">

          {/* Left: text content */}
          <div
            key={slide.id + '-text'}
            className="order-2 lg:order-1"
            style={{ animation: 'fadeSlideIn 0.45s cubic-bezier(.4,0,.2,1) both' }}
          >
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${slide.badgeColor}`}>
              <slide.icon className="h-3 w-3" />
              {slide.badge}
            </span>

            <h3 className="mt-5 text-3xl font-black leading-tight text-slate-100 sm:text-4xl">
              {slide.title.split('\u00a0').map((part, i, arr) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {i === arr.length - 1
                    ? <span className={slide.accent}>{part}</span>
                    : part
                  }
                </span>
              ))}
            </h3>

            <p className="mt-4 text-base leading-relaxed text-slate-400">
              {slide.description}
            </p>

            <ul className="mt-5 space-y-2.5">
              {slide.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${slide.bulletColor}`} />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: phone mockup */}
          <div
            key={slide.id + '-mock'}
            className="order-1 flex justify-center lg:order-2"
            style={{ animation: 'fadeSlideIn 0.45s cubic-bezier(.4,0,.2,1) both' }}
          >
            <div className="relative">
              <div className={`absolute -inset-10 rounded-full bg-gradient-to-br ${slide.glow} blur-2xl opacity-60`} />
              {/* Phone frame */}
              <div className="relative rounded-[2.5rem] border-4 border-[#1a2a40]/80 bg-[#040c1a] p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_32px_64px_rgba(0,0,0,0.6)]">
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-[#1a2a40]" />
                <div className="w-[280px] overflow-hidden pt-4 pb-2">
                  <MockScreen />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Nav arrows */}
        <button
          type="button"
          onClick={prev}
          aria-label="Slide anterior"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/12 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Slide siguiente"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/12 hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Pagination dots + progress bar */}
      <div className="mt-7 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          {CAROUSEL_SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Ir a slide ${i + 1}`}
              onClick={() => { setPaused(true); goTo(i); }}
              className="group relative flex items-center justify-center"
            >
              <span className={`block rounded-full transition-all duration-300 ${
                i === active
                  ? 'h-2.5 w-8 bg-[#a6ce39] shadow-[0_0_8px_rgba(166,206,57,0.7)]'
                  : 'h-2 w-2 bg-white/20 group-hover:bg-white/40'
              }`} />
            </button>
          ))}
        </div>
        {/* Auto-play progress bar */}
        {!paused && (
          <div className="h-px w-32 overflow-hidden rounded-full bg-white/10">
            <div
              key={active + '-bar'}
              className="h-full rounded-full bg-[#a6ce39]/60"
              style={{ animation: `progressBar ${AUTOPLAY_DELAY}ms linear both` }}
            />
          </div>
        )}
      </div>

      {/* CSS keyframes injected inline */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes progressBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </section>
  );
}

export default function LandingPage() {
  const logoVersion = '20260313-1';
  const [slug, setSlug] = useState('');
  const [logoSrc, setLogoSrc] = useState(`/SetGo.png?v=${logoVersion}`);
  const [logoFallbackApplied, setLogoFallbackApplied] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (normalized) navigate(`/${normalized}`);
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#040b1f] text-white">
      {/* Ambient glows fijos — no interfieren con el scroll */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-cyan-500/8 blur-3xl" />
        <div className="absolute -right-32 top-8 h-80 w-80 rounded-full bg-emerald-500/7 blur-3xl" />
        <div className="absolute left-1/2 top-2/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#d9b857]/5 blur-3xl" />
      </div>

      {/* ══════════════════════════ HERO ════════════════════════════════════════════════ */}
      <section className="relative mx-auto w-full max-w-6xl flex-1 px-4 pt-12 pb-20 sm:px-6 lg:px-10">
        <div className="grid w-full gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:items-center">

          {/* Left: headline + form */}
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-200">
              <Zap className="h-3.5 w-3.5" />
              Gestion moderna para clubes de tenis
            </span>

            <div className="mt-5 flex items-center gap-4">
              <img
                src={logoSrc}
                alt="Logo de SetGo"
                className="h-24 w-auto object-contain sm:h-28"
                width="112"
                height="112"
                onError={() => {
                  if (!logoFallbackApplied) {
                    setLogoSrc(setGoMarkFallback);
                    setLogoFallbackApplied(true);
                  }
                }}
              />
              <span className="font-rajdhani text-6xl font-bold tracking-[0.03em] text-slate-100 sm:text-7xl">
                Set<span className="text-[#A6CE39]">Go</span>
              </span>
            </div>

            <h1 className="mt-6 max-w-xl text-4xl font-black leading-tight text-slate-100 sm:text-5xl">
              SetGo ordena tu club en una sola pantalla.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Gestiona torneos, rankings y comunicacion con tus jugadores de forma simple.
              Entra directo por el nombre de tu club.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Nombre del club"
                className="h-12 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <button
                type="submit"
                disabled={!slug.trim()}
                className="h-12 min-w-[150px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 font-bold text-[#05281f] transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Ir al club <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* Right: feature pills */}
          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-8">
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-100">
              <Star className="h-5 w-5 text-[#d9b857]" />
              Por que SetGo
            </h2>
            <ul className="mt-6 space-y-4 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300">
                  <Trophy className="h-3.5 w-3.5" />
                </span>
                <span>Torneos y cuadros actualizados en tiempo real para jugadores y admins.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-300">
                  <BarChart2 className="h-3.5 w-3.5" />
                </span>
                <span>Rankings automaticos con puntos, tendencias y categoria por jugador.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-500/20 text-slate-300">
                  <Users className="h-3.5 w-3.5" />
                </span>
                <span>Cada club tiene su propia entrada y su propia identidad visual.</span>
              </li>
            </ul>
            <a
              href="https://wa.me/543442608040?text=Hola!%20Me%20interesa%20sumar%20mi%20club%20a%20SetGo%20%F0%9F%8E%BE"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#a6ce39] px-4 py-3 text-sm font-black text-slate-900 transition-colors hover:bg-[#bfe04a]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.99 0C5.371 0 0 5.373 0 11.994c0 2.117.554 4.104 1.522 5.832L0 24l6.335-1.493A11.94 11.94 0 0 0 11.99 24C18.61 24 24 18.626 24 12.005 24 5.375 18.61 0 11.99 0zm0 21.805a9.811 9.811 0 0 1-5.032-1.383l-.36-.214-3.742.882.886-3.658-.235-.375A9.821 9.821 0 0 1 2.19 12c0-5.415 4.388-9.812 9.8-9.812 5.415 0 9.813 4.397 9.813 9.812 0 5.413-4.398 9.805-9.813 9.805z"/></svg>
              Contactanos por WhatsApp
            </a>
          </aside>
        </div>

        {/* Scroll hint */}
        <div className="mt-14 flex justify-center opacity-40">
          <ChevronDown className="h-6 w-6 animate-bounce text-slate-400" />
        </div>
      </section>

      <GradientDivider />

      {/* ═════════════════ FEATURES CAROUSEL ═══════════════════════════════════ */}
      <FeaturesCarousel />

      <GradientDivider from="gold" />

      {/* ═════════════════════ APP SHOWCASE ═════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#060f24] via-[#0a1633] to-[#040b1f] py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-[#a6ce39]/5 blur-3xl" />
          <div className="absolute right-1/4 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-[#1a5689]/15 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-10">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">

            {/* Player Card mock */}
            <div className="order-2 flex justify-center lg:order-1 lg:justify-end">
              <div className="relative">
                <div className="absolute -inset-8 rounded-full bg-gradient-to-br from-[#a6ce39]/15 to-[#1a5689]/15 blur-2xl" />
                <MockPlayerCard />
              </div>
            </div>

            {/* Copy */}
            <div className="order-1 lg:order-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a6ce39]/30 bg-[#a6ce39]/10 px-3 py-1 text-xs font-semibold text-[#a6ce39]">
                Tu perfil de jugador
              </span>
              <h2 className="mt-5 text-3xl font-black leading-tight text-slate-100 sm:text-4xl">
                Tu nivel,<br />
                <span className="text-[#a6ce39]">profesionalizado.</span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-slate-300">
                Cada jugador tiene su propia Player Card: ranking en Singles y Dobles,
                puntos acumulados, torneos disputados y tendencia de posicion.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Medalla dorada para el top 3 del ranking',
                  'Historial completo de torneos y partidos',
                  'Comparativa automatica con rivales del club',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#a6ce39]/15 text-[#a6ce39]">
                      <ShieldCheck className="h-3 w-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <GradientDivider />

      {/* ════════════════════════ BENEFITS ═════════════════════════════════════════ */}
      <section className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-10">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-black text-slate-100 sm:text-4xl">Pensado para todos en el club</h2>
          <p className="mt-3 text-base text-slate-400">Sin importar tu rol, SetGo te hace la vida mas facil.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Jugadores */}
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-8">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Medal className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-black text-slate-100">Para Jugadores</h3>
            <p className="mb-5 text-sm text-slate-400">Todo tu historial competitivo en el bolsillo.</p>
            <ul className="space-y-3">
              {[
                'Seguimiento de puntos y posicion en el ranking',
                'Estadisticas de torneos y partidos jugados',
                'Perfil con foto y datos de tu carrera en el club',
                'Inscripcion a torneos desde el celular en segundos',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Organizadores */}
          <div className="rounded-2xl border border-[#d9b857]/20 bg-gradient-to-br from-[#d9b857]/[0.06] to-transparent p-8">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#d9b857]/15 text-[#d9b857]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-black text-slate-100">Para Organizadores</h3>
            <p className="mb-5 text-sm text-slate-400">Menos burocracia, mas tenis.</p>
            <ul className="space-y-3">
              {[
                'Crea y gestiona torneos sin planillas ni Excel',
                'Sorteo automatico del cuadro con un clic',
                'Control de inscripciones y aprobaciones en tiempo real',
                'Rankings que se actualizan solos al cerrar cada torneo',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d9b857]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ════════════════════════ CTA BANNER ══════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/15 via-[#a6ce39]/8 to-[#d9b857]/12" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(166,206,57,0.07),transparent_65%)]" />
        {/* Top border line: emerald → gold */}
        <div className="absolute top-0 h-px w-full bg-gradient-to-r from-transparent via-[#a6ce39]/50 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 lg:px-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#a6ce39]/40 bg-[#a6ce39]/10 px-4 py-1.5 text-xs font-semibold text-[#a6ce39]">
            Gratis para comenzar
          </span>
          <h2 className="mt-5 text-3xl font-black text-white sm:text-5xl">
            Tu club, a otro nivel.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-slate-300 sm:text-lg">
            Unete a los clubes que ya gestionan sus torneos y rankings con SetGo.
            El alta es rapida y sin costo.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://wa.me/543442608040?text=Hola!%20Me%20interesa%20sumar%20mi%20club%20a%20SetGo%20%F0%9F%8E%BE"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-2xl bg-[#a6ce39] px-8 py-4 text-base font-black text-[#04200f] shadow-[0_0_32px_rgba(166,206,57,0.30)] transition-all duration-200 hover:scale-[1.04] hover:bg-[#bfe04a] hover:shadow-[0_0_48px_rgba(166,206,57,0.45)] active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.99 0C5.371 0 0 5.373 0 11.994c0 2.117.554 4.104 1.522 5.832L0 24l6.335-1.493A11.94 11.94 0 0 0 11.99 24C18.61 24 24 18.626 24 12.005 24 5.375 18.61 0 11.99 0zm0 21.805a9.811 9.811 0 0 1-5.032-1.383l-.36-.214-3.742.882.886-3.658-.235-.375A9.821 9.821 0 0 1 2.19 12c0-5.415 4.388-9.812 9.812-9.812 5.415 0 9.813 4.397 9.813 9.812 0 5.413-4.398 9.805-9.813 9.805z"/></svg>
              Contactanos por WhatsApp
            </a>
            <p className="text-xs text-slate-500">Sin tarjeta de credito · Sin compromisos</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 sm:flex-row sm:justify-between sm:px-6 lg:px-10">
          <span className="font-rajdhani text-xl font-bold text-slate-500">
            Set<span className="text-[#A6CE39]">Go</span>
          </span>
          <p className="text-xs text-slate-600">2026 SetGo. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}