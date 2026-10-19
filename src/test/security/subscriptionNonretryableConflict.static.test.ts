import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../../scripts/subscription-nonretryable-conflict");
const apply = readFileSync(resolve(DIR, "apply_idempotent.sql"), "utf8");
const rollback = readFileSync(resolve(DIR, "rollback_GUARDADO.sql"), "utf8");
const PRE = "e7e3b57debf67673a82e3f4f7c2daa48";
const POST = "447ee6a17af25c2b746ce082df6b9b01";
const FN = "platform_private.transition_subscription_core(uuid,text,text,uuid,uuid)";

describe("registro subscription_business_conflict_nonretryable", () => {
  it("apply: alvo único, hashes fixos, no-op no pós e drift rejeitado", () => {
    expect(apply).toContain(FN);
    expect(apply).toContain(PRE);
    expect(apply).toContain(POST);
    expect(apply).toMatch(/md5\(def\) = post_md5[\s\S]*NO-OP[\s\S]*RETURN;/);
    expect(apply).toMatch(/md5\(def\) <> pre_md5[\s\S]*drift/);
    expect(apply).toMatch(/n <> 9/);
    expect(apply).toContain("swzpzcwiasxmjutrmvkm");
  });
  it("apply preserva owner/secdef/search_path/ACL e não usa substituição global", () => {
    expect(apply).toContain("prosecdef");
    expect(apply).toContain(`ARRAY['search_path=""']`);
    expect(apply).toContain("acl_after IS DISTINCT FROM acl_before");
    expect(apply).not.toMatch(/pg_proc[^;]*LOOP|FOR\s+\w+\s+IN\s+SELECT/i);
    expect(apply).not.toMatch(/GRANT|REVOKE|ALTER FUNCTION|INSERT|UPDATE|DELETE/i);
  });
  it("rollback é o inverso exato, guardado e alerta retry", () => {
    expect(rollback).toContain("md5(def) <> post_md5");
    expect(rollback).toContain("md5(def) <> pre_md5");
    expect(rollback).toContain("app.confirm_reintroduce_40001_retry");
    expect(rollback).toMatch(/REPETE INDEFINIDAMENTE/);
    expect(rollback).toContain(`replace(def, $q$ERRCODE='PT409'$q$, $q$ERRCODE='40001'$q$)`);
  });
});
