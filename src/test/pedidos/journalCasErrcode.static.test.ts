// Hotfix LIVE b2b_journal_cas_http409_20261026: conflito CAS do journal não pode
// usar 40001 (PostgREST retenta serialization_failure indefinidamente → HTTP 504).
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const D = "scripts/owner-orders-20261023/durable-attempt-20261026/";
const read = (f: string) => readFileSync(D + f, "utf8");
const core = (s: string) => s.match(/FUNCTION platform_private\.c2_recover_order_attempt_core\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/)![1];

it.each(["candidate.sql.review", "test-install.sql", "assemble.py"])("%s rejeita CAS com PT409, nunca 40001", f => {
  const s = read(f);
  expect(s).not.toContain("ERRCODE='40001'");
  expect(s).toContain("RAISE EXCEPTION 'C2DJ_CAS_CONFLICT' USING ERRCODE='PT409'");
});
it("corpo do core = corpo LIVE pós-hotfix (pin + POST)", () => {
  const body = core(read("candidate.sql.review"));
  expect(body.match(/ERRCODE='PT409'/g)).toHaveLength(1);
  const exp = JSON.parse(read("expected.json"));
  expect(exp.candidate["platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)"]).toBe("191fc04882f27eaa95df242c030a966c");
  expect(read("postflight.sql")).toContain("'191fc04882f27eaa95df242c030a966c'");
  expect(read("rollback.sql.review")).toContain("'191fc04882f27eaa95df242c030a966c'");
  expect(read("rollback.sql.review")).not.toContain("40001");
});
