import { ChevronLeft, ChevronRight, Search, Calendar as CalendarIcon, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { format, parseISO, isToday } from "date-fns";

export default function Calendar() {
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Allow messages from same origin or AI Studio preview
      if (!event.origin.endsWith('.run.app') && !event.origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsConnected(true);
        fetchEvents();
      }
    };
    window.addEventListener('message', handleMessage);
    
    // Check initial status
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        setIsConnected(data.isConnected);
        if (data.isConnected) fetchEvents();
      })
      .catch(err => console.error("Error checking auth status", err));
      
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/calendar/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      } else if (res.status === 401) {
        setIsConnected(false);
      }
    } catch (error) {
      console.error("Failed to fetch events", error);
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
    <div className="flex flex-col h-full bg-background-dark text-slate-100">
      <header className="flex items-center justify-between px-6 pt-12 pb-4 bg-background-dark z-20 sticky top-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-highlight text-white hover:bg-primary/20 transition-colors">
            <Search className="w-5 h-5" />
          </button>
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold border-2 border-surface-highlight">
              A
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background-dark rounded-full"></div>
          </div>
        </div>
      </header>

      <div className="px-4 pb-2">
        <div className="bg-surface-dark rounded-2xl p-4 shadow-lg border border-surface-highlight/50">
          <div className="flex items-center justify-between mb-4 px-2">
            <button className="text-text-secondary hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold">Today</h2>
            <button className="text-text-secondary hover:text-white transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-2 mb-2">
            {['S','M','T','W','T','F','S'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-text-secondary uppercase tracking-wider">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 justify-items-center">
            <div className="h-8 w-8"></div><div className="h-8 w-8"></div><div className="h-8 w-8"></div>
            {[1,2,3,4].map(d => (
              <button key={d} className="h-9 w-9 flex items-center justify-center rounded-full text-sm text-text-secondary hover:bg-surface-highlight transition-colors">{d}</button>
            ))}
            <button className="h-9 w-9 flex items-center justify-center rounded-full text-sm font-bold bg-primary text-white shadow-md shadow-primary/30">5</button>
            {[6,7,8].map(d => (
              <button key={d} className="h-9 w-9 flex items-center justify-center rounded-full text-sm text-white hover:bg-surface-highlight transition-colors">{d}</button>
            ))}
            <button className="h-9 w-9 flex items-center justify-center rounded-full text-sm text-white hover:bg-surface-highlight transition-colors relative">
              9
            </button>
            {[10,11,12,13].map(d => (
              <button key={d} className="h-9 w-9 flex items-center justify-center rounded-full text-sm text-white hover:bg-surface-highlight transition-colors">{d}</button>
            ))}
            <button className="h-9 w-9 flex items-center justify-center rounded-full text-sm text-white hover:bg-surface-highlight transition-colors relative">
              14
            </button>
          </div>
          <div className="flex justify-center mt-2">
            <div className="h-1 w-12 bg-surface-highlight rounded-full"></div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0 custom-scrollbar pb-32 flex flex-col">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center text-center p-6 bg-surface-dark rounded-2xl border border-white/5 max-w-sm w-full mt-8 mx-auto">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <CalendarIcon className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Connect Google Calendar</h3>
            <p className="text-sm text-slate-400 mb-6">
              Link your Google account to allow Mima to manage your schedule, create events, and find free time.
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
        ) : events.length === 0 ? (
          <div className="text-center text-slate-400 mt-10">
            <p>No upcoming events found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event, index) => {
              const start = event.start.dateTime || event.start.date;
              const end = event.end.dateTime || event.end.date;
              const isAllDay = !event.start.dateTime;
              
              const startTime = isAllDay ? "All Day" : format(parseISO(start), "hh:mm a");
              const endTime = isAllDay ? "" : format(parseISO(end), "hh:mm a");
              const dateLabel = isToday(parseISO(start)) ? "Today" : format(parseISO(start), "MMM d");

              return (
                <div key={event.id} className="flex gap-4 group">
                  <div className="flex flex-col items-center pt-1">
                    <div className="text-text-secondary text-xs font-medium w-12 text-right">
                      {isAllDay ? dateLabel : format(parseISO(start), "HH:mm")}
                    </div>
                    {index !== events.length - 1 && (
                      <div className="h-full w-[2px] bg-surface-highlight mt-2 relative">
                        <div className="absolute -top-1 -left-[5px] w-3 h-3 rounded-full border-2 border-primary bg-background-dark z-10"></div>
                      </div>
                    )}
                    {index === events.length - 1 && (
                      <div className="h-full w-[2px] bg-transparent mt-2 relative">
                        <div className="absolute -top-1 -left-[5px] w-3 h-3 rounded-full border-2 border-primary bg-background-dark z-10"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="bg-surface-dark p-4 rounded-xl border-l-4 border-primary hover:bg-surface-highlight transition-all cursor-pointer shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-base">{event.summary || "Busy"}</h3>
                        <Clock className="text-primary w-4 h-4" />
                      </div>
                      <p className="text-sm text-text-secondary mb-2">
                        {startTime} {endTime ? `- ${endTime}` : ''}
                      </p>
                      {event.location && (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-highlight text-text-secondary truncate max-w-[200px]">
                            {event.location}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
