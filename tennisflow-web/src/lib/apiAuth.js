import axios from 'axios';
import { supabase } from './supabase';

const CURRENT_CLUB_ID_STORAGE_KEY = 'tennisflow.current-club-id';

let interceptorId = null;

const isApiRequest = (url = '') => {
  const target = String(url || '').trim();
  if (!target) return false;
  return target === '/api' || target.startsWith('/api/');
};

const readCurrentClubId = () => {
  if (typeof window === 'undefined') return '';

  try {
    return String(window.localStorage.getItem(CURRENT_CLUB_ID_STORAGE_KEY) || '').trim();
  } catch (_) {
    return '';
  }
};

export const setupAxiosAuthInterceptor = () => {
  if (interceptorId !== null) return;

  interceptorId = axios.interceptors.request.use(async (config) => {
    if (!isApiRequest(config?.url)) {
      return config;
    }

    const clubId = readCurrentClubId();
    const nextConfig = {
      ...config,
      params: {
        ...(config?.params || {}),
      },
    };

    if (clubId && !nextConfig.params.club_id) {
      nextConfig.params.club_id = clubId;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      return nextConfig;
    }

    return {
      ...nextConfig,
      headers: {
        ...(config?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    };
  });
};
