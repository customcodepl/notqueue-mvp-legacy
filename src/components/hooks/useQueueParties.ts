import { useCallback, useEffect, useState } from "react";
import type { CreatePartyInput, Party, PartyListResponse } from "@/types";

interface PartyLists {
  waiting: Party[];
  ready: Party[];
}

async function parseErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Request failed";
}

async function fetchPartyLists(signal?: AbortSignal): Promise<PartyLists> {
  const response = await fetch("/api/parties", { credentials: "include", signal });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const data = (await response.json()) as PartyListResponse;
  return { waiting: data.waiting, ready: data.ready };
}

export function useQueueParties() {
  const [waiting, setWaiting] = useState<Party[]>([]);
  const [ready, setReady] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyLists = useCallback((lists: PartyLists) => {
    setWaiting(lists.waiting);
    setReady(lists.ready);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lists = await fetchPartyLists();
      applyLists(lists);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [applyLists]);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const lists = await fetchPartyLists(controller.signal);
        applyLists(lists);
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
  }, [applyLists]);

  const refreshLists = useCallback(async () => {
    const lists = await fetchPartyLists();
    applyLists(lists);
    setError(null);
  }, [applyLists]);

  const addParty = useCallback(
    async (input: CreatePartyInput) => {
      const response = await fetch("/api/parties", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      await refreshLists();
    },
    [refreshLists],
  );

  const advanceQueue = useCallback(async () => {
    const response = await fetch("/api/parties/advance", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    await refreshLists();
  }, [refreshLists]);

  const updateEta = useCallback(
    async (partyId: string, etaMinutes: number | null) => {
      const response = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eta_minutes: etaMinutes }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      await refreshLists();
    },
    [refreshLists],
  );

  const markReady = useCallback(
    async (partyId: string) => {
      const response = await fetch(`/api/parties/${partyId}/ready`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      await refreshLists();
    },
    [refreshLists],
  );

  const seatParty = useCallback(
    async (partyId: string) => {
      const response = await fetch(`/api/parties/${partyId}/seat`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      await refreshLists();
    },
    [refreshLists],
  );

  return {
    waiting,
    ready,
    loading,
    error,
    refresh,
    addParty,
    advanceQueue,
    updateEta,
    markReady,
    seatParty,
  };
}
