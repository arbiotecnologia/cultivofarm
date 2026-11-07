import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("warm", () => expect(1).toBe(1));
it("sync block 65s", () => { execFileSync("sleep", ["65"]); expect(1).toBe(1); }, 120_000);
