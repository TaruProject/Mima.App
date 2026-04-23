export const SUPPORTED_LANGUAGES = ['en', 'es', 'fi', 'sv'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const getPreferredLanguage = (): SupportedLanguage => {
  // 1. Check localStorage
  const stored = localStorage.getItem('mima_language');
  if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
    return stored as SupportedLanguage;
  }

  // 2. Check browser language (first 2 chars)
  const browserLang = navigator.language.slice(0, 2);
  if (SUPPORTED_LANGUAGES.includes(browserLang as SupportedLanguage)) {
    return browserLang as SupportedLanguage;
  }

  // 3. Fallback to English
  return 'en';
};

export const isSupportedLanguage = (lang: string): lang is SupportedLanguage => {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
};
