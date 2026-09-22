import { describe, it, expect } from "vitest";
import {
  classificarErroRpcEdicao,
  mapearErroEdicaoUsuario,
  edicaoExigeRecargaAposErro,
  mapearErroStatusUsuario,
  ErroStatusLocal,
  MSG_ULTIMO_ADMIN_ATIVO,
  MSG_STATUS_ERRO_GENERICO,
  MSG_STATUS_SEM_PERMISSAO,
  MSG_EDICAO_NAO_CONFIRMADA,
} from "@/lib/configuracoes/edicaoUsuarioRpc";
import { MSG_AUTO_DESATIVACAO } from "@/lib/configuracoes/usuariosValidation";

const MSG_ESPERADA =
  "Não é possível remover ou desativar o último administrador ativo. Mantenha outro administrador ativo antes de continuar.";

describe("último administrador ativo — edição (RPC)", () => {
  it("reconhece o token user_last_active_admin (PT409) com mensagem exata", () => {
    const erro = { message: "user_last_active_admin", code: "PT409" };
    const e = classificarErroRpcEdicao(erro);
    expect(e.codigo).toBe("user_last_active_admin");
    expect(e.origem).toBe("rpc");
    expect(mapearErroEdicaoUsuario(erro)).toBe(MSG_ESPERADA);
    expect(MSG_ULTIMO_ADMIN_ATIVO).toBe(MSG_ESPERADA);
    expect(edicaoExigeRecargaAposErro(erro)).toBe(false);
  });

  it("mantém os tokens user_edit_* existentes e o conflito com recarga", () => {
    expect(mapearErroEdicaoUsuario({ message: "user_edit_invalid_phone" })).toMatch(/10 ou 11/);
    expect(edicaoExigeRecargaAposErro({ message: "user_edit_conflict" })).toBe(true);
  });

  it("token desconhecido continua ambíguo, sem vazar texto do servidor", () => {
    const cru = 'ERROR: duplicate key value violates unique constraint "profiles_pkey"';
    const msg = mapearErroEdicaoUsuario({ message: cru, details: "SELECT 1 FROM profiles" });
    expect(msg).toBe(MSG_EDICAO_NAO_CONFIRMADA);
    expect(msg).not.toContain("profiles");
    expect(edicaoExigeRecargaAposErro({ message: cru })).toBe(true);
  });
});

describe("último administrador ativo — status", () => {
  it("erro remoto com o token exibe a mensagem específica", () => {
    expect(mapearErroStatusUsuario({ message: "user_last_active_admin", code: "PT409" })).toBe(
      MSG_ESPERADA,
    );
  });

  it("erro de permissão exibe mensagem segura de permissão", () => {
    expect(mapearErroStatusUsuario({ code: "42501", message: "permission denied for table profiles" })).toBe(
      MSG_STATUS_SEM_PERMISSAO,
    );
  });

  it("erro remoto desconhecido vira genérico e não vaza SQL", () => {
    const msg = mapearErroStatusUsuario({
      message: 'update "profiles" set ativo = false -- syntax error at or near',
      details: "PL/pgSQL function xyz line 12",
    });
    expect(msg).toBe(MSG_STATUS_ERRO_GENERICO);
    expect(msg).not.toMatch(/profiles|PL\/pgSQL|syntax/i);
  });

  it("validação local conhecida preserva a mensagem (autodesativação e zero linhas)", () => {
    expect(mapearErroStatusUsuario(new ErroStatusLocal(MSG_AUTO_DESATIVACAO))).toBe(
      MSG_AUTO_DESATIVACAO,
    );
    const zero = new ErroStatusLocal(
      "Não foi possível confirmar a atualização (status do usuário). Recarregue a lista e verifique antes de tentar novamente.",
    );
    expect(mapearErroStatusUsuario(zero)).toBe(zero.message);
  });
});
