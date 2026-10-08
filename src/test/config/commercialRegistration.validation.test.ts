import { expect,it } from "vitest";
import { clienteSchema } from "@/lib/schemas/cliente";
import { commercialRegistrationError } from "@/lib/commercialRegistrationErrors";
const base={tipo_pessoa:"fisica",nome_fantasia:"Teste",status_cliente:"ativo"};
it("documento opcional permanece permitido",()=>expect(clienteSchema.safeParse(base).success).toBe(true));
it("CPF válido mascarado permitido",()=>expect(clienteSchema.safeParse({...base,cpf_cnpj:"529.982.247-25"}).success).toBe(true));
it("CPF inválido não permite submissão",()=>expect(clienteSchema.safeParse({...base,cpf_cnpj:"11111111111"}).success).toBe(false));
it("IE flexível permanece válida para cadastro",()=>expect(clienteSchema.safeParse({...base,inscricao_estadual:"510.193.600/89"}).success).toBe(true));
it("erro não vaza SQL ou dados privados",()=>{const e={code:"42501",message:"secret SQL d51_5_partner_accounts_tenant_guard",detail:"PRIVATE"};expect(commercialRegistrationError(e)).not.toMatch(/SQL|PRIVATE|d51_/);expect(commercialRegistrationError(e)).toContain("cliente da sua empresa");});