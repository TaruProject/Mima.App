import { useEffect, useRef, useState } from "react";
import { Menu, Mic, ArrowUp, Plus, Square, Play, MessageSquarePlus, X } from "lucide-react";
import Markdown from "react-markdown";
import { useTranslation } from "react-i18next";
import { ActionMenu } from "../components/ui/ActionMenu";
import { ModeBottomSheet } from "../components/ui/ModeBottomSheet";
import { OnboardingFlow } from "../components/onboarding/OnboardingFlow";
import { getMimaStyle, normalizeStyleId, type MimaStyleId } from "../config/mimaStyles";
import { useAuth } from "../contexts/AuthContext";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import { useToast } from "../hooks/useToast";
import { useVoiceRecording } from "../hooks/useVoiceRecording";
import { supabase } from "../lib/supabase";
import { generateChatResponse } from "../services/geminiService";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: number | string;
  role: ChatRole;
  text: string;
  time: string;
  audio?: string | null;
  isWelcome?: boolean;
}

const WELCOME_MESSAGE_ID = "welcome-message";
const ACTIVE_STYLE_STORAGE_KEY = "mima_active_style";
const CHAT_RESET_AT_STORAGE_KEY = "mima_chat_reset_at";
const ARCHIVED_CONVERSATIONS_STORAGE_KEY = "mima_archived_conversations";
const MAX_ARCHIVED_CONVERSATIONS = 8;

interface ArchivedConversation {
  id: string;
  createdAt: string;
  title: string;
  messages: ChatMessage[];
}

