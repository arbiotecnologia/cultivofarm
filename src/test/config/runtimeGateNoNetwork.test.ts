import { expect, it } from "vitest";

it("gate refuses real fetch instead of falling through to a hosted transport", () => {
  expect(() => fetch("https://example.invalid/forbidden")).toThrow("runtime_gate_real_network_forbidden");
});
it("gate refuses XMLHttpRequest before any connection opens", () => {
  expect(() => new XMLHttpRequest().open("GET", "https://example.invalid/forbidden")).toThrow("runtime_gate_real_network_forbidden");
});