import { useState } from 'react';
import {
  MapPin,
  Trophy,
  Users,
  GitBranch,
  Radio,
  CreditCard,
  Settings2,
  LayoutDashboard,
  Wrench,
  ChevronDown,
} from 'lucide-react';

// ─── Definición de tabs ───────────────────────────────────────────────────────

const MAIN_TABS = [
  { id: 'canchas',       label: 'Canchas',             Icon: MapPin },
  { id: 'torneos',       label: 'Torneos',              Icon: Trophy },
  { id: 'inscripciones', label: 'Inscripciones',        Icon: Users },
  { id: 'cuadros',       label: 'Cuadros',              Icon: GitBranch },
  { id: 'live-control',  label: 'Control en Vivo',      Icon: Radio, requiresPremium: true },
];

const CONFIG_TABS = [
  { id: 'mi-plan',       label: 'Mi Plan',              Icon: CreditCard },
  { id: 'configuracion', label: 'Configuración',        Icon: Settings2 },
];

const ADMIN_TABS = [
  { id: 'panel-control', label: 'Panel de Control',    Icon: LayoutDashboard, requiresAdmin: true },
  { id: 'dev-tools',     label: 'Dev Tools',            Icon: Wrench, requiresSuperAdmin: true },
];

// ─── Item individual ──────────────────────────────────────────────────────────

function SidebarItem({ tab, active, clubPlan, onClick, pendingCount, isMobile = false }) {
  const isLiveLocked = tab.requiresPremium && clubPlan !== 'premium';
  const isPlanUpgrade = tab.id === 'mi-plan' && (clubPlan === 'basico' || clubPlan === 'test');

  const baseClass = isMobile
    ? 'relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-[10px] font-semibold transition-all whitespace-nowrap flex-shrink-0'
    : 'relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full group';

  const stateClass = active
    ? isMobile
      ? 'text-blue-600 bg-blue-50'
      : 'text-blue-700 bg-blue-50 font-semibold'
    : isLiveLocked
      ? 'text-slate-400 cursor-not-allowed'
      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 cursor-pointer';

  return (
    <div className={[
      'relative',
      isPlanUpgrade && !isMobile ? 'before:absolute before:inset-0 before:rounded-xl before:ring-1 before:ring-amber-400/50' : '',
    ].join(' ')}>
      <button
        type="button"
        onClick={() => !isLiveLocked && onClick(tab.id)}
        className={`${baseClass} ${stateClass}`}
      >
        {/* Indicador activo (desktop) */}
        {!isMobile && active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-blue-600" />
        )}

        <tab.Icon
          className={isMobile ? 'w-4.5 h-4.5' : 'w-4 h-4 shrink-0'}
          strokeWidth={active ? 2.5 : 2}
        />

        <span>{tab.label}</span>

        {/* Candado live */}
        {isLiveLocked && (
          <span className={isMobile ? 'absolute -top-0.5 -right-0.5 text-[8px]' : 'ml-auto text-amber-500 text-xs'}>
            🔒
          </span>
        )}

        {/* Badge pendientes inscripciones */}
        {tab.id === 'inscripciones' && pendingCount > 0 && (
          <span className={[
            'inline-flex items-center justify-center rounded-full bg-red-500 text-white font-black leading-none',
            isMobile
              ? 'absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 text-[8px]'
              : 'ml-auto min-w-[1.3rem] h-5 px-1 text-[10px]',
          ].join(' ')}>
            {pendingCount}
          </span>
        )}

        {/* Ícono upgrade Mi Plan */}
        {isPlanUpgrade && !isMobile && (
          <span className="ml-auto text-amber-400 text-xs animate-pulse">⭐</span>
        )}
      </button>

      {/* Tooltip live locked (desktop) */}
      {isLiveLocked && !isMobile && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block w-56 rounded-xl bg-slate-900 text-white text-xs font-medium px-3 py-2 text-center shadow-lg z-30 pointer-events-none">
          Función exclusiva para Plan Grand Slam
          <div className="absolute top-1/2 -translate-y-1/2 right-full border-4 border-transparent border-r-slate-900" />
        </div>
      )}
    </div>
  );
}

// ─── Sidebar principal ────────────────────────────────────────────────────────

export default function AdminSidebar({
  activeTab,
  onTabChange,
  clubPlan,
  isAdminOrSuperAdmin,
  isSuperAdmin,
  pendingCount = 0,
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const visibleAdminTabs = ADMIN_TABS.filter((t) => {
    if (t.requiresSuperAdmin) return isSuperAdmin;
    if (t.requiresAdmin) return isAdminOrSuperAdmin;
    return true;
  });

  const allTabs = [...MAIN_TABS, ...CONFIG_TABS, ...visibleAdminTabs];

  // Label del tab activo para mostrar en móvil colapsado
  const activeTabDef = allTabs.find((t) => t.id === activeTab);

  const renderItem = (tab, isMobile = false) => (
    <SidebarItem
      key={tab.id}
      tab={tab}
      active={activeTab === tab.id}
      clubPlan={clubPlan}
      onClick={onTabChange}
      pendingCount={pendingCount}
      isMobile={isMobile}
    />
  );

  return (
    <>
      {/* ──────────────────── DESKTOP SIDEBAR ─────────────────────── */}
      <aside className="hidden lg:flex flex-col gap-1 w-52 shrink-0 bg-white rounded-2xl border border-slate-100 shadow-sm p-3 sticky top-20 self-start">

        {/* Grupo principal */}
        <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Principal
        </p>
        {MAIN_TABS.map((t) => renderItem(t))}

        <div className="my-2 h-px bg-slate-100" />

        {/* Grupo configuración */}
        <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Configuración
        </p>
        {CONFIG_TABS.map((t) => renderItem(t))}

        {/* Grupo admin */}
        {visibleAdminTabs.length > 0 && (
          <>
            <div className="my-2 h-px bg-slate-100" />
            <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Admin
            </p>
            {visibleAdminTabs.map((t) => renderItem(t))}
          </>
        )}
      </aside>

      {/* ──────────────────── MOBILE NAV ──────────────────────────── */}
      <div className="lg:hidden">
        {/* Botón colapsar / expandir */}
        <button
          type="button"
          onClick={() => setMobileExpanded((v) => !v)}
          className="flex items-center justify-between w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm mb-2"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            {activeTabDef && (
              <>
                <activeTabDef.Icon className="w-4 h-4 text-blue-600" strokeWidth={2.5} />
                {activeTabDef.label}
              </>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${mobileExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Menú expandido */}
        {mobileExpanded && (
          <div
            className="bg-white border border-slate-100 rounded-2xl shadow-sm p-3 mb-4 grid grid-cols-3 gap-1.5"
            onClick={() => setMobileExpanded(false)}
          >
            {[...MAIN_TABS, ...CONFIG_TABS, ...visibleAdminTabs].map((t) => renderItem(t, true))}
          </div>
        )}
      </div>
    </>
  );
}
