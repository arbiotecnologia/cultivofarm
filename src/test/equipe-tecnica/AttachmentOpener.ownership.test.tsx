import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ download: vi.fn(), auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["cliente_produtor"], loading: false, authzReady: true, authzEpoch: 0 } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/authz/authenticatedAttachment", () => ({ ATTACHMENT_LIMITS: { files: 24, fileBytes: 20 * 1024 * 1024, totalBytes: 60 * 1024 * 1024 }, downloadAuthenticatedAttachment: state.download }));
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";
beforeEach(() => {
  state.auth.authzReady = true; state.auth.authzEpoch = 0; state.auth.profile.organization_id = "OA";
  state.download.mockReset().mockResolvedValue(new Blob(["a"]));
  let n = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:${++n}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
it("24 URLs maximum; repeated path deduplicates, eviction revokes and evicted path may retry", async () => {
  const h = renderHook(() => useAuthenticatedAttachmentOpener("R", "private"));
  const error = vi.fn();
  for (let n = 0; n < 25; n++) await act(() => h.result.current.open(`${n}.pdf`, error));
  expect(Object.keys(h.result.current.urls)).toHaveLength(24);
  expect(h.result.current.urls["0.pdf"]).toBeUndefined();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  await act(() => h.result.current.open("24.pdf", error));
  expect(state.download).toHaveBeenCalledTimes(25);
  await act(() => h.result.current.open("0.pdf", error));
  expect(state.download).toHaveBeenCalledTimes(26);
  expect(Object.keys(h.result.current.urls)).toHaveLength(24);
  h.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(26);
});
it("60 MiB ownership maximum evicts before retaining another 20 MiB; >20 MiB rejected", async () => {
  state.download.mockResolvedValue(new Blob([new Uint8Array(20 * 1024 * 1024)]));
  const h = renderHook(() => useAuthenticatedAttachmentOpener("R", "private"));
  const error = vi.fn();
  for (let n = 0; n < 4; n++) await act(() => h.result.current.open(`${n}.pdf`, error));
  expect(Object.keys(h.result.current.urls)).toHaveLength(3);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  state.download.mockResolvedValue(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]));
  await act(() => h.result.current.open("large.pdf", error));
  expect(error).toHaveBeenCalledTimes(1); expect(URL.createObjectURL).toHaveBeenCalledTimes(4);
  h.unmount();
});
it("no async popup/download; explicit current click uses download attribute and cleans anchor", async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.href).toBe("blob:1"); expect(this.download).toBe("report.pdf"); expect(this.target).toBe("");
  });
  const open = vi.spyOn(window, "open");
  const h = renderHook(() => useAuthenticatedAttachmentOpener("R", "private"));
  await act(() => h.result.current.open("a.pdf", vi.fn()));
  expect(click).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  act(() => h.result.current.download("a.pdf", "dir/report.pdf"));
  expect(click).toHaveBeenCalledTimes(1); expect(document.querySelector("a[download]")).toBeNull();
  state.auth.authzReady = false; h.rerender();
  act(() => h.result.current.download("a.pdf", "report.pdf"));
  expect(click).toHaveBeenCalledTimes(1); h.unmount();
});
for (const change of ["unmount", "tenant", "epoch", "pending"] as const) it(`${change} aborts and cannot publish obsolete completion`, async () => {
  let resolve: (b: Blob) => void = () => {};
  state.download.mockImplementation(() => new Promise(r => { resolve = r; }));
  const h = renderHook(() => useAuthenticatedAttachmentOpener("R", "private"));
  const error = vi.fn();
  let request: Promise<void> | undefined;
  act(() => { request = h.result.current.open("a.pdf", error); });
  await waitFor(() => expect(state.download).toHaveBeenCalledTimes(1));
  expect(h.result.current.loadingPaths).toEqual(["a.pdf"]);
  const signal = state.download.mock.calls[0][2] as AbortSignal;
  if (change === "unmount") h.unmount();
  else { if (change === "tenant") state.auth.profile.organization_id = "OB"; if (change === "epoch") state.auth.authzEpoch++; if (change === "pending") state.auth.authzReady = false; h.rerender(); }
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve(new Blob(["old"])); await request; });
  expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); h.unmount();
});