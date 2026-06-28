import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LoginRequest, LoginResponse, RegisterRequest, User } from '../types/auth.types';

const API_BASE_URL = 'https://pacientelab.com';

const STORAGE_KEYS = {
  ACCESS_TOKEN: '@patient_lab:access_token',
  USER: '@patient_lab:user',
} as const;

// ─── Storage helpers ──────────────────────────────────────────────────────────

const storeToken = async (token: string): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
};

const storeUser = async (user: User): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};

const getToken = async (): Promise<string | null> => {
  return AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
};

const getUser = async (): Promise<User | null> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER);
  if (!raw) return null;
  return JSON.parse(raw) as User;
};

const clearSession = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  await AsyncStorage.removeItem(STORAGE_KEYS.USER);
};

// ─── API calls ────────────────────────────────────────────────────────────────

const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/auth/login/`, {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message ?? 'Erro ao fazer login');
  }

  const data = (await response.json()) as LoginResponse;

  await storeToken(data.access_token);
  await storeUser(data.user);

  return data;
};

const register = async (payload: RegisterRequest): Promise<void> => {
  const token = await getToken();

  const response = await fetch(`${API_BASE_URL}/api/auth/register/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message ?? 'Erro ao cadastrar');
  }
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const authService = {
  login,
  register,
  getToken,
  getUser,
  clearSession,
};
