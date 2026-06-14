import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestTokenResponse } from "@/types";

async function parseGuestTokenResponse(response: Response): Promise<GuestTokenResponse> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Request failed");
  }
  return (await response.json()) as GuestTokenResponse;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export function useGuestToken(partyId: string | null) {
  const [data, setData] = useState<GuestTokenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abortInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    abortInFlight();

    if (!partyId) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/parties/${partyId}/guest-token`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (response.status === 404) {
          setData(null);
          return;
        }

        const tokenData = await parseGuestTokenResponse(response);
        setData(tokenData);
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load guest token");
        setData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [partyId, abortInFlight]);

  const issueToken = useCallback(async () => {
    if (!partyId) {
      return;
    }

    abortInFlight();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/parties/${partyId}/guest-token`, {
        method: "POST",
        credentials: "include",
      });
      const tokenData = await parseGuestTokenResponse(response);
      setData(tokenData);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to issue guest token");
    } finally {
      setLoading(false);
    }
  }, [partyId, abortInFlight]);

  return { data, loading, error, issueToken, setError };
}
