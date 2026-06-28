import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { authService } from '../../services/auth.service';
import { entryService } from '../../services/entry.service';

type FileEntryKind = 'exam' | 'recipe';

interface FileEntryConfig {
  kind: FileEntryKind;
  title: string;
  entryTypeId: number;
  entrySubtypeId: number;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

interface MediaStreamTrackLike {
  stop: () => void;
}

interface MediaStreamLike {
  getTracks: () => MediaStreamTrackLike[];
}

interface MediaRecorderDataAvailableEventLike {
  data: { size: number };
}

interface MediaRecorderLike {
  state: 'inactive' | 'recording' | string;
  mimeType?: string;
  ondataavailable: ((event: MediaRecorderDataAvailableEventLike) => void) | null;
  onstop: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type MediaRecorderCtor = new (stream: MediaStreamLike) => MediaRecorderLike;

interface BrowserApiLike {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  MediaRecorder?: MediaRecorderCtor;
  navigator?: {
    mediaDevices?: {
      getUserMedia?: (constraints: { audio: boolean }) => Promise<MediaStreamLike>;
    };
    permissions?: {
      query?: (permissionDescriptor: { name: string }) => Promise<{ state: string }>;
    };
  };
  document?: {
    createElement?: (tagName: string) => {
      type?: string;
      accept?: string;
      multiple?: boolean;
      onchange?: ((event: { target?: { files?: ArrayLike<BrowserFileLike> } }) => void) | null;
      click?: () => void;
    };
  };
  FileReader?: new () => {
    result: string | ArrayBuffer | null;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    readAsDataURL: (file: BrowserFileLike) => void;
  };
}

interface BrowserFileLike {
  name: string;
  size: number;
  type: string;
}

export default function NewEntryScreen() {
  const maxRecordingSeconds = 90;
  const mediaRecorderRef = useRef<MediaRecorderLike | null>(null);
  const streamRef = useRef<MediaStreamLike | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);

