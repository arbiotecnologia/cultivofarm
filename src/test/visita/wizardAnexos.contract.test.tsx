import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

const org = "11111111-1111-4111-8111-111111111111";
const visit = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(), remove: vi.fn(), insert: vi.fn(), single: vi.fn(), removeMetadata: vi.fn(),
  deleted: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(), refresh: vi.fn(),
  rows: [] as Tables<"registros_consultor_arquivos">[],
  organization: "11111111-1111-4111-8111-111111111111",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "actor" }, profile: { user_id: "actor", organization_id: mocks.organization, ativo: true, senha_provisoria: false },
  loading: false, roles: ["consultor_tecnico"],
}) }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOnlineStatus: () => true }));
vi.mock("@/hooks/useSignedUrls", () => ({ useSignedUrls: () => ({ urls: { [`11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/documento/file.pdf`]: "https://example.invalid/private" }, error: null, refresh: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.rows, refetch: mocks.refresh }),
  useQueryClient: () => ({ invalidateQueries: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "actor" } }, error: null }) },
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  from: (table: string) => {
    if (table === "profiles") {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { organization_id: mocks.organization, ativo: true }, error: null }) };
      return chain;
    }
    const deletion = { eq: () => deletion, select: mocks.deleted };
    return { insert: mocks.insert, delete: mocks.removeMetadata.mockImplementation(() => deletion) };
  },
} }));
import WizardAnexosStep from "@/pages/app/wizard/WizardAnexosStep";
import { isConsultorStoragePath } from "@/lib/tenantStoragePath";
import { validateTechnicalAttachment } from "@/lib/mediaUpload";

const props = { remoteRegistroId: visit, locked: false, onDone: vi.fn() };
const choose = (file: File) => fireEvent.change(screen.getByLabelText("Selecionar foto ou PDF"), { target: { files: [file] } });
const file = (name = "file.pdf", type = "application/pdf") => new File(["fake"], name, { type });
const attachment = (): Tables<"registros_consultor_arquivos"> => ({
  id: "fake-attachment", registro_consultor_id: visit, arquivo_path: `${org}/${visit}/documento/file.pdf`,
  arquivo_url: null, nome_arquivo: "file.pdf", legenda: null, tipo_arquivo: "application/pdf", tipo_midia: "pdf",
  categoria_arquivo: "geral", uploaded_at: "2026-10-09", uploaded_by: "actor", client_uuid: null,
  capturado_em: null, duracao_segundos: null, foto_principal: false, latitude: null, longitude: null, ponto_area: null,
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.rows = []; mocks.organization = org;
  mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
  mocks.single.mockResolvedValue({ data: { id: "new" }, error: null });
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.deleted.mockResolvedValue({ data: [{ id: "fake-attachment" }], error: null });
  mocks.refresh.mockResolvedValue(undefined);
});
afterEach(cleanup);

