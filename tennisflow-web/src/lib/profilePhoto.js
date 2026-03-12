import { supabase } from './supabase';

export const PROFILE_PHOTO_BUCKET = 'profile-photos';

const extractStoragePath = (url, bucket = PROFILE_PHOTO_BUCKET) => {
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

export async function resolveProfilePhotoUrl(rawUrl) {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return rawUrl;

  const storagePath = extractStoragePath(rawUrl, PROFILE_PHOTO_BUCKET);
  if (!storagePath) return rawUrl;

  const { data, error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24);

  if (error || !data?.signedUrl) {
    return rawUrl;
  }

  return data.signedUrl;
}
