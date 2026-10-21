import { expect, it, vi } from "vitest";
import { clientDocumentDispatcher } from "../../../scripts/attachment-http-revocation-20261021/frontend/clientDocumentDispatcher";
it("client-document failures never call old direct Storage transport", async () => {
  const direct = vi.fn(); const reviewed = vi.fn().mockRejectedValue(new Error("unavailable")); const c = new AbortController();
  await expect(clientDocumentDispatcher("clientes-docs", "path", c.signal, reviewed, direct)).rejects.toThrow("unavailable");
  expect(reviewed).toHaveBeenCalledWith("path", c.signal); expect(direct).not.toHaveBeenCalled();
});
it("XML and other buckets retain their existing transport", async () => {
  const direct = vi.fn().mockResolvedValue(new Blob(["a"])); const reviewed = vi.fn(); const c = new AbortController();
  for (const bucket of ["fiscal-xml", "consultor-arquivos", "financial-receipts"]) {
    await clientDocumentDispatcher(bucket, "path", c.signal, reviewed, direct);
    expect(direct).toHaveBeenCalledWith(bucket, "path", c.signal);
  }
  expect(reviewed).not.toHaveBeenCalled();
});