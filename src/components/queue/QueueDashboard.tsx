import React, { useState } from "react";
import { ArrowRight, Bell, Check, Hash, QrCode, UserPlus, Users } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { useQueueParties } from "@/components/hooks/useQueueParties";
import PartyQrModal from "@/components/queue/PartyQrModal";
import VenueSettingsCard from "@/components/queue/VenueSettingsCard";
import type { Party } from "@/types";
import { cn } from "@/lib/utils";

function PartyEtaInput({
  party,
  disabled,
  onSave,
}: {
  party: Party;
  disabled: boolean;
  onSave: (minutes: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState(party.eta_minutes?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleBlur() {
    const trimmed = value.trim();
    let next: number | null = null;

    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
        setValue(party.eta_minutes?.toString() ?? "");
        return;
      }
      next = parsed;
    }

    if (next === party.eta_minutes) {
      return;
    }

    setSaving(true);
    try {
      await onSave(next);
    } catch {
      setValue(party.eta_minutes?.toString() ?? "");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-blue-100/60">
      <span className="sr-only">ETA minutes for {party.display_name}</span>
      <span aria-hidden="true">ETA</span>
      <input
        type="number"
        min={1}
        max={999}
        inputMode="numeric"
        placeholder="—"
        value={value}
        disabled={disabled || saving}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onBlur={() => {
          void handleBlur();
        }}
        className={cn(
          "w-14 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-center text-xs text-white",
          "placeholder:text-blue-100/40 focus:border-purple-400/50 focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      <span aria-hidden="true">min</span>
    </label>
  );
}

export default function QueueDashboard() {
  const { waiting, ready, loading, error, addParty, advanceQueue, updateEta, markReady, seatParty } = useQueueParties();
  const [displayName, setDisplayName] = useState("");
  const [partySize, setPartySize] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; partySize?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [readyingId, setReadyingId] = useState<string | null>(null);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  const [etaBusyId, setEtaBusyId] = useState<string | null>(null);
  const [qrParty, setQrParty] = useState<Party | null>(null);

  const queueBusy = advancing || readyingId !== null || seatingId !== null || etaBusyId !== null;

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

  async function handleCallNext() {
    setQueueError(null);
    setAdvancing(true);
    try {
      await advanceQueue();
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Failed to advance queue");
    } finally {
      setAdvancing(false);
    }
  }

  async function handleMarkReady(partyId: string) {
    setQueueError(null);
    setReadyingId(partyId);
    try {
      await markReady(partyId);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Failed to mark party ready");
    } finally {
      setReadyingId(null);
    }
  }

  async function handleSeat(partyId: string) {
    setQueueError(null);
    setSeatingId(partyId);
    try {
      await seatParty(partyId);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Failed to seat party");
    } finally {
      setSeatingId(null);
    }
  }

  async function handleEtaSave(partyId: string, minutes: number | null) {
    setQueueError(null);
    setEtaBusyId(partyId);
    try {
      await updateEta(partyId, minutes);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Failed to update ETA");
      throw err;
    } finally {
      setEtaBusyId(null);
    }
  }

  return (
    <>
      {qrParty && (
        <PartyQrModal
          partyId={qrParty.id}
          partyName={qrParty.display_name}
          open={Boolean(qrParty)}
          onClose={() => {
            setQrParty(null);
          }}
        />
      )}

      <div className="space-y-8">
        <VenueSettingsCard />

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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Waiting queue</h2>
            <Button
              type="button"
              disabled={loading || waiting.length === 0 || queueBusy}
              onClick={() => {
                void handleCallNext();
              }}
              className={cn(
                "rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white",
                "transition-colors hover:bg-white/20 disabled:opacity-50",
              )}
            >
              <span className="flex items-center gap-1.5">
                {advancing ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <ArrowRight className="size-3.5" />
                )}
                Call next
              </span>
            </Button>
          </div>

          {loading && <p className="text-sm text-blue-100/60">Loading queue…</p>}
          <ServerError message={!loading ? (error ?? queueError) : null} />

          {!loading && !error && waiting.length === 0 && (
            <p className="text-sm text-blue-100/60">No parties waiting.</p>
          )}

          {!loading && !error && waiting.length > 0 && (
            <ul className="space-y-2">
              {waiting.map((party) => (
                <li
                  key={party.id}
                  className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-white">{party.display_name}</p>
                    <p className="text-sm text-blue-100/60">Party of {party.party_size}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PartyEtaInput
                      key={`${party.id}-${party.eta_minutes ?? "unknown"}`}
                      party={party}
                      disabled={queueBusy}
                      onSave={async (minutes) => {
                        await handleEtaSave(party.id, minutes);
                      }}
                    />
                    <button
                      type="button"
                      disabled={queueBusy}
                      onClick={() => {
                        setQrParty(party);
                      }}
                      className={cn(
                        "rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white",
                        "transition-colors hover:bg-white/20 disabled:opacity-50",
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <QrCode className="size-3.5" />
                        QR
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={queueBusy}
                      onClick={() => {
                        void handleMarkReady(party.id);
                      }}
                      className={cn(
                        "rounded-lg border border-green-400/30 bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-100",
                        "transition-colors hover:bg-green-500/30 disabled:opacity-50",
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {readyingId === party.id ? (
                          <span className="size-3.5 animate-spin rounded-full border-2 border-green-200/30 border-t-green-100" />
                        ) : (
                          <Bell className="size-3.5" />
                        )}
                        Ready
                      </span>
                    </button>
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        "border-purple-400/30 bg-purple-500/20 text-purple-200",
                      )}
                    >
                      #{party.position ?? "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Ready for table</h2>

          {!loading && ready.length === 0 && <p className="text-sm text-blue-100/60">No parties ready.</p>}

          {!loading && ready.length > 0 && (
            <ul className="space-y-2">
              {ready.map((party) => (
                <li
                  key={party.id}
                  className="flex flex-col gap-3 rounded-lg border border-green-400/20 bg-green-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-white">{party.display_name}</p>
                    <p className="text-sm text-blue-100/60">Party of {party.party_size}</p>
                  </div>
                  <button
                    type="button"
                    disabled={queueBusy}
                    onClick={() => {
                      void handleSeat(party.id);
                    }}
                    className={cn(
                      "rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white",
                      "transition-colors hover:bg-white/20 disabled:opacity-50",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {seatingId === party.id ? (
                        <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      Seat
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
