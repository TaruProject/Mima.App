import React, { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

export default function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      // Show iOS prompt if not installed
      setShowIOSPrompt(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setSupportsPWA(false);
      setShowIOSPrompt(false);
    });

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

  const dismissIOSPrompt = () => {
    setShowIOSPrompt(false);
  };

  if (isInstalled) {
    return null;
  }

  if (isIOS && showIOSPrompt) {
    return (
      <div className="fixed bottom-6 left-4 right-4 z-50 bg-surface-dark border border-white/10 p-5 rounded-2xl shadow-2xl flex flex-col gap-3 animate-in slide-in-from-bottom-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#6221dd] rounded-xl flex items-center justify-center overflow-hidden shrink-0">
              <img src="/assets/logo.jpg?v=4" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Instalar Mima AI</h3>
              <p className="text-white/70 text-sm leading-tight mt-1">
                Instala esta app en tu iPhone para una mejor experiencia.
              </p>
            </div>
          </div>
          <button
            onClick={dismissIOSPrompt}
            className="p-1 text-white/60 hover:text-white transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>
        <div className="bg-white/5 rounded-xl p-3 mt-1 border border-white/5">
          <p className="text-sm text-white/90 flex items-center gap-2">
            1. Toca el botón <Share size={16} className="text-primary" /> en la barra inferior.
          </p>
          <p className="text-sm text-white/90 flex items-center gap-2 mt-2">
            2. Selecciona <strong className="text-white">"Añadir a la pantalla de inicio"</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (!supportsPWA) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-surface-dark border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center justify-between animate-in slide-in-from-bottom-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#6221dd] rounded-xl flex items-center justify-center overflow-hidden">
          <img src="/assets/logo.jpg?v=4" alt="Mima" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
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
