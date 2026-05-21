import { useTranslation } from 'react-i18next';

interface LanguageSelectorProps {
  onSelect: (language: string) => void;
  selectedLanguage: string;
  showCodes?: boolean;
}

const languages = [
  { code: 'fi', labelKey: 'profile.language_option_fi', shortCode: 'FI' },
  { code: 'sv', labelKey: 'profile.language_option_sv', shortCode: 'SV' },
  { code: 'en', labelKey: 'profile.language_option_en', shortCode: 'EN' },
  { code: 'es', labelKey: 'profile.language_option_es', shortCode: 'ES' },
];

export default function LanguageSelector({
  onSelect,
  selectedLanguage,
  showCodes = true,
}: LanguageSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-white mb-4 text-center">
        {t('auth.select_language')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => onSelect(lang.code)}
            className={`p-4 rounded-xl border-2 transition-all ${
              selectedLanguage === lang.code
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-white/10 bg-white/5 text-white hover:border-white/20'
            }`}
            aria-label={t('auth.select_language_aria', {
              language: t(lang.labelKey),
            })}
          >
            <div className="flex flex-col items-center space-y-2">
              {showCodes && (
                <span className="text-xs font-bold tracking-wider text-slate-300">
                  {lang.shortCode}
                </span>
              )}
              <span className="text-sm font-medium">{t(lang.labelKey)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
