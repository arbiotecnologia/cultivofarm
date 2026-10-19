import { afterEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ download: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: sdk.from } } }));
import { downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";
afterEach(() => vi.restoreAllMocks());
it("uses the canonical authenticated SDK stream and never a signed URL", async () => {
  sdk.from.mockReturnValue({ download: sdk.download });
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } });
  sdk.download.mockReturnValue({ asStream: () => Promise.resolve({ data: stream, error: null }) });
  const abort = new AbortController();
  const blob = await downloadAuthenticatedAttachment("financial-receipts", "tenant/2026/REC-2026-000001.pdf", abort.signal);
  expect(blob.size).toBe(3);
  expect(sdk.from).toHaveBeenCalledWith("financial-receipts");
  expect(sdk.download.mock.calls[0][0]).toBe("tenant/2026/REC-2026-000001.pdf");
  expect(sdk.download.mock.calls[0][2].cache).toBe("no-store");
  expect(sdk.download.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);
});