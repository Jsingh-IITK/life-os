import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Session state for the whole app.
 *
 * `loading` is deliberately distinct from "no session": during the first tick
 * the stored session has not been read yet, and treating that as signed-out
 * bounces an already-authenticated user to the sign-in screen on every launch.
 */
interface SessionState {
  session: Session | null;
  loading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    let active = true;

    // Restore whatever is in storage before subscribing, so the first paint
    // already reflects a persisted session.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState({ session: data.session, loading: false });
      })
      .catch(() => {
        // A failure to read storage is not a session; proceed as signed out
        // rather than leaving the app stuck behind a loading overlay.
        if (active) setState({ session: null, loading: false });
      });

    // Bounded wait. If storage never answers — a wedged adapter, a blocked
    // origin — the app must still become usable rather than sitting on the
    // splash forever. Signing in again is a far better failure than a page
    // that never resolves.
    const timeout = setTimeout(() => {
      if (active) setState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
    }, 5000);

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      // Covers sign-in, sign-out, token refresh and user updates.
      setState({ session, loading: false });
    });

    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** The signed-in user's id, or null. Never read a user id from anywhere else. */
export function useUserId(): string | null {
  return useSession().session?.user.id ?? null;
}