export default function Chat() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { play, stop, isPlaying: isAudioPlaying } = useAudioPlayback();
  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecording();

  const createWelcomeMessage = (): ChatMessage => ({
    id: WELCOME_MESSAGE_ID,
    role: "assistant",
    text: t("chat.welcome_message"),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    audio: null,
    isWelcome: true,
  });

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage()]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<MimaStyleId>(() => {
    try {
      return normalizeStyleId(localStorage.getItem(ACTIVE_STYLE_STORAGE_KEY));
    } catch {
      return "neutral";
    }
  });
  const [voiceId, setVoiceId] = useState("DODLEQrClDo8wCz460ld");
  const [isLoading, setIsLoading] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isModeSheetOpen, setIsModeSheetOpen] = useState(false);
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
      return localStorage.getItem("mima_onboarding_done") !== "true";
    } catch {
      return false;
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastPersistedMessageIdRef = useRef<string | null>(null);
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

  useEffect(() => {
    try {
      localStorage.setItem(ARCHIVED_CONVERSATIONS_STORAGE_KEY, JSON.stringify(archivedConversations));
    } catch {
      // Ignore storage failures.
    }
  }, [archivedConversations]);

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

        const historyResponse = await fetch("/api/chat/history", { headers });
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          const resetAt = localStorage.getItem(CHAT_RESET_AT_STORAGE_KEY);
          const visibleHistory = resetAt
            ? history.filter((msg: any) => new Date(msg.created_at).getTime() > new Date(resetAt).getTime())
            : history;

          if (visibleHistory.length > 0) {
            lastPersistedMessageIdRef.current = visibleHistory[visibleHistory.length - 1]?.id?.toString() || null;
            setMessages(
              visibleHistory.map((msg: any) => ({
                id: msg.id,
                role: msg.role === "user" ? "user" : "assistant",
                text: msg.content,
                time: new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                audio: msg.audio_data,
              })),
            );
          } else {
            setMessages([createWelcomeMessage()]);
          }
        }

        const prefsResponse = await fetch("/api/user/preferences", { headers });
        if (prefsResponse.ok) {
          const prefs = await prefsResponse.json();
          if (prefs.voice_id) setVoiceId(prefs.voice_id);
          if (prefs.language && (prefs.onboarding_done || !showOnboarding)) {
            localStorage.setItem("mima_language", prefs.language);
            i18n.changeLanguage(prefs.language);
          }
          if (prefs.onboarding_done) {
            setShowOnboarding(false);
            localStorage.setItem("mima_onboarding_done", "true");
          }
        }
      } catch (error) {
        console.error("Failed to load data from Supabase:", error);
      }
    };

    loadData();
  }, [user, i18n, showOnboarding]);

  useEffect(() => {
    if (!user) return;

    const saveHistory = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const messagesToSave = messages.filter((message) => !message.isWelcome);
        if (messagesToSave.length === 0) return;

        const lastMessage = messagesToSave[messagesToSave.length - 1];
        const lastMessageId = lastMessage.id.toString();

        if (lastPersistedMessageIdRef.current === lastMessageId) {
          return;
        }

        await fetch("/api/chat/message", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.id,
            role: lastMessage.role,
            content: lastMessage.text,
            mode,
            audio_data: lastMessage.audio ?? null,
          }),
        });

        lastPersistedMessageIdRef.current = lastMessageId;
      } catch (error) {
        console.error("Failed to save chat history:", error);
      }
    };

    const timeoutId = setTimeout(saveHistory, 1000);
    return () => clearTimeout(timeoutId);
  }, [messages, mode, user]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput("");

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "user",
        text: userMsg,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        audio: null,
      },
    ]);

    setIsLoading(true);

    try {
      const history = messages
        .filter((message) => !message.isWelcome)
        .map((message) => ({
          role: message.role === "user" ? "user" : "model",
          content: message.text,
        }));

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const responseText = await generateChatResponse(
        userMsg,
        mode,
        i18n.language,
        history,
        session?.access_token,
      );

      if (responseText.includes("Unauthorized") || responseText.includes("auth")) {
        await supabase.auth.refreshSession();
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: responseText,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          audio: null,
        },
      ]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: t("chat.error_message"),
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          audio: null,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
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
      const firstUserMessage = messagesToArchive.find((message) => message.role === "user");
      const titleSource = firstUserMessage?.text || messagesToArchive[0]?.text || t("chat.sender_mima");
      const title = titleSource.length > 42 ? `${titleSource.slice(0, 42).trim()}...` : titleSource;

      setArchivedConversations((prev) => [
        {
          id: `${Date.now()}`,
          createdAt: new Date().toISOString(),
          title,
          messages: messagesToArchive,
        },
        ...prev,
      ].slice(0, MAX_ARCHIVED_CONVERSATIONS));
    }

    stop();
    setPlayingId(null);
    setInput("");
    setIsLoading(false);
    setMessages([createWelcomeMessage()]);
    setIsHistoryOpen(false);
    lastPersistedMessageIdRef.current = null;
    localStorage.setItem(CHAT_RESET_AT_STORAGE_KEY, new Date().toISOString());

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

      const response = await fetch("/api/chat/history", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        console.error("Failed to clear chat history:", await response.text());
        showToast(t("chat.history_clear_error"), "error");
        return;
      }

      showToast(t("chat.new_conversation_started"), "success");
    } catch (error) {
      console.error("Failed to start new conversation:", error);
      showToast(t("chat.history_clear_error"), "error");
    }
  };

  const handleRestoreConversation = (conversation: ArchivedConversation) => {
    stop();
    setPlayingId(null);
    setInput("");
    setIsLoading(false);
    lastPersistedMessageIdRef.current = conversation.messages[conversation.messages.length - 1]?.id?.toString() || null;
    setMessages(conversation.messages);
    setIsHistoryOpen(false);
    showToast(t("chat.history_restored"), "success");
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
      await play("/api/tts", { text, voiceId });
    } catch (error) {
      console.error("Audio playback error:", error);
      setPlayingId(null);
    }
  };

  useEffect(() => {
    if (!isAudioPlaying) setPlayingId(null);
  }, [isAudioPlaying]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
                localStorage.setItem("mima_voice_id", selectedVoiceId);
              }
              localStorage.setItem("mima_language", i18n.language);
              localStorage.setItem("mima_onboarding_done", "true");

              if (user) {
                const {
                  data: { session },
                } = await supabase.auth.getSession();
                const response = await fetch("/api/user/preferences", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    onboarding_done: true,
                    voice_id: selectedVoiceId || voiceId,
                    language: i18n.language,
                  }),
                });

                if (!response.ok) {
                  console.error("Failed to sync preferences to server:", await response.text());
                }
              }
            } catch (error) {
              console.error("Error in onboarding completion:", error);
              setShowOnboarding(false);
              localStorage.setItem("mima_onboarding_done", "true");
            }
          }}
        />
      )}

      <header className="flex items-center justify-between p-4 pt-6 shrink-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-highlight transition-colors text-slate-100"
            aria-label={t("chat.history_title")}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#6221dd] flex items-center justify-center overflow-hidden">
              <img src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg" alt={t("chat.sender_mima")} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">{t("chat.sender_mima")}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewConversation}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-highlight transition-colors text-text-secondary"
            aria-label={t("action_menu.new_conversation")}
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
            aria-label={t("common.close")}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-[85%] max-w-sm bg-background-dark border-r border-white/10 z-[90] p-5 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">{t("chat.history_title")}</h2>
                <p className="text-sm text-slate-400">{t("chat.history_subtitle")}</p>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-300"
                aria-label={t("common.close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleNewConversation}
              className="w-full py-3 px-4 rounded-2xl bg-primary text-white font-semibold flex items-center justify-center gap-2 mb-4"
            >
              <MessageSquarePlus className="w-4 h-4" />
              {t("action_menu.new_conversation")}
            </button>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {archivedConversations.length === 0 ? (
                <div className="rounded-2xl border border-white/5 bg-surface-dark p-4 text-sm text-slate-400">
                  {t("chat.history_empty")}
                </div>
              ) : (
                archivedConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => handleRestoreConversation(conversation)}
                    className="w-full text-left rounded-2xl border border-white/5 bg-surface-dark p-4 hover:bg-surface-highlight transition-colors"
                  >
                    <div className="text-sm font-semibold text-white mb-1">{conversation.title}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(conversation.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </button>
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
          onAttachFile={() => alert(t("common.coming_soon"))}
          onTakeScreenshot={() => alert(t("common.coming_soon"))}
        />

        <ModeBottomSheet
          isOpen={isModeSheetOpen}
          onClose={() => setIsModeSheetOpen(false)}
          currentMode={mode}
          onSelectMode={(newMode) => setMode(newMode)}
        />

        <div className="flex justify-center my-4">
          <span className="text-xs font-medium text-text-secondary bg-surface-highlight px-3 py-1 rounded-full">{t("chat.today")}</span>
        </div>

        {messages.map((msg) => {
          const isUser = msg.role === "user";

          return (
            <div key={msg.id} className={`flex items-start gap-3 max-w-[85%] ${isUser ? "justify-end ml-auto" : ""}`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-full bg-[#6221dd] shrink-0 flex items-center justify-center shadow-lg shadow-purple-900/20 overflow-hidden">
                  <img src="/assets/logo.jpg?v=4" alt={t("chat.sender_mima")} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </div>
              )}

              <div className={`flex flex-col gap-1 ${isUser ? "items-end" : ""}`}>
                {!isUser && <span className="text-xs text-text-secondary ml-1">{t("chat.sender_mima")}</span>}

                <div
                  className={`p-4 rounded-2xl shadow-sm leading-relaxed text-[15px] ${
                    isUser ? "bg-primary text-white rounded-tr-sm shadow-primary/20" : "bg-surface-highlight text-slate-100 rounded-tl-sm"
                  }`}
                >
                  <div className="markdown-body">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                </div>

                <div className={`flex items-center gap-2 ${isUser ? "mr-1" : "ml-1"}`}>
                  <span className="text-xs text-text-secondary">{msg.time}</span>
                  {!isUser && (
                    <button
                      onClick={() => handlePlayAudio(msg.id, msg.text)}
                      className={`p-1.5 rounded-full transition-all ${
                        playingId === msg.id.toString() ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-text-secondary hover:bg-surface-highlight hover:text-white"
                      }`}
                      title={playingId === msg.id.toString() ? t("chat.stop_audio") : t("chat.play_audio")}
                    >
                      {playingId === msg.id.toString() ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start gap-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-full bg-[#6221dd] shrink-0 flex items-center justify-center shadow-lg shadow-purple-900/20 overflow-hidden">
              <img src="/assets/logo.jpg?v=4" alt={t("chat.sender_mima")} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary ml-1">{t("chat.sender_mima")}</span>
              <div className="bg-surface-highlight text-slate-100 p-4 rounded-2xl rounded-tl-sm shadow-sm leading-relaxed text-[15px] flex items-center gap-1">
                <div className="w-2 h-2 bg-text-secondary rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 bg-background-dark pb-8 shrink-0 relative">
        <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2 w-full h-32 bg-primary/10 blur-[60px] rounded-full pointer-events-none"></div>
        <div className="relative flex items-end gap-3 max-w-3xl mx-auto">
          <button
            onClick={() => setIsActionMenuOpen(true)}
            className="flex-shrink-0 w-10 h-10 mb-1 flex items-center justify-center rounded-full bg-surface-highlight text-text-secondary hover:text-primary transition-colors active:scale-95"
            aria-label={t("chat.action_menu")}
          >
            <Plus className="w-5 h-5" />
          </button>

          <div className="flex-1 bg-surface-dark rounded-[24px] border border-surface-highlight focus-within:border-primary transition-colors flex items-center shadow-sm">
            <input
              className="w-full bg-transparent border-none focus:ring-0 text-white placeholder:text-text-secondary h-12 px-4 py-3 rounded-[24px] outline-none"
              placeholder={t("chat.input_placeholder")}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleSend()}
              disabled={isLoading}
            />
            <button
              onClick={handleMicClick}
              disabled={isLoading || isTranscribing}
              className={`mr-2 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                isRecording ? "text-red-500 bg-red-500/10 animate-pulse" : isTranscribing ? "text-primary animate-spin" : "text-text-secondary hover:text-primary"
              }`}
            >
              {isTranscribing ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Mic className="w-5 h-5" />}
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
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
