import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Menu,
  Mic,
  ArrowUp,
  Plus,
  Square,
  Play,
  MessageSquarePlus,
  X,
  Trash2,
  ListTodo,
  RefreshCw,
  Sparkles,
  Volume2,
  Loader2,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ui/ActionMenu';
import { ModeBottomSheet } from '../components/ui/ModeBottomSheet';
import { OnboardingFlow } from '../components/onboarding/OnboardingFlow';
import { getMimaStyle, normalizeStyleId, type MimaStyleId } from '../config/mimaStyles';
import { useAuth } from '../contexts/AuthContext';
import { useAudioPlayback, type TtsStatus } from '../hooks/useAudioPlayback';
import { useToast } from '../hooks/useToast';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { supabase } from '../lib/supabase';
import { generateChatResponse } from '../services/geminiService';
import { isOptimizationEnabled, invalidateCacheForVoice } from '../utils/ttsCache';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: number | string;
  role: ChatRole;
  text: string;
  time: string;
  audio?: string | null;
  isWelcome?: boolean;
}

const WELCOME_MESSAGE_ID = 'welcome-message';
const ACTIVE_STYLE_STORAGE_KEY = 'mima_active_style';
const CHAT_RESET_AT_STORAGE_KEY = 'mima_chat_reset_at';
const ARCHIVED_CONVERSATIONS_STORAGE_KEY = 'mima_archived_conversations';
const MAX_ARCHIVED_CONVERSATIONS = 8;

interface ArchivedConversation {
  id: string;
  createdAt: string;
  title: string;
  messages: ChatMessage[];
}

interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  size: number;
}

interface UserTask {
  id?: string;
  title: string;
  due_at?: string | null;
  status: 'open' | 'completed';
}

const SUPPORTED_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.csv',
  '.json',
  '.md',
  '.markdown',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.rtf',
  '.html',
  '.xml',
];
const SUPPORTED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'text/markdown',
  'text/html',
  'application/xml',
  'text/xml',
  'application/rtf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

