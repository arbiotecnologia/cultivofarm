import { describe, it, expect } from "vitest";
import { c2ContextProbe, decodeC2Contexts, decodeC2Partner, isC2ExternalScope } from "./multiProfileContract";
const actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tenant="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",partner="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const roles=["parceiro_b2b","parceiro_b2b_tecnico","cliente_produtor"];
const row={contract:"C2_MULTIPROFILE_V1",actor_id:actor,tenant_id:tenant,ready:true,partner_id:partner,available_contexts:["b2b","technical","producer"],producer_links_valid:true};
describe("coordinated external contract",()=>{
 it("accepts all three real portals",()=>expect(decodeC2Contexts(row,actor,tenant,roles).available_contexts).toEqual(["b2b","technical","producer"]));
 it("rejects internal gestor mixed with external",()=>expect(isC2ExternalScope([...roles,"gestor"])).toBe(false));
 it("rejects stale actor",()=>expect(()=>decodeC2Contexts(row,partner,tenant,roles)).toThrow());
 it("rejects stale tenant",()=>expect(()=>decodeC2Contexts(row,actor,partner,roles)).toThrow());
 it("rejects producer without real links",()=>expect(()=>decodeC2Contexts({...row,producer_links_valid:false},actor,tenant,roles)).toThrow());
 it("rejects manager after partial revoke",()=>expect(()=>decodeC2Contexts(row,actor,tenant,roles.slice(1))).toThrow());
 it("preserves technician and producer residual",()=>expect(c2ContextProbe({...row,available_contexts:["technical","producer"]},actor,tenant,roles.slice(1)).eligible).toBe(true));
 it("denies all dependent contexts on total revoke",()=>expect(c2ContextProbe({...row,partner_id:null,available_contexts:[]},actor,tenant,roles).eligible).toBe(false));
 it("does not adopt legacy resolver",()=>expect(()=>decodeC2Contexts({...row,contract:undefined},actor,tenant,roles)).toThrow());
 it("rejects an invented internal portal",()=>expect(()=>decodeC2Contexts({...row,available_contexts:["admin"]},actor,tenant,roles)).toThrow());
 it("binds exact roles in partner projection",()=>{
  const p={...row,organization_id:tenant,commercial_owner_organization_id:tenant,mode:"commercial_owner",external_roles:roles,manager:true,technician:true};
  expect(decodeC2Partner(p,actor,tenant,roles).partner_id).toBe(partner);
  expect(()=>decodeC2Partner(p,actor,tenant,roles.slice(1))).toThrow();
 });
});