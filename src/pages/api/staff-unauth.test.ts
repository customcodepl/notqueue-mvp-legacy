import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import { GET as getParties, POST as postParties } from "./parties";
import { POST as postAdvance } from "./parties/advance";
import { PATCH as patchParty } from "./parties/[partyId]";
import { POST as postReady } from "./parties/[partyId]/ready";
import { POST as postSeat } from "./parties/[partyId]/seat";
import { GET as getGuestToken, POST as postGuestToken } from "./parties/[partyId]/guest-token";
import { GET as getVenueSettings, PATCH as patchVenueSettings } from "./venue/settings";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

const createClientMock = vi.mocked(createClient);

const PARTY_ID = "00000000-0000-4000-8000-000000000001";

function unauthContext(url: string, params: Record<string, string> = {}): Parameters<APIRoute>[0] {
  return {
    request: new Request(url, { method: "GET" }),
    cookies: {
      get: () => undefined,
      has: () => false,
      set: () => undefined,
      delete: () => undefined,
      headers: () => new Headers(),
    },
    params,
  } as Parameters<APIRoute>[0];
}

const staffRoutes: { name: string; handler: APIRoute; url: string; params?: Record<string, string> }[] = [
  { name: "GET /api/parties", handler: getParties, url: "https://example.test/api/parties" },
  { name: "POST /api/parties", handler: postParties, url: "https://example.test/api/parties" },
  { name: "POST /api/parties/advance", handler: postAdvance, url: "https://example.test/api/parties/advance" },
  {
    name: "PATCH /api/parties/[partyId]",
    handler: patchParty,
    url: `https://example.test/api/parties/${PARTY_ID}`,
    params: { partyId: PARTY_ID },
  },
  {
    name: "POST /api/parties/[partyId]/ready",
    handler: postReady,
    url: `https://example.test/api/parties/${PARTY_ID}/ready`,
    params: { partyId: PARTY_ID },
  },
  {
    name: "POST /api/parties/[partyId]/seat",
    handler: postSeat,
    url: `https://example.test/api/parties/${PARTY_ID}/seat`,
    params: { partyId: PARTY_ID },
  },
  {
    name: "GET /api/parties/[partyId]/guest-token",
    handler: getGuestToken,
    url: `https://example.test/api/parties/${PARTY_ID}/guest-token`,
    params: { partyId: PARTY_ID },
  },
  {
    name: "POST /api/parties/[partyId]/guest-token",
    handler: postGuestToken,
    url: `https://example.test/api/parties/${PARTY_ID}/guest-token`,
    params: { partyId: PARTY_ID },
  },
  { name: "GET /api/venue/settings", handler: getVenueSettings, url: "https://example.test/api/venue/settings" },
  {
    name: "PATCH /api/venue/settings",
    handler: patchVenueSettings,
    url: "https://example.test/api/venue/settings",
  },
];

describe("staff API unauthenticated", () => {
  beforeEach(() => {
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as unknown as NonNullable<ReturnType<typeof createClient>>);
  });

  it.each(staffRoutes)("$name returns 401 without a session", async ({ handler, url, params }) => {
    const response = await handler(unauthContext(url, params ?? {}));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
