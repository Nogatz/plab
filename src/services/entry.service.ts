import type {
  CreateEntryRequest,
  CreateEntryResponse,
  FileByIdResponse,
  EntrySubtypesResponse,
  EntryListResponse,
  EntryTypesResponse,
} from '../types/entry.types';
import { authService } from './auth.service';

const API_BASE_URL = 'https://pacientelab.com';

const listEntries = async (): Promise<EntryListResponse> => {
  const token = await authService.getToken();

  if (!token) {
    throw new Error('Token não encontrado. Faça login novamente.');
  }

  const response = await fetch(`${API_BASE_URL}/api/entry/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message ?? 'Erro ao buscar entradas');
  }

  return (await response.json()) as EntryListResponse;
};

const getFileById = async (fileId: number): Promise<FileByIdResponse> => {
  const token = await authService.getToken();

  if (!token) {
    throw new Error('Token não encontrado. Faça login novamente.');
  }

  const response = await fetch(`${API_BASE_URL}/api/fileByID/${fileId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message ?? 'Erro ao buscar arquivo');
  }

  return (await response.json()) as FileByIdResponse;
};

const deleteEntry = async (entryId: number): Promise<{ success: boolean; message: string }> => {
  const token = await authService.getToken();

  if (!token) {
    throw new Error('Token não encontrado. Faça login novamente.');
  }

  const response = await fetch(`${API_BASE_URL}/api/entry/${entryId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message ?? 'Erro ao deletar entrada');
  }

  return (await response.json()) as { success: boolean; message: string };
};

const createEntry = async (payload: CreateEntryRequest): Promise<CreateEntryResponse> => {
  const token = await authService.getToken();

  if (!token) {
    throw new Error('Token não encontrado. Faça login novamente.');
  }

  const response = await fetch(`${API_BASE_URL}/api/entry/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message ?? 'Erro ao criar entry');
  }

  return (await response.json()) as CreateEntryResponse;
};

const listEntryTypes = async (): Promise<EntryTypesResponse> => {
  const token = await authService.getToken();

  if (!token) {
    throw new Error('Token não encontrado. Faça login novamente.');
  }

  const response = await fetch(`${API_BASE_URL}/api/entry/types`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message ?? 'Erro ao buscar tipos de entry');
  }

  return (await response.json()) as EntryTypesResponse;
};

const listEntrySubtypes = async (entryTypeId?: number): Promise<EntrySubtypesResponse> => {
  const token = await authService.getToken();

  if (!token) {
    throw new Error('Token não encontrado. Faça login novamente.');
  }

  const query =
    typeof entryTypeId === 'number' && entryTypeId > 0
      ? `?entry_type_id=${entryTypeId}`
      : '';

  const response = await fetch(`${API_BASE_URL}/api/entry/subtypes${query}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as { message?: string }).message ?? 'Erro ao buscar subtipos de entry');
  }

  return (await response.json()) as EntrySubtypesResponse;
};

export const entryService = {
  listEntries,
  createEntry,
  getFileById,
  deleteEntry,
  listEntryTypes,
  listEntrySubtypes,
};
