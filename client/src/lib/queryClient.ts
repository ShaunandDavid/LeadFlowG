import { QueryClient } from "@tanstack/react-query";
import { getAuth } from "firebase/auth";

type QueryKey = [string, Record<string, unknown>?];

export interface ApiMutationArgs {
  path: string;
  method?: string;
  body?: unknown;
  params?: Record<string, unknown>;
}

async function getIdToken(): Promise<string | undefined> {
  const auth = getAuth();
  return auth.currentUser?.getIdToken?.();
}

export async function getCurrentIdToken(): Promise<string | undefined> {
  return getIdToken();
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = new URL(path, window.location.origin);
  if (params && typeof params === "object") {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function parseJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse JSON response", error);
    throw new Error("Invalid JSON response");
  }
}

async function authFetch(
  path: string,
  options: {
    method?: string;
    params?: Record<string, unknown>;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
) {
  const { method = "GET", params, body, signal } = options;
  const url = buildUrl(path, params);
  const idToken = await getIdToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const data = await parseJsonResponse(res);

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && (data as any).error) ||
      res.statusText ||
      "Request failed";
    throw new Error(message);
  }

  return data;
}

export async function apiQuery(path: string, params?: Record<string, unknown>, signal?: AbortSignal) {
  return authFetch(path, { params, signal });
}

export async function apiMutation({ path, method = "POST", body, params }: ApiMutationArgs) {
  return authFetch(path, { method, body, params });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey, signal }) => {
        const [path, params] = queryKey as QueryKey;
        if (typeof path !== "string") {
          throw new Error("queryKey[0] must be a string path");
        }
        return apiQuery(path, params, signal);
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
      retry: 2,
    },
    mutations: {
      retry: false,
    },
  },
});
