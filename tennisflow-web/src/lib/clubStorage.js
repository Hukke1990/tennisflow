import { supabase } from './supabase';

export const CLUB_LOGOS_BUCKET = 'club-logos';
export const CLUB_ADS_BUCKET = 'club-ads';

const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB

const validateImage = (file) => {
  if (!file) return 'No se seleccionó ningún archivo.';
  if (!VALID_IMAGE_TYPES.has(file.type)) return 'Solo se permiten imágenes JPEG, PNG, WEBP o GIF.';
  if (file.size > MAX_SIZE_BYTES) return 'El archivo supera el límite de 3 MB.';
  return null;
};

const extractPathFromUrl = (url, bucket) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
};

// ──────────────────────────────────────────────────────────────────────
// Upload club logo → bucket: club-logos / path: {clubId}/logo.{ext}
// Returns public URL string.
// ──────────────────────────────────────────────────────────────────────
export async function uploadClubLogo({ clubId, file }) {
  const err = validateImage(file);
  if (err) throw new Error(err);

  const ext = (file.name || '').split('.').pop() || 'jpg';
  const filePath = `${clubId}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(CLUB_LOGOS_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(CLUB_LOGOS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// ──────────────────────────────────────────────────────────────────────
// Upload ad image → bucket: club-ads / path: {clubId}/ad_{timestamp}.{ext}
// Returns public URL string.
// ──────────────────────────────────────────────────────────────────────
export async function uploadAdImage({ clubId, file }) {
  const err = validateImage(file);
  if (err) throw new Error(err);

  const ext = (file.name || '').split('.').pop() || 'jpg';
  const filePath = `${clubId}/ad_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(CLUB_ADS_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(CLUB_ADS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// ──────────────────────────────────────────────────────────────────────
// Delete a file from storage given its full public URL.
// Silently ignores errors (best-effort cleanup).
// ──────────────────────────────────────────────────────────────────────
export async function deleteStorageFile(bucket, url) {
  if (!url) return;
  try {
    const path = extractPathFromUrl(url, bucket);
    if (!path) return;
    await supabase.storage.from(bucket).remove([path]);
  } catch (_) {
    // best-effort
  }
}
