import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { LogOut, Settings, Camera, Check, Loader2, Globe, Volume2, Play, Square, Link2, RefreshCw, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { supabase } from "../lib/supabase";
import { voices } from "../constants/voices";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import { useGoogleConnection } from "../hooks/useGoogleConnection";

const PROFILE_AVATAR_STORAGE_KEY = "mima_profile_avatar_data_url";

function sanitizeUsername(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const { play: playAudio, stop: stopAudio, isPlaying: isAudioPlaying, cleanup: cleanupAudio } = useAudioPlayback();
  const { isConnected, reconnectRequired, isConnecting, connect, disconnect, checkStatus } = useGoogleConnection();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [language, setLanguage] = useState(i18n.language);
  const [voiceId, setVoiceId] = useState(voices[0].id);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState({
    fullName: "",
    username: "",
    language: i18n.language,
    voiceId: voices[0].id,
  });

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading profile:", error);
          return;
        }

        const loadedName = data?.name || "";
        const loadedUsername = data?.username || "";
        const loadedLang = data?.language || i18n.language;
        const loadedVoice = data?.voice_id || voices[0].id;

        setFullName(loadedName);
        setUsername(loadedUsername);
        setLanguage(loadedLang);
        setVoiceId(loadedVoice);
        setInitialValues({
          fullName: loadedName,
          username: loadedUsername,
          language: loadedLang,
          voiceId: loadedVoice,
        });

        if (loadedLang !== i18n.language) {
          i18n.changeLanguage(loadedLang);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) return;

        const prefsResponse = await fetch("/api/user/preferences", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (prefsResponse.ok) {
          const prefs = await prefsResponse.json();
          if (prefs.voice_id) setVoiceId(prefs.voice_id);
          if (prefs.language) {
            setLanguage(prefs.language);
            i18n.changeLanguage(prefs.language);
          }
        }
      } catch (error) {
        console.error("Error in loadProfile:", error);
      }
    };

    loadProfile();
  }, [user, i18n]);

  useEffect(() => {
    try {
      const storedAvatar = localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY);
      if (storedAvatar) {
        setAvatarDataUrl(storedAvatar);
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const changed =
      fullName !== initialValues.fullName ||
      username !== initialValues.username ||
      language !== initialValues.language ||
      voiceId !== initialValues.voiceId;

    setHasChanges(changed);
  }, [fullName, username, language, voiceId, initialValues]);

  useEffect(() => {
    if (!isAudioPlaying) setPreviewPlayingId(null);
  }, [isAudioPlaying]);

  useEffect(() => () => cleanupAudio(), [cleanupAudio]);

  const handleVoiceSelect = async (id: string) => {
    if (id === voiceId) return;
    setVoiceId(id);

    if (!user) {
      showToast(t("profile.voice_updated"), "success");
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/user/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ voice_id: id }),
      });

      if (!response.ok) {
        throw new Error("Failed to save voice");
      }

      showToast(t("profile.voice_updated"), "success");
    } catch (error) {
      console.error("Error saving voice to Supabase:", error);
      showToast(t("chat.error_message"), "error");
    }
  };

  const playVoicePreview = async (id: string) => {
    if (previewPlayingId === id) {
      stopAudio();
      setPreviewPlayingId(null);
      return;
    }

    if (previewLoadingId) return;

    try {
      setPreviewLoadingId(id);
      await playAudio(`/api/tts/preview?voiceId=${id}&text=${encodeURIComponent(t("onboarding.voice_preview_text"))}`);
      setPreviewPlayingId(id);
    } catch (error) {
      console.error("Error playing preview", error);
      showToast(t("chat.audio_error"), "error");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleLanguageChange = async (newLang: string) => {
    setLanguage(newLang);
    localStorage.setItem("mima_language", newLang);
    i18n.changeLanguage(newLang);

    if (!user) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await fetch("/api/user/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ language: newLang }),
      });
    } catch (error) {
      console.error("Error saving language to Supabase:", error);
    }
  };

  const handleSave = async () => {
    if (!hasChanges || isSaving || !user) return;

    setIsSaving(true);
    setSaveStatus("saving");

    try {
      const usernameSource = username || fullName || user.email?.split("@")[0] || "mima";
      const normalizedBaseUsername = sanitizeUsername(usernameSource) || "mima";
      const { data: existingProfiles, error: usernameError } = await supabase
        .from("profiles")
        .select("id, username")
        .ilike("username", `${normalizedBaseUsername}%`);

      if (usernameError) throw usernameError;

      const existingUsernames = new Set(
        (existingProfiles || [])
          .filter((profile) => profile.id !== user.id)
          .map((profile) => sanitizeUsername(profile.username || "")),
      );

      let resolvedUsername = normalizedBaseUsername;
      if (existingUsernames.has(resolvedUsername)) {
        let suffix = 2;
        while (existingUsernames.has(`${normalizedBaseUsername}${String(suffix).padStart(2, "0")}`)) {
          suffix += 1;
        }
        resolvedUsername = `${normalizedBaseUsername}${String(suffix).padStart(2, "0")}`;
      }

      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          name: fullName || null,
          username: resolvedUsername || null,
          language,
          voice_id: voiceId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) throw error;

      if (resolvedUsername !== username) {
        setUsername(resolvedUsername);
        showToast(t("profile.username_adjusted", { username: `@${resolvedUsername}` }), "info");
      }

      setSaveStatus("saved");
      setHasChanges(false);
      setInitialValues({ fullName, username: resolvedUsername, language, voiceId });
      showToast(t("profile.save_success"), "success");
    } catch (error: any) {
      console.error("Error saving profile:", error);
      setSaveStatus("idle");
      showToast(error.message || t("chat.error_message"), "error");
    } finally {
      setIsSaving(false);

      setTimeout(() => {
        setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
      }, 2000);
    }
  };

  const handleAvatarButtonClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : null;
        if (!result) return;

        setAvatarDataUrl(result);

        try {
          localStorage.setItem(PROFILE_AVATAR_STORAGE_KEY, result);
        } catch (storageError) {
          console.error("Error saving avatar locally:", storageError);
          showToast(t("profile.photo_upload_error"), "error");
        }
      };
      reader.readAsDataURL(file);
    } finally {
      event.target.value = "";
    }
  };

  const handleReconnectGoogle = async () => {
    if (isConnecting) return;
    await connect();
  };

  const handleDisconnectGoogle = async () => {
    await disconnect();
  };

  return (
    <div className="flex flex-col h-full bg-background-dark text-slate-100 pb-24">
      <header className="sticky top-0 z-50 bg-background-dark/80 backdrop-blur-md pt-12 pb-4 px-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("profile.title")}</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-8 no-scrollbar">
        <section className="space-y-6">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center border-4 border-white/10 shadow-2xl overflow-hidden">
                {avatarDataUrl ? (
                  <img src={avatarDataUrl} alt={t("profile.title")} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-white">{(fullName || user?.email || "M").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <button
                onClick={handleAvatarButtonClick}
                className="absolute bottom-0 right-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center border-4 border-background-dark text-white hover:bg-primary-dark transition-colors shadow-lg"
                aria-label={t("profile.photo_upload")}
              >
                <Camera className="w-5 h-5" />
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t("profile.full_name")}</label>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full bg-surface-dark border border-white/5 rounded-2xl p-4 text-white focus:outline-none focus:border-primary transition-colors"
                placeholder={t("profile.full_name")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t("profile.username")}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(sanitizeUsername(event.target.value))}
                  className="w-full bg-surface-dark border border-white/5 rounded-2xl p-4 pl-8 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder={t("profile.username_placeholder")}
                />
              </div>
              <p className="text-xs text-slate-500 ml-1">{t("profile.username_hint")}</p>
            </div>

            <div className="space-y-1.5 opacity-60">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t("profile.email_readonly")}</label>
              <input type="email" value={user?.email || ""} readOnly className="w-full bg-surface-dark/50 border border-white/5 rounded-2xl p-4 text-slate-400 cursor-not-allowed" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">{t("profile.interface_language")}</label>
              <div className="relative">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <select
                  value={language}
                  onChange={(event) => handleLanguageChange(event.target.value)}
                  className="w-full bg-surface-dark border border-white/5 rounded-2xl p-4 pl-12 text-white appearance-none focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="en">{t("profile.language_option_en")}</option>
                  <option value="es">{t("profile.language_option_es")}</option>
                  <option value="fi">{t("profile.language_option_fi")}</option>
                  <option value="sv">{t("profile.language_option_sv")}</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  <Settings className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="px-1">
            <h3 className="text-xl font-bold text-white">{t("profile.google_title")}</h3>
            <p className="text-sm text-slate-400">{t("profile.google_subtitle")}</p>
          </div>

          <div className="bg-surface-dark border border-white/5 rounded-2xl p-4 space-y-4">
            {reconnectRequired && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {t("profile.google_write_required")}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isConnected ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"}`}>
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-white">{isConnected ? t("profile.google_connected") : t("profile.google_not_connected")}</p>
                <p className="text-sm text-slate-400">{t("profile.google_permissions_hint")}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleReconnectGoogle}
                disabled={isConnecting}
                className="flex-1 py-3 px-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${isConnecting ? "animate-spin" : ""}`} />
                {isConnected ? t("profile.google_reconnect") : t("profile.google_connect")}
              </button>
              {isConnected && (
                <button
                  onClick={handleDisconnectGoogle}
                  className="py-3 px-4 bg-white/5 text-slate-200 font-semibold rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                >
                  <Unplug className="w-4 h-4" />
                  {t("profile.google_disconnect")}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="px-1">
            <h3 className="text-xl font-bold text-white">{t("profile.voice_title")}</h3>
            <p className="text-sm text-slate-400">{t("profile.voice_subtitle")}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {voices.map((voice) => {
              const isSelected = voiceId === voice.id;
              const isLoading = previewLoadingId === voice.id;
              const isPlaying = previewPlayingId === voice.id;

              return (
                <div
                  key={voice.id}
                  onClick={() => handleVoiceSelect(voice.id)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer group ${
                    isSelected ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(98,33,221,0.1)]" : "bg-surface-dark border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSelected ? "bg-primary text-white" : "bg-white/5 text-slate-400"}`}>
                        <Volume2 className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>

                    <div>
                      <p className={`font-bold text-sm ${isSelected ? "text-white" : "text-slate-300"}`}>{voice.name}</p>
                    </div>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        playVoicePreview(voice.id);
                      }}
                      className={`w-full py-2 rounded-xl flex items-center justify-center gap-2 transition-colors ${
                        isPlaying ? "bg-primary text-white" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                      <span className="text-xs font-bold uppercase tracking-wider">{t("onboarding.voice_preview_btn")}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`w-full py-4 rounded-full font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${
              hasChanges && !isSaving
                ? "bg-primary text-white shadow-primary/20 hover:bg-primary-dark active:scale-95"
                : saveStatus === "saved"
                  ? "bg-emerald-500 text-white"
                  : "bg-white/5 text-slate-500 cursor-not-allowed"
            }`}
          >
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t("profile.saving")}
              </>
            ) : saveStatus === "saved" ? (
              <>
                <Check className="w-5 h-5" />
                {t("profile.saved")}
              </>
            ) : (
              t("profile.save_btn")
            )}
          </button>
        </div>

        <div className="pt-4 border-t border-white/5">
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 p-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl border border-red-500/20 transition-colors font-bold active:scale-95"
          >
            <LogOut className="w-5 h-5" />
            {t("profile.logout")}
          </button>
        </div>
      </main>
    </div>
  );
}
