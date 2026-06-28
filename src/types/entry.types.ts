export interface EntryItem {
  id: number;
  user_id: number;
  entry_type_id: number;
  entry_subtype_id: number;
  file_id?: number;
  title: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  file_name?: string;
  file_base64?: string;
  mime_type?: string;
}

export interface FileByIdItem {
  file_id: number;
  file_name: string;
  file_base64?: string;
  mime_type?: string;
  created_at?: string;
}

export interface EntryPagination {
  page: number;
  limit: number;
  total: number;
}

export interface EntryListResponse {
  success: boolean;
  data: EntryItem[];
  pagination: EntryPagination;
  timestamp: string;
}

export interface CreateEntryRequest {
  user_id: number;
  entry_type_id: number;
  entry_subtype_id: number;
  title: string;
  description: string;
  file_name: string;
  file_base64: string;
}

export interface CreateEntryResponse {
  success: boolean;
  data?: EntryItem;
  message?: string;
  timestamp?: string;
}

export interface EntryTypeItem {
  id: number;
  name?: string;
  title?: string;
  label?: string;
  description?: string;
}

export interface EntrySubtypeItem {
  id: number;
  entry_type_id?: number;
  name?: string;
  title?: string;
  label?: string;
  description?: string;
}

export interface EntryTypesResponse {
  success: boolean;
  data: EntryTypeItem[];
  total?: number;
  timestamp?: string;
}

export interface EntrySubtypesResponse {
  success: boolean;
  data: EntrySubtypeItem[];
  total?: number;
  filters?: {
    entry_type_id?: number | null;
  };
  timestamp?: string;
}

export interface FileByIdResponse {
  success: boolean;
  data: FileByIdItem;
  timestamp?: string;
}
