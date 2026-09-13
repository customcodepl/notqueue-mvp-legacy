import type { ReactNode } from "react";
import { Clock, ExternalLink, Hash, Users } from "lucide-react";
import { useGuestPartyView } from "@/components/hooks/useGuestPartyView";
import type { GuestPartyView } from "@/types";
import { cn } from "@/lib/utils";

interface GuestStatusProps {
  token: string;
  initialView: GuestPartyView | null;
  initialError?: string | null;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

function GuestCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

function VenueSection({ view }: { view: GuestPartyView }) {
  if (!view.info_text && !view.menu_link) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left">
      {view.info_text && <p className="text-sm text-blue-100/80">{view.info_text}</p>}
      {view.menu_link && (
        <a
          href={view.menu_link}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium text-purple-200 underline-offset-2",
            "hover:text-purple-100 hover:underline",
          )}
        >
          View menu
          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function GuestHeader({ view }: { view: GuestPartyView }) {
  return (
    <div className="text-center">
      <p className="text-sm text-blue-100/70">Welcome</p>
      <h1 className="mt-1 bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
        {view.display_name}
      </h1>
      <p className="mt-2 inline-flex items-center justify-center gap-1.5 text-sm text-blue-100/80">
        <Users className="size-4 shrink-0" aria-hidden="true" />
        Party of {view.party_size}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <GuestCard>
      <div className="animate-pulse space-y-6 text-center" aria-busy="true" aria-label="Loading your wait status">
        <div className="space-y-2">
          <div className="mx-auto h-4 w-16 rounded bg-white/10" />
          <div className="mx-auto h-8 w-40 rounded bg-white/10" />
          <div className="mx-auto h-4 w-24 rounded bg-white/10" />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6">
          <div className="mx-auto h-3 w-24 rounded bg-white/10" />
          <div className="mx-auto mt-3 h-10 w-16 rounded bg-white/10" />
        </div>
        <div className="h-4 w-full rounded bg-white/10" />
      </div>
    </GuestCard>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <GuestCard>
      <div className="text-center">
        <h1 className="mb-3 text-xl font-semibold text-white">Link unavailable</h1>
        <p className="text-sm text-blue-100/80">{message}</p>
      </div>
    </GuestCard>
  );
}

function WaitingView({ view }: { view: GuestPartyView }) {
  return (
    <GuestCard>
      <div className="space-y-6">
        <GuestHeader view={view} />

        {view.position !== null && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
            <p className="inline-flex items-center justify-center gap-1.5 text-xs tracking-wide text-blue-100/60 uppercase">
              <Hash className="size-3.5 shrink-0" aria-hidden="true" />
              Queue position
            </p>
            <p className="mt-1 text-3xl font-bold text-white">#{view.position}</p>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
          <p className="inline-flex items-center justify-center gap-1.5 text-xs tracking-wide text-blue-100/60 uppercase">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            Estimated wait
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {view.eta_minutes !== null ? `${view.eta_minutes} min` : "Wait time unknown"}
          </p>
        </div>

        <VenueSection view={view} />
      </div>
    </GuestCard>
  );
}

function ReadyView({ view }: { view: GuestPartyView }) {
  return (
    <GuestCard>
      <div className="space-y-6">
        <div
          className={cn(
            "rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-8 text-center",
            "shadow-[0_0_40px_-12px_rgba(52,211,153,0.45)]",
          )}
        >
          <p className="text-xs font-semibold tracking-widest text-emerald-200/80 uppercase">Your table is ready!</p>
          <h2 className="mt-2 text-2xl font-bold text-white">{view.display_name}</h2>
          <p className="mt-3 text-sm text-emerald-100/90">
            Please proceed to the host stand — we will seat you shortly.
          </p>
        </div>

        <VenueSection view={view} />
      </div>
    </GuestCard>
  );
}

function SeatedView({ view }: { view: GuestPartyView }) {
  return (
    <GuestCard>
      <div className="space-y-6 text-center">
        <GuestHeader view={view} />
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-lg font-medium text-white">
          You&apos;re seated. Enjoy your meal!
        </p>
      </div>
    </GuestCard>
  );
}

export default function GuestStatus({
  token,
  initialView,
  initialError = null,
  supabaseUrl,
  supabaseAnonKey,
}: GuestStatusProps) {
  const { data, loading, error } = useGuestPartyView(token, initialView, supabaseUrl, supabaseAnonKey);

  const view = data ?? initialView;
  const displayError = error ?? (view ? null : initialError);

  if (displayError) {
    return <ErrorState message={displayError} />;
  }

  if (loading && !view) {
    return <LoadingState />;
  }

  if (!view) {
    return <ErrorState message="This link is invalid or has expired." />;
  }

  switch (view.status) {
    case "ready":
      return <ReadyView view={view} />;
    case "seated":
      return <SeatedView view={view} />;
    default:
      return <WaitingView view={view} />;
  }
}
