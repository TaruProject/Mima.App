import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { registerSW } from 'virtual:pwa-register';

// Register service worker with auto-update
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    onNeedRefresh() {
      // When a new version is found, force the update immediately
      updateSW(true);
    },
    onOfflineReady() {
      console.log('App is ready to work offline');
    },
    immediate: true
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
