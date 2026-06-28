import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { EntryItem, FileByIdItem } from '../../types/entry.types';
import { entryService } from '../../services/entry.service';

type EntryListRenderItem =
  | {
      kind: 'month-header';
      id: string;
      monthLabel: string;
    }
  | {
      kind: 'entry';
      id: string;
      entry: EntryItem;
    };

export default function EntryScreen() {
  const [entryList, setEntryList] = useState<EntryItem[]>([]);
  const [entryTypeNameById, setEntryTypeNameById] = useState<Record<number, string>>({});
  const [entrySubtypeNameById, setEntrySubtypeNameById] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<EntryItem | null>(null);
  const [filePreviewEntry, setFilePreviewEntry] = useState<EntryItem | null>(null);
  const [filePreviewData, setFilePreviewData] = useState<FileByIdItem | null>(null);
  const [isFilePreviewLoading, setIsFilePreviewLoading] = useState(false);
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null);

  const getEntryDate = useCallback((entry: EntryItem): Date | null => {
    const rawDate = entry.created_at ?? entry.updated_at;

    if (!rawDate) {
      return null;
    }

    const parsedDate = new Date(rawDate);

    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return parsedDate;
  }, []);

  const monthYearFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-PT', {
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  const entryListWithMonthHeaders = useMemo<EntryListRenderItem[]>(() => {
    const nextItems: EntryListRenderItem[] = [];
    let currentMonthKey: string | null = null;

    entryList.forEach((entry) => {
      const parsedDate = getEntryDate(entry);
      const monthKey = parsedDate
        ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`
        : 'sem-data';
      const monthLabel = parsedDate
        ? monthYearFormatter.format(parsedDate)
        : 'Sem data';

      if (monthKey !== currentMonthKey) {
        currentMonthKey = monthKey;
        nextItems.push({
          kind: 'month-header',
          id: `month-${monthKey}`,
          monthLabel,
        });
      }

      nextItems.push({
        kind: 'entry',
        id: `entry-${entry.id}`,
        entry,
      });
    });

    return nextItems;
  }, [entryList, getEntryDate, monthYearFormatter]);
  const [playingEntryId, setPlayingEntryId] = useState<number | null>(null);
  const webAudioRef = useRef<{
    play: () => Promise<void>;
    pause: () => void;
    currentTime: number;
    onended: (() => void) | null;
  } | null>(null);

  const loadEntryList = useCallback(async (isPullToRefresh = false) => {
    try {
      if (isPullToRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      const [entryListResponse, entryTypesResponse, entrySubtypesResponse] = await Promise.all([
        entryService.listEntries(),
        entryService.listEntryTypes(),
        entryService.listEntrySubtypes(),
      ]);

      const nextTypeNameById = entryTypesResponse.data.reduce<Record<number, string>>(
        (accumulator, typeItem) => {
          const typeName = typeItem.name ?? typeItem.title ?? typeItem.label;

          if (typeName) {
            accumulator[typeItem.id] = typeName;
          }

          return accumulator;
        },
        {},
      );

      const nextSubtypeNameById = entrySubtypesResponse.data.reduce<Record<number, string>>(
        (accumulator, subtypeItem) => {
          const subtypeName = subtypeItem.name ?? subtypeItem.title ?? subtypeItem.label;

          if (subtypeName) {
            accumulator[subtypeItem.id] = subtypeName;
          }

          return accumulator;
        },
        {},
      );

      setEntryList(entryListResponse.data);
      setEntryTypeNameById(nextTypeNameById);
      setEntrySubtypeNameById(nextSubtypeNameById);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erro ao carregar entries');
    } finally {
      if (isPullToRefresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadEntryList();
  }, [loadEntryList]);

  useEffect(() => {
    return () => {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.currentTime = 0;
        webAudioRef.current = null;
      }
    };
  }, []);

  const loadFileData = useCallback(async (fileId: number): Promise<FileByIdItem> => {
    const response = await entryService.getFileById(fileId);
    return response.data;
  }, []);

  const resolveAudioSource = useCallback((entry: EntryItem, fileData?: FileByIdItem | null): string | null => {
    const sourceData = fileData ?? null;

    if (sourceData?.file_base64) {
      const mimeType = sourceData.mime_type && sourceData.mime_type.startsWith('audio/')
        ? sourceData.mime_type
        : 'audio/mpeg';

      return `data:${mimeType};base64,${sourceData.file_base64}`;
    }

    if (entry.file_base64) {
      const mimeType = entry.mime_type && entry.mime_type.startsWith('audio/')
        ? entry.mime_type
        : 'audio/mpeg';

      return `data:${mimeType};base64,${entry.file_base64}`;
    }

    if (entry.file_name) {
      const isHttp = /^https?:\/\//i.test(entry.file_name);
      const isDataAudio = entry.file_name.startsWith('data:audio/');

      if (isHttp || isDataAudio) {
        return entry.file_name;
      }
    }

    return null;
  }, []);

  const handlePlayAudio = useCallback((entry: EntryItem) => {
    console.log('Entry completo para áudio', entry);

    setFilePreviewEntry(entry);
    setFilePreviewData(null);
    setFilePreviewError(null);
    setIsFilePreviewLoading(true);

    if (!entry.file_id) {
      setIsFilePreviewLoading(false);
      setFilePreviewError('Áudio sem ID para busca.');
      return;
    }

    void loadFileData(entry.file_id)
      .then((fileData) => {
        setFilePreviewData(fileData);
        console.log('Source resolvido para áudio', {
          entryId: entry.id,
          hasSource: !!resolveAudioSource(entry, fileData),
          hasBase64: !!fileData.file_base64,
          fileName: fileData.file_name,
          mimeType: fileData.mime_type,
        });
      })
      .catch((error) => {
        console.log('Áudio sem source para preview (fallback modal)', {
          entryId: entry.id,
          error: error instanceof Error ? error.message : 'erro desconhecido',
        });
        setFilePreviewError(error instanceof Error ? error.message : 'Erro ao carregar áudio.');
      })
      .finally(() => {
        setIsFilePreviewLoading(false);
      });
  }, [loadFileData, resolveAudioSource]);

  const getNonAudioFileKind = useCallback((entry: EntryItem): 'pdf' | 'image' | null => {
    const mimeType = (entry.mime_type ?? '').toLowerCase();
    const fileName = (entry.file_name ?? '').toLowerCase();

    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return 'pdf';
    }

    if (
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.png')
    ) {
      return 'image';
    }

    return null;
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!entryToDelete) return;

    try {
      setIsLoading(true);
      await entryService.deleteEntry(Number(entryToDelete.id));
      setEntryToDelete(null);
      await loadEntryList();
    } catch (error) {
      Alert.alert(
        'Erro ao deletar',
        error instanceof Error ? error.message : 'Erro desconhecido ao deletar a entrada',
      );
    } finally {
      setIsLoading(false);
    }
  }, [entryToDelete, loadEntryList]);

  const resolveFileSource = useCallback((entry: EntryItem, fileData?: FileByIdItem | null): string | null => {
    const sourceData = fileData ?? null;

    if (sourceData?.file_base64) {
      const mimeType = sourceData.mime_type?.trim() || 'application/octet-stream';
      return `data:${mimeType};base64,${sourceData.file_base64}`;
    }

    if (entry.file_base64) {
      const mimeType = entry.mime_type?.trim() || 'application/octet-stream';
      return `data:${mimeType};base64,${entry.file_base64}`;
    }

    if (entry.file_name) {
      const isHttp = /^https?:\/\//i.test(entry.file_name);
      const isDataUri = /^data:/i.test(entry.file_name);

      if (isHttp || isDataUri) {
        return entry.file_name;
      }
    }

    return null;
  }, []);

  const downloadSource = useCallback((source: string, fileName: string) => {
    const documentRef = globalThis.document;

    if (!documentRef?.createElement || !documentRef.body) {
      Alert.alert('Não suportado', 'Não foi possível baixar este arquivo neste dispositivo.');
      return;
    }

    const linkElement = documentRef.createElement('a');
    linkElement.href = source;
    linkElement.download = fileName;
    linkElement.style.display = 'none';
    documentRef.body.appendChild(linkElement);
    linkElement.click();
    documentRef.body.removeChild(linkElement);
  }, []);

  const buildPdfViewerHtml = useCallback((fileData: FileByIdItem): string => {
    const base64Content = fileData.file_base64 ?? '';
    const mimeType = fileData.mime_type?.trim() || 'application/pdf';

    return `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #f8fafc; }
            body { overflow: hidden; }
            .viewer { width: 100%; height: 100%; }
            iframe, object { width: 100%; height: 100%; border: 0; }
          </style>
        </head>
        <body>
          <div class="viewer">
            <object data="data:${mimeType};base64,${base64Content}" type="${mimeType}">
              <iframe src="data:${mimeType};base64,${base64Content}"></iframe>
            </object>
          </div>
        </body>
      </html>
    `;
  }, []);

  const buildAudioPlayerHtml = useCallback((fileData: FileByIdItem): string => {
    const base64Content = fileData.file_base64 ?? '';
    const mimeType = fileData.mime_type?.trim() || 'audio/mpeg';

    return `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <style>
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #f8fafc; font-family: Arial, sans-serif; }
            body { display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
            .card { width: 100%; max-width: 520px; background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 18px; box-sizing: border-box; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08); }
            .title { font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 8px; }
            .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 16px; line-height: 18px; }
            audio { width: 100%; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="title">Player de áudio</div>
            <div class="subtitle">Toque no play para ouvir o conteúdo dentro do modal.</div>
            <audio controls preload="metadata" autoplay>
              <source src="data:${mimeType};base64,${base64Content}" type="${mimeType}" />
              Seu navegador não suporta áudio.
            </audio>
          </div>
        </body>
      </html>
    `;
  }, []);

  const handleOpenFile = useCallback((entry: EntryItem) => {
    console.log('Entry completo para arquivo', entry);

    console.log('Abrir arquivo da entry', {
      entryId: entry.id,
      fileId: entry.file_id,
      fileName: entry.file_name,
      mimeType: entry.mime_type,
    });

    setFilePreviewEntry(entry);
    setFilePreviewData(null);
    setFilePreviewError(null);
    setIsFilePreviewLoading(true);

    if (!entry.file_id) {
      setIsFilePreviewLoading(false);
      setFilePreviewError('Arquivo sem ID para busca.');
      return;
    }

    void loadFileData(entry.file_id)
      .then((fileData) => {
        setFilePreviewData(fileData);
        console.log('Source resolvido para arquivo', {
          entryId: entry.id,
          hasSource: !!resolveFileSource(entry, fileData),
          hasBase64: !!fileData.file_base64,
          fileName: fileData.file_name,
          mimeType: fileData.mime_type,
        });
      })
      .catch((error) => {
        console.log('Arquivo sem source para preview (fallback modal)', {
          entryId: entry.id,
          error: error instanceof Error ? error.message : 'erro desconhecido',
        });
        setFilePreviewError(error instanceof Error ? error.message : 'Erro ao buscar arquivo.');
      })
      .finally(() => {
        setIsFilePreviewLoading(false);
      });
  }, [loadFileData, resolveFileSource]);

  const handleDownloadPdf = useCallback(() => {
    if (!filePreviewEntry) {
      return;
    }

    const source = resolveFileSource(filePreviewEntry, filePreviewData);

    if (!source) {
      Alert.alert('Arquivo indisponível', 'Não foi possível baixar o PDF.');
      return;
    }

    downloadSource(source, filePreviewData?.file_name ?? filePreviewEntry.file_name ?? 'arquivo.pdf');
  }, [downloadSource, filePreviewData, filePreviewEntry, resolveFileSource]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando entries...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerContent}>
          <Text style={styles.errorTitle}>Não foi possível carregar</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadEntryList()}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Bem-vindo, sua lista de entradas</Text>
          <Text style={styles.subtitle}>Aqui você acompanha tudo o que já foi registrado.</Text>
        </View>

        <FlatList
          data={entryListWithMonthHeaders}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void loadEntryList(true)}
            />
          }
          contentContainerStyle={entryList.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nenhuma entry encontrada</Text>
              <Text style={styles.emptySubtitle}>Quando houver registros, eles aparecerão aqui.</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'month-header') {
              return (
                <View style={styles.monthHeaderContainer}>
                  <Text style={styles.monthHeaderText}>{item.monthLabel}</Text>
                </View>
              );
            }

            const entry = item.entry;
            const nonAudioFileKind = getNonAudioFileKind(entry);
            const entryTypeId = Number(entry.entry_type_id);
            const shouldShowFileAction = entryTypeId !== 3;

            return (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => setEntryToDelete(entry)}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteButtonIcon}>🗑️</Text>
              </TouchableOpacity>

              <Text style={styles.cardTitle}>{entry.title}</Text>
              {!!entry.description && <Text style={styles.cardDescription}>{entry.description}</Text>}
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>ID: {entry.id}</Text>
                <Text style={styles.metaText}>
                  Tipo: {entryTypeNameById[entry.entry_type_id] ?? `#${entry.entry_type_id}`}
                </Text>
                <Text style={styles.metaText}>
                  Subtipo: {entrySubtypeNameById[entry.entry_subtype_id] ?? `#${entry.entry_subtype_id}`}
                </Text>
              </View>
              <View style={styles.footerRow}>
                {!!entry.created_at && <Text style={styles.dateText}>Criado em: {entry.created_at}</Text>}

                {entryTypeId === 3 ? (
                  <TouchableOpacity
                    onPress={() => handlePlayAudio(entry)}
                    style={styles.playButton}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.playButtonIcon}>
                      {playingEntryId === Number(entry.id) ? '⏹' : '▶️'}
                    </Text>
                  </TouchableOpacity>
                ) : shouldShowFileAction && nonAudioFileKind === 'pdf' ? (
                  <TouchableOpacity
                    onPress={() => handleOpenFile(entry)}
                    style={styles.playButton}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.playButtonIcon}>📄</Text>
                  </TouchableOpacity>
                ) : shouldShowFileAction && nonAudioFileKind === 'image' ? (
                  <TouchableOpacity
                    onPress={() => handleOpenFile(entry)}
                    style={styles.playButton}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.playButtonIcon}>🖼️</Text>
                  </TouchableOpacity>
                ) : shouldShowFileAction ? (
                  <TouchableOpacity
                    onPress={() => handleOpenFile(entry)}
                    style={styles.playButton}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.playButtonIcon}>📎</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            );
          }}
        />
      </View>

      <Modal
        visible={!!entryToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setEntryToDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmar exclusão</Text>
            <Text style={styles.modalDescription}>
              Tem certeza que deseja excluir a entrada
              {entryToDelete?.title ? ` "${entryToDelete.title}"` : ''}?
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => setEntryToDelete(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalSecondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalDangerButton}
                onPress={() => void handleConfirmDelete()}
                activeOpacity={0.85}
              >
                <Text style={styles.modalDangerButtonText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!filePreviewEntry}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setFilePreviewEntry(null);
          setFilePreviewData(null);
          setFilePreviewError(null);
          setIsFilePreviewLoading(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.previewModalCard}>
            <Text style={styles.modalTitle}>Visualizar arquivo</Text>

            <Text style={styles.previewFileName} numberOfLines={1}>
              {filePreviewEntry?.file_name ?? 'Arquivo'}
            </Text>

            {isFilePreviewLoading ? (
              <View style={styles.previewLoadingBox}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.previewLoadingText}>A carregar arquivo...</Text>
              </View>
            ) : filePreviewError ? (
              <Text style={styles.previewPdfHint}>{filePreviewError}</Text>
            ) : filePreviewEntry && filePreviewData && getNonAudioFileKind(filePreviewEntry) === 'image' && !!resolveFileSource(filePreviewEntry, filePreviewData) ? (
              <View style={styles.previewImageContainer}>
                <Image
                  source={{ uri: resolveFileSource(filePreviewEntry, filePreviewData) as string }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              </View>
            ) : filePreviewEntry && filePreviewData && Number(filePreviewEntry.entry_type_id) === 3 && !!filePreviewData.file_base64 ? (
              <View style={styles.previewAudioViewerContainer}>
                <WebView
                  originWhitelist={['*']}
                  source={{ html: buildAudioPlayerHtml(filePreviewData) }}
                  style={styles.previewAudioViewer}
                  javaScriptEnabled
                  domStorageEnabled
                />
              </View>
            ) : filePreviewEntry && filePreviewData && getNonAudioFileKind(filePreviewEntry) === 'pdf' && !!filePreviewData.file_base64 ? (
              <View style={styles.previewPdfViewerContainer}>
                <WebView
                  originWhitelist={['*']}
                  source={{ html: buildPdfViewerHtml(filePreviewData) }}
                  style={styles.previewPdfViewer}
                  javaScriptEnabled
                  domStorageEnabled
                />
              </View>
            ) : filePreviewEntry && filePreviewData && !resolveFileSource(filePreviewEntry, filePreviewData) ? (
              <Text style={styles.previewPdfHint}>
                Arquivo carregado, mas sem preview direto disponível. Você pode abrir externamente.
              </Text>
            ) : (
              <Text style={styles.previewPdfHint}>
                Pré-visualização simplificada do arquivo.
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => setFilePreviewEntry(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalSecondaryButtonText}>Fechar</Text>
              </TouchableOpacity>

              {filePreviewEntry && filePreviewData && getNonAudioFileKind(filePreviewEntry) === 'pdf' && !!resolveFileSource(filePreviewEntry, filePreviewData) ? (
                <TouchableOpacity
                  style={styles.modalPrimaryButton}
                  onPress={handleDownloadPdf}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalPrimaryButtonText}>Download</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#6b7280',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#4b5563',
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  card: {
    position: 'relative',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  monthHeaderContainer: {
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  monthHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'capitalize',
  },
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonIcon: {
    fontSize: 13,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  footerRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  playButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonIcon: {
    fontSize: 14,
  },
  cardDescription: {
    marginTop: 4,
    fontSize: 14,
    color: '#4b5563',
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  previewModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  previewFileName: {
    marginTop: 8,
    color: '#4b5563',
    fontSize: 13,
  },
  previewImageContainer: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    backgroundColor: '#f9fafb',
    height: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPdfViewerContainer: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    backgroundColor: '#f9fafb',
    height: 420,
  },
  previewPdfViewer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  previewAudioViewerContainer: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    backgroundColor: '#f9fafb',
    height: 220,
  },
  previewAudioViewer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  previewLoadingBox: {
    marginTop: 14,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  previewLoadingText: {
    color: '#4b5563',
    fontSize: 14,
  },
  previewPdfHint: {
    marginTop: 14,
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
  },
  modalDescription: {
    marginTop: 10,
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 22,
  },
  modalActions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 10,
  },
  modalSecondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSecondaryButtonText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 14,
  },
  modalDangerButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDangerButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalPrimaryButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
