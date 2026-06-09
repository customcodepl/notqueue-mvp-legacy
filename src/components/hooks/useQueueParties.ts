import { useCallback, useEffect, useState } from "react";
import type { CreatePartyInput, Party, PartyListResponse } from "@/types";

async function fetchParties(signal?: AbortSignal): Promise<Party[]> {
  const response = await fetch("/api/parties", { credentials: "include", signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to load queue");
  }
  const data = (await response.json()) as PartyListResponse;
  return data.parties;
}

export function useQueueParties() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextParties = await fetchParties();
      setParties(nextParties);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const nextParties = await fetchParties(controller.signal);
        setParties(nextParties);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load queue");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  const addParty = useCallback(async (input: CreatePartyInput) => {
    const response = await fetch("/api/parties", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to add party");
    }

    const nextParties = await fetchParties();
    setParties(nextParties);
    setError(null);
  }, []);

  return { parties, loading, error, refresh, addParty };
}
