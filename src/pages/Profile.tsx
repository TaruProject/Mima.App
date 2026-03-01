import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, Settings, Shield, Bell } from 'lucide-react';

export default function Profile() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex flex-col h-full bg-background-dark text-slate-100 pb-24">
      <header className="sticky top-0 z-50 bg-background-dark/80 backdrop-blur-md pt-12 pb-4 px-6">
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <div className="bg-surface-dark rounded-3xl p-6 border border-white/5 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-primary/20 to-purple-500/20"></div>
          
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center mb-4 border-4 border-background-dark shadow-xl">
            <span className="text-3xl font-bold text-white">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          
          <h2 className="text-xl font-bold text-white mb-1">{user?.email}</h2>
          <p className="text-sm text-slate-400 mb-6">Mima User</p>
          
          <button className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold transition-colors border border-white/10 flex items-center justify-center gap-2">
            <Settings className="w-4 h-4" />
            Edit Profile
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2 mb-3">Account Settings</h3>
          
          <button className="w-full flex items-center justify-between p-4 bg-surface-dark hover:bg-surface-highlight rounded-2xl border border-white/5 transition-colors group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <Bell className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-200">Notifications</span>
            </div>
          </button>

          <button className="w-full flex items-center justify-between p-4 bg-surface-dark hover:bg-surface-highlight rounded-2xl border border-white/5 transition-colors group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                <Shield className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-200">Privacy & Security</span>
            </div>
          </button>
        </div>

        <div className="pt-4">
          <button 
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 p-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl border border-red-500/20 transition-colors font-bold"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}
