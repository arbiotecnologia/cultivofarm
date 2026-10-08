import { render,screen,waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect,it,vi } from "vitest";
vi.mock("@/hooks/useCommercialRegistrationScope",()=>({useCommercialRegistrationScope:()=>({ready:true,scope:"A",capture:()=>()=>true})}));
vi.mock("@/lib/clienteDocumentos",()=>({gerarBackupDocumentosCliente:vi.fn(),removerTodosDocumentosCliente:vi.fn()}));
vi.mock("sonner",()=>({toast:{error:vi.fn()}}));
import { ExcluirInativarDialog } from "@/components/cadastros/ExcluirInativarDialog";
it("erro de consulta de dependências não libera exclusão",async()=>{const remove=vi.fn();render(<MemoryRouter><ExcluirInativarDialog open onOpenChange={vi.fn()} nome="TEMPORARY_AUDIT" entidade="fazenda" entidadeId="F" isAdmin loadDeps={async()=>{throw new Error("SQL raw");}} onInativar={vi.fn()} onExcluir={remove}/></MemoryRouter>);await waitFor(()=>expect(screen.getByRole("button",{name:"Excluir definitivamente"})).toBeDisabled());expect(remove).not.toHaveBeenCalled();});