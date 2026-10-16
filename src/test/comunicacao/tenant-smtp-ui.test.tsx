import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {afterEach,describe,it,expect,vi} from "vitest";
import TenantEmailSettings from "@/pages/configuracoes/TenantEmailSettings";
import {EMPTY_VIEW,type SmtpView,type TenantSmtpTransport} from "@/lib/configuracoes/tenantSmtp";
afterEach(cleanup);
const config={host:"smtp.provider.com",port:465,tls_mode:"implicit_tls" as const,username:"user",from_email:"sender@provider.com",reply_to:"",from_name:"Cultivo Farm"};
const view:SmtpView={...EMPTY_VIEW,config,version:1,credential_configured:true};
const transport=(save=vi.fn(async()=>({...view,version:2}))):TenantSmtpTransport=>({load:vi.fn(async()=>view),save});
describe("SMTP-T1 UI real, transport simulated",()=>{
 it("draft writes expected version and clears secret before IO",async()=>{
  const save=vi.fn(async()=>({...view,version:2}));render(<TenantEmailSettings scope="actorA/orgA" transport={transport(save)}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());
  const credential=screen.getByLabelText("Nova credencial (opcional)");fireEvent.change(credential,{target:{value:"mock-secret"}});
  fireEvent.click(screen.getByRole("button",{name:"Salvar rascunho"}));
  expect(credential).toHaveValue("");await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith({expected_version:1,config,password:"mock-secret"});
  await screen.findByRole("status");expect(screen.getByRole("status")).toHaveTextContent("Rascunho salvo");
 });
 it("conflict blocks retries until reload",async()=>{
  const save=vi.fn(async()=>{throw new Error("SMTP_CONFLICT");});render(<TenantEmailSettings scope="A" transport={transport(save)}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"Salvar rascunho"}));
  await screen.findByRole("alert");expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeDisabled();expect(save).toHaveBeenCalledOnce();
 });
 it("identity change fences delayed save and clears credential",async()=>{
  let resolve:((v:SmtpView)=>void)|undefined;const save=vi.fn(()=>new Promise<SmtpView>(r=>{resolve=r;}));const t=transport(save);
  const r=render(<TenantEmailSettings scope="A" transport={t}/>);await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Nova credencial (opcional)"),{target:{value:"mock-secret"}});fireEvent.click(screen.getByRole("button",{name:"Salvar rascunho"}));
  r.rerender(<TenantEmailSettings scope="B" transport={t}/>);await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());resolve?.({...view,version:99});
  await waitFor(()=>expect(screen.getByLabelText("Nova credencial (opcional)")).toHaveValue(""));expect(screen.queryByText(/Rascunho salvo/)).not.toBeInTheDocument();
 });
 it("uninstalled contract blocks actual submission",async()=>{render(<TenantEmailSettings scope="A"/>);await screen.findByRole("alert");expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeDisabled();expect(screen.getByLabelText("Credencial SMTP")).toBeDisabled();});
});
