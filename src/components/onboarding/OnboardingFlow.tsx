import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Check, Volume2, Play, Square, Loader2 } from 'lucide-react';
import { generateSpeech } from '../../services/geminiService';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const voices = [
  { id: "DODLEQrClDo8wCz460ld", name: "Mima US-1" },
  { id: "L0yTtpRXzdyzQlzALhgD", name: "Mima US-2" },
  { id: "d3MFdIuCfbAIwiu7jC4a", name: "Mima US-3" },
  { id: "l4Coq6695JDX9xtLqXDE", name: "Mima US-4" },
];

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState(voices[0].id);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else {
      localStorage.setItem('mima_onboarding_done', 'true');
      localStorage.setItem('mima_voice_id', selectedVoice);
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const playPreview = async (id: string) => {
    if (previewPlayingId === id) {
      audioRef.current?.pause();
      setPreviewPlayingId(null);
      return;
    }

    try {
      setPreviewLoadingId(id);
      const audioBase64 = await generateSpeech("Hola, soy Mima, tu asistente personal inteligente.", id);
      
      if (audioRef.current) audioRef.current.pause();

      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      audioRef.current = audio;
      
      audio.onplay = () => {
        setPreviewLoadingId(null);
        setPreviewPlayingId(id);
      };
      
      audio.onended = () => setPreviewPlayingId(null);
      await audio.play();
    } catch (error) {
      console.error(error);
      setPreviewLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background-dark flex flex-col overflow-hidden">
      {/* Progress Dots */}
      <div className="flex justify-center gap-2 pt-12 pb-6">
        {[1, 2, 3].map((i) => (
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
              <h2 className="text-3xl font-bold text-white mb-4">Hola, soy Mima 👋</h2>
              <p className="text-lg text-slate-400 max-w-xs">
                Tu asistente personal inteligente. Antes de empezar, personalicemos tu experiencia.
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 flex flex-col px-8 pt-12"
            >
              <h2 className="text-2xl font-bold text-white mb-2 text-center">¿Cómo quieres que suene tu Mima?</h2>
              <p className="text-slate-400 text-center mb-8">Podrás cambiarla cuando quieras desde tu Perfil ⚙️</p>
              
              <div className="grid grid-cols-2 gap-4">
                {voices.map((v) => {
                  const isSelected = selectedVoice === v.id;
                  const isPlaying = previewPlayingId === v.id;
                  const isLoading = previewLoadingId === v.id;

                  return (
                    <div 
                      key={v.id}
                      onClick={() => setSelectedVoice(v.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isSelected ? 'bg-primary text-white' : 'bg-white/10 text-slate-400'
                        }`}>
                          <Volume2 className="w-4 h-4" />
                        </div>
                        {isSelected && <Check className="w-5 h-5 text-primary" />}
                      </div>
                      <p className="font-bold text-white mb-3">{v.name}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playPreview(v.id);
                        }}
                        className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400"
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                        Muestra
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
              <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                >
                  <Check className="w-12 h-12 text-emerald-500" />
                </motion.div>
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">¡Todo listo!</h2>
              <p className="text-lg text-slate-400 max-w-xs mb-8">
                Recuerda: puedes cambiar la voz y otros ajustes en tu Perfil.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Buttons */}
      <div className="p-8 flex gap-4">
        {step > 1 && (
          <button 
            onClick={handleBack}
            className="flex-1 py-4 rounded-2xl bg-white/5 text-white font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            Atrás
          </button>
        )}
        <button 
          onClick={handleNext}
          className="flex-[2] py-4 rounded-2xl bg-primary text-white font-bold flex items-center justify-center gap-2 hover:bg-primary-dark transition-all active:scale-95 shadow-lg shadow-primary/20"
        >
          {step === 3 ? 'Ir al chat' : 'Continuar'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
