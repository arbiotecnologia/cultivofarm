import { beforeEach, vi } from "vitest";

// This focused gate must never silently fall through to a real transport.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("runtime_gate_real_network_forbidden");
  }));
  vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(() => {
    throw new Error("runtime_gate_real_network_forbidden");
  });
});