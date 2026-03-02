import { useState, useRef, useEffect } from "react";
import { Menu, Settings, Mic, ArrowUp, Plus, Volume2 } from "lucide-react";
import { generateChatResponse, generateSpeech } from "../services/geminiService";
import Markdown from "react-markdown";

export default function Chat() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "Mima",
      text: "Hello. I am Mima, your personal assistant. How can I help you today?",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      audio: null as string | null,
    },
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("Neutral Mode");
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem('mima_voice_id') || "DODLEQrClDo8wCz460ld");
  const [isLoading, setIsLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const voices = [
    { id: "DODLEQrClDo8wCz460ld", name: "Mima US-1" },
    { id: "L0yTtpRXzdyzQlzALhgD", name: "Mima US-2" },
    { id: "d3MFdIuCfbAIwiu7jC4a", name: "Mima US-3" },
    { id: "l4Coq6695JDX9xtLqXDE", name: "Mima US-4" },
    { id: "jP5jSWhfXz3nfQENMtf4", name: "Mima UK-1" },
    { id: "ZtcPZrt9K4w8e1OB9M6w", name: "Mima UK-2" },
    { id: "6fZce9LFNG3iEITDfqZZ", name: "Mima UK-3" },
  ];

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVoiceId = e.target.value;
    setVoiceId(newVoiceId);
    localStorage.setItem('mima_voice_id', newVoiceId);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = input;
    setInput("");
    
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        sender: "You",
        text: userMsg,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        audio: null,
      },
    ]);
    
    setIsLoading(true);
    
    try {
      const responseText = await generateChatResponse(userMsg, mode);
      
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "Mima",
          text: responseText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          audio: null,
        },
      ]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "Mima",
          text: "I encountered an error processing your request.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          audio: null,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayAudio = async (msgId: number, text: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    if (playingAudio === msgId.toString()) {
      audioRef.current?.pause();
      setPlayingAudio(null);
      return;
    }

    let audioData = msg.audio;
    
    if (!audioData) {
      setPlayingAudio("loading-" + msgId);
      const generatedAudio = await generateSpeech(text, voiceId);
      if (generatedAudio) {
        audioData = generatedAudio;
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audio: audioData } : m));
      } else {
        setPlayingAudio(null);
        return;
      }
    }

    if (audioData) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(audioData);
      audioRef.current = audio;
      audio.play();
      setPlayingAudio(msgId.toString());
      audio.onended = () => setPlayingAudio(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between p-4 pt-6 shrink-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-3">
          <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-highlight transition-colors text-slate-100">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#6221dd] flex items-center justify-center overflow-hidden">
              <img src="/assets/logo.jpg?v=2" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Mima AI</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group hidden sm:block">
            <select 
              value={voiceId}
              onChange={handleVoiceChange}
              className="appearance-none bg-transparent pl-3 pr-8 py-1.5 text-sm font-medium text-text-secondary border border-surface-highlight rounded-full focus:outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {voices.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          <div className="relative group">
            <select 
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="appearance-none bg-transparent pl-3 pr-8 py-1.5 text-sm font-medium text-text-secondary border border-surface-highlight rounded-full focus:outline-none focus:border-primary transition-colors cursor-pointer"
            >
              <option>Business Mode</option>
              <option>Neutral Mode</option>
              <option>Family Mode</option>
              <option>Zen Mode</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-highlight transition-colors text-text-secondary">
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-2 space-y-6 scroll-smooth">
        <div className="flex justify-center my-4">
          <span className="text-xs font-medium text-text-secondary bg-surface-highlight px-3 py-1 rounded-full">
            Today
          </span>
        </div>

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 max-w-[85%] ${
              msg.sender === "You" ? "justify-end ml-auto" : ""
            }`}
          >
            {msg.sender === "Mima" && (
              <div className="w-8 h-8 rounded-full bg-[#6221dd] shrink-0 flex items-center justify-center shadow-lg shadow-purple-900/20 overflow-hidden">
                <img src="/assets/logo.jpg?v=2" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
            )}
            <div className={`flex flex-col gap-1 ${msg.sender === "You" ? "items-end" : ""}`}>
              {msg.sender === "Mima" && (
                <span className="text-xs text-text-secondary ml-1">{msg.sender}</span>
              )}
              <div
                className={`p-4 rounded-2xl shadow-sm leading-relaxed text-[15px] ${
                  msg.sender === "You"
                    ? "bg-primary text-white rounded-tr-sm shadow-primary/20"
                    : "bg-surface-highlight text-slate-100 rounded-tl-sm"
                }`}
              >
                <div className="markdown-body">
                  <Markdown>{msg.text}</Markdown>
                </div>
              </div>
              <div className={`flex items-center gap-2 ${msg.sender === "You" ? "mr-1" : "ml-1"}`}>
                <span className="text-xs text-text-secondary">
                  {msg.time}
                </span>
                {msg.sender === "Mima" && (
                  <button 
                    onClick={() => handlePlayAudio(msg.id, msg.text)}
                    className={`p-1 rounded-full transition-colors ${
                      playingAudio === msg.id.toString() 
                        ? "text-primary bg-primary/10" 
                        : playingAudio === "loading-" + msg.id
                        ? "text-text-secondary animate-pulse"
                        : "text-text-secondary hover:bg-surface-highlight hover:text-white"
                    }`}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-3 max-w-[85%]">
            <div className="w-8 h-8 rounded-full bg-[#6221dd] shrink-0 flex items-center justify-center shadow-lg shadow-purple-900/20 overflow-hidden">
              <img src="/assets/logo.jpg?v=2" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
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
          <button className="flex-shrink-0 w-10 h-10 mb-1 flex items-center justify-center rounded-full bg-surface-highlight text-text-secondary hover:text-primary transition-colors">
            <Plus className="w-5 h-5" />
          </button>
          <div className="flex-1 bg-surface-dark rounded-[24px] border border-surface-highlight focus-within:border-primary transition-colors flex items-center shadow-sm">
            <input
              className="w-full bg-transparent border-none focus:ring-0 text-white placeholder:text-text-secondary h-12 px-4 py-3 rounded-[24px] outline-none"
              placeholder="Ask Mima..."
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isLoading}
            />
            <button className="mr-2 w-8 h-8 flex items-center justify-center rounded-full text-text-secondary hover:text-primary transition-colors">
              <Mic className="w-5 h-5" />
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
