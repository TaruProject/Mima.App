import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Wrapper to use translation hook in class component
const withTranslation = (Component: any) => {
  return function WrappedComponent(props: any) {
    const { t } = useTranslation();
    return <Component {...props} t={t} />;
  };
};

interface Props {
  children?: ReactNode;
  t?: (key: string) => string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const t = this.props.t || ((key: string) => key);
      
      return (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background-dark text-slate-100 p-6">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-center text-white">
            {t('common.error_boundary_title') || "Oops! Something went wrong"}
          </h1>
          <p className="text-slate-400 text-center mb-8 max-w-sm">
            {t('common.error_boundary_description') || "We're sorry, but an unexpected error occurred. Please try reloading the page."}
          </p>
          
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-lg shadow-primary/25 active:scale-95"
          >
            <RefreshCw className="w-5 h-5" />
            {t('common.reload_page') || "Reload page"}
          </button>
          
          {import.meta.env.MODE !== 'production' && this.state.error && (
            <div className="mt-12 p-4 bg-black/50 border border-red-500/20 rounded-xl max-w-2xl w-full overflow-auto">
              <p className="text-red-400 font-mono text-sm mb-2">{this.state.error.message}</p>
              <pre className="text-slate-500 font-mono text-xs whitespace-pre-wrap">
                {this.state.error.stack}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation(ErrorBoundary);
