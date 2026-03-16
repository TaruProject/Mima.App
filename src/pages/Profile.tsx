import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { generateSpeech } from '../services/geminiService';
import { LogOut, User, Settings, Shield, Bell, Camera, Check, Loader2, Globe, Volume2, Play, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  
  const voices = [
    { id: "DODLEQrClDo8wCz460ld", name: "Mima US-1" },
    { id: "L0yTtpRXzdyzQlzALhgD", name: "Mima US-2" },
    { id: "d3MFdIuCfbAIwiu7jC4a", name: "Mima US-3" },
    { id: "l4Coq6695JDX9xtLqXDE", name: "Mima US-4" },
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Mima ES-1" },
    { id: "FGY2WhTYpP6BYn95boSj", name: "Mima ES-2" },
    { id: "IKne3meq5a9ay67vC7pY", name: "Mima ES-3" },
  ];

  const [fullName, setFullName] = useState("Mima User");
  const [username, setUsername] = useState("mima_user");
  const [language, setLanguage] = useState(i18n.language);
  const [voiceId, setVoiceId] = useState(() => {
    try {
      return localStorage.getItem('mima_voice_id') || voices[0].id;
    } catch (e) {
      return voices[0].id;
    }
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initial values to track changes
  const [initialValues, setInitialValues] = useState({
    fullName: "Mima User",
    username: "mima_user",
    language: i18n.language
  });

  useEffect(() => {
    const changed = 
      fullName !== initialValues.fullName || 
      username !== initialValues.username || 
      language !== initialValues.language;
    setHasChanges(changed);
  }, [fullName, username, language, initialValues]);

  const handleVoiceSelect = (id: string) => {
    if (id === voiceId) return;
    setVoiceId(id);
    try {
      localStorage.setItem('mima_voice_id', id);
      showToast(t('profile.voice_updated'), "success");
    } catch (e) {
      console.error("Error saving voice preference", e);
    }
  };

  const playVoicePreview = async (id: string) => {
    if (previewPlayingId === id) {
      previewAudioRef.current?.pause();
      setPreviewPlayingId(null);
      return;
    }

    try {
      setPreviewLoadingId(id);
      const previewText = t('onboarding.voice_preview_text');
      const audioBase64 = await generateSpeech(previewText, id);
      
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }

      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      previewAudioRef.current = audio;
      
      audio.onplay = () => {
        setPreviewLoadingId(null);
        setPreviewPlayingId(id);
      };
      
      audio.onended = () => {
        setPreviewPlayingId(null);
      };

      await audio.play();
    } catch (error) {
      console.error("Error playing preview", error);
      setPreviewLoadingId(null);
      showToast(t('chat.audio_error'), "error");
    }
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
    localStorage.setItem('mima_language', newLang);
  };

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;
    
    setIsSaving(true);
    setSaveStatus('saving');
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsSaving(false);
    setSaveStatus('saved');
    setHasChanges(false);
    setInitialValues({ fullName, username, language });
    showToast(t('profile.save_success'), "success");
    
    setTimeout(() => {
      setSaveStatus('idle');
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full bg-background-dark text-slate-100 pb-24">
      <header className="sticky top-0 z-50 bg-background-dark/80 backdrop-blur-md pt-12 pb-4 px-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('profile.title')}</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-8 no-scrollbar">
        {/* BLOQUE A — Información del usuario */}
        <section className="space-y-6">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center border-4 border-white/10 shadow-2xl overflow-hidden">
                <span className="text-4xl font-bold text-white">
                  {fullName.charAt(0).toUpperCase()}
                </span>
              </div>
              <button className="absolute bottom-0 right-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center border-4 border-background-dark text-white hover:bg-primary-dark transition-colors shadow-lg">
                <Camera className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('profile.full_name')}</label>
              <input 
                type="text" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-surface-dark border border-white/5 rounded-2xl p-4 text-white focus:outline-none focus:border-primary transition-colors"
                placeholder={t('profile.full_name')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('profile.username')}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">@</span>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())}
                  className="w-full bg-surface-dark border border-white/5 rounded-2xl p-4 pl-8 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="username"
                />
              </div>
            </div>

            <div className="space-y-1.5 opacity-60">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('profile.email_readonly')}</label>
              <input 
                type="email" 
                value={user?.email || ""} 
                readOnly
                className="w-full bg-surface-dark/50 border border-white/5 rounded-2xl p-4 text-slate-400 cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t('profile.interface_language')}</label>
              <div className="relative">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <select 
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="w-full bg-surface-dark border border-white/5 rounded-2xl p-4 pl-12 text-white appearance-none focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="en">🇺🇸 English</option>
                  <option value="es">🇪🇸 Español</option>
                  <option value="fi">🇫🇮 Suomi</option>
                  <option value="sv">🇸🇪 Svenska</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  <Settings className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BLOQUE B — Personalización de Mima (Voz) */}
        <section className="space-y-4">
          <div className="px-1">
            <h3 className="text-xl font-bold text-white">{t('profile.voice_title')}</h3>
            <p className="text-sm text-slate-400">{t('profile.voice_subtitle')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {voices.map((v) => {
              const isSelected = voiceId === v.id;
              const isLoading = previewLoadingId === v.id;
              const isPlaying = previewPlayingId === v.id;

              return (
                <div 
                  key={v.id}
                  onClick={() => handleVoiceSelect(v.id)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer group ${
                    isSelected 
                      ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(98,33,221,0.1)]' 
                      : 'bg-surface-dark border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isSelected ? 'bg-primary text-white' : 'bg-white/5 text-slate-400'
                      }`}>
                        <Volume2 className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <p className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {v.name}
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playVoicePreview(v.id);
                      }}
                      className={`w-full py-2 rounded-xl flex items-center justify-center gap-2 transition-colors ${
                        isPlaying 
                          ? 'bg-primary text-white' 
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isPlaying ? (
                        <Square className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      <span className="text-xs font-bold uppercase tracking-wider">{t('onboarding.voice_preview_btn')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="pt-2">
          <button 
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`w-full py-4 rounded-full font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${
              hasChanges && !isSaving
                ? 'bg-primary text-white shadow-primary/20 hover:bg-primary-dark active:scale-95'
                : saveStatus === 'saved'
                ? 'bg-emerald-500 text-white'
                : 'bg-white/5 text-slate-500 cursor-not-allowed'
            }`}
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('profile.saving')}
              </>
            ) : saveStatus === 'saved' ? (
              <>
                <Check className="w-5 h-5" />
                {t('profile.saved')}
              </>
            ) : (
              t('profile.save_btn')
            )}
          </button>
        </div>

        <div className="pt-4 border-t border-white/5">
          <button 
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 p-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl border border-red-500/20 transition-colors font-bold active:scale-95"
          >
            <LogOut className="w-5 h-5" />
            {t('profile.logout')}
          </button>
        </div>
      </main>
    </div>
  );
}
