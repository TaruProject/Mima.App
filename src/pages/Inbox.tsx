import { AlertCircle, ArrowLeft, Mail as MailIcon, Paperclip, RefreshCw, Search, Sparkles, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGoogleConnection } from "../hooks/useGoogleConnection";
import { useToast } from "../hooks/useToast";
import { ProductivitySnapshot } from "../components/ProductivitySnapshot";

type InboxFilter = "all" | "urgent" | "newsletters" | "updates";
type EmailCategory = "general" | "newsletters" | "updates";
type EmailUrgency = "low" | "normal" | "high";

interface EmailSummary {
  id: string;
  threadId: string | null;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labels: string[];
  unread: boolean;
  category: EmailCategory;
  urgency: EmailUrgency;
}

interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
  partId: string | null;
}

interface EmailDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  messageId: string;
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  attachments: EmailAttachment[];
  labels: string[];
}

interface DraftPreview {
  draftId: string;
  subject: string;
  bodyHtml: string;
  to: string;
}

function htmlToText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.textContent?.trim() || "";
}

function formatEmailDate(value: string, language: string): string {
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

export default function Inbox() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { isConnected, reconnectRequired, connect, getAuthHeaders, checkStatus } = useGoogleConnection();

  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<InboxFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [emailDetailsById, setEmailDetailsById] = useState<Record<string, EmailDetail>>({});
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [draftingEmailId, setDraftingEmailId] = useState<string | null>(null);
  const [draftPreviews, setDraftPreviews] = useState<Record<string, DraftPreview>>({});
  const [analyzingAttachmentId, setAnalyzingAttachmentId] = useState<string | null>(null);
  const [attachmentAnalyses, setAttachmentAnalyses] = useState<Record<string, string>>({});

  const fetchEmails = useCallback(
    async (query: string = "", showSpinner: boolean = true) => {
      if (showSpinner) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          includeMeta: "true",
          maxResults: "10",
        });

        if (query.trim()) {
          params.set("q", query.trim());
        }

        const response = await fetch(`/api/gmail/messages?${params.toString()}`, {
          headers: getAuthHeaders(),
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setEmails(Array.isArray(data?.messages) ? data.messages : []);
          return;
        }

        if (response.status === 401) {
          setError(t("inbox.token_expired"));
          checkStatus();
          return;
        }

        if (response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          setError(errorData.errorCode === "RECONNECT_REQUIRED" ? t("inbox.reconnect_required") : t("inbox.permission_denied"));
          checkStatus();
          return;
        }

        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || t("common.loading_failed"));
      } catch (fetchError) {
        console.error("Failed to fetch emails", fetchError);
        setError(t("common.network_error"));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [checkStatus, getAuthHeaders, t],
  );

  useEffect(() => {
    if (!isConnected) return;

    const timeoutId = window.setTimeout(() => {
      void fetchEmails(searchInput, false);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [fetchEmails, isConnected, searchInput]);

  const openEmail = useCallback(
    async (emailId: string) => {
      setSelectedEmailId(emailId);
      setDetailsError(null);

      if (emailDetailsById[emailId]) {
        return;
      }

      try {
        setIsDetailsLoading(true);
        const response = await fetch(`/api/gmail/messages/${emailId}`, {
          headers: getAuthHeaders(),
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 401) {
            setDetailsError(t("inbox.token_expired"));
            checkStatus();
            return;
          }
          if (response.status === 403) {
            setDetailsError(errorData.errorCode === "RECONNECT_REQUIRED" ? t("inbox.reconnect_required") : t("inbox.permission_denied"));
            checkStatus();
            return;
          }

          setDetailsError(errorData.message || t("inbox.detail_error"));
          return;
        }

        const data = (await response.json()) as EmailDetail;
        setEmailDetailsById((prev) => ({ ...prev, [emailId]: data }));
      } catch (detailError) {
        console.error("Failed to load email details", detailError);
        setDetailsError(t("common.network_error"));
      } finally {
        setIsDetailsLoading(false);
      }
    },
    [checkStatus, emailDetailsById, getAuthHeaders, t],
  );

  const handleDraftReply = async (emailId: string) => {
    try {
      setDraftingEmailId(emailId);

      const response = await fetch(`/api/gmail/messages/${emailId}/draft-reply-ai`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          language: i18n.language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData?.errorCode === "RECONNECT_REQUIRED") {
          throw new Error("RECONNECT_REQUIRED");
        }
        throw new Error(errorData?.error || "DRAFT_FAILED");
      }

      const draft = (await response.json()) as DraftPreview;
      setDraftPreviews((prev) => ({ ...prev, [emailId]: draft }));
      showToast(t("inbox.draft_created"), "success");
    } catch (draftError) {
      console.error("Failed to create Gmail draft reply", draftError);
      const message =
        draftError instanceof Error && draftError.message === "RECONNECT_REQUIRED"
          ? t("inbox.reconnect_required")
          : t("inbox.draft_error");
      showToast(message, "error");
      checkStatus();
    } finally {
      setDraftingEmailId(null);
    }
  };

  const handleAnalyzeAttachment = async (emailId: string, attachmentId: string | null) => {
    if (!attachmentId) return;

    try {
      setAnalyzingAttachmentId(attachmentId);
      const response = await fetch(
        `/api/gmail/messages/${emailId}/attachments/${attachmentId}?analyze=true&language=${encodeURIComponent(i18n.language)}`,
        {
          headers: getAuthHeaders(),
          credentials: "include",
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "ATTACHMENT_ANALYSIS_FAILED");
      }

      const payload = await response.json();
      setAttachmentAnalyses((prev) => ({
        ...prev,
        [attachmentId]: payload.analysis || "",
      }));
    } catch (analysisError) {
      console.error("Failed to analyze attachment", analysisError);
      showToast(t("inbox.attachment_analysis_error"), "error");
    } finally {
      setAnalyzingAttachmentId(null);
    }
  };

  const filteredEmails = useMemo(() => {
    return emails.filter((email) => {
      if (selectedFilter === "urgent") {
        return email.urgency === "high";
      }
      if (selectedFilter === "newsletters") {
        return email.category === "newsletters";
      }
      if (selectedFilter === "updates") {
        return email.category === "updates";
      }
      return true;
    });
  }, [emails, selectedFilter]);

  const selectedEmailSummary = selectedEmailId ? emails.find((email) => email.id === selectedEmailId) ?? null : null;
  const selectedEmail = selectedEmailId ? emailDetailsById[selectedEmailId] ?? null : null;
  const selectedDraft = selectedEmailId ? draftPreviews[selectedEmailId] ?? null : null;

  const badgeTextByFilter: Record<Exclude<InboxFilter, "all">, string> = {
    urgent: t("inbox.urgent_badge"),
    newsletters: t("inbox.newsletters_badge"),
    updates: t("inbox.updates_badge"),
  };

  return (
    <div className="flex flex-col h-full bg-background-dark text-slate-100 pb-24">
      <header className="sticky top-0 z-50 bg-background-dark/80 backdrop-blur-md pt-6">
        <div className="px-6 pb-2 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              if (selectedEmailId) {
                setSelectedEmailId(null);
                setDetailsError(null);
              }
            }}
            disabled={!selectedEmailId}
            aria-label={t("common.back")}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-lg font-bold tracking-tight text-center flex-1">{selectedEmailId ? t("inbox.message_title") : t("inbox.title")}</h2>
          <button
            onClick={() => {
              if (selectedEmailId) {
                void openEmail(selectedEmailId);
              } else {
                void fetchEmails(searchInput, false);
              }
            }}
            aria-label={t("inbox.refresh")}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/10 transition-colors relative"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing || isDetailsLoading ? "animate-spin" : ""}`} />
            {reconnectRequired && <span className="absolute top-2 right-2 w-2 h-2 bg-amber-400 rounded-full"></span>}
          </button>
        </div>
      </header>

      {!selectedEmailId && (
        <div className="px-6 pt-2 pb-4 space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">{t("inbox.action_items")}</h1>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t("inbox.search_placeholder")}
                className="w-full rounded-2xl border border-white/5 bg-surface-dark pl-11 pr-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary/40"
              />
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {(["all", "urgent", "newsletters", "updates"] as InboxFilter[]).map((filter) => {
              const isActive = selectedFilter === filter;
              const label =
                filter === "all"
                  ? t("inbox.filter_all")
                  : filter === "urgent"
                    ? t("inbox.filter_urgent")
                    : filter === "newsletters"
                      ? t("inbox.filter_newsletters")
                      : t("inbox.filter_updates");

              return (
                <button
                  key={filter}
                  onClick={() => setSelectedFilter(filter)}
                  className={`flex h-9 shrink-0 items-center justify-center px-5 rounded-full text-sm font-semibold transition-transform active:scale-95 ${
                    isActive
                      ? "bg-primary text-white shadow-lg shadow-primary/25"
                      : "bg-surface-dark border border-white/5 text-slate-400 hover:text-white hover:bg-surface-highlight transition-colors"
                  }`}
                >
                {label}
              </button>
            );
          })}
          </div>

          <ProductivitySnapshot compact maxTasks={2} maxDrafts={2} />
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 space-y-4 flex flex-col no-scrollbar">
        {isConnected === false ? (
          <div className="flex flex-col items-center justify-center text-center p-6 bg-surface-dark rounded-2xl border border-white/5 max-w-sm w-full mt-8 mx-auto">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <MailIcon className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t("inbox.connect_title")}</h3>
            <p className="text-sm text-slate-400 mb-6">{t("inbox.connect_description")}</p>
            <button
              onClick={() => connect()}
              className="w-full py-3 px-4 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t("common.signin_google")}
            </button>
          </div>
        ) : isConnected === null || isLoading ? (
          <div className="flex justify-center mt-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center text-center p-6 bg-surface-dark rounded-2xl border border-red-500/30 max-w-sm w-full mt-8 mx-auto">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <MailIcon className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{t("inbox.error_loading")}</h3>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => connect()}
                className="flex-1 py-2 px-4 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                {t("common.reconnect")}
              </button>
              <button onClick={() => void fetchEmails(searchInput, false)} className="flex-1 py-2 px-4 bg-surface-highlight rounded-lg text-sm hover:bg-white/10 transition-colors">
                {t("common.try_again")}
              </button>
            </div>
          </div>
        ) : selectedEmailId ? (
          <div className="pb-8">
            {reconnectRequired && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4">
                {t("inbox.reconnect_required")}
              </div>
            )}

            {isDetailsLoading && !selectedEmail ? (
              <div className="flex justify-center mt-10">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : detailsError ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-200">
                {detailsError}
              </div>
            ) : selectedEmail ? (
              <div className="space-y-4">
                <div className="rounded-3xl bg-surface-dark border border-white/5 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">{t("inbox.subject_label")}</p>
                      <h3 className="text-xl font-bold text-white leading-tight">{selectedEmail.subject || t("inbox.no_subject")}</h3>
                    </div>
                    {selectedEmailSummary?.urgency === "high" && (
                      <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-200">
                        {t("inbox.urgent_badge")}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div className="rounded-2xl bg-background-dark/60 border border-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1">{t("inbox.from_label")}</p>
                      <p className="text-slate-200 break-words">{selectedEmail.from}</p>
                    </div>
                    <div className="rounded-2xl bg-background-dark/60 border border-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1">{t("inbox.to_label")}</p>
                      <p className="text-slate-200 break-words">{selectedEmail.to || t("inbox.not_available")}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">{formatEmailDate(selectedEmail.date, i18n.language)}</p>

                  <div className="rounded-2xl bg-background-dark/60 border border-white/5 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-3">{t("inbox.message_body")}</p>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap break-words leading-7">
                      {selectedEmail.bodyText?.trim() || htmlToText(selectedEmail.bodyHtml) || selectedEmail.snippet || t("inbox.no_body")}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Paperclip className="w-4 h-4 text-slate-400" />
                      <span>{t("inbox.attachments_title")}</span>
                    </div>

                    {selectedEmail.attachments.length === 0 ? (
                      <div className="rounded-2xl border border-white/5 bg-background-dark/50 px-4 py-3 text-sm text-slate-400">
                        {t("inbox.no_attachments")}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedEmail.attachments.map((attachment) => (
                          <div key={attachment.attachmentId || attachment.filename} className="rounded-2xl border border-white/5 bg-background-dark/50 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white break-words">{attachment.filename}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                  {attachment.mimeType} - {Math.max(1, Math.round(attachment.size / 1024))} KB
                                </p>
                              </div>
                              <button
                                onClick={() => void handleAnalyzeAttachment(selectedEmail.id, attachment.attachmentId)}
                                disabled={!attachment.attachmentId || analyzingAttachmentId === attachment.attachmentId}
                                className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 border border-white/5 hover:bg-white/10 disabled:opacity-50"
                              >
                                <Sparkles className="w-4 h-4 text-primary" />
                                {analyzingAttachmentId === attachment.attachmentId ? t("inbox.analyzing_attachment") : t("inbox.analyze_attachment")}
                              </button>
                            </div>

                            {attachment.attachmentId && attachmentAnalyses[attachment.attachmentId] && (
                              <div className="mt-4 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-primary mb-2">{t("inbox.analysis_title")}</p>
                                <p className="text-sm text-slate-200 whitespace-pre-wrap break-words leading-7">
                                  {attachmentAnalyses[attachment.attachmentId]}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleDraftReply(selectedEmail.id)}
                    disabled={draftingEmailId === selectedEmail.id}
                    className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl text-sm font-semibold transition-colors w-full justify-center border border-white/5 disabled:opacity-60"
                  >
                    <Zap className="w-4 h-4 text-primary" />
                    {draftingEmailId === selectedEmail.id ? t("inbox.draft_creating") : t("inbox.draft_reply")}
                  </button>
                </div>

                {selectedDraft && (
                  <div className="rounded-3xl border border-primary/20 bg-primary/10 p-5 space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <Sparkles className="w-4 h-4" />
                      <p className="text-sm font-semibold">{t("inbox.draft_preview_title")}</p>
                    </div>
                    <div className="rounded-2xl bg-background-dark/60 border border-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1">{t("inbox.to_label")}</p>
                      <p className="text-sm text-slate-200 break-words">{selectedDraft.to}</p>
                    </div>
                    <div className="rounded-2xl bg-background-dark/60 border border-white/5 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1">{t("inbox.subject_label")}</p>
                      <p className="text-sm text-slate-200 break-words">{selectedDraft.subject}</p>
                    </div>
                    <div className="rounded-2xl bg-background-dark/60 border border-white/5 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-3">{t("inbox.draft_body_label")}</p>
                      <p className="text-sm text-slate-200 whitespace-pre-wrap break-words leading-7">
                        {htmlToText(selectedDraft.bodyHtml)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">{t("inbox.draft_ready_hint")}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/5 bg-surface-dark px-4 py-4 text-sm text-slate-400">
                {selectedEmailSummary?.snippet || t("inbox.detail_error")}
              </div>
            )}
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="text-center text-slate-400 mt-10 px-4">
            <p>{searchInput.trim() ? t("inbox.no_search_results") : t("inbox.empty")}</p>
          </div>
        ) : (
          <div className="space-y-4 pb-8">
            {reconnectRequired && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {t("inbox.reconnect_required")}
              </div>
            )}

            {filteredEmails.map((email) => (
              <button
                key={email.id}
                onClick={() => void openEmail(email.id)}
                className="group relative overflow-hidden rounded-2xl bg-surface-dark border border-white/5 p-4 transition-all hover:bg-surface-highlight text-left w-full"
              >
                <div className="flex items-start gap-4 mb-3">
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-indigo-500 to-purple-400 flex items-center justify-center font-bold text-lg text-white">
                      {email.from.charAt(0).toUpperCase()}
                    </div>
                    {email.unread && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary"></span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-3 mb-1">
                      <h3 className="text-base font-bold text-white truncate">{email.from}</h3>
                      <p className="text-xs text-slate-500 shrink-0">{formatEmailDate(email.date, i18n.language)}</p>
                    </div>
                    <p className="text-sm text-slate-300 font-medium leading-snug truncate">{email.subject || t("inbox.no_subject")}</p>
                  </div>
                </div>

                <div className="pl-16 relative z-10 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {email.urgency === "high" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-3 py-1 text-[11px] font-semibold text-red-200">
                        <AlertCircle className="w-3 h-3" />
                        {t("inbox.urgent_badge")}
                      </span>
                    )}
                    {email.category !== "general" && (
                      <span className="inline-flex items-center rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
                        {badgeTextByFilter[email.category]}
                      </span>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-background-dark/50 border border-white/5 backdrop-blur-sm">
                    <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">{email.snippet}</p>
                  </div>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDraftReply(email.id);
                    }}
                    disabled={draftingEmailId === email.id}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm font-semibold transition-colors w-full sm:w-auto justify-center sm:justify-start border border-white/5 disabled:opacity-60"
                  >
                    <Zap className="w-4 h-4 text-primary" />
                    {draftingEmailId === email.id ? t("inbox.draft_creating") : t("inbox.draft_reply")}
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
