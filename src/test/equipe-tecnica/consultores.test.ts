import { describe, it, expect } from "vitest";
import {
  ROLES_EQUIPE_TECNICA,
  mapConsultores,
  isConsultorAtivo,
  filtrarConsultores,
  rolesOrfaos,
  emailsDuplicados,
} from "@/lib/equipe-tecnica/consultores";

describe("equipe técnica — mapConsultores", () => {
  it("não duplica usuário multipapel e agrega todos os papéis", () => {
    const out = mapConsultores(
      [
        { user_id: "u1", role: "gestor" },
        { user_id: "u1", role: "consultor_tecnico" },
      ],
      [{ user_id: "u1", nome: "Ana" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].roles.sort()).toEqual(["consultor_tecnico", "gestor"]);
    expect(out[0].role).toBe("consultor_tecnico");
  });

  it("retorna vazio sem perfis", () => {
    expect(mapConsultores([{ user_id: "u1", role: "gestor" }], [])).toEqual([]);
    expect(mapConsultores(null, null)).toEqual([]);
  });

  it("cobre apenas os papéis técnicos declarados", () => {
    expect(ROLES_EQUIPE_TECNICA).toEqual(["tecnico_agronomo", "consultor_tecnico", "gestor"]);
  });
});

describe("equipe técnica — status", () => {
  it("considera ativo quando ativo é true ou nulo", () => {
    expect(isConsultorAtivo({ ativo: true })).toBe(true);
    expect(isConsultorAtivo({ ativo: null })).toBe(true);
    expect(isConsultorAtivo({})).toBe(true);
  });

  it("considera inativo apenas quando ativo é false", () => {
    expect(isConsultorAtivo({ ativo: false })).toBe(false);
  });
});

describe("equipe técnica — busca", () => {
  const lista = [
    { nome: "Ana Souza", email: "ana@arbio.com" },
    { nome: "Bruno Lima", email: "bruno@arbio.com" },
  ];

  it("retorna tudo com termo vazio ou só espaços", () => {
    expect(filtrarConsultores(lista, "")).toHaveLength(2);
    expect(filtrarConsultores(lista, "   ")).toHaveLength(2);
  });

  it("filtra por nome e e-mail ignorando caixa e espaços", () => {
    expect(filtrarConsultores(lista, " ANA ")).toHaveLength(1);
    expect(filtrarConsultores(lista, "bruno@")).toHaveLength(1);
  });

  it("não busca por campo inexistente no perfil (CREA foi removido)", () => {
    const comCampoMorto = [{ nome: "Ana", email: "a@a.com", crea: "MG-123" }];
    expect(filtrarConsultores(comCampoMorto, "mg-123")).toHaveLength(0);
  });

  it("não quebra com campos ausentes", () => {
    expect(filtrarConsultores([{ nome: null, email: null }], "ana")).toHaveLength(0);
  });
});

describe("equipe técnica — integridade", () => {
  it("aponta papéis sem perfil (órfãos)", () => {
    expect(
      rolesOrfaos(
        [
          { user_id: "u1", role: "gestor" },
          { user_id: "u2", role: "consultor_tecnico" },
        ],
        [{ user_id: "u1" }],
      ),
    ).toEqual(["u2"]);
  });

  it("detecta e-mails duplicados ignorando caixa", () => {
    expect(
      emailsDuplicados([
        { email: "ana@arbio.com" },
        { email: "ANA@arbio.com " },
        { email: null },
      ]),
    ).toEqual(["ana@arbio.com"]);
  });
});
