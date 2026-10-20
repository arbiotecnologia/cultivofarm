import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const base="scripts/manual-cq-recovery-20261020/";
describe("LIVE programming containment remains immutable in assembly",()=>{
  for (const file of ["preflight-readonly.sql","postflight-readonly.sql","rollback-postflight-readonly.sql","candidate.sql.review","rollback.sql.review"])
    it(`${file} requires exact LIVE body, ACL, trigger and aggregate`,()=>{
      const sql=readFileSync(base+file,"utf8");
      expect(sql).toContain("7c168ffa9393207fb3388c9546c19d05");
      expect(sql).toContain("3cd248f967d379787235709a45a8f4e8");
      expect(sql).toMatch(/guard_manual_program_binding_v1\(\).*proacl::text='\{postgres=X\/postgres\}'/);
      expect(sql).toContain("CREATE TRIGGER aa_manual_program_binding_v1 BEFORE UPDATE ON public.programacao_producao FOR EACH ROW EXECUTE FUNCTION platform_private.guard_manual_program_binding_v1()");
      expect(sql).not.toMatch(/CREATE(?: OR REPLACE)? FUNCTION platform_private\.guard_manual_program_binding_v1/);
      expect(sql).not.toMatch(/(?:DROP|ALTER) (?:FUNCTION|TRIGGER) (?:platform_private\.)?(?:guard_manual_program_binding_v1|aa_manual_program_binding_v1)/);
      expect(sql).not.toMatch(/(?:REVOKE|GRANT)[^;]*ON FUNCTION platform_private\.guard_manual_program_binding_v1/);
    });
});
describe("LIVE lot delete containment remains immutable in assembly",()=>{
  for (const file of ["preflight-readonly.sql","postflight-readonly.sql","rollback-postflight-readonly.sql","candidate.sql.review","rollback.sql.review"])
    it(`${file} preserves exact deletion dependency`,()=>{
      const sql=readFileSync(base+file,"utf8");
      expect(sql).toContain("0d490a2910e7fb63dd50fd4c86e1cf0f");
      expect(sql).toContain("c99348df3f7e5f103739a8ded41a5a00");
      expect(sql).toMatch(/guard_manual_lot_delete_v1\(\).*proacl::text='\{postgres=X\/postgres\}'/);
      expect(sql).toContain("tgtype=11");
      expect(sql).toContain("CREATE TRIGGER aa_manual_lot_delete_v1 BEFORE DELETE ON public.lotes FOR EACH ROW EXECUTE FUNCTION platform_private.guard_manual_lot_delete_v1()");
      expect(sql).not.toMatch(/CREATE(?: OR REPLACE)? FUNCTION platform_private\.guard_manual_lot_delete_v1/);
      expect(sql).not.toMatch(/(?:DROP|ALTER) (?:FUNCTION|TRIGGER) (?:platform_private\.)?(?:guard_manual_lot_delete_v1|aa_manual_lot_delete_v1)/);
      expect(sql).not.toMatch(/(?:REVOKE|GRANT)[^;]*ON FUNCTION platform_private\.guard_manual_lot_delete_v1/);
    });
});