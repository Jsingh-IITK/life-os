import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Server state lives here; Zustand is for local UI state only.
 *
 * The client is created inside a component rather than at module scope so it
 * is not shared across requests during static rendering, which would leak one
 * user's cached data into another's page.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Financial figures should not refetch on every focus change, but
            // they must not go stale enough to show yesterday's balance.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