function isSupportedAttachmentFile(file: File): boolean {
  if (file.type.startsWith('image/')) {
    return true;
  }

  if (SUPPORTED_ATTACHMENT_MIME_TYPES.includes(file.type)) {
    return true;
  }

  const fileName = file.name.toLowerCase();
  return SUPPORTED_ATTACHMENT_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

const CURRENT_CHAT_SNAPSHOT_STORAGE_KEY = 'mima_current_chat_snapshot';

export default function Chat() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    play,
    playCached,
    preload,
    stop,
    isPlaying: isAudioPlaying,
    ttsStatus,
    checkCacheStatus,
  } = useAudioPlayback();
  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecording();

  const createWelcomeMessage = (): ChatMessage => ({
    id: WELCOME_MESSAGE_ID,
    role: 'assistant',
    text: t('chat.welcome_message'),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    audio: null,
    isWelcome: true,
  });

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [ttsCacheStatuses, setTtsCacheStatuses] = useState<Record<string, TtsStatus>>({});
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage()]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<MimaStyleId>(() => {
    try {
      return normalizeStyleId(localStorage.getItem(ACTIVE_STYLE_STORAGE_KEY));
    } catch {
      return 'neutral';
    }
  });
  const [voiceId, setVoiceId] = useState('DODLEQrClDo8wCz460ld');
  const [isLoading, setIsLoading] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isModeSheetOpen, setIsModeSheetOpen] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<ChatAttachment[]>([]);
  const [openTasks, setOpenTasks] = useState<UserTask[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [archivedConversations, setArchivedConversations] = useState<ArchivedConversation[]>(() => {
    try {
      const raw = localStorage.getItem(ARCHIVED_CONVERSATIONS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem('mima_onboarding_done') !== 'true';
    } catch {
      return false;
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const persistedMessageIdsRef = useRef<Set<string>>(new Set());
  const isPersistingRef = useRef(false);
  const activeMode = getMimaStyle(mode);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.isWelcome) {
        return [createWelcomeMessage()];
      }
      return prev;
    });
  }, [i18n.language]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STYLE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage failures.
    }
  }, [mode]);

  const prevVoiceIdRef = useRef(voiceId);
  useEffect(() => {
    if (prevVoiceIdRef.current !== voiceId && isOptimizationEnabled()) {
      invalidateCacheForVoice(voiceId);
      setTtsCacheStatuses({});
    }
    prevVoiceIdRef.current = voiceId;
  }, [voiceId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        ARCHIVED_CONVERSATIONS_STORAGE_KEY,
        JSON.stringify(archivedConversations)
      );
    } catch {
      // Ignore storage failures.
    }
  }, [archivedConversations]);

  useEffect(() => {
    messagesRef.current = messages;
    const snapshot = messages.filter((message) => !message.isWelcome);

    try {
      if (snapshot.length > 0) {
        localStorage.setItem(CURRENT_CHAT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
      } else {
        localStorage.removeItem(CURRENT_CHAT_SNAPSHOT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [messages]);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const headers = {
          Authorization: `Bearer ${session.access_token}`,
        };

        const localSnapshot = (() => {
          try {
            const raw = localStorage.getItem(CURRENT_CHAT_SNAPSHOT_STORAGE_KEY);
            return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
          } catch {
            return [];
          }
        })();

        const historyResponse = await fetch('/api/chat/history', { headers });
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          const resetAt = localStorage.getItem(CHAT_RESET_AT_STORAGE_KEY);
          const visibleHistory = resetAt
            ? history.filter(
                (msg: any) => new Date(msg.created_at).getTime() > new Date(resetAt).getTime()
              )
            : history;

          const serverMessages = visibleHistory.map((msg: any) => ({
            id: msg.id,
            role: msg.role === 'user' ? 'user' : 'assistant',
            text: msg.content,
            time: new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            audio: msg.audio_data,
          }));

          const mergedMessages =
            localSnapshot.length > serverMessages.length ? localSnapshot : serverMessages;

          if (mergedMessages.length > 0) {
            persistedMessageIdsRef.current = new Set(
              serverMessages.map((message) => message.id.toString())
            );
            setMessages(
              mergedMessages.map((msg: any) => ({
                id: msg.id,
                role: msg.role,
                text: msg.text,
                time: msg.time,
                audio: msg.audio ?? null,
              }))
            );
          } else {
            persistedMessageIdsRef.current = new Set();
            setMessages([createWelcomeMessage()]);
          }
        }

        const prefsResponse = await fetch('/api/user/preferences', { headers });
        if (prefsResponse.ok) {
          const prefs = await prefsResponse.json();
          if (prefs.voice_id) setVoiceId(prefs.voice_id);
          if (prefs.language && (prefs.onboarding_done || !showOnboarding)) {
            localStorage.setItem('mima_language', prefs.language);
            i18n.changeLanguage(prefs.language);
          }
          if (prefs.onboarding_done) {
            setShowOnboarding(false);
            localStorage.setItem('mima_onboarding_done', 'true');
          }
        }
      } catch (error) {
        console.error('Failed to load data from Supabase:', error);
      }
    };

    loadData();
  }, [user, i18n, showOnboarding]);

  const fetchOpenTasks = useCallback(async () => {
    if (!user) {
      setOpenTasks([]);
      return;
    }

    try {
      setIsTasksLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setOpenTasks([]);
        return;
      }

      const response = await fetch('/api/user/tasks?status=open&limit=6', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const tasks = await response.json();
      setOpenTasks(Array.isArray(tasks) ? tasks : []);
    } catch (error) {
      console.error('Failed to fetch open tasks:', error);
    } finally {
      setIsTasksLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchOpenTasks();
  }, [fetchOpenTasks]);

  useEffect(() => {
    if (!user) return;

    const saveHistory = async (messagesToPersist: ChatMessage[]) => {
      if (isPersistingRef.current) return;

      try {
        isPersistingRef.current = true;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const pendingMessages = messagesToPersist.filter(
          (message) =>
            !message.isWelcome && !persistedMessageIdsRef.current.has(message.id.toString())
        );
        if (pendingMessages.length === 0) {
          return;
        }

        for (const pendingMessage of pendingMessages) {
          const response = await fetch('/api/chat/message', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: user.id,
              role: pendingMessage.role,
              content: pendingMessage.text,
              mode,
              audio_data: pendingMessage.audio ?? null,
            }),
          });

          if (!response.ok) {
            throw new Error(await response.text());
          }

          persistedMessageIdsRef.current.add(pendingMessage.id.toString());
        }
      } catch (error) {
        console.error('Failed to save chat history:', error);
      } finally {
        isPersistingRef.current = false;
      }
    };

    const timeoutId = setTimeout(() => saveHistory(messages), 400);
    return () => clearTimeout(timeoutId);
  }, [messages, mode, user]);

  useEffect(() => {
    if (!user) return;

    const flushPendingMessages = () => {
      void (async () => {
        if (isPersistingRef.current) {
          return;
        }

        const pendingMessages = messagesRef.current.filter(
          (message) =>
            !message.isWelcome && !persistedMessageIdsRef.current.has(message.id.toString())
        );

        if (pendingMessages.length === 0) {
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        for (const pendingMessage of pendingMessages) {
          const response = await fetch('/api/chat/message', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_id: user.id,
              role: pendingMessage.role,
              content: pendingMessage.text,
              mode,
              audio_data: pendingMessage.audio ?? null,
            }),
            keepalive: true,
          });

          if (response.ok) {
            persistedMessageIdsRef.current.add(pendingMessage.id.toString());
          }
        }
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingMessages();
      }
    };

    window.addEventListener('beforeunload', flushPendingMessages);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      flushPendingMessages();
      window.removeEventListener('beforeunload', flushPendingMessages);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [mode, user]);

  const sendMessage = useCallback(
    async ({
      text,
      displayText,
      attachments: attachmentsOverride,
    }: {
      text: string;
      displayText?: string;
      attachments?: ChatAttachment[];
    }) => {
      if (isLoading) return;

      const trimmedText = text.trim();
      const pendingAttachments = attachmentsOverride ?? selectedAttachments;

      if (!trimmedText && pendingAttachments.length === 0) {
        return;
      }

      const messageForAI = trimmedText || t('chat.attachment_analysis_default');
      const userDisplayText =
        displayText ||
        trimmedText ||
        `${t('chat.attachment_analysis_default')}\n\n${pendingAttachments.map((attachment) => `- ${attachment.name}`).join('\n')}`;

      setInput('');
      setSelectedAttachments([]);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'user',
          text: userDisplayText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          audio: null,
        },
      ]);

      setIsLoading(true);

      try {
        const history = messages
          .filter((message) => !message.isWelcome)
          .map((message) => ({
            role: message.role === 'user' ? 'user' : 'model',
            content: message.text,
          }));

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const responseText = await generateChatResponse(
          messageForAI,
          mode,
          i18n.language,
          history,
          session?.access_token,
          pendingAttachments
        );

        if (responseText.includes('Unauthorized') || responseText.includes('auth')) {
          await supabase.auth.refreshSession();
        }

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            text: responseText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            audio: null,
          },
        ]);
      } catch (error) {
        console.error('Chat Error:', error);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            text: t('chat.error_message'),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            audio: null,
          },
        ]);
      } finally {
        setIsLoading(false);
        void fetchOpenTasks();
      }
    },
    [fetchOpenTasks, i18n.language, isLoading, messages, mode, selectedAttachments, t]
  );

  const handleSend = async () => {
    await sendMessage({
      text: input,
      attachments: selectedAttachments,
    });
  };

  const handleDailyBriefing = async () => {
    await sendMessage({
      text: t('chat.daily_briefing_prompt'),
      displayText: t('chat.daily_briefing_label'),
      attachments: [],
    });
  };

  const handleMicClick = async () => {
    if (isRecording) {
      const text = await stopRecording();
      if (text) setInput(text);
      return;
    }

    await startRecording();
  };

  const handleNewConversation = async () => {
    const messagesToArchive = messages.filter((message) => !message.isWelcome);
    if (messagesToArchive.length > 0) {
      const firstUserMessage = messagesToArchive.find((message) => message.role === 'user');
      const titleSource =
        firstUserMessage?.text || messagesToArchive[0]?.text || t('chat.sender_mima');
      const title = titleSource.length > 42 ? `${titleSource.slice(0, 42).trim()}...` : titleSource;

      setArchivedConversations((prev) =>
        [
          {
            id: `${Date.now()}`,
            createdAt: new Date().toISOString(),
            title,
            messages: messagesToArchive,
          },
          ...prev,
        ].slice(0, MAX_ARCHIVED_CONVERSATIONS)
      );
    }

    stop();
    setPlayingId(null);
    setInput('');
    setIsLoading(false);
    setMessages([createWelcomeMessage()]);
    setIsHistoryOpen(false);
    persistedMessageIdsRef.current = new Set();
    localStorage.setItem(CHAT_RESET_AT_STORAGE_KEY, new Date().toISOString());
    localStorage.removeItem(CURRENT_CHAT_SNAPSHOT_STORAGE_KEY);
    setSelectedAttachments([]);

    if (!user) {
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return;
      }

      const response = await fetch('/api/chat/history', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        console.error('Failed to clear chat history:', await response.text());
        showToast(t('chat.history_clear_error'), 'error');
        return;
      }

      showToast(t('chat.new_conversation_started'), 'success');
    } catch (error) {
      console.error('Failed to start new conversation:', error);
      showToast(t('chat.history_clear_error'), 'error');
    }
  };

  const handleRestoreConversation = (conversation: ArchivedConversation) => {
    stop();
    setPlayingId(null);
    setInput('');
    setIsLoading(false);
    persistedMessageIdsRef.current = new Set(
      conversation.messages.map((message) => message.id.toString())
    );
    setMessages(conversation.messages);
    setIsHistoryOpen(false);
    showToast(t('chat.history_restored'), 'success');
  };

  const handleDeleteArchivedConversation = (conversationId: string) => {
    setArchivedConversations((prev) =>
      prev.filter((conversation) => conversation.id !== conversationId)
    );
    showToast(t('chat.conversation_deleted'), 'success');
  };

  const handleAttachFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleAttachmentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const supportedFiles = files.filter((file) => {
      return isSupportedAttachmentFile(file);
    });

    if (supportedFiles.length !== files.length) {
      showToast(t('chat.attachment_unsupported'), 'error');
    }

    const nextAttachments = await Promise.all(
      supportedFiles.slice(0, 5).map(
        (file) =>
          new Promise<ChatAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = typeof reader.result === 'string' ? reader.result : '';
              const base64Data = result.includes(',') ? result.split(',')[1] : result;
              resolve({
                id: `${file.name}-${file.size}-${Date.now()}`,
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                data: base64Data,
                size: file.size,
              });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    );

    setSelectedAttachments((prev) => [...prev, ...nextAttachments].slice(0, 5));
    if (nextAttachments.length > 0) {
      showToast(t('chat.attachments_added', { count: nextAttachments.length }), 'success');
    }
    event.target.value = '';
  };

  const removeAttachment = (attachmentId: string) => {
    setSelectedAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const handlePlayAudio = async (msgId: number | string, text: string) => {
    const nextId = msgId.toString();

    if (playingId === nextId) {
      stop();
      setPlayingId(null);
      return;
    }

    try {
      setPlayingId(nextId);
      if (isOptimizationEnabled()) {
        await playCached(text, voiceId);
      } else {
        await play('/api/tts', { text, voiceId });
      }
    } catch (error) {
      console.error('Audio playback error:', error);
      setPlayingId(null);
      showToast(t('chat.tts_unavailable'), 'error');
    }
  };

  useEffect(() => {
    if (!isAudioPlaying) setPlayingId(null);
  }, [isAudioPlaying]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- preload/checkCacheStatus are stable; ttsCacheStatuses excluded to avoid infinite loop
  useEffect(() => {
    if (!isOptimizationEnabled()) return;

    const assistantMessages = messages.filter(
      (msg) => msg.role === 'assistant' && !msg.isWelcome && msg.text.trim()
    );
    if (assistantMessages.length === 0) return;

    const schedulePreload = () => {
      for (const msg of assistantMessages) {
        const key = msg.id.toString();
        if (ttsCacheStatuses[key] === 'ready' || ttsCacheStatuses[key] === 'loading') continue;
        preload(msg.text, voiceId).then(() => {
          checkCacheStatus(msg.text, voiceId).then((status) => {
            setTtsCacheStatuses((prev) => {
              if (prev[key] === status) return prev;
              return { ...prev, [key]: status };
            });
          });
        });
      }
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(schedulePreload, { timeout: 3000 });
    } else {
      setTimeout(schedulePreload, 100);
    }
  }, [messages, voiceId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full relative">
      {showOnboarding && (
        <OnboardingFlow
          onComplete={async (selectedVoiceId) => {
            try {
              setShowOnboarding(false);
              if (selectedVoiceId) {
                setVoiceId(selectedVoiceId);
                localStorage.setItem('mima_voice_id', selectedVoiceId);
              }
              localStorage.setItem('mima_language', i18n.language);
              localStorage.setItem('mima_onboarding_done', 'true');

              if (user) {
                const {
                  data: { session },
                } = await supabase.auth.getSession();
                const response = await fetch('/api/user/preferences', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    onboarding_done: true,
                    voice_id: selectedVoiceId || voiceId,
                    language: i18n.language,
                  }),
                });

                if (!response.ok) {
                  console.error('Failed to sync preferences to server:', await response.text());
                }
              }
            } catch (error) {
              console.error('Error in onboarding completion:', error);
              setShowOnboarding(false);
              localStorage.setItem('mima_onboarding_done', 'true');
            }
          }}
        />
      )}

      <header className="flex items-center justify-between p-4 pt-6 shrink-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-highlight transition-colors text-slate-100"
            aria-label={t('chat.history_title')}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#6221dd] flex items-center justify-center overflow-hidden">
              <img
                src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg"
                alt={t('chat.sender_mima')}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl font-bold tracking-tight">{t('chat.sender_mima')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewConversation}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-highlight transition-colors text-text-secondary"
            aria-label={t('action_menu.new_conversation')}
          >
            <MessageSquarePlus className="w-6 h-6" />
          </button>
        </div>
      </header>

      {isHistoryOpen && (
        <>
          <button
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[80]"
            onClick={() => setIsHistoryOpen(false)}
            aria-label={t('common.close')}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-[85%] max-w-sm bg-background-dark border-r border-white/10 z-[90] p-5 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">{t('chat.history_title')}</h2>
                <p className="text-sm text-slate-400">{t('chat.history_subtitle')}</p>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-300"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleNewConversation}
              className="w-full py-3 px-4 rounded-2xl bg-primary text-white font-semibold flex items-center justify-center gap-2 mb-4"
            >
              <MessageSquarePlus className="w-4 h-4" />
              {t('action_menu.new_conversation')}
            </button>

            <button
              onClick={() => {
                void handleDailyBriefing();
                setIsHistoryOpen(false);
              }}
              className="w-full py-3 px-4 rounded-2xl bg-white/5 border border-white/10 text-white font-semibold flex items-center justify-center gap-2 mb-4"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              {t('chat.daily_briefing_label')}
            </button>

            <div className="rounded-2xl border border-white/5 bg-surface-dark p-4 mb-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ListTodo className="w-4 h-4 text-primary" />
                    {t('chat.tasks_title')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{t('chat.tasks_subtitle')}</p>
                </div>
                <button
                  onClick={() => void fetchOpenTasks()}
                  className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-300"
                  aria-label={t('chat.refresh_tasks')}
                  title={t('chat.refresh_tasks')}
                >
                  <RefreshCw className={`w-4 h-4 ${isTasksLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {isTasksLoading ? (
                <div className="text-sm text-slate-400">{t('chat.tasks_loading')}</div>
              ) : openTasks.length === 0 ? (
                <div className="text-sm text-slate-400">{t('chat.tasks_empty')}</div>
              ) : (
                <div className="space-y-2">
                  {openTasks.map((task) => (
                    <div
                      key={task.id || task.title}
                      className="rounded-xl bg-background-dark/60 border border-white/5 px-3 py-2"
                    >
                      <div className="text-sm text-white">{task.title}</div>
                      {task.due_at && (
                        <div className="text-xs text-slate-400 mt-1">
                          {new Date(task.due_at).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {archivedConversations.length === 0 ? (
                <div className="rounded-2xl border border-white/5 bg-surface-dark p-4 text-sm text-slate-400">
                  {t('chat.history_empty')}
                </div>
              ) : (
                archivedConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="rounded-2xl border border-white/5 bg-surface-dark p-4"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleRestoreConversation(conversation)}
                        className="flex-1 text-left hover:bg-surface-highlight/60 rounded-xl transition-colors -m-1 p-1"
                      >
                        <div className="text-sm font-semibold text-white mb-1">
                          {conversation.title}
                        </div>
                        <div className="text-xs text-slate-400">
                          {new Date(conversation.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteArchivedConversation(conversation.id)}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                        aria-label={t('chat.delete_conversation')}
                        title={t('chat.delete_conversation')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-2 space-y-6 scroll-smooth">
        <ActionMenu
          isOpen={isActionMenuOpen}
          onClose={() => setIsActionMenuOpen(false)}
          currentModeLabel={t(activeMode.labelKey)}
          onSelectMode={() => {
            setIsActionMenuOpen(false);
            setIsModeSheetOpen(true);
          }}
          onNewConversation={handleNewConversation}
          onAttachFile={handleAttachFileClick}
        />

        <ModeBottomSheet
          isOpen={isModeSheetOpen}
          onClose={() => setIsModeSheetOpen(false)}
          currentMode={mode}
          onSelectMode={(newMode) => setMode(newMode)}
        />

        <div className="flex justify-center my-4">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-xs font-medium text-text-secondary bg-surface-highlight px-3 py-1 rounded-full">
              {t('chat.today')}
            </span>
            <button
              onClick={() => void handleDailyBriefing()}
              disabled={isLoading}
              className="text-xs font-medium text-white bg-white/5 border border-white/10 px-3 py-1 rounded-full hover:bg-white/10 disabled:opacity-50"
            >
              {t('chat.daily_briefing_label')}
            </button>
          </div>
        </div>

        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 max-w-[85%] ${isUser ? 'justify-end ml-auto' : ''}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-full bg-[#6221dd] shrink-0 flex items-center justify-center shadow-lg shadow-purple-900/20 overflow-hidden">
                  <img
                    src="/assets/logo.jpg?v=4"
                    alt={t('chat.sender_mima')}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : ''}`}>
                {!isUser && (
                  <span className="text-xs text-text-secondary ml-1">{t('chat.sender_mima')}</span>
                )}

                <div
                  className={`p-4 rounded-2xl shadow-sm leading-relaxed text-[15px] ${
                    isUser
                      ? 'bg-primary text-white rounded-tr-sm shadow-primary/20'
                      : 'bg-surface-highlight text-slate-100 rounded-tl-sm'
                  }`}
                >
                  <div className="markdown-body">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                </div>

                <div className={`flex items-center gap-2 ${isUser ? 'mr-1' : 'ml-1'}`}>
                  <span className="text-xs text-text-secondary">{msg.time}</span>
                  {!isUser &&
                    (() => {
                      const msgKey = msg.id.toString();
                      const isCurrentlyPlaying = playingId === msgKey;
                      const cacheStatus = ttsCacheStatuses[msgKey] ?? 'idle';
                      const isGenerating = isCurrentlyPlaying && ttsStatus === 'loading';
                      const isReady = !isCurrentlyPlaying && cacheStatus === 'ready';

                      let buttonIcon: React.ReactNode;
                      let buttonTitle: string;
                      let buttonClass: string;

                      if (isCurrentlyPlaying && ttsStatus === 'playing') {
                        buttonIcon = <Square className="w-4 h-4 fill-current" />;
                        buttonTitle = t('chat.stop_audio');
                        buttonClass = 'text-primary bg-primary/10 hover:bg-primary/20';
                      } else if (isGenerating) {
                        buttonIcon = <Loader2 className="w-4 h-4 animate-spin" />;
                        buttonTitle = t('chat.tts_generating');
                        buttonClass = 'text-primary bg-primary/10';
                      } else if (isReady) {
                        buttonIcon = <Volume2 className="w-4 h-4 text-green-400" />;
                        buttonTitle = t('chat.tts_cached');
                        buttonClass = 'text-green-400 bg-green-400/10 hover:bg-green-400/20';
                      } else {
                        buttonIcon = <Play className="w-4 h-4 fill-current ml-0.5" />;
                        buttonTitle = t('chat.play_audio');
                        buttonClass =
                          'text-text-secondary hover:bg-surface-highlight hover:text-white';
                      }

                      return (
                        <button
                          onClick={() => handlePlayAudio(msg.id, msg.text)}
                          disabled={isGenerating}
                          className={`p-1.5 rounded-full transition-all ${buttonClass}`}
                          title={buttonTitle}
                        >
                          {buttonIcon}
                        </button>
                      );
                    })()}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start gap-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-full bg-[#6221dd] shrink-0 flex items-center justify-center shadow-lg shadow-purple-900/20 overflow-hidden">
              <img
                src="/assets/logo.jpg?v=4"
                alt={t('chat.sender_mima')}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary ml-1">{t('chat.sender_mima')}</span>
              <div className="bg-surface-highlight text-slate-100 p-4 rounded-2xl rounded-tl-sm shadow-sm leading-relaxed text-[15px] flex items-center gap-1">
                <div className="w-2 h-2 bg-text-secondary rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-text-secondary rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                ></div>
                <div
                  className="w-2 h-2 bg-text-secondary rounded-full animate-bounce"
                  style={{ animationDelay: '0.4s' }}
                ></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 bg-background-dark pb-8 shrink-0 relative">
        <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2 w-full h-32 bg-primary/10 blur-[60px] rounded-full pointer-events-none"></div>
        <div className="relative flex items-end gap-3 max-w-3xl mx-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.csv,.json,.md,.markdown,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.html,.xml"
            multiple
            className="hidden"
            onChange={handleAttachmentChange}
          />
          <button
            onClick={() => setIsActionMenuOpen(true)}
            className="flex-shrink-0 w-10 h-10 mb-1 flex items-center justify-center rounded-full bg-surface-highlight text-text-secondary hover:text-primary transition-colors active:scale-95"
            aria-label={t('chat.action_menu')}
          >
            <Plus className="w-5 h-5" />
          </button>

          <div className="flex-1 bg-surface-dark rounded-[24px] border border-surface-highlight focus-within:border-primary transition-colors flex flex-col shadow-sm">
            {selectedAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {selectedAttachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    onClick={() => removeAttachment(attachment.id)}
                    className="max-w-full px-3 py-1.5 rounded-full bg-white/8 text-xs text-slate-200 hover:bg-white/12 truncate"
                    title={t('chat.remove_attachment')}
                  >
                    {attachment.name}
                  </button>
                ))}
              </div>
            )}
            <input
              className="w-full bg-transparent border-none focus:ring-0 text-white placeholder:text-text-secondary h-12 px-4 py-3 rounded-[24px] outline-none"
              placeholder={t('chat.input_placeholder')}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSend()}
              disabled={isLoading}
            />
            <button
              onClick={handleMicClick}
              disabled={isLoading || isTranscribing}
              className={`mr-2 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                isRecording
                  ? 'text-red-500 bg-red-500/10 animate-pulse'
                  : isTranscribing
                    ? 'text-primary animate-spin'
                    : 'text-text-secondary hover:text-primary'
              }`}
            >
              {isTranscribing ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && selectedAttachments.length === 0)}
            className="flex-shrink-0 w-12 h-12 mb-0 flex items-center justify-center rounded-full bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/30 transition-all active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowUp className="w-6 h-6 group-hover:hidden" />
            <div className="hidden group-hover:block w-4 h-4 bg-white rounded-sm animate-pulse"></div>
          </button>
        </div>
      </footer>
    </div>
  );
}
