import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("warm", () => expect(1).toBe(1));
it("sync block 55s", () => { execFileSync("sleep", ["55"]); expect(1).toBe(1); }, 120_000);
