import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { GuestPartyView } from "@/types";

const POLL_INTERVAL_MS = 30_000;
const INVALID_LINK_MESSAGE = "This link is invalid or has expired.";
const UNAVAILABLE_MESSAGE = "Service is temporarily unavailable.";

export function useGuestPartyView(token: string, initialData: GuestPartyView | null = null) {
  const [data, setData] = useState<GuestPartyView | null>(initialData);
  const [loading, setLoading] = useState(initialData === null);
  const [error, setError] = useState<string | null>(null);
  const pollingStoppedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadViewRef = useRef<(() => Promise<void>) | null>(null);

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (loadView: () => Promise<void>) => {
      clearPolling();
      if (pollingStoppedRef.current) {
        return;
      }

      intervalRef.current = setInterval(() => {
        void loadView();
      }, POLL_INTERVAL_MS);
    },
    [clearPolling],
  );

  useEffect(() => {
    pollingStoppedRef.current = false;

    async function loadView() {
      if (pollingStoppedRef.current) {
        return;
      }

      const supabase = createBrowserClient();
      if (!supabase) {
        pollingStoppedRef.current = true;
        clearPolling();
        setError(UNAVAILABLE_MESSAGE);
        setLoading(false);
        return;
      }

      const response = await supabase.rpc("get_guest_party_view", { p_token: token });

      if (response.error || response.data === null) {
        pollingStoppedRef.current = true;
        clearPolling();
        setError(INVALID_LINK_MESSAGE);
        setLoading(false);
        return;
      }

      setData(response.data as GuestPartyView);
      setError(null);
      setLoading(false);
    }

    loadViewRef.current = loadView;

    void loadView();
    startPolling(loadView);

    function handleVisibilityChange() {
      if (document.hidden) {
        clearPolling();
        return;
      }

      void loadView();
      startPolling(loadView);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearPolling, startPolling, token]);

  const refresh = useCallback(async () => {
    if (loadViewRef.current) {
      await loadViewRef.current();
    }
  }, []);

  return { data, loading, error, refresh };
}
