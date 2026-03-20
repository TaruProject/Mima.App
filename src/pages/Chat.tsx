import { useState, useRef, useEffect } from "react";
import { Menu, Settings, Mic, ArrowUp, Plus, Volume2, Square, Play } from "lucide-react";
import { generateChatResponse } from "../services/geminiService";
import Markdown from "react-markdown";
import { ActionMenu } from "../components/ui/ActionMenu";
import { ModeBottomSheet } from "../components/ui/ModeBottomSheet";
import { OnboardingFlow } from "../components/onboarding/OnboardingFlow";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import { useVoiceRecording } from "../hooks/useVoiceRecording";
import { supabase } from "../lib/supabase";

export default function Chat() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { play, stop, isPlaying: isAudioPlaying } = useAudioPlayback();
  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecording();
  
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);

  const [messages, setMessages] = useState<any[]>(() => {
    // Initial messages
    return [
      {
        id: 1,
        sender: "Mima",
        text: t('chat.welcome_message'),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("Neutral Mode");
  const [voiceId, setVoiceId] = useState("DODLEQrClDo8wCz460ld");
  const [isLoading, setIsLoading] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isModeSheetOpen, setIsModeSheetOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem('mima_onboarding_done') !== 'true';
    } catch (e) {
      return false;
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history and preferences from Supabase when user is authenticated
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const headers = {
          'Authorization': `Bearer ${session.access_token}`
        };

        // Load chat history
        const historyResponse = await fetch('/api/chat/history', { headers });
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          if (history.length > 0) {
            setMessages(history.map((msg: any) => ({
              id: msg.id,
              sender: msg.role === 'user' ? t('common.you') : 'Mima',
              text: msg.content,
              time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              audio: msg.audio_data,
            })));
          }
        }

        // Load preferences
        const prefsResponse = await fetch('/api/user/preferences', { headers });
        if (prefsResponse.ok) {
          const prefs = await prefsResponse.json();
          console.log("Loaded prefs from backend:", prefs);
          if (prefs.voice_id) setVoiceId(prefs.voice_id);
          if (prefs.language) i18n.changeLanguage(prefs.language);
          if (prefs.onboarding_done) {
            setShowOnboarding(false);
            localStorage.setItem('mima_onboarding_done', 'true');
          }
        }
      } catch (error) {
        console.error("Failed to load data from Supabase:", error);
      }
    };

    loadData();
  }, [user, t, i18n]);

  // Save chat history to Supabase
  useEffect(() => {
    if (!user || messages.length <= 1) return; // Don't save welcome message only

    const saveHistory = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const headers = {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        };

        // Save only new messages (exclude welcome message)
        const messagesToSave = messages
          .filter(m => m.id !== 1)
          .map(msg => ({
            user_id: user.id,
            role: msg.sender === t('common.you') ? 'user' : 'assistant' as const,
            content: msg.text,
            mode,
            audio_data: msg.audio
          }));

        if (messagesToSave.length > 0) {
          await fetch('/api/chat/message', {
            method: 'POST',
            headers,
            body: JSON.stringify(messagesToSave[messagesToSave.length - 1]) // Save last message
          });
        }
      } catch (error) {
        console.error("Failed to save chat history:", error);
      }
    };

    const timeoutId = setTimeout(saveHistory, 1000); // Debounce save
    return () => clearTimeout(timeoutId);
  }, [messages, user, mode, t]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = input;
    setInput("");
    
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        sender: t('common.you'),
        text: userMsg,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        audio: null,
      },
    ]);
    
    setIsLoading(true);
    
    try {
      const history = messages
        .filter(m => m.id !== 1) // exclude welcome message
        .map(m => ({
          role: m.sender === t('common.you') ? 'user' : 'model',
          content: m.text
        }));

      const { data: { session } } = await supabase.auth.getSession();
      const responseText = await generateChatResponse(userMsg, mode, i18n.language, history, session?.access_token);
      
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "Mima",
          text: responseText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "Mima",
          text: t('chat.error_message'),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
      if (text) {
        setInput(text);
      }
    } else {
      await startRecording();
    }
  };

  const handlePlayAudio = async (msgId: number, text: string) => {
    if (playingId === msgId.toString()) {
      stop();
      setPlayingId(null);
      return;
    }

    try {
      setPlayingId(msgId.toString());
      await play('/api/tts', { text, voiceId });
    } catch (error) {
      console.error("Audio playback error:", error);
      setPlayingId(null);
    }
  };

  // Reset playingId when audio stops naturally
  useEffect(() => {
    if (!isAudioPlaying) {
      setPlayingId(null);
    }
  }, [isAudioPlaying]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Scrolling logic replaced by simple scroll to bottom on message change

  return (
    <div className="flex flex-col h-full relative">
      {showOnboarding && (
        <OnboardingFlow onComplete={async () => {
          setShowOnboarding(false);
          // Sync with Supabase if logged in
          if (user) {
            try {
              await fetch('/api/user/preferences', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${user.id}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ onboarding_done: true })
              });
            } catch (e) {
              console.error("Failed to sync onboarding status:", e);
            }
          }
        }} />
      )}
      <header className="flex items-center justify-between p-4 pt-6 shrink-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-3">
          <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-highlight transition-colors text-slate-100">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#6221dd] flex items-center justify-center overflow-hidden">
              <img src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Mima</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-highlight transition-colors text-text-secondary" aria-label={t('common.settings')}>
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-2 space-y-6 scroll-smooth">
        <ActionMenu 
          isOpen={isActionMenuOpen}
          onClose={() => setIsActionMenuOpen(false)}
          currentMode={mode}
          onSelectMode={() => {
            setIsActionMenuOpen(false);
            setIsModeSheetOpen(true);
          }}
          onAttachFile={() => console.log("Attach file")}
          onTakeScreenshot={() => console.log("Take screenshot")}
        />
        <ModeBottomSheet
          isOpen={isModeSheetOpen}
          onClose={() => setIsModeSheetOpen(false)}
          currentMode={mode}
          onSelectMode={(newMode) => setMode(newMode)}
        />
        <div className="flex justify-center my-4">
          <span className="text-xs font-medium text-text-secondary bg-surface-highlight px-3 py-1 rounded-full">
            {t('chat.today')}
          </span>
        </div>

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 max-w-[85%] ${
              msg.sender === t('common.you') ? "justify-end ml-auto" : ""
            }`}
          >
            {msg.sender === "Mima" && (
              <div className="w-8 h-8 rounded-full bg-[#6221dd] shrink-0 flex items-center justify-center shadow-lg shadow-purple-900/20 overflow-hidden">
                <img src="/assets/logo.jpg?v=4" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
            )}
            <div className={`flex flex-col gap-1 ${msg.sender === t('common.you') ? "items-end" : ""}`}>
              {msg.sender === "Mima" && (
                <span className="text-xs text-text-secondary ml-1">{msg.sender}</span>
              )}
              <div
                className={`p-4 rounded-2xl shadow-sm leading-relaxed text-[15px] ${
                  msg.sender === t('common.you')
                    ? "bg-primary text-white rounded-tr-sm shadow-primary/20"
                    : "bg-surface-highlight text-slate-100 rounded-tl-sm"
                }`}
              >
                <div className="markdown-body">
                  <Markdown>{msg.text}</Markdown>
                </div>
              </div>
              <div className={`flex items-center gap-2 ${msg.sender === t('common.you') ? "mr-1" : "ml-1"}`}>
                <span className="text-xs text-text-secondary">
                  {msg.time}
                </span>
                {msg.sender === "Mima" && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handlePlayAudio(msg.id, msg.text)}
                      className={`p-1.5 rounded-full transition-all ${
                        playingId === msg.id.toString() 
                          ? "text-primary bg-primary/10 hover:bg-primary/20" 
                          : "text-text-secondary hover:bg-surface-highlight hover:text-white"
                      }`}
                      title={playingId === msg.id.toString() ? t('chat.stop_audio') : t('chat.play_audio')}
                    >
                      {playingId === msg.id.toString() ? (
                        <Square className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>
                    
                    {playingId === msg.id.toString() && (
                      <div className="w-24 h-1.5 bg-surface-highlight rounded-full overflow-hidden ml-1">
                        <div 
                          className="h-full bg-primary transition-all duration-100 ease-linear"
                          style={{ width: `${audioProgress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-full bg-[#6221dd] shrink-0 flex items-center justify-center shadow-lg shadow-purple-900/20 overflow-hidden">
              <img src="/assets/logo.jpg?v=4" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary ml-1">Mima</span>
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
            aria-label={t('chat.action_menu')}
          >
            <Plus className="w-5 h-5" />
          </button>
          <div className="flex-1 bg-surface-dark rounded-[24px] border border-surface-highlight focus-within:border-primary transition-colors flex items-center shadow-sm">
            <input
              className="w-full bg-transparent border-none focus:ring-0 text-white placeholder:text-text-secondary h-12 px-4 py-3 rounded-[24px] outline-none"
              placeholder={t('chat.input_placeholder')}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isLoading}
            />
            <button 
              onClick={handleMicClick}
              disabled={isLoading || isTranscribing}
              className={`mr-2 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                isRecording ? "text-red-500 bg-red-500/10 animate-pulse" : 
                isTranscribing ? "text-primary animate-spin" : "text-text-secondary hover:text-primary"
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
