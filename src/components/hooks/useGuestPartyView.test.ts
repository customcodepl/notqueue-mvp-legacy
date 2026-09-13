/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { GuestPartyView } from "@/types";
import { useGuestPartyView } from "./useGuestPartyView";

vi.mock("@/lib/supabase-browser", () => ({
  createBrowserClient: vi.fn(),
}));

const createBrowserClientMock = vi.mocked(createBrowserClient);

const partyA: GuestPartyView = {
  display_name: "Smith",
  party_size: 4,
  position: 1,
  eta_minutes: 15,
  status: "waiting",
  menu_link: null,
  info_text: null,
};

describe("useGuestPartyView", () => {
  beforeEach(() => {
    createBrowserClientMock.mockReset();
  });

  it("keeps SSR party data when the browser client is missing", async () => {
    createBrowserClientMock.mockReturnValue(null);

    const { result } = renderHook(() => useGuestPartyView("token-a", partyA));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(partyA);
  });

  it("reports unavailable when there is no client and no SSR data", async () => {
    createBrowserClientMock.mockReturnValue(null);

    const { result } = renderHook(() => useGuestPartyView("token-a", null));

    await waitFor(() => {
      expect(result.current.error).toBe("Service is temporarily unavailable.");
    });

    expect(result.current.data).toBeNull();
  });

  it.each([
    { data: null, error: { message: "boom" } },
    { data: null, error: null },
  ])("reports an invalid link when RPC returns %o even if SSR data exists", async (rpcResult) => {
    createBrowserClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue(rpcResult),
    } as unknown as NonNullable<ReturnType<typeof createBrowserClient>>);

    const { result } = renderHook(() => useGuestPartyView("token-a", partyA));

    await waitFor(() => {
      expect(result.current.error).toBe("This link is invalid or has expired.");
    });
  });

  it("stores only the RPC party payload on success", async () => {
    createBrowserClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: partyA, error: null }),
    } as unknown as NonNullable<ReturnType<typeof createBrowserClient>>);

    const { result } = renderHook(() => useGuestPartyView("token-a", null));

    await waitFor(() => {
      expect(result.current.data).toEqual(partyA);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({
      display_name: "Smith",
      party_size: 4,
      position: 1,
      eta_minutes: 15,
      status: "waiting",
      menu_link: null,
      info_text: null,
    });
  });
});
