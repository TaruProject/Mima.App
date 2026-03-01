import { Outlet, Link, useLocation } from "react-router-dom";
import { Plus, MessageSquare, Calendar as CalendarIcon, Mail, User } from "lucide-react";
import clsx from "clsx";

export default function Layout() {
  const location = useLocation();

  const navItems = [
    { path: "/", icon: MessageSquare, label: "Chat" },
    { path: "/calendar", icon: CalendarIcon, label: "Calendar" },
    { path: "/inbox", icon: Mail, label: "Inbox" },
    { path: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto w-full bg-background-dark shadow-2xl overflow-hidden border-x border-white/5 relative">
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <Outlet />
      </main>

      <nav className="shrink-0 border-t border-white/5 bg-background-dark/95 backdrop-blur-xl pb-6 pt-2 z-50">
        <div className="flex justify-around items-end px-2">
          {navItems.slice(0, 2).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                "group flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                location.pathname === item.path ? "text-primary" : "text-slate-500 hover:text-white"
              )}
            >
              <div
                className={clsx(
                  "relative flex items-center justify-center h-10 w-16 rounded-2xl transition-all",
                  location.pathname === item.path ? "bg-primary/10" : "group-hover:bg-surface-highlight"
                )}
              >
                <item.icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
            </Link>
          ))}

          {/* FAB / Center Action */}
          <div className="relative -top-6">
            <button className="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/40 text-white transition-transform active:scale-95 border-4 border-background-dark">
              <Plus className="w-8 h-8" />
            </button>
          </div>

          {navItems.slice(2).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                "group flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                location.pathname === item.path ? "text-primary" : "text-slate-500 hover:text-white"
              )}
            >
              <div
                className={clsx(
                  "relative flex items-center justify-center h-10 w-16 rounded-2xl transition-all",
                  location.pathname === item.path ? "bg-primary/10" : "group-hover:bg-surface-highlight"
                )}
              >
                <item.icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
