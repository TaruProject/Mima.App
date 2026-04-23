import { useTranslation } from 'react-i18next';

interface LanguageSelectorProps {
  onSelect: (language: string) => void;
  selectedLanguage: string;
  showFlags?: boolean;
}

const languages = [
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
];

export default function LanguageSelector({
  onSelect,
  selectedLanguage,
  showFlags = true,
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
            aria-label={`Select ${lang.name} language`}
          >
            <div className="flex flex-col items-center space-y-2">
              {showFlags && <span className="text-2xl">{lang.flag}</span>}
              <span className="text-sm font-medium">{lang.name}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
