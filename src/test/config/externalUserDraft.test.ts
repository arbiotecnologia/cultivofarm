import { describe, it, expect } from "vitest";
import { validateUserDraft, externalUserPayload, EXTERNAL_USER_ACTIVATION_REVIEWED } from "@/lib/configuracoes/externalUserDraft";
const partner = "11111111-1111-4111-8111-111111111111", client = "22222222-2222-4222-8222-222222222222", key = "33333333-3333-4333-8333-333333333333";
const draft = { nome: "Teste", email: "test@example.invalid", password: "", roles: ["parceiro_b2b"], partner_id: partner };
describe("external dialog contract", () => {
 it("activation enables the existing dialog but not technical authority",()=>{expect(EXTERNAL_USER_ACTIVATION_REVIEWED).toBe(true);expect(validateUserDraft({...draft,roles:['parceiro_b2b_tecnico']},'b2b').roles).toBeTruthy();});
 it("B2B gestor exclusive without credential or tenant",()=>{ expect(validateUserDraft(draft,"b2b")).toEqual({}); const p=externalUserPayload(draft,"b2b",key);expect(p.roles).toEqual(["parceiro_b2b"]);expect(p.partner_papel).toBe("gestor");expect(p).not.toHaveProperty("password");expect(p).not.toHaveProperty("organization_id"); });
 it("technical denied",()=>expect(validateUserDraft({...draft,roles:["parceiro_b2b_tecnico"]},"b2b").roles).toBeTruthy());
 it("cumulative denied",()=>expect(validateUserDraft({...draft,roles:["parceiro_b2b","administrador"]},"b2b").roles).toBeTruthy());
 it("producer explicit primary",()=>{const p={...draft,roles:["cliente_produtor"],partner_id:null,cliente_ids:[client],principal_cliente_id:client};expect(validateUserDraft(p,"producer")).toEqual({});expect(externalUserPayload(p,"producer",key).cliente_ids).toEqual([client]);expect(validateUserDraft({...p,principal_cliente_id:partner},"producer").cliente_ids).toBeTruthy();});
 it("duplicate client denied",()=>expect(validateUserDraft({...draft,roles:["cliente_produtor"],partner_id:null,cliente_ids:[client,client],principal_cliente_id:client},"producer").cliente_ids).toBeTruthy());
 it("external password denied",()=>expect(validateUserDraft({...draft,password:"Example123"},"b2b").password).toBeTruthy());
 it("internal password preserved",()=>expect(validateUserDraft({...draft,roles:["administrativo"],partner_id:null},"internal").password).toBeTruthy());
});
