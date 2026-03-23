import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function GoogleCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDescription || t("google_callback.auth_failed"));
      setTimeout(() => {
        navigate("/?error=google_auth_failed");
      }, 3000);
      return;
    }

    if (code) {
      setStatus("success");
      setMessage(t("google_callback.success_description"));
      setTimeout(() => {
        navigate("/?google_connected=true");
      }, 2000);
      return;
    }

    setStatus("error");
    setMessage(t("google_callback.no_code"));
    setTimeout(() => {
      navigate("/?error=google_auth_failed");
    }, 3000);
  }, [navigate, searchParams, t]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background-dark text-white p-6">
      <div className="max-w-sm w-full text-center">
        {status === "processing" && (
          <>
            <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">{t("google_callback.processing_title")}</h1>
            <p className="text-slate-400">{t("google_callback.processing_description")}</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">{t("google_callback.success_title")}</h1>
            <p className="text-slate-400 mb-4">{message}</p>
            <p className="text-sm text-slate-500">{t("google_callback.redirecting")}</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">{t("google_callback.error_title")}</h1>
            <p className="text-slate-400 mb-4">{message}</p>
            <p className="text-sm text-slate-500">{t("google_callback.redirecting")}</p>
          </>
        )}
      </div>
    </div>
  );
}
