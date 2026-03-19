import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Supabase getSession error:", error.message);

        // Handle refresh token errors gracefully
        if (error.message.includes('Refresh Token Not Found') ||
            error.message.includes('refresh token') ||
            error.message.includes('expired')) {
          console.warn("Session expired, signing out user...");
          // Sign out but don't wait - we want to clear local state regardless
          supabase.auth.signOut().catch(signOutError => {
            console.error("Error during sign out after token error:", signOutError);
          }).finally(() => {
            setSession(null);
            setUser(null);
            setIsLoading(false);
          });
          return;
        }

        console.error("Unhandled getSession error:", error);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    }).catch((err) => {
      console.error("Supabase getSession catch:", err);
      // Still set loading to false to prevent infinite loading
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);

      // Handle token refresh errors
      if (event === 'TOKEN_REFRESHED') {
        console.log("Token refreshed successfully");
      }

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        // No need to clear localStorage - all data is now in Supabase
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error during sign out:", error);
    } finally {
      // Clear local session data
      setSession(null);
      setUser(null);
      // No need to clear localStorage - all data is now in Supabase
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
