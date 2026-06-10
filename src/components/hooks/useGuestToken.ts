import { useCallback, useState } from "react";
import type { GuestTokenResponse } from "@/types";

async function parseGuestTokenResponse(response: Response): Promise<GuestTokenResponse> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Request failed");
  }
  return (await response.json()) as GuestTokenResponse;
}

export function useGuestToken(partyId: string | null) {
  const [data, setData] = useState<GuestTokenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveToken = useCallback(async () => {
    if (!partyId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/parties/${partyId}/guest-token`, {
        credentials: "include",
      });

      if (response.status === 404) {
        setData(null);
        return;
      }

      const tokenData = await parseGuestTokenResponse(response);
      setData(tokenData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load guest token");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  const issueToken = useCallback(async () => {
    if (!partyId) {
      return;
    }

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
      setError(err instanceof Error ? err.message : "Failed to issue guest token");
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  return { data, loading, error, fetchActiveToken, issueToken, setError };
}
