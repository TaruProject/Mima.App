import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import LanguageSelector from '../components/LanguageSelector';
import { getPreferredLanguage, SupportedLanguage } from '../utils/languageDetector';

function mapAuthErrorToTranslationKey(error: unknown): string {
  const message = String((error as { message?: string })?.message || '').toLowerCase();

  if (message.includes('database error saving new user')) {
    return 'auth.error_database_save';
  }

  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'auth.error_user_exists';
  }

  if (message.includes('invalid login credentials')) {
    return 'auth.error_invalid_credentials';
  }

  if (message.includes('password should be at least')) {
    return 'auth.error_weak_password';
  }

  return 'auth.error_generic';
}

type AuthStep = 'language' | 'welcome' | 'form';

export default function Auth() {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<AuthStep>('language');
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] =
    useState<SupportedLanguage>(getPreferredLanguage());

  useEffect(() => {
    i18n.changeLanguage(selectedLanguage);
  }, [i18n, selectedLanguage]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const googleError = urlParams.get('error');

    if (googleError) {
      setError(t('auth.google_error'));
      setStep('form');
    }
  }, [t]);

  const handleLanguageSelect = (language: string) => {
    const safeLanguage = language as SupportedLanguage;
    setSelectedLanguage(safeLanguage);
    localStorage.setItem('mima_language', safeLanguage);
    i18n.changeLanguage(safeLanguage);
  };

  const handleLanguageContinue = () => {
    setStep('welcome');
  };

  const handleGoToForm = (login: boolean) => {
    setIsLogin(login);
    setError('');
    setStep('form');
  };

  const handleAuth = async () => {
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              language: selectedLanguage,
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data.session?.access_token && data.user?.id) {
          const timestamp = new Date().toISOString();

          const profileUpsert = supabase.from('profiles').upsert(
            {
              id: data.user.id,
              language: selectedLanguage,
              updated_at: timestamp,
            },
            { onConflict: 'id' }
          );

          const preferencesUpsert = supabase.from('user_preferences').upsert(
            {
              user_id: data.user.id,
              language: selectedLanguage,
              onboarding_done: false,
              updated_at: timestamp,
            },
            { onConflict: 'user_id' }
          );

          const [profileResult, preferencesResult] = await Promise.allSettled([
            profileUpsert,
            preferencesUpsert,
          ]);

          if (profileResult.status === 'rejected') {
            console.warn('Profile upsert after signUp failed:', profileResult.reason);
          } else if (profileResult.value.error) {
            console.warn('Profile upsert after signUp returned error:', profileResult.value.error);
          }

          if (preferencesResult.status === 'rejected') {
            console.warn('Preferences upsert after signUp failed:', preferencesResult.reason);
          } else if (preferencesResult.value.error) {
            console.warn(
              'Preferences upsert after signUp returned error:',
              preferencesResult.value.error
            );
          }
        }
      }
    } catch (authError: unknown) {
      setError(t(mapAuthErrorToTranslationKey(authError)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background-dark">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          {step === 'language' && (
            <motion.div
              key="language-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm flex flex-col items-center"
            >
              <div className="w-20 h-20 rounded-2xl overflow-hidden mb-8 shadow-lg shadow-primary/20 border border-white/10">
                <img
                  src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg"
                  alt={t('chat.sender_mima')}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <LanguageSelector
                onSelect={handleLanguageSelect}
                selectedLanguage={selectedLanguage}
                showCodes
              />

              <button
                onClick={handleLanguageContinue}
                className="w-full mt-6 py-3.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                {t('common.continue')}
              </button>
            </motion.div>
          )}

          {step === 'welcome' && (
            <motion.div
              key="welcome-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm flex flex-col items-center"
            >
              <div className="w-24 h-24 rounded-3xl overflow-hidden mb-8 shadow-lg shadow-primary/20 border border-white/10">
                <img
                  src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg"
                  alt={t('chat.sender_mima')}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <h1 className="text-3xl font-bold text-white mb-3 text-center">
                {t('auth.welcome_title')}
              </h1>
              <p className="text-slate-400 text-center mb-10">{t('auth.welcome_subtitle')}</p>

              <button
                onClick={() => handleGoToForm(false)}
                className="w-full py-3.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                {t('auth.create_account')}
              </button>

              <div className="mt-4 w-full">
                <button
                  onClick={() => handleGoToForm(true)}
                  className="w-full py-3.5 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 active:scale-[0.98] transition-all"
                >
                  {t('auth.sign_in')}
                </button>
              </div>

              <button
                onClick={() => setStep('language')}
                className="mt-4 text-slate-500 text-sm hover:text-slate-300 transition-colors"
              >
                {t('auth.change_language')}
              </button>
            </motion.div>
          )}

          {step === 'form' && (
            <motion.div
              key="form-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm"
            >
              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 shadow-lg shadow-primary/20 border border-white/10">
                  <img
                    src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg"
                    alt={t('chat.sender_mima')}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h1 className="text-2xl font-bold text-white">
                  {isLogin ? t('auth.welcome_back') : t('auth.create_account')}
                </h1>
                <p className="text-slate-400 mt-1 text-center text-sm">
                  {isLogin ? t('auth.sign_in_subtitle') : t('auth.sign_up_subtitle')}
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">
                    {t('auth.email')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                    placeholder={t('auth.email_placeholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">
                    {t('auth.password')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                    placeholder={t('auth.password_placeholder')}
                  />
                </div>
              </div>

              <button
                onClick={handleAuth}
                disabled={loading || !email || !password}
                className="w-full mt-6 py-3.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('auth.loading') : isLogin ? t('auth.sign_in') : t('auth.sign_up')}
              </button>

              <div className="mt-6 text-center">
                <p className="text-slate-500 text-sm">
                  {isLogin ? t('auth.no_account') : t('auth.have_account')}{' '}
                  <button
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError('');
                    }}
                    className="text-primary font-medium hover:underline"
                  >
                    {isLogin ? t('auth.sign_up') : t('auth.sign_in')}
                  </button>
                </p>
              </div>

              <button
                onClick={() => setStep('welcome')}
                className="w-full mt-4 text-slate-500 text-sm hover:text-slate-300 transition-colors text-center"
              >
                {t('common.back')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
