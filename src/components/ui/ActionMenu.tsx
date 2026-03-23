import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Paperclip, Camera, Theater, ChevronRight, MessageSquarePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentModeLabel: string;
  onSelectMode: () => void;
  onNewConversation: () => void;
  onAttachFile: () => void;
  onTakeScreenshot: () => void;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({
  isOpen,
  onClose,
  currentModeLabel,
  onSelectMode,
  onNewConversation,
  onAttachFile,
  onTakeScreenshot,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

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
            className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-[2px]"
          />

          {/* Menu Content */}
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-24 left-4 right-4 max-w-3xl mx-auto bg-surface-dark/95 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl z-[70] overflow-hidden"
          >
            <div className="flex flex-col py-2">
              <button
                onClick={() => {
                  onNewConversation();
                  onClose();
                }}
                className="flex items-center gap-[14px] px-5 min-h-[52px] w-full hover:bg-white/5 transition-colors text-left"
              >
                <MessageSquarePlus className="w-5 h-5 text-primary" />
                <span className="text-base font-medium text-white">{t('action_menu.new_conversation')}</span>
              </button>

              <div className="h-[1px] bg-white/10 my-1 mx-5" />

              {/* Attach */}
              <button
                onClick={() => {
                  onAttachFile();
                  onClose();
                }}
                className="flex items-center gap-[14px] px-5 min-h-[52px] w-full hover:bg-white/5 transition-colors text-left"
              >
                <Paperclip className="w-5 h-5 text-white/80" />
                <span className="text-base font-normal text-white">{t('action_menu.attach')}</span>
              </button>
              
              <button
                onClick={() => {
                  onTakeScreenshot();
                  onClose();
                }}
                className="flex items-center gap-[14px] px-5 min-h-[52px] w-full hover:bg-white/5 transition-colors text-left"
              >
                <Camera className="w-5 h-5 text-white/80" />
                <span className="text-base font-normal text-white">{t('action_menu.screenshot')}</span>
              </button>

              {/* Separator */}
              <div className="h-[1px] bg-white/10 my-1 mx-5" />

              {/* Mode selection */}
              <button
                onClick={() => {
                  onSelectMode();
                }}
                className="flex items-center justify-between px-5 min-h-[52px] w-full hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex items-center gap-[14px]">
                  <Theater className="w-5 h-5 text-primary" />
                  <span className="text-base font-medium text-white">{t('action_menu.select_mode')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">
                    {currentModeLabel}
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/40" />
                </div>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
