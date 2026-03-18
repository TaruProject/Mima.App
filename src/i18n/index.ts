import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';
import fiCommon from './locales/fi/common.json';
import svCommon from './locales/sv/common.json';

const resources = {
  en: { common: enCommon },
  es: { common: esCommon },
  fi: { common: fiCommon },
  sv: { common: svCommon },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    // CSP-friendly configuration - avoids eval()
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'mima_language',
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false,
    },
    // Disable features that may use eval in production
    debug: false,
    saveMissing: false,
  });

export default i18n;
