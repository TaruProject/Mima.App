import { useState } from "react";
import { motion } from "motion/react";
import { supabase } from "../lib/supabase";
import { useTranslation } from 'react-i18next';

export default function Auth() {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check for Google OAuth error in URL
  const urlParams = new URLSearchParams(window.location.search);
  const googleError = urlParams.get('error');
  if (googleError && !error) {
    setError(t('auth.google_error'));
  }

  const handleAuth = async () => {
    setLoading(true);
    setError("");
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background-dark">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 rounded-2xl overflow-hidden mb-6 shadow-lg shadow-primary/20 border border-white/10">
              <img
                src="https://i.postimg.cc/cJwnS5cZ/mima_logo.jpg"
                alt="Mima"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-3xl font-bold text-white">
              {isLogin ? t('auth.welcome_back') : t('auth.create_account')}
            </h1>
            <p className="text-slate-400 mt-2 text-center">
              {isLogin ? t('auth.sign_in_subtitle') : t('auth.sign_up_subtitle')}
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">{t('auth.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="my-6">
            <div className="h-[1px] bg-white/10"></div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleAuth}
            disabled={loading || !email || !password}
            className="w-full py-3.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : isLogin ? t('auth.sign_in') : t('auth.sign_up')}
          </button>

          {/* Toggle */}
          <div className="mt-8 text-center">
            <p className="text-slate-500 text-sm">
              {isLogin ? t('auth.no_account') : t('auth.have_account')}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary font-medium hover:underline"
              >
                {isLogin ? t('auth.sign_up') : t('auth.sign_in')}
              </button>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
