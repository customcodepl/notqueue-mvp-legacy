import React, { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Copy, RefreshCw, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { useGuestToken } from "@/components/hooks/useGuestToken";
import { cn } from "@/lib/utils";

interface PartyQrModalProps {
  partyId: string;
  partyName: string;
  open: boolean;
  onClose: () => void;
}

export default function PartyQrModal({ partyId, partyName, open, onClose }: PartyQrModalProps) {
  const { data, loading, error, fetchActiveToken, issueToken } = useGuestToken(open ? partyId : null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    void fetchActiveToken();
  }, [open, partyId, fetchActiveToken]);

  if (!open) {
    return null;
  }

  async function handleCopy() {
    if (!data?.guest_url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(data.guest_url);
      setCopyMessage("Link copied");
    } catch {
      setCopyMessage("Could not copy link");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="party-qr-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="party-qr-title" className="text-lg font-semibold text-white">
              Guest QR
            </h2>
            <p className="text-sm text-blue-100/70">{partyName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 p-1.5 text-blue-100/80 transition-colors hover:bg-white/10"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {loading && <p className="text-sm text-blue-100/60">Loading…</p>}
        <ServerError message={!loading ? error : null} />

        {!loading && !error && !data && (
          <div className="space-y-4">
            <p className="text-sm text-blue-100/70">No guest link issued yet for this party.</p>
            <Button
              type="button"
              onClick={() => {
                void issueToken();
              }}
              className="w-full rounded-lg bg-purple-600 hover:bg-purple-500"
            >
              Issue QR
            </Button>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-xl bg-white p-4">
              <QRCode value={data.guest_url} size={200} />
            </div>
            <p className="text-center text-xs break-all text-blue-100/70">{data.guest_url}</p>
            {copyMessage && <p className="text-center text-xs text-green-300">{copyMessage}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void handleCopy();
                }}
                className={cn("flex-1 rounded-lg border-white/20 bg-white/10 text-white hover:bg-white/20")}
              >
                <span className="flex items-center gap-2">
                  <Copy className="size-4" />
                  Copy link
                </span>
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void issueToken();
                }}
                className="flex-1 rounded-lg bg-purple-600 hover:bg-purple-500"
              >
                <span className="flex items-center gap-2">
                  <RefreshCw className="size-4" />
                  Reissue
                </span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
