"use client";

import { useState, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Direction } from "radix-ui";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/client";
import { sessionKey } from "@/lib/api/session";

const staleBookingCodes = new Set(["VISIT_CONFLICT", "BOOKING_CONFLICT", "PAYMENT_CONFLICT", "INVALID_VISIT_TRANSITION", "BOOKING_EDIT_NOT_ALLOWED", "PAYMENT_ALREADY_RECORDED", "RECONCILIATION_REQUIRED", "RECONCILIATION_MISMATCH"]);

function createQueryClient() {
  // An expired or revoked session anywhere signs the user out, which sends them to the login page.
  const handleError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(sessionKey, null);
  };
  // Someone else changed the booking first: reload it so the next attempt uses the current version.
  const handleMutationError = (error: unknown) => {
    handleError(error);
    if (error instanceof ApiError && staleBookingCodes.has(error.code)) void queryClient.invalidateQueries({ queryKey: ["bookings"] });
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleMutationError }),
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
  return queryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Direction.Provider dir="rtl">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster position="top-center" dir="rtl" closeButton />
          </TooltipProvider>
        </QueryClientProvider>
      </Direction.Provider>
    </ThemeProvider>
  );
}
