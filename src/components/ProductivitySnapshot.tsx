import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Mail, RefreshCw, Sparkles, ListTodo, CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useGoogleConnection } from "../hooks/useGoogleConnection";

interface UserTask {
  id?: string;
  title: string;
  due_at?: string | null;
  status: "open" | "completed";
}

interface GmailDraftSummary {
  draftId: string;
  subject: string;
  to: string;
  from: string;
  date: string;
  snippet: string;
}

interface ProductivitySnapshotProps {
  compact?: boolean;
  maxTasks?: number;
  maxDrafts?: number;
}

function formatDate(value: string, language: string): string {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const locale =
    language === "fi"
      ? "fi-FI"
      : language === "sv"
        ? "sv-SE"
        : language === "es"
          ? "es-ES"
          : "en-US";

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function ProductivitySnapshot({ compact = false, maxTasks = 3, maxDrafts = 3 }: ProductivitySnapshotProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { getAuthHeaders, reconnectRequired, connect, isConnecting } = useGoogleConnection();

  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [drafts, setDrafts] = useState<GmailDraftSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setTasksError(null);
    setDraftsError(null);

    try {
      const headers = getAuthHeaders();

      const [tasksResponse, draftsResponse] = await Promise.all([
        fetch("/api/user/tasks?status=open&limit=5", {
          headers,
          credentials: "include",
        }),
        fetch("/api/gmail/drafts", {
          headers,
          credentials: "include",
        }),
      ]);

      if (tasksResponse.ok) {
        const taskData = await tasksResponse.json();
        const taskItems = Array.isArray(taskData) ? taskData : Array.isArray(taskData?.tasks) ? taskData.tasks : [];
        setTasks(taskItems);
      } else {
        const errorData = await tasksResponse.json().catch(() => ({}));
        setTasks([]);
        setTasksError(errorData?.message || t("common.loading_failed"));
      }

      if (draftsResponse.ok) {
        const draftData = await draftsResponse.json();
        setDrafts(Array.isArray(draftData) ? draftData : []);
      } else {
        const errorData = await draftsResponse.json().catch(() => ({}));
        setDrafts([]);
        if (draftsResponse.status === 403 && errorData?.errorCode === "RECONNECT_REQUIRED") {
          setDraftsError("RECONNECT_REQUIRED");
        } else if (draftsResponse.status !== 401) {
          setDraftsError(errorData?.message || t("common.loading_failed"));
        }
      }

      setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      console.error("Failed to load productivity snapshot", error);
      setTasks([]);
      setDrafts([]);
      setTasksError(t("common.network_error"));
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders, t, user]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const visibleTasks = useMemo(() => tasks.slice(0, maxTasks), [maxTasks, tasks]);
  const visibleDrafts = useMemo(() => drafts.slice(0, maxDrafts), [drafts, maxDrafts]);

  if (!user) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-white/5 bg-surface-dark p-5 space-y-4 shadow-2xl shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("workspace.title")}
          </div>
          <p className="text-sm text-slate-400">{t("workspace.subtitle")}</p>
        </div>

        <button
          onClick={() => void loadSnapshot()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          {t("workspace.refresh")}
        </button>
      </div>

      {lastUpdatedAt && (
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
          {t("workspace.updated_at", { time: lastUpdatedAt })}
        </p>
      )}

      {reconnectRequired && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-semibold">{t("profile.google_write_required")}</p>
          <button
            onClick={() => void connect()}
            disabled={isConnecting}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-950 transition-colors hover:bg-amber-300 disabled:opacity-60"
          >
            {t("common.reconnect")}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border border-white/5 bg-background-dark/70 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-white">{t("chat.tasks_title")}</p>
            </div>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300">{tasks.length}</span>
          </div>

          {isLoading && tasks.length === 0 ? (
            <div className="space-y-2">
              <div className="h-12 rounded-2xl bg-white/5 animate-pulse" />
              <div className="h-12 rounded-2xl bg-white/5 animate-pulse" />
            </div>
          ) : visibleTasks.length > 0 ? (
            <div className="space-y-2">
              {visibleTasks.map((task, index) => (
                <div key={task.id || `${task.title}-${index}`} className="rounded-2xl border border-white/5 bg-surface-dark/80 px-4 py-3">
                  <p className="text-sm font-medium text-slate-100 leading-6">{task.title}</p>
                  {task.due_at && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      <span>{formatDate(task.due_at, i18n.language)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 leading-6">{tasksError || t("chat.tasks_empty")}</p>
          )}
        </div>

        <div className="rounded-3xl border border-white/5 bg-background-dark/70 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-white">{t("inbox.saved_drafts_title")}</p>
            </div>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300">{drafts.length}</span>
          </div>

          {isLoading && drafts.length === 0 ? (
            <div className="space-y-2">
              <div className="h-12 rounded-2xl bg-white/5 animate-pulse" />
              <div className="h-12 rounded-2xl bg-white/5 animate-pulse" />
            </div>
          ) : visibleDrafts.length > 0 ? (
            <div className="space-y-2">
              {visibleDrafts.map((draft) => (
                <div key={draft.draftId} className="rounded-2xl border border-white/5 bg-surface-dark/80 px-4 py-3">
                  <p className="text-sm font-medium text-slate-100 leading-6">{draft.subject || t("inbox.no_subject")}</p>
                  <p className="mt-1 text-xs text-slate-400 break-words">{draft.to || draft.from || t("inbox.not_available")}</p>
                  {draft.snippet && <p className="mt-2 line-clamp-2 text-sm text-slate-300 leading-6">{draft.snippet}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 leading-6">
              {draftsError === "RECONNECT_REQUIRED" ? t("profile.google_write_required") : t("inbox.saved_drafts_empty")}
            </p>
          )}
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10"
          >
            {t("workspace.open_chat")}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/inbox"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10"
          >
            {t("workspace.open_inbox")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