it.each([["file.pdf", "application/pdf", "documento", "pdf"], ["photo.jpg", "image/jpeg", "foto", "foto"]])(
  "envia %s com path e enums reais", async (name, mime, folder, media) => {
    render(<WizardAnexosStep {...props} />); choose(file(name, mime));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Anexo enviado."));
    const path = mocks.upload.mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^${org}/${visit}/${folder}/[a-f0-9-]+\\.${name.split(".").pop()}$`));
    expect(mocks.upload.mock.calls[0][2]).toEqual({ contentType: mime, upsert: false });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo_midia: media, categoria_arquivo: "geral", uploaded_by: "actor", arquivo_path: path }));
  },
);
it("aceita exatamente 15MB e rejeita acima do limite", () => {
  const valid = file(); Object.defineProperty(valid, "size", { value: 15 * 1024 * 1024 });
  expect(validateTechnicalAttachment(valid).mediaType).toBe("pdf");
  const oversized = file(); Object.defineProperty(oversized, "size", { value: 15 * 1024 * 1024 + 1 });
  expect(() => validateTechnicalAttachment(oversized)).toThrow("15MB");
});
it("arquivo acima de 15MB não chega ao Storage", async () => {
  const oversized = file(); Object.defineProperty(oversized, "size", { value: 15 * 1024 * 1024 + 1 });
  render(<WizardAnexosStep {...props} />); choose(oversized);
  await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("15MB")));
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("visita inválida não gera upload nem metadata", async () => {
  render(<WizardAnexosStep {...props} remoteRegistroId="../visit" />); choose(file());
  await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
});
it.each([["movie.mp4", "video/mp4"], ["sound.webm", "audio/webm"], ["file.jpg", "application/pdf"], ["file.pdf", ""], ["evil.svg", "image/svg+xml"], ["../file.pdf", "application/pdf"]])(
  "nega MIME/extensão %s antes do upload", async (name, mime) => {
    render(<WizardAnexosStep {...props} />); choose(file(name, mime));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  },
);
it("nega arquivo vazio e enum/caminho legado inválidos", () => {
  expect(() => validateTechnicalAttachment(new File([], "file.pdf", { type: "application/pdf" }))).toThrow();
  expect(isConsultorStoragePath(`${org}/${visit}/documento/file.pdf`, org, visit)).toBe(true);
  for (const path of [`${org}/anexos/actor/${visit}/file.pdf`, `${org}/${visit}/video/file.mp4`, `${org}/${visit}/documento/../file.pdf`, `${org}/${visit}/anexo/file.pdf`, `${org}/${org}/foto/file.jpg`]) {
    expect(isConsultorStoragePath(path, org, visit)).toBe(false);
  }
});
it("serializa duplo envio antes do primeiro await", async () => {
  let finish: ((value: { error: null }) => void) | undefined;
  mocks.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<WizardAnexosStep {...props} />);
  act(() => { choose(file()); choose(file()); });
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled();
  await act(async () => { finish?.({ error: null }); });
  await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
});
it.each(["error", "rejection", "empty"])("falha metadata %s compensa somente blob criado", async mode => {
  if (mode === "error") mocks.single.mockResolvedValue({ error: { message: "private URL" }, data: null });
  if (mode === "rejection") mocks.single.mockRejectedValue(new Error("private URL"));
  if (mode === "empty") mocks.single.mockResolvedValue({ error: null, data: null });
  render(<WizardAnexosStep {...props} />); choose(file());
  await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
  expect(mocks.toastError.mock.calls[0][0]).not.toContain("private URL");
});
it.each(["error", "rejection"])("falha compensação %s não anuncia sucesso", async mode => {
  mocks.single.mockResolvedValue({ error: { message: "metadata" }, data: null });
  if (mode === "error") mocks.remove.mockResolvedValue({ error: { message: "storage" } });
  else mocks.remove.mockRejectedValue(new Error("storage"));
  render(<WizardAnexosStep {...props} />); choose(file());
  await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("Não foi possível limpar")));
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
});
it("falha upload não compensa blob que não criou", async () => {
  mocks.upload.mockResolvedValue({ error: { message: "collision" } });
  render(<WizardAnexosStep {...props} />); choose(file());
  await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
});
it("abrir e cancelar remoção não produz efeitos", () => {
  mocks.rows = [attachment()]; render(<WizardAnexosStep {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Remover" }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("alertdialog")).toBeNull(); expect(mocks.removeMetadata).not.toHaveBeenCalled();
});
it.each(["error", "rejection"])("falha Storage %s preserva metadata e diálogo", async mode => {
  mocks.rows = [attachment()];
  if (mode === "error") mocks.remove.mockResolvedValue({ error: { message: "denied" } });
  else mocks.remove.mockRejectedValue(new Error("denied"));
  render(<WizardAnexosStep {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Remover" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("preservado"));
  expect(mocks.removeMetadata).not.toHaveBeenCalled(); expect(mocks.toastSuccess).not.toHaveBeenCalled();
});
it("remoção confirmada serializa duplo clique e cerca metadata por visita/path", async () => {
  mocks.rows = [attachment()];
  let finish: ((value: { error: null }) => void) | undefined;
  mocks.remove.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<WizardAnexosStep {...props} />); fireEvent.click(screen.getByRole("button", { name: "Remover" }));
  const button = screen.getByRole("button", { name: "Confirmar remoção" });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(mocks.remove).toHaveBeenCalledTimes(1); expect(mocks.removeMetadata).not.toHaveBeenCalled();
  await act(async () => { finish?.({ error: null }); });
  await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Anexo removido."));
  expect(mocks.removeMetadata).toHaveBeenCalledTimes(1);
});
it("leitura conserva acesso assinado sem controles de escrita", () => {
  mocks.rows = [attachment()]; render(<WizardAnexosStep {...props} locked />);
  expect(screen.getByRole("link", { name: "Abrir" })).toHaveAttribute("href", "https://example.invalid/private");
  expect(screen.queryByRole("button", { name: "Remover" })).toBeNull();
  expect(screen.queryByLabelText("Selecionar foto ou PDF")).toBeNull();
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
});
it("falha metadata de remoção não anuncia sucesso", async () => {
  mocks.rows = [attachment()]; mocks.deleted.mockResolvedValue({ error: { message: "denied" }, data: null });
  render(<WizardAnexosStep {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Remover" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("preservado"));
  expect(mocks.toastSuccess).not.toHaveBeenCalled(); expect(screen.getByRole("alertdialog")).toBeTruthy();
});
it("troca de tenant durante upload impede metadata e sucesso tardios", async () => {
  let finish: ((value: { error: null }) => void) | undefined;
  mocks.upload.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const h = render(<WizardAnexosStep {...props} />); choose(file());
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
  mocks.organization = "33333333-3333-4333-8333-333333333333"; h.rerender(<WizardAnexosStep {...props} />);
  await act(async () => { finish?.({ error: null }); });
  expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.toastSuccess).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
});