"use client";

import { useMutation, useQuery, useQueryClient, type MutationFunctionContext } from "@tanstack/react-query";
import type { LoginRequest } from "@just4kids/contracts";
import { ApiError, apiRequest } from "./client";
import type { Session } from "./types";

export const sessionKey = ["session"] as const;

/** The signed-in session, or `null` when signed out. The CSRF token for writes lives here. */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async ({ signal }) => {
      try {
        return await apiRequest<Session>("/auth/session", { signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginRequest) => {
      const { csrfToken } = await apiRequest<{ csrfToken: string }>("/auth/csrf");
      return apiRequest<Session>("/auth/login", { method: "POST", body: input, csrfToken });
    },
    onSuccess: session => {
      queryClient.clear();
      queryClient.setQueryData(sessionKey, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>("/auth/logout", { method: "POST", csrfToken: queryClient.getQueryData<Session | null>(sessionKey)?.csrfToken }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(sessionKey, null);
    },
  });
}

/**
 * A write request that carries the current session's CSRF token.
 * `invalidate` lists query keys refreshed after success.
 */
export function useApiMutation<Input, Output>(
  request: (input: Input, csrfToken: string | undefined) => Promise<Output>,
  options: { invalidate?: (output: Output, input: Input) => readonly (readonly unknown[])[]; onSuccess?: (output: Output, input: Input, context: MutationFunctionContext) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => request(input, queryClient.getQueryData<Session | null>(sessionKey)?.csrfToken),
    onSuccess: async (output, input, _result, context) => {
      await Promise.all((options.invalidate?.(output, input) ?? []).map(queryKey => queryClient.invalidateQueries({ queryKey })));
      options.onSuccess?.(output, input, context);
    },
  });
}
