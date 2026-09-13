import { describe, expect, it } from "vitest";
import { guestUrlFromRequest } from "@/lib/api";

describe("guestUrlFromRequest", () => {
  it("builds a guest path from the request origin and encodes the token", () => {
    const request = new Request("https://notqueue.example/api/parties/abc/guest-token");
    expect(guestUrlFromRequest(request, "tok/en+")).toBe("https://notqueue.example/guest/tok%2Fen%2B");
  });
});
