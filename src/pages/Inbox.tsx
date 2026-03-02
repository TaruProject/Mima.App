import { ArrowLeft, Settings, Mail as MailIcon, Zap } from "lucide-react";
import { useState, useEffect } from "react";

export default function Inbox() {
  const [isConnected, setIsConnected] = useState(false);
  const [emails, setEmails] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Allow messages from same origin, AI Studio preview, or the production domain
      if (!event.origin.endsWith('.run.app') && !event.origin.includes('localhost') && !event.origin.includes('mima-app.com')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsConnected(true);
        fetchEmails();
      }
    };
    window.addEventListener('message', handleMessage);
    
    // Check initial status
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        setIsConnected(data.isConnected);
        if (data.isConnected) fetchEmails();
      })
      .catch(err => console.error("Error checking auth status", err));
      
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchEmails = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/gmail/messages');
      if (res.ok) {
        const data = await res.json();
        setEmails(data);
      } else if (res.status === 401) {
        setIsConnected(false);
      }
    } catch (error) {
      console.error("Failed to fetch emails", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      const authWindow = window.open(
        '',
        'oauth_popup',
        'width=600,height=700'
      );
      
      if (!authWindow) {
        alert('Please allow popups for this site to connect your account.');
        return;
      }

      const response = await fetch('/api/auth/url');
      if (!response.ok) {
        authWindow.close();
        throw new Error('Failed to get auth URL');
      }
      const { url } = await response.json();
      
      authWindow.location.href = url;
    } catch (error) {
      console.error('OAuth error:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-dark text-slate-100 pb-24">
      <header className="sticky top-0 z-50 bg-background-dark/80 backdrop-blur-md pt-6">
        <div className="px-6 pb-2 flex items-center justify-between">
          <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-lg font-bold tracking-tight text-center flex-1">Mima Inbox</h2>
          <button className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/10 transition-colors relative">
            <Settings className="w-6 h-6" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full"></span>
          </button>
        </div>
        <div className="px-6 pt-2 pb-4">
          <h1 className="text-3xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">Action Items</h1>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            <button className="flex h-9 shrink-0 items-center justify-center px-5 rounded-full bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/25 transition-transform active:scale-95">
              All
            </button>
            <button className="flex h-9 shrink-0 items-center justify-center px-5 rounded-full bg-surface-dark border border-white/5 text-slate-400 hover:text-white hover:bg-surface-highlight transition-colors active:scale-95">
              Urgent
            </button>
            <button className="flex h-9 shrink-0 items-center justify-center px-5 rounded-full bg-surface-dark border border-white/5 text-slate-400 hover:text-white hover:bg-surface-highlight transition-colors active:scale-95">
              Newsletters
            </button>
            <button className="flex h-9 shrink-0 items-center justify-center px-5 rounded-full bg-surface-dark border border-white/5 text-slate-400 hover:text-white hover:bg-surface-highlight transition-colors active:scale-95">
              Updates
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 space-y-4 flex flex-col">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center text-center p-6 bg-surface-dark rounded-2xl border border-white/5 max-w-sm w-full mt-8 mx-auto">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <MailIcon className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Connect Gmail</h3>
            <p className="text-sm text-slate-400 mb-6">
              Link your Google account to allow Mima to read, summarize, and draft replies to your emails.
            </p>
            <button 
              onClick={handleConnect}
              className="w-full py-3 px-4 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center mt-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : emails.length === 0 ? (
          <div className="text-center text-slate-400 mt-10">
            <p>Your inbox is empty.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {emails.map((email) => (
              <div key={email.id} className="group relative overflow-hidden rounded-2xl bg-surface-dark border border-white/5 p-4 transition-all hover:bg-surface-highlight">
                <div className="flex items-start gap-4 mb-3">
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-indigo-500 to-purple-400 flex items-center justify-center font-bold text-lg text-white">
                      {email.from.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-base font-bold text-white truncate">{email.from}</h3>
                    </div>
                    <p className="text-sm text-slate-300 font-medium leading-snug truncate">{email.subject}</p>
                  </div>
                </div>
                <div className="pl-16 relative z-10">
                  <div className="p-3 rounded-xl bg-background-dark/50 border border-white/5 backdrop-blur-sm mb-3">
                    <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">
                      {email.snippet}
                    </p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm font-semibold transition-colors w-full sm:w-auto justify-center sm:justify-start border border-white/5">
                    <Zap className="w-4 h-4 text-primary" />
                    Draft Reply with Mima
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
