import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Check, Volume2, Play, Square, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { voices } from '../../constants/voices';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';

interface OnboardingFlowProps {
  onComplete: (voiceId?: string) => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState(voices[0].id);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const {
    play: playAudio,
    stop: stopAudio,
    isPlaying: isAudioPlaying,
    cleanup: cleanupAudio,
  } = useAudioPlayback();

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
      return;
    }

    localStorage.setItem('mima_onboarding_done', 'true');
    localStorage.setItem('mima_voice_id', selectedVoice);
    onComplete(selectedVoice);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const playPreview = async (id: string) => {
    if (previewPlayingId === id) {
      stopAudio();
      setPreviewPlayingId(null);
      return;
    }

    if (previewLoadingId) return;

    try {
      setPreviewLoadingId(id);
      await playAudio(
        `/api/tts/preview?voiceId=${id}&text=${encodeURIComponent(t('onboarding.voice_preview_text'))}`
      );
      setPreviewPlayingId(id);
    } catch (error) {
      console.error('Onboarding playback error:', error);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  useEffect(() => {
    if (!isAudioPlaying) setPreviewPlayingId(null);
  }, [isAudioPlaying]);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  return (
    <div className="fixed inset-0 z-[200] bg-background-dark flex flex-col overflow-hidden">
      <div className="flex justify-center gap-2 pt-12 pb-6">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${step === index ? 'w-6 bg-primary' : 'bg-white/20'}`}
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
              className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
            >
              <div className="w-32 h-32 rounded-3xl bg-primary/20 flex items-center justify-center mb-8 animate-pulse">
                <img
                  src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg"
                  alt={t('chat.sender_mima')}
                  className="w-24 h-24 rounded-2xl object-cover"
                />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                {t('onboarding.welcome_title')}
              </h2>
              <p className="text-lg text-slate-400 max-w-xs">{t('onboarding.welcome_subtitle')}</p>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 flex flex-col px-8 pt-4 overflow-y-auto no-scrollbar"
            >
              <h2 className="text-2xl font-bold text-white mb-2 text-center">
                {t('onboarding.voice_title')}
              </h2>
              <p className="text-slate-400 text-center mb-6">{t('onboarding.voice_subtitle')}</p>

              <div className="grid grid-cols-2 gap-3 pb-8">
                {voices.map((voice) => {
                  const isSelected = selectedVoice === voice.id;
                  const isPlaying = previewPlayingId === voice.id;
                  const isLoading = previewLoadingId === voice.id;

                  return (
                    <div
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center ${isSelected ? 'bg-primary text-white' : 'bg-white/10 text-slate-400'}`}
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-primary" />}
                      </div>
                      <p className="font-bold text-white text-sm mb-2">{voice.name}</p>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          playPreview(voice.id);
                        }}
                        className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"
                      >
                        {isLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isPlaying ? (
                          <Square className="w-3 h-3 fill-current" />
                        ) : (
                          <Play className="w-3 h-3 fill-current" />
                        )}
                        {t('onboarding.voice_preview_btn')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 2 && (
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
                  alt={t('chat.sender_mima')}
                  className="w-20 h-20 object-cover rounded-full"
                />
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">{t('onboarding.final_title')}</h2>
              <p className="text-lg text-slate-400 max-w-xs">{t('onboarding.final_subtitle')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-8 flex gap-4 h-28">
        {step > 0 ? (
          <button
            onClick={handleBack}
            className="flex-1 py-4 rounded-2xl bg-white/5 text-white font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            {t('common.back')}
          </button>
        ) : (
          <div className="flex-1" />
        )}

        <button
          onClick={handleNext}
          className="flex-[2] py-4 rounded-2xl bg-primary text-white font-bold flex items-center justify-center gap-2 hover:bg-primary-dark transition-all active:scale-95 shadow-lg shadow-primary/20"
        >
          {step === 2 ? t('onboarding.go_to_chat') : t('common.continue')}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
