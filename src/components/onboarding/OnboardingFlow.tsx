import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Check, Volume2, Play, Square, Loader2 } from 'lucide-react';
import { generateSpeech } from '../../services/geminiService';
import { useTranslation } from 'react-i18next';
import { voices } from '../../constants/voices';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
];

const STEP0_TITLES: Record<string, string> = {
  en: 'Choose your language',
  es: 'Elige tu idioma',
  fi: 'Valitse kielesi',
  sv: 'Välj ditt språk',
};

const STEP0_SUBTITLES: Record<string, string> = {
  en: "Select the language for Mima's interface",
  es: 'Selecciona el idioma de la interfaz de Mima',
  fi: 'Valitse Miman käyttöliittymän kieli',
  sv: 'Välj språk för Mimas gränssnitt',
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [hasSelectedLanguage, setHasSelectedLanguage] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(voices[0].id);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const handleNext = async () => {
    if (step < 3) setStep(step + 1);
    else {
      // Save preferences to localStorage ( survives logout)
      localStorage.setItem('mima_onboarding_done', 'true');
      localStorage.setItem('mima_voice_id', selectedVoice);
      
      // Save preferences to Supabase if the user provided userId
      // Note: OnboardingFlow is often shown before the user is fully identified in the local state,
      // but if the parent component (Chat.tsx) has the user, it will also sync.
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const changeLanguage = async (code: string) => {
    i18n.changeLanguage(code);
    setHasSelectedLanguage(true);
    // Auto advance after 400ms when a user selects a language for the first time
    if (step === 0) {
      setTimeout(() => setStep(1), 400);
    }
  };

  const playPreview = async (id: string) => {
    if (previewPlayingId === id) {
      audioRef.current?.pause();
      setPreviewPlayingId(null);
      return;
    }

    try {
      setPreviewLoadingId(id);
      const previewText = t('onboarding.voice_preview_text');
      const audioBase64 = await generateSpeech(previewText, id);
      
      if (audioRef.current) audioRef.current.pause();

      // Safety check for double prefix
      let audioUrl = audioBase64;
      if (audioUrl && audioUrl.startsWith('data:audio/mpeg;base64,data:audio/mpeg;base64,')) {
        audioUrl = audioUrl.replace('data:audio/mpeg;base64,', '');
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onplay = () => {
        setPreviewLoadingId(null);
        setPreviewPlayingId(id);
      };
      
      audio.onended = () => setPreviewPlayingId(null);
      audio.onerror = (e) => {
        console.error("Onboarding audio error:", e);
        setPreviewLoadingId(null);
      };

      await audio.play();
    } catch (error) {
      console.error("Onboarding playback error:", error);
      setPreviewLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background-dark flex flex-col overflow-hidden">
      {/* Progress Dots */}
      <div className="flex justify-center gap-2 pt-12 pb-6">
        {[0, 1, 2, 3].map((i) => (
          <div 
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              step === i ? 'w-6 bg-primary' : 'bg-white/20'
            }`}
          />
        ))}
      </div>

      <div className="flex-1 relative">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-8"
            >
              <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center mb-8 overflow-hidden shadow-lg shadow-primary/20">
                <img 
                  src="/assets/logo.jpg" 
                  alt="Mima" 
                  className="w-16 h-16 object-cover rounded-xl"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2 text-center">{STEP0_TITLES[i18n.language] || STEP0_TITLES.en}</h2>
              <p className="text-slate-400 text-center mb-8">{STEP0_SUBTITLES[i18n.language] || STEP0_SUBTITLES.en}</p>
              
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${
                      i18n.language === lang.code 
                        ? 'bg-primary/10 border-primary text-white' 
                        : 'bg-white/5 border-white/5 text-slate-400'
                    }`}
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <span className="font-bold">{lang.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
            >
              <div className="w-32 h-32 rounded-3xl bg-primary/20 flex items-center justify-center mb-8 animate-pulse">
                <img src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg" alt="Mima" className="w-24 h-24 rounded-2xl object-cover" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">{t('onboarding.welcome_title')}</h2>
              <p className="text-lg text-slate-400 max-w-xs">
                {t('onboarding.welcome_subtitle')}
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 flex flex-col px-8 pt-4 overflow-y-auto no-scrollbar"
            >
              <h2 className="text-2xl font-bold text-white mb-2 text-center">{t('onboarding.voice_title')}</h2>
              <p className="text-slate-400 text-center mb-6">{t('onboarding.voice_subtitle')}</p>
              
              <div className="grid grid-cols-2 gap-3 pb-8">
                {voices.map((v) => {
                  const isSelected = selectedVoice === v.id;
                  const isPlaying = previewPlayingId === v.id;
                  const isLoading = previewLoadingId === v.id;

                  return (
                    <div 
                      key={v.id}
                      onClick={() => setSelectedVoice(v.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                          isSelected ? 'bg-primary text-white' : 'bg-white/10 text-slate-400'
                        }`}>
                          <Volume2 className="w-3.5 h-3.5" />
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-primary" />}
                      </div>
                      <p className="font-bold text-white text-sm mb-2">{v.name}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playPreview(v.id);
                        }}
                        className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"
                      >
                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                        {t('onboarding.voice_preview_btn')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
            >
              <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-8 overflow-hidden shadow-lg shadow-primary/30">
                <img 
                  src="/assets/logo.jpg" 
                  alt="Mima" 
                  className="w-20 h-20 object-cover rounded-full"
                />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">{t('onboarding.final_title')}</h2>
              <p className="text-lg text-slate-400 max-w-xs">
                {t('onboarding.final_subtitle')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Buttons */}
      <div className="p-8 flex gap-4 h-28">
        {step > 0 && (
          <>
            <button 
              onClick={handleBack}
              className="flex-1 py-4 rounded-2xl bg-white/5 text-white font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              {t('common.back')}
            </button>
            <button 
              onClick={handleNext}
              className="flex-[2] py-4 rounded-2xl bg-primary text-white font-bold flex items-center justify-center gap-2 hover:bg-primary-dark transition-all active:scale-95 shadow-lg shadow-primary/20"
            >
              {step === 3 ? t('onboarding.go_to_chat') : t('common.continue')}
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
