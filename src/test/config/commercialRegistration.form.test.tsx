import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
const s=vi.hoisted(()=>({save:vi.fn(),update:vi.fn(),close:vi.fn(),cep:vi.fn(),resolve:undefined as undefined|(()=>void)}));
vi.mock("@/lib/api/viacep",()=>({fetchCEP:s.cep}));
vi.mock("@/hooks/useCommercialRegistrationScope",()=>({useCommercialRegistrationScope:()=>({scope:"A",canManagePartners:true,ready:true,organizationId:"OA",capture:()=>()=>true})}));
vi.mock("@tanstack/react-query",()=>({useQuery:({queryKey}:{queryKey:string[]})=>({data:queryKey[0]==="clientes-lookup-b2b"?[{id:"00000000-0000-4000-8000-000000000001",nome:"Cliente próprio"}]:[],isLoading:false,isError:false})}));
vi.mock("@/hooks/useParceiroB2BMutations",()=>({useCreateParceiroB2B:()=>({mutateAsync:s.save,isPending:false}),useUpdateParceiroB2B:()=>({mutateAsync:s.update,isPending:false})}));
vi.mock("@/components/comercial/ParceiroUsuariosTab",()=>({ParceiroUsuariosTab:()=>null}));
vi.mock("sonner",()=>({toast:{error:vi.fn(),success:vi.fn(),warning:vi.fn()}}));
import { ParceiroB2BFormDialog } from "@/components/comercial/ParceiroB2BFormDialog";
import type { ParceiroB2B } from "@/hooks/useParceirosB2B";
beforeEach(()=>{s.save.mockReset();s.update.mockReset();s.close.mockReset();s.cep.mockReset();s.resolve=undefined;});
function nameInput(){const input=screen.getByText("Razão Social *").parentElement?.querySelector("input");if(!input)throw new Error("name input missing");return input;}
it("preserva string obrigatória vazia na validação, mantendo opcionais nulos", () => {
 const parse = vi.spyOn(z.ZodObject.prototype, "safeParse");
 try {
  render(<ParceiroB2BFormDialog open onOpenChange={s.close}/>);
  fireEvent.click(screen.getByRole("button", {name: "Criar parceiro"}));
  expect(parse).toHaveBeenCalledWith(expect.objectContaining({razao_social: "", nome_fantasia: null, cnpj: null}));
  expect(s.save).not.toHaveBeenCalled();
 } finally { parse.mockRestore(); }
});
it.each(["", " ", "A"])("nega razão social insuficiente sem envio: %j", (value) => {
 render(<ParceiroB2BFormDialog open onOpenChange={s.close}/>);
 fireEvent.change(nameInput(), {target: {value}});
 fireEvent.click(screen.getByRole("button", {name: "Criar parceiro"}));
 expect(s.save).not.toHaveBeenCalled();
 expect(s.update).not.toHaveBeenCalled();
 expect(s.close).not.toHaveBeenCalled();
});
it("nega CNPJ repetido sem envio", () => {
 render(<ParceiroB2BFormDialog open onOpenChange={s.close}/>);
 fireEvent.change(nameInput(), {target: {value: "TESTE AUDITORIA B2B 20261008"}});
 const cnpj = screen.getByText("CNPJ").parentElement?.querySelector("input");
 if (!cnpj) throw new Error("cnpj input missing");
 fireEvent.change(cnpj, {target: {value: "11.111.111/1111-11"}});
 fireEvent.click(screen.getByRole("button", {name: "Criar parceiro"}));
 expect(s.save).not.toHaveBeenCalled();
 expect(s.close).not.toHaveBeenCalled();
});
async function fill(){fireEvent.change(nameInput(),{target:{value:"TEMPORARY_AUDIT"}});fireEvent.click(screen.getByRole("combobox",{name:"Cliente da empresa"}));fireEvent.click(await screen.findByRole("option",{name:"Cliente próprio"}));}
it("cadastra parceiro sem vínculo com cliente",async()=>{render(<ParceiroB2BFormDialog open onOpenChange={s.close}/>);fireEvent.change(nameInput(),{target:{value:"TEMPORARY_AUDIT"}});fireEvent.click(screen.getByRole("button",{name:"Criar parceiro"}));await waitFor(()=>expect(s.save).toHaveBeenCalledTimes(1));expect(s.save.mock.calls[0][0]).toMatchObject({razao_social:"TEMPORARY_AUDIT",client_id:null});});
it("edita parceiro mantendo cliente opcional",async()=>{const parceiro={id:"EXISTING",razao_social:"TEMPORARY_AUDIT",client_id:null,ativo:true,desconto_padrao:0,limite_credito_brl:null,comissao_percentual:null,meta_mensal_brl:null} as ParceiroB2B;render(<ParceiroB2BFormDialog open onOpenChange={s.close} parceiro={parceiro}/>);fireEvent.click(screen.getByRole("button",{name:"Salvar alterações"}));await waitFor(()=>expect(s.update).toHaveBeenCalledTimes(1));expect(s.update.mock.calls[0][0]).toMatchObject({id:"EXISTING",client_id:null});});
it("duplo clique faz um envio; libera lock após falha e mantém UUID",async()=>{s.save.mockImplementationOnce(()=>new Promise<void>(r=>{s.resolve=r;})).mockRejectedValueOnce(new Error("offline"));render(<ParceiroB2BFormDialog open onOpenChange={s.close}/>);await fill();const button=screen.getByRole("button",{name:"Criar parceiro"});fireEvent.click(button);fireEvent.click(button);expect(s.save).toHaveBeenCalledTimes(1);const first=s.save.mock.calls[0][0];await act(async()=>s.resolve?.());await waitFor(()=>expect(s.close).toHaveBeenCalledTimes(1));fireEvent.click(button);await waitFor(()=>expect(s.save).toHaveBeenCalledTimes(2));expect(s.save.mock.calls[1][0].id).toBe(first.id);expect(nameInput()).toHaveValue("TEMPORARY_AUDIT");fireEvent.click(button);await waitFor(()=>expect(s.save).toHaveBeenCalledTimes(3));});
it("CEP atrasado não sobrescreve endereço editado",async()=>{let resolve:((v:unknown)=>void)|undefined;s.cep.mockImplementation(()=>new Promise(r=>{resolve=r;}));render(<ParceiroB2BFormDialog open onOpenChange={s.close}/>);fireEvent.mouseDown(screen.getByRole("tab",{name:"Endereço"}),{button:0,ctrlKey:false});await screen.findByText("CEP");const input=(label:string)=>{const node=screen.getByText(label).parentElement?.querySelector("input");if(!node)throw new Error("input missing");return node;};fireEvent.change(input("CEP"),{target:{value:"01001000"}});fireEvent.blur(input("CEP"));await waitFor(()=>expect(s.cep).toHaveBeenCalledTimes(1));fireEvent.change(input("Logradouro"),{target:{value:"Manual"}});await act(async()=>resolve?.({logradouro:"ANTIGO",bairro:"ANTIGO",localidade:"ANTIGO",uf:"SP"}));expect(input("Logradouro")).toHaveValue("Manual");});
it("edição própria usa ID existente e não cria outro parceiro",async()=>{const parceiro={id:"EXISTING",razao_social:"TEMPORARY_AUDIT",client_id:"00000000-0000-4000-8000-000000000001",ativo:true,desconto_padrao:0,limite_credito_brl:null,comissao_percentual:null,meta_mensal_brl:null} as ParceiroB2B;render(<ParceiroB2BFormDialog open onOpenChange={s.close} parceiro={parceiro}/>);fireEvent.click(screen.getByRole("button",{name:"Salvar alterações"}));await waitFor(()=>expect(s.update).toHaveBeenCalledTimes(1));expect(s.update.mock.calls[0][0].id).toBe("EXISTING");expect(s.save).not.toHaveBeenCalled();});
it("edição com cliente ausente da lista própria não envia",()=>{const parceiro={id:"EXISTING",razao_social:"TEMPORARY_AUDIT",client_id:"CROSS",ativo:true,desconto_padrao:0} as ParceiroB2B;render(<ParceiroB2BFormDialog open onOpenChange={s.close} parceiro={parceiro}/>);fireEvent.click(screen.getByRole("button",{name:"Salvar alterações"}));expect(s.update).not.toHaveBeenCalled();expect(s.save).not.toHaveBeenCalled();expect(nameInput()).toHaveValue("TEMPORARY_AUDIT");});