import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createSessionHandler } from "./auth-session";

type AuthValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthValue>({ session: null, user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = createSessionHandler<Session>(queryClient, (next) => {
      setSession(next);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      handler.onAuthEvent(next);
    });
    void handler.hydrate(supabase.auth.getSession().then(({ data }) => data.session));
    return () => {
      handler.dispose();
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
