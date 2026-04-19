"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";

/**
 * tRPC URL: use same-origin /api/trpc proxy (Next.js rewrites) so that
 * HttpOnly session cookies are forwarded automatically. The Next.js server
 * proxies to the real API via the rewrite rule in next.config.ts.
 */
function getTrpcUrl(): string {
  if (typeof window !== "undefined") {
    // Client-side: same-origin proxy path
    return "/api/trpc";
  }
  // Server-side: call the API directly
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
  return `${apiUrl}/trpc`;
}

function TRPCWrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: getTrpcUrl(),
          fetch(url, options) {
            return fetch(url, { ...options, credentials: "include" });
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <SessionProvider>
      <TRPCWrapper>{children}</TRPCWrapper>
    </SessionProvider>
  );
}
