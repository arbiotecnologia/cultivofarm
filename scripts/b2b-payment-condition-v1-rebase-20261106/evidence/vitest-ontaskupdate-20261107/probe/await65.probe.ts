import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
it("warm", () => expect(1).toBe(1));
it("async wait 65s", async () => { await promisify(execFile)("sleep", ["65"]); expect(1).toBe(1); }, 120_000);