  const [isAudioModalVisible, setIsAudioModalVisible] = useState(false);
  const [isFileModalVisible, setIsFileModalVisible] = useState(false);
  const [fileEntryConfig, setFileEntryConfig] = useState<FileEntryConfig | null>(null);
  const [fileTitleInput, setFileTitleInput] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileBase64, setSelectedFileBase64] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileSuccess, setFileSuccess] = useState<string | null>(null);
  const [isFileSaving, setIsFileSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [microphonePermissionStatus, setMicrophonePermissionStatus] = useState<
    'unknown' | 'granted' | 'denied'
  >('unknown');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [remainingRecordingSeconds, setRemainingRecordingSeconds] =
    useState(maxRecordingSeconds);
  const [remainingRecordingTimeLabel, setRemainingRecordingTimeLabel] = useState('01:30');

  useEffect(() => {
    initializeSpeechRecognition();
    void syncMicrophonePermissionState();

    return () => {
      stopRecording();
      stopRecordingCountdown();
      stopSpeechRecognition();
    };
  }, []);

  useEffect(() => {
    const minutes = Math.floor(remainingRecordingSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (remainingRecordingSeconds % 60).toString().padStart(2, '0');

    setRemainingRecordingTimeLabel(`${minutes}:${seconds}`);
  }, [remainingRecordingSeconds]);

  const getBrowserApi = (): BrowserApiLike => {
    return globalThis as unknown as BrowserApiLike;
  };

  const getSpeechRecognitionCtor = (): SpeechRecognitionCtor | null => {
    const browserApi = getBrowserApi();

    return browserApi.SpeechRecognition || browserApi.webkitSpeechRecognition || null;
  };

  const syncMicrophonePermissionState = async () => {
    const browserApi = getBrowserApi();
    const queryPermission = browserApi.navigator?.permissions?.query;

    if (!queryPermission) {
      return;
    }

    try {
      const permissionResult = await queryPermission({ name: 'microphone' });

      if (permissionResult.state === 'granted') {
        setMicrophonePermissionStatus('granted');
      } else if (permissionResult.state === 'denied') {
        setMicrophonePermissionStatus('denied');
      } else {
        setMicrophonePermissionStatus('unknown');
      }
    } catch {
      setMicrophonePermissionStatus('unknown');
    }
  };

  const initializeSpeechRecognition = () => {
    const speechRecognitionCtor = getSpeechRecognitionCtor();

    if (!speechRecognitionCtor) {
      setIsSpeechSupported(false);
      return;
    }

    setIsSpeechSupported(true);

    const speechRecognition = new speechRecognitionCtor();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'pt-BR';

    speechRecognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interimTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript?.trim();

        if (!transcript) {
          continue;
        }

        if (event.results[index].isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${transcript}`.trim();
        }
      }

      setTranscriptText(`${finalTranscriptRef.current} ${interimTranscript}`.trim());
    };

    speechRecognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setSpeechError(event.error || 'Falha ao transcrever o áudio.');
    };

    speechRecognition.onend = () => {
      setIsListening(false);
    };

    speechRecognitionRef.current = speechRecognition;
  };

  const startSpeechRecognition = () => {
    const speechRecognition = speechRecognitionRef.current;

    if (!speechRecognition || !isSpeechSupported) {
      return;
    }

    try {
      speechRecognition.start();
      setIsListening(true);
    } catch (error) {
      console.error('Speech recognition start error:', error);
      setSpeechError('Não foi possível iniciar a transcrição.');
    }
  };

  const stopSpeechRecognition = () => {
    const speechRecognition = speechRecognitionRef.current;

    if (!speechRecognition || !isSpeechSupported) {
      return;
    }

    try {
      speechRecognition.stop();
      setIsListening(false);
    } catch (error) {
      console.error('Speech recognition stop error:', error);
    }
  };

  const stopRecordingCountdown = () => {
    if (recordingCountdownIntervalRef.current) {
      clearInterval(recordingCountdownIntervalRef.current);
      recordingCountdownIntervalRef.current = null;
    }
  };

  const startRecordingCountdown = () => {
    stopRecordingCountdown();
    setRemainingRecordingSeconds(maxRecordingSeconds);

    recordingCountdownIntervalRef.current = setInterval(() => {
      setRemainingRecordingSeconds((previousValue) => {
        if (!isRecordingRef.current) {
          return previousValue;
        }

        if (previousValue <= 1) {
          stopRecording();
          return 0;
        }

        return previousValue - 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    stopSpeechRecognition();
    stopRecordingCountdown();

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    isRecordingRef.current = false;
    setIsRecording(false);
    setRemainingRecordingSeconds(maxRecordingSeconds);
  };

  const requestMicrophonePermission = async (): Promise<boolean> => {
    const browserApi = getBrowserApi();
    const mediaDevices = browserApi.navigator?.mediaDevices;

    if (!mediaDevices?.getUserMedia) {
      setSpeechError('Este dispositivo/navegador não suporta acesso ao microfone.');
      setMicrophonePermissionStatus('denied');
      return false;
    }

    try {
      const permissionStream = await mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      setMicrophonePermissionStatus('granted');
      setSpeechError(null);
      return true;
    } catch (error) {
      console.error('Microphone permission denied or unavailable:', error);
      setMicrophonePermissionStatus('denied');
      setSpeechError(
        'Permissão de microfone negada. Ative o microfone nas configurações do navegador/sistema e tente novamente.',
      );
      return false;
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    try {
      const hasPermission = await requestMicrophonePermission();

      if (!hasPermission) {
        return;
      }

      const browserApi = getBrowserApi();
      const mediaDevices = browserApi.navigator?.mediaDevices;
      const mediaRecorderCtor = browserApi.MediaRecorder;

      if (!mediaDevices?.getUserMedia || !mediaRecorderCtor) {
        setSpeechError('Gravação não suportada neste dispositivo/navegador.');
        return;
      }

      finalTranscriptRef.current = '';
      setTranscriptText('');
      setSpeechError(null);

      const stream = await mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new mediaRecorderCtor(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = () => {
        // Parte visual inicial: o blob gravado será utilizado nos próximos passos.
      };

      mediaRecorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      startRecordingCountdown();
      startSpeechRecognition();
    } catch (error) {
      console.error('Microphone permission denied or unavailable:', error);
      setSpeechError('Permissão de microfone negada ou indisponível.');
    }
  };

  const closeAudioModal = () => {
    if (isRecording) {
      stopRecording();
    }

    setIsAudioModalVisible(false);
  };

  const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();

  const acceptedFileMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  const acceptedFileExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
  const maxFileSizeBytes = 5 * 1024 * 1024;

  const readFileAsBase64 = async (file: BrowserFileLike): Promise<string> => {
    const browserApi = getBrowserApi();
    const FileReaderCtor = browserApi.FileReader;

    if (!FileReaderCtor) {
      throw new Error('Leitura de arquivo não suportada neste navegador.');
    }

    return new Promise<string>((resolve, reject) => {
      const fileReader = new FileReaderCtor();

      fileReader.onload = () => {
        const rawResult = fileReader.result;

        if (typeof rawResult !== 'string') {
          reject(new Error('Não foi possível ler o arquivo selecionado.'));
          return;
        }

        const base64Content = rawResult.includes(',') ? rawResult.split(',')[1] : rawResult;
        resolve(base64Content);
      };

      fileReader.onerror = () => {
        reject(new Error('Erro ao converter arquivo para base64.'));
      };

      fileReader.readAsDataURL(file);
    });
  };

  const validateSelectedFile = (file: BrowserFileLike): string | null => {
    const lowerName = file.name.toLowerCase();
    const hasValidExtension = acceptedFileExtensions.some((extension) => lowerName.endsWith(extension));
    const hasValidMimeType = acceptedFileMimeTypes.includes(file.type);

    if (!hasValidExtension && !hasValidMimeType) {
      return 'Formato inválido. Selecione PDF, JPG ou PNG.';
    }

    if (file.size > maxFileSizeBytes) {
      return 'Arquivo acima de 5MB. Selecione um arquivo menor.';
    }

    return null;
  };

  const openFilePicker = async () => {
    const documentRef = globalThis.document;

    if (!documentRef?.body) {
      setFileError('Seleção de arquivo não suportada neste ambiente.');
      return;
    }

    const inputElement = documentRef.createElement('input');

    inputElement.type = 'file';
    inputElement.accept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
    inputElement.multiple = false;
    inputElement.style.display = 'none';
    inputElement.onchange = (event) => {
      void (async () => {
        const selectedFile = (event.target as HTMLInputElement | null)?.files?.[0];

        documentRef.body.removeChild(inputElement);

        if (!selectedFile) {
          return;
        }

        const validationError = validateSelectedFile(selectedFile);

        if (validationError) {
          setFileError(validationError);
          setSelectedFileName(null);
          setSelectedFileBase64(null);
          return;
        }

        try {
          const base64Content = await readFileAsBase64(selectedFile);
          setSelectedFileName(selectedFile.name);
          setSelectedFileBase64(base64Content);
          setFileError(null);
        } catch (error) {
          setFileError(error instanceof Error ? error.message : 'Erro ao ler arquivo.');
        }
      })();
    };

    documentRef.body.appendChild(inputElement);
    inputElement.click();
  };

  const toBase64 = (value: string): string => {
    if (typeof btoa === 'function') {
      return btoa(
        encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hexCode) =>
          String.fromCharCode(parseInt(hexCode, 16)),
        ),
      );
    }

    const textEncoder = new TextEncoder();
    const bytes = textEncoder.encode(value);
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';

    for (let index = 0; index < bytes.length; index += 3) {
      const firstByte = bytes[index];
      const secondByte = bytes[index + 1];
      const thirdByte = bytes[index + 2];

      const firstChunk = firstByte >> 2;
      const secondChunk = ((firstByte & 3) << 4) | (secondByte !== undefined ? secondByte >> 4 : 0);
      const thirdChunk =
        secondByte !== undefined
          ? ((secondByte & 15) << 2) | (thirdByte !== undefined ? thirdByte >> 6 : 0)
          : 64;
      const fourthChunk = thirdByte !== undefined ? thirdByte & 63 : 64;

      result += base64Chars[firstChunk];
      result += base64Chars[secondChunk];
      result += thirdChunk === 64 ? '=' : base64Chars[thirdChunk];
      result += fourthChunk === 64 ? '=' : base64Chars[fourthChunk];
    }

    return result;
  };

  const buildEntryTitle = (transcript: string): string => {
    const normalizedTranscript = normalizeText(transcript);
    const maxTitleLength = 80;

    if (!normalizedTranscript) {
      return 'Entrada de voz';
    }

    if (normalizedTranscript.length <= maxTitleLength) {
      return normalizedTranscript;
    }

    return `${normalizedTranscript.slice(0, maxTitleLength - 3).trim()}...`;
  };

  const handleSaveAudioEntry = async () => {
    if (isSaving) {
      return;
    }

    const normalizedTranscript = normalizeText(transcriptText);

    if (isRecording) {
      setSaveError('Pare a gravação antes de guardar.');
      return;
    }

    if (!normalizedTranscript) {
      setSaveError('Nenhum texto transcrito para guardar.');
      return;
    }

    const currentUser = await authService.getUser();

    if (!currentUser?.id) {
      setSaveError('Usuário não encontrado. Faça login novamente.');
      return;
    }

    try {
      setSaveError(null);
      setSaveSuccess(null);
      setIsSaving(true);

      await entryService.createEntry({
        user_id: currentUser.id,
        entry_type_id: 3,
        entry_subtype_id: 4,
        title: buildEntryTitle(normalizedTranscript),
        description: normalizedTranscript,
        file_name: `entrada-voz-${Date.now()}.txt`,
        file_base64: toBase64(normalizedTranscript),
      });

      setSaveSuccess('Entrada de voz guardada com sucesso.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Erro ao guardar entrada de voz.');
    } finally {
      setIsSaving(false);
    }
  };

  const openFileModal = (kind: FileEntryKind) => {
    const config: FileEntryConfig =
      kind === 'exam'
        ? {
            kind,
            title: 'Adicionar arquivo de exame',
            entryTypeId: 2,
            entrySubtypeId: 1,
          }
        : {
            kind,
            title: 'Adicionar arquivo de receita',
            entryTypeId: 2,
            entrySubtypeId: 2,
          };

    setFileEntryConfig(config);
    setFileTitleInput('');
    setSelectedFileName(null);
    setSelectedFileBase64(null);
    setFileError(null);
    setFileSuccess(null);
    setIsFileModalVisible(true);
  };

  const closeFileModal = () => {
    if (isFileSaving) {
      return;
    }

    setIsFileModalVisible(false);
  };

  const handleSaveFileEntry = async () => {
    if (isFileSaving) {
      return;
    }

    const normalizedTitle = normalizeText(fileTitleInput);

    if (!fileEntryConfig) {
      setFileError('Configuração do tipo de arquivo inválida.');
      return;
    }

    if (!normalizedTitle) {
      setFileError('Informe um título para esta entrada.');
      return;
    }

    if (!selectedFileName || !selectedFileBase64) {
      setFileError('Selecione um arquivo PDF, JPG ou PNG até 5MB.');
      return;
    }

    const currentUser = await authService.getUser();

    if (!currentUser?.id) {
      setFileError('Usuário não encontrado. Faça login novamente.');
      return;
    }

    try {
      setIsFileSaving(true);
      setFileError(null);
      setFileSuccess(null);

      await entryService.createEntry({
        user_id: currentUser.id,
        entry_type_id: fileEntryConfig.entryTypeId,
        entry_subtype_id: fileEntryConfig.entrySubtypeId,
        title: normalizedTitle,
        description: normalizedTitle,
        file_name: selectedFileName,
        file_base64: selectedFileBase64,
      });

      setFileSuccess('Arquivo guardado com sucesso.');
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Erro ao guardar arquivo.');
    } finally {
      setIsFileSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={['#f8fbff', '#eef4ff', '#f7f0ff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBackground}
      >
      <View style={styles.container}>
        <View style={styles.messageBox}>
          <Text style={styles.messageTitle}>Como adicionar suas informações</Text>

          <Text style={styles.messageText}>
            Você pode registrar seu acompanhamento de saúde de forma simples:
          </Text>

          <Text style={styles.messageListItem}>
            • <Text style={styles.messageStrong}>Áudio transcrito:</Text> descreva seu estado físico e
            mental, sintomas e dores.
          </Text>

          <Text style={styles.messageListItem}>
            • <Text style={styles.messageStrong}>Exames:</Text> envie arquivos em PDF ou imagens dos seus
            exames.
          </Text>

          <Text style={styles.messageListItem}>
            • <Text style={styles.messageStrong}>Receitas:</Text> adicione fotos ou documentos das suas
            receitas médicas; com essas informações, vamos gerar alertas para seu acompanhamento.
          </Text>
        </View>

        <View style={styles.buttonList}>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.85}
            onPress={() => setIsAudioModalVisible(true)}
          >
            <Text style={styles.actionButtonText}>Adicionar Audio transcrito</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.85}
            onPress={() => openFileModal('exam')}
          >
            <Text style={styles.actionButtonText}>Adicionar arquivo de exame</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.85}
            onPress={() => openFileModal('recipe')}
          >
            <Text style={styles.actionButtonText}>Adicionar arquivo de receita</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={isAudioModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAudioModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adicionar áudio transcrito</Text>
            <Text style={styles.modalDescription}>
              Grave um áudio falando sobre sua saúde física e mental. Você pode descrever dores,
              cor da urina, fezes, doenças que já teve, hábitos do dia a dia e também como está
              emocionalmente (feliz, triste, ansioso ou com raiva). Em breve, o conteúdo será
              transcrito automaticamente.
            </Text>

            <View style={styles.microphoneContainer}>
              <TouchableOpacity
                style={[styles.microphoneCircle, isRecording && styles.microphoneCircleRecording]}
                onPress={() => void toggleRecording()}
                activeOpacity={0.9}
              >
                <Text style={styles.microphoneIcon}>{isRecording ? '⏹️' : '🎤'}</Text>
              </TouchableOpacity>

              <Text style={styles.microphoneHint}>
                {isRecording ? `Gravando... ${remainingRecordingTimeLabel}` : 'Toque para iniciar a gravação'}
              </Text>

              {!isRecording && microphonePermissionStatus !== 'granted' && (
                <Text style={styles.permissionHint}>
                  {microphonePermissionStatus === 'denied'
                    ? 'Microfone bloqueado. Libere nas configurações do navegador/sistema.'
                    : 'Para começar, toque no microfone para solicitar permissão.'}
                </Text>
              )}

              {isListening && <Text style={styles.listeningBadge}>Transcrevendo em tempo real...</Text>}

              {!!speechError && <Text style={styles.speechErrorText}>{speechError}</Text>}

              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptLabel}>Transcrição</Text>
                <Text style={styles.transcriptText}>
                  {transcriptText || 'A transcrição aparecerá aqui após iniciar a gravação.'}
                </Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={closeAudioModal}
                activeOpacity={0.85}
                disabled={isSaving}
              >
                <Text style={styles.modalSecondaryButtonText}>Fechar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalPrimaryButton, isSaving && styles.modalPrimaryButtonDisabled]}
                activeOpacity={0.85}
                onPress={() => void handleSaveAudioEntry()}
                disabled={isSaving}
              >
                <Text style={styles.modalPrimaryButtonText}>{isSaving ? 'Guardando...' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>

            {!!saveError && <Text style={styles.saveErrorText}>{saveError}</Text>}
            {!!saveSuccess && <Text style={styles.saveSuccessText}>{saveSuccess}</Text>}
          </View>
        </View>
      </Modal>

      <Modal
        visible={isFileModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeFileModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{fileEntryConfig?.title ?? 'Adicionar arquivo'}</Text>
            <Text style={styles.modalDescription}>
              Selecione 1 arquivo do tipo PDF, JPG ou PNG com no máximo 5MB e informe um título.
            </Text>

            <View style={styles.fileFormContainer}>
              <Text style={styles.fileInputLabel}>Título</Text>
              <TextInput
                style={styles.fileTitleInput}
                value={fileTitleInput}
                onChangeText={setFileTitleInput}
                placeholder="Ex: Hemograma - Maio"
                placeholderTextColor="#94a3b8"
                editable={!isFileSaving}
              />

              <TouchableOpacity
                style={styles.filePickerButton}
                onPress={() => void openFilePicker()}
                activeOpacity={0.85}
                disabled={isFileSaving}
              >
                <Text style={styles.filePickerButtonText}>
                  {selectedFileName ? 'Trocar arquivo' : 'Selecionar arquivo'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.filePickedName}>
                {selectedFileName ? `Arquivo: ${selectedFileName}` : 'Nenhum arquivo selecionado'}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={closeFileModal}
                activeOpacity={0.85}
                disabled={isFileSaving}
              >
                <Text style={styles.modalSecondaryButtonText}>Fechar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalPrimaryButton, isFileSaving && styles.modalPrimaryButtonDisabled]}
                onPress={() => void handleSaveFileEntry()}
                activeOpacity={0.85}
                disabled={isFileSaving}
              >
                <Text style={styles.modalPrimaryButtonText}>{isFileSaving ? 'Guardando...' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>

            {!!fileError && <Text style={styles.saveErrorText}>{fileError}</Text>}
            {!!fileSuccess && <Text style={styles.saveSuccessText}>{fileSuccess}</Text>}
          </View>
        </View>
      </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fbff',
  },
  gradientBackground: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 20,
  },
  messageBox: {
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  messageTitle: {
    color: '#1e1b4b',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
  },
  messageText: {
    color: '#312e81',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  messageListItem: {
    color: '#312e81',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
  },
  messageStrong: {
    fontWeight: '800',
    color: '#1e1b4b',
  },
  buttonList: {
    gap: 14,
  },
  actionButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  actionButtonText: {
    color: '#1d4ed8',
    fontSize: 17,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  modalDescription: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#4b5563',
  },
  fileFormContainer: {
    marginTop: 18,
    gap: 10,
  },
  fileInputLabel: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  fileTitleInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  filePickerButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#eff6ff',
  },
  filePickerButtonText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 14,
  },
  filePickedName: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  microphoneContainer: {
    marginTop: 20,
    alignItems: 'center',
    gap: 10,
  },
  microphoneCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#dbeafe',
    borderWidth: 2,
    borderColor: '#60a5fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  microphoneCircleRecording: {
    backgroundColor: '#fee2e2',
    borderColor: '#f87171',
  },
  microphoneIcon: {
    fontSize: 44,
  },
  microphoneHint: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
    textAlign: 'center',
  },
  permissionHint: {
    fontSize: 13,
    color: '#1d4ed8',
    textAlign: 'center',
    fontWeight: '600',
  },
  listeningBadge: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
  },
  speechErrorText: {
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
  },
  transcriptBox: {
    marginTop: 4,
    width: '100%',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 96,
  },
  transcriptLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  transcriptText: {
    color: '#0f172a',
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: {
    marginTop: 24,
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
    fontWeight: '600',
    fontSize: 14,
  },
  modalPrimaryButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  modalPrimaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  saveErrorText: {
    marginTop: 10,
    color: '#dc2626',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  saveSuccessText: {
    marginTop: 10,
    color: '#059669',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
});
