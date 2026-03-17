import { RefreshCw, Download } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function UpdateOverlay({ onUpdate }: { onUpdate: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-surface-dark border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col relative">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/20 to-transparent pointer-events-none"></div>
        
        <div className="flex flex-col items-center p-8 pt-10 gap-6 z-10">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse"></div>
            <div className="relative w-20 h-20 bg-gradient-to-br from-primary to-[#8b5cf6] rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
              <Download className="text-white w-10 h-10" />
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-white text-2xl font-bold leading-tight tracking-tight whitespace-pre-line">
              {t('update.title')}
            </h2>
            <p className="text-slate-400 text-sm font-normal leading-relaxed max-w-[260px]">
              {t('update.description')}
            </p>
          </div>
        </div>
        
        <div className="p-6 pt-2 pb-8 flex flex-col gap-3">
          <button 
            onClick={onUpdate}
            className="w-full flex items-center justify-center gap-2 h-14 rounded-full bg-primary hover:bg-primary/90 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-primary/25 group cursor-pointer"
          >
            <RefreshCw className="text-white w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            <span className="text-white text-base font-bold tracking-wide">{t('update.button')}</span>
          </button>
          
          <p className="text-center text-xs text-slate-600 font-medium">
            v2.4.0 • 45MB
          </p>
        </div>
      </div>
    </div>
  );
}
