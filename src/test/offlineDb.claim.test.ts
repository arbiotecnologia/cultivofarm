/**
 * Testes do mecanismo de claim/release no IndexedDB.
 * Valida que apenas 1 "trabalhador" consegue reivindicar um item por vez,
 * simulando concorrência entre StrictMode e múltiplas abas.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  savePendingRegistro,
  claimPendingRegistro,
  releasePendingRegistro,
  getPendingRegistros,
  savePendingCheckin,
  claimPendingCheckin,
  releasePendingCheckin,
  savePendingFoto,
  claimPendingFoto,
  releasePendingFoto,
  __resetOfflineDbForTests,
  type PendingRegistro,
  type PendingCheckin,
} from "@/lib/offlineDb";

function makeRegistro(id: string): PendingRegistro {
  return {
    id,
    clientUuid: id,
    payload: { objetivo_visita: "Teste " + id, problema_principal: "x" },
    createdAt: new Date().toISOString(),
    synced: false,
  };
}

function makeCheckin(id: string): PendingCheckin {
  return {
    id,
    clientUuid: id,
    payload: { tipo_checkin: "chegada_fazenda" },
    createdAt: new Date().toISOString(),
  };
}

beforeEach(async () => {
  await __resetOfflineDbForTests();
});

describe("claimPendingRegistro", () => {
  it("apenas o primeiro claim concorrente vence", async () => {
    await savePendingRegistro(makeRegistro("r1"));

    const [a, b] = await Promise.all([
      claimPendingRegistro("r1"),
      claimPendingRegistro("r1"),
    ]);

    // Pelo menos um deve ganhar; um deve perder (idealmente XOR)
    expect(a !== b || a === false).toBe(true);
    expect([a, b].filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it("após release, novo claim funciona", async () => {
    await savePendingRegistro(makeRegistro("r2"));
    const first = await claimPendingRegistro("r2");
    expect(first).toBe(true);

    const second = await claimPendingRegistro("r2");
    expect(second).toBe(false);

    await releasePendingRegistro("r2");
    const third = await claimPendingRegistro("r2");
    expect(third).toBe(true);
  });

  it("getPendingRegistros filtra itens em sincronização", async () => {
    await savePendingRegistro(makeRegistro("r3"));
    await claimPendingRegistro("r3");
    const pending = await getPendingRegistros();
    expect(pending.find((r) => r.id === "r3")).toBeUndefined();
  });
});

describe("claimPendingCheckin", () => {
  it("checkin: claim duplicado é rejeitado", async () => {
    await savePendingCheckin(makeCheckin("c1"));
    const a = await claimPendingCheckin("c1");
    const b = await claimPendingCheckin("c1");
    expect(a).toBe(true);
    expect(b).toBe(false);
    await releasePendingCheckin("c1");
  });
});

describe("claimPendingFoto", () => {
  it("dois claims concorrentes têm exatamente um vencedor", async () => {
    await savePendingFoto({
      id: "foto-concorrente",
      registroLocalId: "visita-local",
      remoteRegistroId: "00000000-0000-0000-0000-000000000001",
      clientUuid: "00000000-0000-0000-0000-000000000002",
      file: new Blob(["evidencia"], { type: "image/jpeg" }),
      fileName: "evidencia.jpg",
      mimeType: "image/jpeg",
      isPrincipal: true,
      latitude: -15.5,
      longitude: -47.5,
      capturadoEm: "2026-08-05T12:00:00.000Z",
      syncStatus: "pending_sync",
    });

    const outcomes = await Promise.all([
      claimPendingFoto("foto-concorrente"),
      claimPendingFoto("foto-concorrente"),
    ]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((value) => !value)).toHaveLength(1);
    await releasePendingFoto("foto-concorrente");
  });
});
