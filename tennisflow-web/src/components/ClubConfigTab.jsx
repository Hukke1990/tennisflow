import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useClub } from '../context/ClubContext';
import ImageDropzone from './ImageDropzone';
import { uploadClubLogo } from '../lib/clubStorage';

const API_URL = '';

// ─────────────────────────────────────────────
// Sub-component: section wrapper
// ─────────────────────────────────────────────
function Section({ children, dimmed = false }) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-6 transition-opacity ${
        dimmed ? 'opacity-60' : ''
      }`}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, badge, description }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        {badge && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {badge}
          </span>
        )}
      </div>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
  );
}

function LockedNote({ text }) {
  return <p className="text-xs font-medium text-blue-600 mt-2">🔒 {text}</p>;
}

// ─────────────────────────────────────────────
// Mobile preview frame
// ─────────────────────────────────────────────
function MobilePreview({ src, alt = 'Vista previa móvil' }) {
  if (!src) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 font-medium">Vista previa en móvil:</p>
      <div className="mx-auto max-w-[320px] rounded-[1.8rem] border-[5px] border-gray-800 overflow-hidden shadow-xl bg-white">
        {/* Notch */}
        <div className="bg-gray-800 h-5 flex items-center justify-center">
          <span className="w-16 h-2 bg-gray-700 rounded-full" />
        </div>
        <img src={src} alt={alt} className="w-full object-cover" style={{ maxHeight: 80 }} />
        {/* Fake content below */}
        <div className="p-3 space-y-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
export default function ClubConfigTab() {
  const { session } = useAuth();
  const { clubId, clubPlan } = useClub();

  const headers = { Authorization: `Bearer ${session?.access_token}` };

  // ── remote state ──────────────────────────
  const [config, setConfig] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  // ── logo ──────────────────────────────────
  const [logoFile, setLogoFile] = useState(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoMsg, setLogoMsg] = useState({ text: '', ok: true });

  // ── white label ───────────────────────────
  const [whiteLabel, setWhiteLabel] = useState(false);
  const [wlSaving, setWlSaving] = useState(false);

  // ── ads ───────────────────────────────────
  // (ads management disabled — coming soon)

  const isProOrPremium = clubPlan === 'pro' || clubPlan === 'premium';
  const isPremium = clubPlan === 'premium';

  // ── load config ───────────────────────────
  const loadConfig = useCallback(async () => {
    if (!clubId) return;
    setPageLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/club-config`, {
        headers,
        params: { club_id: clubId },
      });
      setConfig(data);
      setWhiteLabel(!!data.white_label);
    } catch {
      setPageError('No se pudo cargar la configuración del club.');
    } finally {
      setPageLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, session?.access_token]);

  // ── load ads ──────────────────────────────
  // (disabled — coming soon)

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── save logo ─────────────────────────────
  const handleSaveLogo = async () => {
    if (!logoFile) return;
    setLogoSaving(true);
    setLogoMsg({ text: '', ok: true });
    try {
      const url = await uploadClubLogo({ clubId, file: logoFile });
      await axios.patch(`${API_URL}/api/club-config`, { logo_url: url }, { headers, params: { club_id: clubId } });
      setConfig((prev) => ({ ...prev, logo_url: url }));
      setLogoFile(null);
      setLogoMsg({ text: 'Logo actualizado correctamente.', ok: true });
    } catch (e) {
      setLogoMsg({ text: e.message || 'Error al subir el logo.', ok: false });
    } finally {
      setLogoSaving(false);
    }
  };

  // ── toggle white label ────────────────────
  const handleToggleWhiteLabel = async (value) => {
    if (wlSaving) return;
    setWlSaving(true);
    const prev = whiteLabel;
    setWhiteLabel(value); // optimistic
    try {
      await axios.patch(`${API_URL}/api/club-config`, { white_label: value }, { headers, params: { club_id: clubId } });
    } catch {
      setWhiteLabel(prev); // revert
    } finally {
      setWlSaving(false);
    }
  };

  // ── render ────────────────────────────────
  if (pageLoading) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        Cargando configuración...
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="text-center py-16 text-red-500 text-sm">{pageError}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ══════════════════════════════════════
          1 — LOGO DEL CLUB
          ══════════════════════════════════════ */}
      <Section dimmed={!isProOrPremium}>
        <SectionHeader
          title="Logo del Club"
          badge="Pro / Premium"
          description={
            isProOrPremium
              ? 'El logo se incluirá automáticamente en los PDFs de cuadros y cronogramas.'
              : 'El logo del club está disponible en los planes Pro y Premium.'
          }
        />

        {isProOrPremium ? (
          <div className="max-w-xs">
            <ImageDropzone
              onFile={setLogoFile}
              currentUrl={config?.logo_url || null}
              label="Subir logo del club"
            />
          </div>
        ) : (
          <LockedNote text="Disponible en los planes Pro y Premium." />
        )}

        {isProOrPremium && logoFile && (
          <button
            type="button"
            onClick={handleSaveLogo}
            disabled={logoSaving}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {logoSaving ? 'Subiendo...' : 'Guardar logo'}
          </button>
        )}

        {logoMsg.text && (
          <p className={`mt-2 text-sm ${logoMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
            {logoMsg.text}
          </p>
        )}
      </Section>

      {/* ══════════════════════════════════════
          2 — MARCA BLANCA (Premium)
          ══════════════════════════════════════ */}
      <Section dimmed={!isPremium}>
        <div className="flex items-start justify-between gap-4">
          <SectionHeader
            title="Marca Blanca"
            badge="Premium"
            description='Ocultá el texto "Powered by SetGo" de la cartelera pública del club.'
          />

          {/* Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={whiteLabel}
            disabled={!isPremium || wlSaving}
            onClick={() => isPremium && handleToggleWhiteLabel(!whiteLabel)}
            className={`relative flex-shrink-0 mt-1 w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              whiteLabel ? 'bg-amber-500' : 'bg-gray-200'
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                whiteLabel ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {!isPremium && <LockedNote text="Disponible en el plan Premium." />}
      </Section>

      {/* ══════════════════════════════════════
          3 — GESTIÓN DE ANUNCIOS (Próximamente)
          ══════════════════════════════════════ */}
      <Section dimmed>
        <SectionHeader
          title="Gestión de Anuncios"
          badge="Próximamente"
          description="Podrás subir tus propios banners para mostrarlos en la cartelera pública del club."
        />
        <p className="text-xs text-gray-400 mt-1">
          Esta funcionalidad estará disponible próximamente.
        </p>
      </Section>
    </div>
  );
}
