import { useCallback, useEffect, useState } from "react";
import type { UpdateVenueSettingsInput, VenueSettings, VenueSettingsResponse } from "@/types";

async function parseErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Request failed";
}

export function useVenueSettings() {
  const [settings, setSettings] = useState<VenueSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/venue/settings", { credentials: "include" });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
      const data = (await response.json()) as VenueSettingsResponse;
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load venue settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/venue/settings", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await parseErrorMessage(response));
        }
        const data = (await response.json()) as VenueSettingsResponse;
        setSettings(data.settings);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load venue settings");
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();

    return () => {
      controller.abort();
    };
  }, []);

  const updateSettings = useCallback(async (input: UpdateVenueSettingsInput) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/venue/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const data = (await response.json()) as VenueSettingsResponse;
      setSettings(data.settings);
      return data.settings;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save venue settings";
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, error, saving, updateSettings, refresh };
}
