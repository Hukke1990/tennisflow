import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, BarChart2, Users, Zap, Star, Medal, ShieldCheck, ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import setGoMarkFallback from '../assets/setgo-mark.svg';

// ── Mock Player Card (Ficha del Jugador) ───────────────────────────────────────────────────────────
function MockPlayerCard() {
  return (
    <div className="relative w-full max-w-[272px] mx-auto rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#07111f] text-white">

      {/* ── Header banner ── */}
      <div className="relative h-[72px] bg-gradient-to-br from-[#0b2a4a] via-[#0e3d6e] to-[#1560a8] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(166,206,57,0.12),transparent_55%)]" />
        {/* Decorative star */}
        <div className="absolute right-3 top-3 opacity-20">
          <Star className="h-9 w-9 text-[#a6ce39]" fill="currentColor" />
        </div>
        <div className="absolute bottom-2 left-3">
          <p className="text-[8px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Ficha del Jugador</p>
          <p className="text-sm font-black text-white leading-tight">Gastón Ramírez</p>
        </div>
      </div>

      {/* ── Avatar row ── */}
      <div className="flex items-center gap-3 px-3 -mt-5 mb-3">
        {/* Avatar with gold ring */}
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full ring-[2.5px] ring-[#d9b857] ring-offset-2 ring-offset-[#07111f] bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-xl">
            GR
          </div>
          {/* Top-3 gold badge */}
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#d9b857] text-[7px] font-black text-slate-900 shadow">
            <Star className="h-2 w-2" fill="currentColor" />
          </span>
        </div>
        <div className="min-w-0 mt-4">
          <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
            <span className="text-[8px]">📍</span> Cdad. del Uruguay, Entre Ríos
          </p>
        </div>
      </div>

      {/* ── Rankings block ── */}
      <div className="mx-3 grid grid-cols-2 rounded-xl overflow-hidden ring-1 ring-white/8 mb-2.5">
        {/* Singles — gold */}
        <div className="relative flex flex-col items-center py-3 px-2 bg-gradient-to-br from-[#8a6218] via-[#c9a032] to-[#f0d778]">
          <div className="flex items-center justify-center mb-1 w-6 h-6 rounded-lg bg-white/25">
            <Star className="h-3 w-3 text-white" fill="currentColor" />
          </div>
          <p className="text-[8px] font-extrabold uppercase tracking-widest text-amber-900/80">Singles</p>
          <p className="text-[22px] font-black text-amber-950 leading-none">#3</p>
          <span className="mt-1 rounded-full bg-amber-950/25 px-2 py-0.5 text-[8px] font-black text-amber-950">Categoría 1a</span>
        </div>
        {/* Dobles — blue */}
        <div className="relative flex flex-col items-center py-3 px-2 bg-gradient-to-bl from-[#0e3157] via-[#1a5689] to-[#2f8ec6] border-l border-white/10">
          <div className="flex items-center justify-center mb-1 w-6 h-6 rounded-lg bg-white/15">
            <ShieldCheck className="h-3 w-3 text-white/80" />
          </div>
          <p className="text-[8px] font-extrabold uppercase tracking-widest text-blue-200/70">Dobles</p>
          <p className="text-[22px] font-black text-white leading-none">#7</p>
          <span className="mt-1 rounded-full bg-white/15 px-2 py-0.5 text-[8px] font-black text-blue-100">Categoría 3a</span>
        </div>
      </div>

      {/* ── Physical stats row ── */}
      <div className="mx-3 grid grid-cols-4 gap-1 mb-2.5">
        {[
          { label: 'Altura', val: '185 cm' },
          { label: 'Peso',   val: '82 kg'  },
          { label: 'Mano',   val: 'Diestro' },
          { label: 'Revés',  val: '1 mano' },
        ].map(({ label, val }) => (
          <div key={label} className="rounded-lg bg-white/[0.05] border border-white/5 p-1.5 text-center">
            <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">{label}</p>
            <p className="text-[9px] font-black text-slate-100 leading-tight">{val}</p>
          </div>
        ))}
      </div>

      {/* ── Quick stats ── */}
      <div className="mx-3 mb-3">
        <p className="text-[8px] font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">Estadísticas Rápidas</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Partidos',  val: '24'   },
            { label: 'Victorias', val: '18'   },
            { label: 'Eficacia',  val: '75%'  },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-xl bg-[#0d1d35] border border-white/[0.07] p-2 text-center">
              <p className="text-[14px] font-black text-white leading-none">{val}</p>
              <p className="text-[8px] text-slate-500 font-medium mt-0.5">{label}</p>
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
  const podium = [
    { pos: 2, initials: 'LF', name: 'L. Fernández', pts: 2500, color: 'from-slate-500 to-slate-600', border: 'ring-slate-400/40', icon: '🥈' },
    { pos: 1, initials: 'MG', name: 'M. Gutierrez', pts: 2500, color: 'from-blue-500 to-indigo-600',  border: 'ring-[#d9b857]/70',   icon: '🥇' },
    { pos: 3, initials: 'GR', name: 'G. Ramírez',   pts: 2460, color: 'from-orange-500 to-amber-600', border: 'ring-amber-500/40',   icon: '🥉' },
  ];
  const rows = [
    { pos: 1, initials: 'MG', color: 'from-blue-500 to-indigo-600',    name: 'Marcos Gutierrez',  pts: 2500 },
    { pos: 2, initials: 'LF', color: 'from-blue-400 to-blue-600',      name: 'Lucas Fernández',   pts: 2500 },
    { pos: 3, initials: 'GR', color: 'from-blue-500 to-indigo-600',    name: 'Gastón Ramírez',    pts: 2460, highlight: true },
    { pos: 4, initials: 'AN', color: 'from-blue-500 to-indigo-600',    name: 'Agustín Núñez',     pts: 2450 },
    { pos: 5, initials: 'SG', color: 'from-blue-500 to-indigo-600',    name: 'Santiago Gómez',    pts: 2450 },
  ];

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

      {/* ── Filtro inteligente bar ── */}
      <div className="px-3 pt-2.5 pb-2 bg-[#0a1728] border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <p className="text-[7px] font-extrabold uppercase tracking-[0.15em] text-slate-500">Filtros activos</p>
            <p className="text-[9px] font-black text-white">Filtro Inteligente</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5">
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[7px] font-black text-emerald-300 whitespace-nowrap">Singles · 1a</span>
          </span>
        </div>
        {/* Filter pills */}
        <div className="flex gap-1">
          {[
            { label: 'MODALIDAD', val: 'Singles',    active: true  },
            { label: 'SEXO',      val: 'Caballeros', active: false },
            { label: 'CATEGORÍA', val: '1a',         active: false },
          ].map(({ label, val, active }) => (
            <div key={label} className={`flex-1 rounded-lg border px-1.5 py-1 ${
              active ? 'border-[#a6ce39]/40 bg-[#a6ce39]/10' : 'border-white/[0.07] bg-white/[0.04]'
            }`}>
              <p className="text-[6px] font-extrabold uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`text-[8px] font-black truncate ${active ? 'text-[#a6ce39]' : 'text-slate-300'}`}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Podio de Honor ── */}
      <div className="px-3 pt-2 pb-2 bg-gradient-to-b from-[#0c1e38] to-[#081528]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-black text-white">Podio de Honor</p>
          <span className="text-[7px] font-extrabold text-slate-500 uppercase tracking-widest">TOP 3</span>
        </div>
        <div className="flex items-end justify-center gap-1.5">
          {podium.map(({ pos, initials, name, pts, color, border, icon }) => (
            <div
              key={pos}
              className={`flex flex-col items-center rounded-xl border bg-[#0d1e35] px-2 py-2 ${border} ${
                pos === 1 ? 'ring-1 pb-3 pt-2' : 'ring-1 opacity-90'
              }`}
              style={{ width: pos === 1 ? '84px' : '72px' }}
            >
              <span className="text-base leading-none mb-1">{icon}</span>
              {pos === 1 && <Trophy className="h-3 w-3 text-[#d9b857] mb-0.5" />}
              <p className="text-[7px] font-black text-slate-500 mb-1">#{pos}</p>
              <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[8px] font-black mb-1 shadow-md`}>
                {initials}
              </div>
              <p className={`text-[${pos === 1 ? '11' : '10'}px] font-black text-white leading-none`}>{pts}</p>
              <p className="text-[6px] text-slate-500 font-bold">ELO</p>
              <p className="text-[7px] text-slate-400 font-bold mt-0.5 text-center leading-tight">{name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabla de Posición ── */}
      <div className="bg-[#07101e]">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05]">
          <div>
            <p className="text-[7px] font-extrabold uppercase tracking-widest text-slate-500">Tabla de Posición</p>
            <p className="text-[7px] text-slate-600">249 jugadores</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-[#d9b857]/15 border border-[#d9b857]/30 px-1.5 py-0.5">
            <span className="w-1 h-1 rounded-full bg-[#d9b857] animate-pulse" />
            <span className="text-[7px] font-black text-[#d9b857]">Ranking en vivo</span>
          </span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[28px_1fr_auto] gap-x-2 px-3 py-1 border-b border-white/[0.04]">
          {['PUESTO', 'JUGADOR', 'ELO'].map(h => (
            <p key={h} className="text-[6px] font-extrabold uppercase tracking-widest text-slate-600">{h}</p>
          ))}
        </div>

        {/* Rows */}
        {rows.map(({ pos, initials, color, name, pts, highlight }) => (
          <div
            key={pos}
            className={`grid grid-cols-[28px_1fr_auto] gap-x-2 items-center px-3 py-1.5 border-b border-white/[0.03] last:border-0 ${
              highlight ? 'bg-[#a6ce39]/[0.07]' : ''
            }`}
          >
            <span className={`text-[9px] font-black ${highlight ? 'text-[#a6ce39]' : 'text-slate-500'}`}>#{pos}</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={`w-5 h-5 shrink-0 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[7px] font-black`}>
                {initials}
              </div>
              <span className={`text-[9px] font-bold truncate ${highlight ? 'text-[#a6ce39]' : 'text-slate-300'}`}>{name}</span>
            </div>
            <span className={`text-[9px] font-black tabular-nums ${highlight ? 'text-[#a6ce39]' : 'text-slate-400'}`}>{pts}</span>
          </div>
        ))}
      </div>

    </div>
  );
}

// ── Mock Bracket Screen ───────────────────────────────────────────────────────────────────────
function MockBracketScreen() {
  // player helper: name, seed (null | number), avatar color, winner bool, live bool
  const P = ({ name, seed, color = 'from-blue-500 to-indigo-600', winner, live }) => (
    <div className={`flex items-center gap-1.5 px-2 py-[5px] border-b border-white/[0.04] last:border-0 ${
      winner ? 'bg-[#0e2a46]' : live ? 'bg-[#0a2010]' : 'bg-[#090f1e]'
    }`}>
      {/* seed badge or avatar */}
      <div className={`relative w-[14px] h-[14px] rounded-full shrink-0 bg-gradient-to-br ${color} flex items-center justify-center`}>
        {seed && (
          <span className="absolute -top-1 -right-1 w-[9px] h-[9px] rounded-full bg-[#d9b857] flex items-center justify-center text-[5px] font-black text-slate-900 leading-none">
            {seed}
          </span>
        )}
      </div>
      <span className={`text-[9px] font-bold flex-1 truncate leading-none ${
        winner ? 'text-white' : live ? 'text-emerald-300' : 'text-slate-400'
      }`}>{name}</span>
      {winner && <span className="text-[7px] font-black text-[#a6ce39] shrink-0">W</span>}
      {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />}
    </div>
  );

  // Match card
  const Match = ({ players, status, live }) => (
    <div className={`rounded-lg overflow-hidden ring-1 ${live ? 'ring-emerald-500/40' : 'ring-white/[0.07]'} shadow-md`}>
      {players.map((p, i) => <P key={i} {...p} live={live && !p.winner} />)}
      {status && (
        <div className={`px-2 py-0.5 text-center text-[7px] font-extrabold uppercase tracking-wider ${
          live
            ? 'bg-emerald-900/50 text-emerald-400'
            : 'bg-[#0b152a] text-slate-600'
        }`}>{status}</div>
      )}
    </div>
  );

  return (
    <div className="w-full max-w-[278px] mx-auto rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-[#07101e]">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#040c1a]">
        <span className="text-[10px] text-slate-400 font-black tracking-wide">SetGo</span>
        <div className="flex gap-1">
          <div className="w-3 h-1 rounded-full bg-slate-700" />
          <div className="w-1 h-1 rounded-full bg-slate-700" />
        </div>
      </div>

      <div className="bg-gradient-to-b from-[#0c1e38] to-[#07101e] px-3 pt-3 pb-4">

        {/* ── Tournament title ── */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[7px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Cuadro de juego</p>
            <p className="text-[11px] font-black text-[#d9b857] leading-tight">Copa Almafuerte 2026</p>
          </div>
          <span className="rounded-full bg-[#d9b857]/15 border border-[#d9b857]/30 px-2 py-0.5 text-[8px] font-black text-[#d9b857]">32 jugadores</span>
        </div>

        {/* ── 3-column bracket ── */}
        <div className="flex items-start gap-1">

          {/* ── Col 1: Cuartos de Final ── */}
          <div className="flex flex-col gap-1.5 flex-[1.1]">
            <p className="text-[7px] font-extrabold uppercase tracking-widest text-slate-500 text-center mb-0.5">Cuartos</p>

            <Match
              players={[
                { name: 'S. Gómez', seed: 1, winner: true },
                { name: 'F. Ortiz',  seed: null },
              ]}
              status="Programado"
            />
            <Match
              players={[
                { name: 'F. Morales', seed: null, winner: true },
                { name: 'G. Ibarra',  seed: null },
              ]}
              status="Programado"
            />
            <Match
              players={[
                { name: 'M. Cruz',   seed: 3 },
                { name: 'R. Domíng.', seed: null },
              ]}
              status="Programado"
            />
          </div>

          {/* ── Connector ── */}
          <div className="flex flex-col justify-around self-stretch pt-5 gap-0 opacity-25 shrink-0">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center">
                <div className="w-1.5 h-px bg-slate-400" />
              </div>
            ))}
          </div>

          {/* ── Col 2: Semifinal ── */}
          <div className="flex flex-col gap-1.5 flex-[1.05]">
            <p className="text-[7px] font-extrabold uppercase tracking-widest text-slate-500 text-center mb-0.5">Semifinal</p>

            <Match
              live
              players={[
                { name: 'S. Gómez',  seed: 1, color: 'from-[#a6ce39]/80 to-emerald-600', live: true },
                { name: 'F. Morales', seed: null, live: true },
              ]}
              status="En curso"
            />
            <Match
              players={[
                { name: 'Por definir', seed: null },
                { name: 'Por definir', seed: null },
              ]}
              status="Programado"
            />
          </div>

          {/* ── Connector ── */}
          <div className="flex flex-col justify-around self-stretch pt-5 opacity-25 shrink-0">
            <div className="w-1.5 h-px bg-slate-400" />
          </div>

          {/* ── Col 3: Final ── */}
          <div className="flex flex-col flex-1">
            <p className="text-[7px] font-extrabold uppercase tracking-widest text-[#d9b857]/70 text-center mb-0.5">Gran Final</p>
            <div className="rounded-lg overflow-hidden ring-1 ring-[#d9b857]/25 bg-gradient-to-b from-[#1a1200] to-[#0d0c00] mt-1">
              <div className="px-1.5 py-2 flex flex-col items-center gap-1">
                <Trophy className="h-4 w-4 text-[#d9b857]/70" />
                <span className="text-[7px] font-black text-[#d9b857]/60 uppercase tracking-widest text-center leading-tight">Por<br/>definir</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Live match banner ── */}
        <div className="mt-3.5 flex items-center justify-between gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-[10px] font-black text-emerald-300">Partido en vivo</span>
          </div>
          <span className="text-[8px] text-emerald-400/70 font-bold">Cancha 1</span>
        </div>

        {/* ── Round progress pills ── */}
        <div className="mt-2.5 flex items-center gap-1 justify-center">
          {['1ra Ronda', 'Octavos', 'Cuartos', 'Semi', 'Final'].map((r, i) => (
            <div key={r} className={`h-1 rounded-full transition-all ${
              i < 3 ? 'w-5 bg-[#a6ce39]/60' : i === 3 ? 'w-5 bg-[#a6ce39]/30 animate-pulse' : 'w-3 bg-white/10'
            }`} />
          ))}
        </div>
        <p className="text-center text-[7px] text-slate-600 font-medium mt-1">Semifinales en curso</p>

      </div>
    </div>
  );
}

// ── Mock Live Match Screen ──────────────────────────────────────────────────────────────────
function MockLiveMatchScreen() {
  const matches = [
    {
      cat: 'Cat. Primera · 24 Jugadores',
      cancha: 'Cancha 3',
      p1: { initials: 'LU', name: 'L. Uribe',   label: 'Local' },
      p2: { initials: 'RD', name: 'R. Delgado', label: 'Local' },
    },
    {
      cat: 'Cat. Primera · 24 Jugadores',
      cancha: 'Cancha 4',
      p1: { initials: 'NM', name: 'N. Montoya', label: 'Local' },
      p2: { initials: 'RO', name: 'R. Ojeda',   label: 'Local' },
    },
  ];

  const stats = [
    { val: '2',   label: 'Partidos En Vivo', bg: 'from-blue-700 to-blue-900',           icon: Zap },
    { val: '2/4', label: 'Canchas Ocupadas', bg: 'from-slate-700 to-slate-900',          icon: null },
    { val: '8',   label: 'Torneos Activos',  bg: 'from-amber-700/80 to-amber-900/80',    icon: Trophy },
  ];

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

      {/* ── Club header ── */}
      <div className="px-3.5 pt-2.5 pb-2 bg-gradient-to-r from-[#0b2340]/80 to-[#091a30]/60 border-b border-white/[0.06]">
        <p className="text-[7px] font-extrabold uppercase tracking-[0.17em] text-[#a6ce39]">Club Activo</p>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <p className="text-[11px] font-black text-white">
            Gestionando <span className="text-[#a6ce39]">SetGo Demo</span>
          </p>
        </div>
        <p className="text-[7px] text-slate-500 mt-0.5">Panel operativo en tiempo real</p>
      </div>

      {/* ── Live match cards ── */}
      <div className="px-2.5 pt-2 pb-1 flex flex-col gap-1.5">
        {matches.map((m) => (
          <div key={m.cancha} className="rounded-xl bg-[#0c1e38] ring-1 ring-emerald-500/20 overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-2.5 py-1 bg-[#0a1a30]">
              <span className="text-[7px] text-slate-500 font-bold uppercase tracking-wide truncate">{m.cat}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[7px] text-slate-400 font-bold">{m.cancha}</span>
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[6px] font-black text-emerald-300">EN VIVO</span>
                </span>
              </div>
            </div>

            {/* Scoreboard */}
            <div className="flex items-center justify-between px-2.5 py-1.5 gap-2">
              {/* P1 */}
              <div className="flex flex-col items-center gap-0.5 w-10 shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-[9px] font-black shadow">
                  {m.p1.initials}
                </div>
                <p className="text-[8px] font-bold text-slate-300 text-center leading-tight">{m.p1.name}</p>
                <span className="text-[6px] text-slate-600 font-bold border border-white/10 rounded px-1">LOC</span>
              </div>

              {/* Score */}
              <div className="flex-1 flex flex-col items-center gap-0.5">
                <div className="flex items-stretch rounded-lg overflow-hidden ring-1 ring-white/10 bg-[#071628] w-full">
                  <div className="flex-1 py-1 text-center">
                    <p className="text-[6px] text-slate-600 font-bold uppercase">SETS</p>
                    <p className="text-[9px] font-black text-slate-400">—</p>
                  </div>
                  <div className="px-2 py-1 bg-[#d9b857]/10 border-x border-[#d9b857]/20 text-center">
                    <p className="text-[6px] text-[#d9b857]/70 font-bold uppercase">GAME</p>
                    <p className="text-[14px] font-black text-[#d9b857] leading-none">0-0</p>
                  </div>
                  <div className="flex-1 py-1 text-center">
                    <p className="text-[6px] text-slate-600 font-bold uppercase">GAMES</p>
                    <p className="text-[9px] font-black text-slate-400">—</p>
                  </div>
                </div>
                <p className="text-[6px] text-slate-600">Primer Set · 00:00</p>
              </div>

              {/* P2 */}
              <div className="flex flex-col items-center gap-0.5 w-10 shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-[9px] font-black shadow">
                  {m.p2.initials}
                </div>
                <p className="text-[8px] font-bold text-slate-300 text-center leading-tight">{m.p2.name}</p>
                <span className="text-[6px] text-slate-600 font-bold border border-white/10 rounded px-1">LOC</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-3 gap-1.5 px-2.5 py-2">
        {stats.map(({ val, label, bg, icon: Icon }) => (
          <div key={label} className={`rounded-xl bg-gradient-to-br ${bg} p-2 text-center ring-1 ring-white/[0.07]`}>
            {Icon && <Icon className="h-3 w-3 text-white/60 mx-auto mb-0.5" />}
            <p className="text-[13px] font-black text-white leading-none">{val}</p>
            <p className="text-[6px] text-white/50 font-bold mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
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
    id: 'bracket',
    badge: 'Cuadros en Vivo',
    badgeColor: 'border-[#d9b857]/30 bg-[#d9b857]/10 text-[#d9b857]',
    title: 'Gestión de Torneos Sin Caos',
    accent: 'text-[#d9b857]',
    description:
      'Cuadros de juego, horarios y resultados transparentes para todos. Armá el sorteo, seguí el torneo en vivo y cerralo en minutos.',
    bullets: [
      'Sorteo automático del cuadro',
      'Seguimiento de partidos en tiempo real',
      'Resultados visibles para jugadores y público',
    ],
    bulletColor: 'bg-[#d9b857]',
    icon: Trophy,
    iconBg: 'bg-[#d9b857]/15 text-[#d9b857]',
    glow: 'from-[#d9b857]/10 to-transparent',
    MockScreen: MockBracketScreen,
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
                <div className="pt-4 pb-2">
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
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState(`/SetGo.png?v=${logoVersion}`);
  const [logoFallbackApplied, setLogoFallbackApplied] = useState(false);
  const [requestData, setRequestData] = useState({
    clubName: '',
    cityCountry: '',
    contactName: '',
    phone: '',
    email: '',
  });
  const navigate = useNavigate();
  const contactEmail = 'gastonbordet@gmail.com';

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (normalized) navigate(`/${normalized}`);
  };

  const handleRequestFieldChange = (field) => (e) => {
    setRequestData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const isMobileDevice = () =>
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const handleContactSubmit = (e) => {
    e.preventDefault();

    const subject = `Solicitud de alta de club en SetGo - ${requestData.clubName.trim()}`;
    const body = [
      'Hola Gaston, quiero solicitar el alta de mi club en SetGo.',
      '',
      `Nombre del club: ${requestData.clubName.trim()}`,
      `Ciudad/Pais: ${requestData.cityCountry.trim()}`,
      `Nombre de contacto: ${requestData.contactName.trim()}`,
      `Telefono de contacto: ${requestData.phone.trim()}`,
      `Correo de contacto: ${requestData.email.trim()}`,
      '',
      'Gracias.',
    ].join('\n');

    if (isMobileDevice()) {
      // En móvil abre la app de correo nativa
      window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } else {
      // En desktop abre Gmail web en pestaña nueva
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contactEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const opened = window.open(gmailUrl, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.href = gmailUrl;
    }
    setIsContactOpen(false);
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
            <button
              type="button"
              onClick={() => setIsContactOpen(true)}
              className="mt-8 inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20"
            >
              Solicitar alta de club por correo
            </button>
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
            <button
              type="button"
              onClick={() => setIsContactOpen(true)}
              className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-[#a6ce39] px-8 py-4 text-base font-black text-[#04200f] shadow-[0_0_32px_rgba(166,206,57,0.30)] transition-all duration-200 hover:scale-[1.04] hover:shadow-[0_0_48px_rgba(166,206,57,0.45)] active:scale-[0.98]"
            >
              Crea tu cuenta gratis <ArrowRight className="h-5 w-5" />
            </button>
            <p className="text-xs text-slate-500">Sin tarjeta de credito · Sin compromisos</p>
          </div>
        </div>
      </section>

      {isContactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#010716]/80 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a1633] p-6 shadow-2xl shadow-black/60 sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-100">Solicitar alta de club</h3>
                <p className="mt-1 text-sm text-slate-300">Completa los datos para abrir Gmail con la informacion lista.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsContactOpen(false)}
                className="rounded-md border border-white/15 px-2 py-1 text-sm text-slate-300 transition-colors hover:bg-white/10"
                aria-label="Cerrar formulario"
              >
                X
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-3">
              <input
                type="text"
                value={requestData.clubName}
                onChange={handleRequestFieldChange('clubName')}
                placeholder="Nombre del club"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <input
                type="text"
                value={requestData.cityCountry}
                onChange={handleRequestFieldChange('cityCountry')}
                placeholder="Ciudad/Pais"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <input
                type="text"
                value={requestData.contactName}
                onChange={handleRequestFieldChange('contactName')}
                placeholder="Nombre de contacto"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <input
                type="tel"
                value={requestData.phone}
                onChange={handleRequestFieldChange('phone')}
                placeholder="Telefono de contacto"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <input
                type="email"
                value={requestData.email}
                onChange={handleRequestFieldChange('email')}
                placeholder="Correo de contacto"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsContactOpen(false)}
                  className="h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-[#05281f] transition-colors hover:bg-emerald-400"
                >
                  {isMobileDevice() ? 'Abrir mi correo' : 'Abrir Gmail'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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