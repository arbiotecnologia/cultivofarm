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
 it("injected disabled transport blocks submission independently of production",async()=>{const unavailable=vi.fn(async()=>{throw new Error("SMTP_UNAVAILABLE");});const save=vi.fn();render(<TenantEmailSettings scope="A" transport={{load:unavailable,save}}/>);await screen.findByRole("alert");expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeDisabled();expect(screen.getByLabelText("Credencial SMTP")).toBeDisabled();expect(save).not.toHaveBeenCalled();});
 it("double submit has one in-flight write and clears password",async()=>{
  let resolve:((v:SmtpView)=>void)|undefined;
  const save=vi.fn(()=>new Promise<SmtpView>(r=>{resolve=r;}));render(<TenantEmailSettings scope="A" transport={transport(save)}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Nova credencial (opcional)"),{target:{value:"mock-only-password"}});
  const form=screen.getByRole("button",{name:"Salvar rascunho"}).closest("form");if(!form)throw new Error("missing form");
  fireEvent.submit(form);fireEvent.submit(form);expect(save).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Nova credencial (opcional)")).toHaveValue("");expect(document.body.textContent).not.toContain("mock-only-password");
  resolve?.({...view,version:2});await screen.findByRole("status");
 });
 it("unknown failure never renders raw payload and never retries",async()=>{
  const save=vi.fn(async()=>{throw new Error("unsafe provider mock-only-password p_password");});render(<TenantEmailSettings scope="A" transport={transport(save)}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"Salvar rascunho"}));await screen.findByRole("alert");
  expect(document.body.textContent).not.toContain("mock-only-password");expect(document.body.textContent).not.toContain("unsafe provider");expect(save).toHaveBeenCalledOnce();
 });
 it("identity switch discards delayed read and prior fields",async()=>{
  let resolveA:((v:SmtpView)=>void)|undefined;
  const load=vi.fn().mockImplementationOnce(()=>new Promise<SmtpView>(r=>{resolveA=r;})).mockResolvedValueOnce({...EMPTY_VIEW});
  const save=vi.fn();const t:TenantSmtpTransport={load,save};const r=render(<TenantEmailSettings scope="A" transport={t}/>);
  r.rerender(<TenantEmailSettings scope="B" transport={t}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());
  resolveA?.(view);await waitFor(()=>expect(screen.getByLabelText("Host SMTP")).toHaveValue(""));
  expect(screen.getByLabelText("Credencial SMTP")).toHaveValue("");expect(save).not.toHaveBeenCalled();
 });
 it("CAS conflict requires reload and uses read-back version",async()=>{
  const save=vi.fn().mockRejectedValueOnce(new Error("SMTP_CONFLICT")).mockResolvedValueOnce({...view,version:5});
  const load=vi.fn().mockResolvedValueOnce(view).mockResolvedValueOnce({...view,version:4});
  render(<TenantEmailSettings scope="A" transport={{load,save}}/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"Salvar rascunho"}));await screen.findByRole("alert");
  expect(save).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole("button",{name:"Recarregar"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Salvar rascunho"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"Salvar rascunho"}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[1][0]).toEqual({expected_version:4,config});
 });
});
describe('SMTP F2/F3 UI scope and explicit send',()=>{
 const result={version:1,mode:'connection' as const,code:'smtp_connection_ok' as const,dispatch_enabled:false as const,sender_verified:false as const};
 it('send requires same-version connection and confirmation, with no arbitrary recipient',async()=>{
  const test=vi.fn().mockResolvedValueOnce(result).mockResolvedValueOnce({...result,mode:'send',code:'smtp_send_accepted'});
  render(<TenantEmailSettings scope="A" transport={{...transport(),test}}/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Testar conexão'})).toBeEnabled());
  expect(screen.getByRole('button',{name:'Enviar teste'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Testar conexão'}));
  await waitFor(()=>expect(screen.getByRole('checkbox')).toBeEnabled());
  expect(screen.getByRole('button',{name:'Enviar teste'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Enviar teste'}));
  await waitFor(()=>expect(test).toHaveBeenCalledTimes(2));
  expect(test.mock.calls[1][0]).toEqual({mode:'send',expected_version:1,confirm_send:true,idempotency_key:expect.any(String)});
 });
 it('double click one test and late identity response discarded',async()=>{
  let resolve:((v:typeof result)=>void)|undefined;const test=vi.fn(()=>new Promise<typeof result>(r=>{resolve=r;}));const t={...transport(),test};
  const r=render(<TenantEmailSettings scope="A" transport={t}/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Testar conexão'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Testar conexão'}));fireEvent.click(screen.getByRole('button',{name:'Testar conexão'}));expect(test).toHaveBeenCalledOnce();
  r.rerender(<TenantEmailSettings scope="B" transport={t}/>);resolve?.(result);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Testar conexão'})).toBeEnabled());expect(screen.getByRole('checkbox')).toBeDisabled();
 });
 it('raw error blocks repeated test, without leaked exception',async()=>{
  const test=vi.fn(async()=>{throw new Error('unsafe AUTH synthetic-only');});render(<TenantEmailSettings scope="A" transport={{...transport(),test}}/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Testar conexão'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Testar conexão'}));
  await screen.findByRole('alert');expect(document.body.textContent).not.toContain('synthetic-only');expect(screen.getByRole('button',{name:'Testar conexão'})).toBeDisabled();expect(test).toHaveBeenCalledOnce();
 });
});
