import { describe, it, expect } from "vitest";
import { canAccess, type AppRole } from "@/lib/permissions";

const ALL_ROLES: AppRole[] = [
  "administrador", "gestor", "consultor_tecnico", "tecnico_agronomo",
  "aplicador", "operador_onfarm", "producao", "administrativo", "financeiro",
  "gestor_comercial", "cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico",
];

const SHARED = ["administrador", "cliente_produtor", "consultor_tecnico", "tecnico_agronomo", "aplicador"];
const TECHNICAL = ["administrador", "consultor_tecnico", "tecnico_agronomo", "aplicador"];
const PRODUCER = ["administrador", "cliente_produtor"];

describe("Fase 3.2 — proteção declarativa do portal mobile /app/*", () => {
  it.each(["/app", "/app/perfil", "/app/notificacoes"])("rota compartilhada %s", (route) => {
    for (const r of ALL_ROLES) {
      expect(canAccess(r, route)).toBe(SHARED.includes(r));
    }
  });

  it.each([
    "/app/fazendas", "/app/registrar", "/app/registros", "/app/ordens",
    "/app/solicitacoes", "/app/checkin", "/app/visita/novo", "/app/catalogo",
  ])("rota técnica %s", (route) => {
    for (const r of ALL_ROLES) {
      expect(canAccess(r, route)).toBe(TECHNICAL.includes(r));
    }
  });

  it.each(["/app/recomendacoes", "/app/entregas", "/app/aplicacoes", "/app/solicitar"])(
    "rota produtor %s",
    (route) => {
      for (const r of ALL_ROLES) {
        expect(canAccess(r, route)).toBe(PRODUCER.includes(r));
      }
    },
  );
});
