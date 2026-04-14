import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({
  session: null,
  user: null,
  customer: null,
  loading: true,
  signOut: async () => {},
  refreshCustomer: async () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomer = useCallback(async (userId) => {
    try {
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, last_name, full_name, email, phone, phone_verified, email_verified, profile_image')
        .eq('user_id', userId)
        .maybeSingle();
      setCustomer(data);
    } catch (e) {
      console.error('Fetch customer error:', e);
    }
  }, []);

  const refreshCustomer = useCallback(async () => {
    if (user?.id) await fetchCustomer(user.id);
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
