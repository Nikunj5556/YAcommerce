import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

interface CustomerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  profile_image: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  customer: CustomerProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  customer: null,
  loading: true,
  signOut: async () => {},
  refreshCustomer: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomer = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, full_name, email, phone, phone_verified, email_verified, profile_image")
      .eq("user_id", userId)
      .maybeSingle();
    setCustomer(data);
  }, []);

  const refreshCustomer = useCallback(async () => {
    if (user?.id) {
      await fetchCustomer(user.id);
    }
  }, [user?.id, fetchCustomer]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user || null);
      if (s?.user?.id) {
        fetchCustomer(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user || null);
      if (s?.user?.id) {
        fetchCustomer(s.user.id);
      } else {
        setCustomer(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchCustomer]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setCustomer(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, customer, loading, signOut, refreshCustomer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
