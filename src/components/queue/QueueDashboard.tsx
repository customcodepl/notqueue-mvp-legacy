import React, { useState } from "react";
import { UserPlus, Users, Hash } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { useQueueParties } from "@/components/hooks/useQueueParties";
import { cn } from "@/lib/utils";

export default function QueueDashboard() {
  const { parties, loading, error, addParty } = useQueueParties();
  const [displayName, setDisplayName] = useState("");
  const [partySize, setPartySize] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; partySize?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const next: typeof fieldErrors = {};
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      next.displayName = "Party name is required";
    } else if (trimmedName.length > 100) {
      next.displayName = "Party name must be 100 characters or fewer";
    }

    const size = Number(partySize);
    if (!partySize.trim()) {
      next.partySize = "Party size is required";
    } else if (!Number.isInteger(size) || size < 1) {
      next.partySize = "Enter a whole number of 1 or more";
    } else if (size > 99) {
      next.partySize = "Party size must be 99 or fewer";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearFieldError(field: keyof typeof fieldErrors) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) {
      return;
    }

    setSubmitting(true);
    try {
      await addParty({
        display_name: displayName.trim(),
        party_size: Number(partySize),
      });
      setDisplayName("");
      setPartySize("");
      setFieldErrors({});
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to add party");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Add to queue</h2>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <FormField
            id="display_name"
            label="Party name"
            value={displayName}
            onChange={(value) => {
              setDisplayName(value);
              clearFieldError("displayName");
            }}
            placeholder="e.g. Smith"
            error={fieldErrors.displayName}
            icon={<Users className="size-4" />}
          />

          <FormField
            id="party_size"
            type="number"
            label="Party size"
            value={partySize}
            onChange={(value) => {
              setPartySize(value);
              clearFieldError("partySize");
            }}
            placeholder="e.g. 4"
            error={fieldErrors.partySize}
            icon={<Hash className="size-4" />}
          />

          <ServerError message={submitError} />

          <Button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Adding…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <UserPlus className="size-4" />
                Add party
              </span>
            )}
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Waiting queue</h2>

        {loading && <p className="text-sm text-blue-100/60">Loading queue…</p>}
        <ServerError message={!loading ? error : null} />

        {!loading && !error && parties.length === 0 && <p className="text-sm text-blue-100/60">No parties waiting.</p>}

        {!loading && !error && parties.length > 0 && (
          <ul className="space-y-2">
            {parties.map((party) => (
              <li
                key={party.id}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/10 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-white">{party.display_name}</p>
                  <p className="text-sm text-blue-100/60">Party of {party.party_size}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    "border-purple-400/30 bg-purple-500/20 text-purple-200",
                  )}
                >
                  #{party.position ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
