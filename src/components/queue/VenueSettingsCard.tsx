import { useState } from "react";
import type { SubmitEvent } from "react";
import { ExternalLink, FileText, Save } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { useVenueSettings } from "@/components/hooks/useVenueSettings";
import { Button } from "@/components/ui/button";
import type { UpdateVenueSettingsInput } from "@/types";
import { cn } from "@/lib/utils";

const INFO_TEXT_MAX_LENGTH = 500;

function VenueSettingsForm({
  initialMenuLink,
  initialInfoText,
  saving,
  loadError,
  onSave,
}: {
  initialMenuLink: string;
  initialInfoText: string;
  saving: boolean;
  loadError: string | null;
  onSave: (input: UpdateVenueSettingsInput) => Promise<void>;
}) {
  const [menuLink, setMenuLink] = useState(initialMenuLink);
  const [infoText, setInfoText] = useState(initialInfoText);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaved(false);

    const trimmedMenu = menuLink.trim();
    const trimmedInfo = infoText.trim();

    if (trimmedInfo.length > INFO_TEXT_MAX_LENGTH) {
      setSaveError(`Info text must be ${INFO_TEXT_MAX_LENGTH} characters or fewer`);
      return;
    }

    try {
      await onSave({
        menu_link: trimmedMenu === "" ? null : trimmedMenu,
        info_text: trimmedInfo === "" ? null : trimmedInfo,
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save venue settings");
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="menu_link" className="mb-1 block text-sm text-blue-100/80">
          Menu link
        </label>
        <div className="relative">
          <ExternalLink
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-blue-100/50"
            aria-hidden="true"
          />
          <input
            id="menu_link"
            name="menu_link"
            type="url"
            value={menuLink}
            placeholder="https://example.com/menu"
            disabled={saving}
            onChange={(e) => {
              setMenuLink(e.target.value);
              setSaved(false);
            }}
            className={cn(
              "w-full rounded-lg border border-white/20 bg-white/10 py-2 pr-3 pl-10 text-white",
              "placeholder:text-blue-100/40 focus:border-purple-400/50 focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        </div>
      </div>

      <div>
        <label htmlFor="info_text" className="mb-1 block text-sm text-blue-100/80">
          Info text
        </label>
        <div className="relative">
          <FileText className="pointer-events-none absolute top-3 left-3 size-4 text-blue-100/50" aria-hidden="true" />
          <textarea
            id="info_text"
            name="info_text"
            value={infoText}
            rows={3}
            maxLength={INFO_TEXT_MAX_LENGTH}
            placeholder="e.g. Please remain nearby while you wait."
            disabled={saving}
            onChange={(e) => {
              setInfoText(e.target.value);
              setSaved(false);
            }}
            className={cn(
              "w-full resize-y rounded-lg border border-white/20 bg-white/10 py-2 pr-3 pl-10 text-white",
              "placeholder:text-blue-100/40 focus:border-purple-400/50 focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        </div>
      </div>

      <ServerError message={loadError ?? saveError} />

      {saved && (
        <p className="text-sm text-emerald-300" role="status">
          Saved
        </p>
      )}

      <Button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {saving ? (
          <span className="flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Saving…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save className="size-4" />
            Save
          </span>
        )}
      </Button>
    </form>
  );
}

export default function VenueSettingsCard() {
  const { settings, loading, error, saving, updateSettings } = useVenueSettings();

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Guest page info</h2>
        <p className="mt-1 text-sm text-blue-100/60">Shown to guests on their wait status page.</p>
      </div>

      {loading && <p className="text-sm text-blue-100/60">Loading settings…</p>}

      {!loading && settings && (
        <VenueSettingsForm
          key={settings.updated_at}
          initialMenuLink={settings.menu_link ?? ""}
          initialInfoText={settings.info_text ?? ""}
          saving={saving}
          loadError={error}
          onSave={updateSettings}
        />
      )}

      {!loading && !settings && <ServerError message={error ?? "Failed to load venue settings"} />}
    </section>
  );
}
