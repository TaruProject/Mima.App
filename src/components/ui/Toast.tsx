import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  onClose: (id: string) => void;
}

const icons = {
  success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  info: <Info className="w-5 h-5 text-blue-400" />,
};

const bgColors = {
  success: 'bg-emerald-500/10 border-emerald-500/20',
  error: 'bg-red-500/10 border-red-500/20',
  warning: 'bg-amber-500/10 border-amber-500/20',
  info: 'bg-blue-500/10 border-blue-500/20',
};

export const Toast: React.FC<ToastProps> = ({ id, message, type, duration = 5000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      layout
      className={`flex items-center gap-3 p-4 rounded-2xl border backdrop-blur-md shadow-lg min-w-[300px] max-w-md ${bgColors[type]}`}
    >
      <div className="shrink-0">{icons[type]}</div>
      <p className="flex-1 text-sm font-medium text-slate-100">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
        aria-label="Cerrar notificación"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

export const ToastContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      <div className="pointer-events-auto flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {children}
        </AnimatePresence>
      </div>
    </div>
  );
};
