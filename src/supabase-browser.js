import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const publishableKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

export const hasSupabaseBrowserConfig = Boolean(supabaseUrl && publishableKey);

const SUPABASE_REFRESH_RETRY_DELAYS_MS = [700, 1600];

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildSupabaseFetch(baseFetch) {
  return async (input, init) => {
    const requestUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
    const parsedUrl = requestUrl ? new URL(requestUrl, window.location.origin) : null;
    const isRefreshTokenRequest =
      Boolean(parsedUrl) &&
      parsedUrl.origin === supabaseUrl &&
      parsedUrl.pathname === "/auth/v1/token" &&
      parsedUrl.searchParams.get("grant_type") === "refresh_token";

    const performFetch = () =>
      baseFetch(input instanceof Request ? input.clone() : input, init);

    if (!isRefreshTokenRequest) {
      return performFetch();
    }

    let lastError = null;

    for (let attempt = 0; attempt <= SUPABASE_REFRESH_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await performFetch();
        if (![502, 503, 504].includes(response.status)) {
          return response;
        }

        lastError = new Error(`Supabase auth refresh failed with ${response.status}`);
        if (attempt === SUPABASE_REFRESH_RETRY_DELAYS_MS.length) {
          return response;
        }
      } catch (error) {
        lastError = error;
        if (attempt === SUPABASE_REFRESH_RETRY_DELAYS_MS.length) {
          throw error;
        }
      }

      console.warn("[auth] retrying Supabase token refresh", {
        attempt: attempt + 1,
        reason: lastError?.message || "unknown"
      });
      await wait(SUPABASE_REFRESH_RETRY_DELAYS_MS[attempt]);
    }

    throw lastError || new Error("Supabase auth refresh failed");
  };
}

export const supabase = hasSupabaseBrowserConfig
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true
      },
      global: {
        fetch: buildSupabaseFetch(globalThis.fetch.bind(globalThis))
      }
    })
  : null;
