import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setSupportsPWA(false);
    });

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const onClick = (evt: React.MouseEvent) => {
    evt.preventDefault();
    if (!promptInstall) {
      return;
    }
    promptInstall.prompt();
    promptInstall.userChoice.then((choiceResult: { outcome: string }) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      setSupportsPWA(false);
    });
  };

  if (!supportsPWA || isInstalled) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-surface-dark border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center justify-between animate-in slide-in-from-bottom-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#6221dd] rounded-xl flex items-center justify-center overflow-hidden">
          <img src="/assets/logo.jpg?v=5" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        </div>
        <div>
          <h3 className="text-white font-medium text-sm">Instalar Mima AI</h3>
          <p className="text-white/60 text-xs">Añade la app a tu pantalla de inicio</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSupportsPWA(false)}
          className="p-2 text-white/60 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
        <button
          onClick={onClick}
          className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <Download size={16} />
          Instalar
        </button>
      </div>
    </div>
  );
}
