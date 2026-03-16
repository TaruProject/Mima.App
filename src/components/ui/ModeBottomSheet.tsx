import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check } from 'lucide-react';

interface ModeBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: string;
  onSelectMode: (mode: string) => void;
}

const modes = [
  { id: 'Neutral Mode', name: 'Neutral', description: 'Equilibrado y eficiente' },
  { id: 'Business Mode', name: 'Profesional', description: 'Formal y ejecutivo' },
  { id: 'Creative Mode', name: 'Creativo', description: 'Inspirador y expresivo' },
  { id: 'Zen Mode', name: 'Zen', description: 'Conciso y tranquilo' },
  { id: 'Family Mode', name: 'Familiar', description: 'Cercano y amable' },
];

export const ModeBottomSheet: React.FC<ModeBottomSheetProps> = ({
  isOpen,
  onClose,
  currentMode,
  onSelectMode,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[80] backdrop-blur-sm"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-surface-dark rounded-t-[32px] border-t border-white/10 z-[90] pb-10 pt-4 px-6 shadow-2xl max-w-2xl mx-auto"
          >
            {/* Handle */}
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6" />

            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Seleccionar modo</h3>
              <button 
                onClick={onClose}
                className="p-2 rounded-full bg-white/5 text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {modes.map((mode) => {
                const isActive = currentMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => {
                      onSelectMode(mode.id);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      isActive 
                        ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(98,33,221,0.1)]' 
                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-left">
                      <p className={`font-bold ${isActive ? 'text-primary' : 'text-white'}`}>
                        {mode.name}
                      </p>
                      <p className="text-sm text-white/40">{mode.description}</p>
                    </div>
                    {isActive && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
