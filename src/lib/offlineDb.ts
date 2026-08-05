/**
 * IndexedDB-based offline queue for pending operations.
 * Stores registros_consultor + their photos when offline.
 *
 * v3: client_uuid (idempotência), tracking de upload de mídia, retry com backoff.
 */

const DB_NAME = "arbio_offline";
const DB_VERSION = 7;
const STORE_REGISTROS = "pending_registros";
const STORE_FOTOS = "pending_fotos";
const STORE_CHECKINS = "pending_checkins";
const STORE_SYNCED_MAPPINGS = "synced_visit_mappings";
const STORE_CAMPO = "pending_campo";
const STORE_DIAGNOSTICOS = "pending_diagnosticos";
const STORE_RECOMENDACOES = "pending_recomendacoes";

const STALE_SYNC_MS = 60_000;
/** 30 dias — janela para preservar mapping local→remote após remoção da pendência */
const MAPPING_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type PendingOperationType = "create_consultor_record" | "create_technical_visit";
export type PendingSyncStatus =
  | "local_draft"
  | "pending_sync"
  | "syncing"
  | "synced"
  | "sync_error";

export interface PendingRegistro {
  id: string;
  /** UUID gerado no cliente — usado para idempotência no servidor */
  clientUuid?: string;
  /** Tipo de operação — determina o contrato de sincronização */
  operationType?: PendingOperationType;
  payload: Record<string, any>;
  createdAt: string;
  synced: boolean;
  syncingAt?: number | null;
  /** ID remoto recuperado após primeira sincronização bem-sucedida */
  remoteId?: string | null;
  /** Versão do servidor (rpc idempotente) */
  version?: number | null;
  syncStatus?: PendingSyncStatus;
  lastSyncError?: string | null;
}

export interface PendingFoto {
  id: string;
  registroLocalId: string;
  file: Blob;
  fileName: string;
  mimeType: string;
  isPrincipal: boolean;
  /** Já confirmado no storage */
  uploaded?: boolean;
  /** Path final usado no storage (idempotente) */
  remotePath?: string | null;
  uploadAttempts?: number;
  lastUploadError?: string | null;
  /**
   * Visita JÁ existente no servidor (fluxo online que falhou só na mídia).
   * Quando presente, a mídia é reenviada isoladamente — nunca recria a visita.
   */
  remoteRegistroId?: string | null;
  /** Chave de idempotência da referência em registros_consultor_arquivos */
  clientUuid?: string | null;
  categoria?: string | null;
  /** Lease de sincronização (evita duas abas processarem a mesma mídia) */
  syncingAt?: number | null;
  /** Estado recuperável da mídia na fila */
  syncStatus?: PendingSyncStatus;
  /** Metadados preservados no retry */
  tipoMidia?: "foto" | "audio" | "documento";
  legenda?: string | null;
  duracaoSegundos?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  capturadoEm?: string | null;
}

/** Tentativas máximas antes de exigir ação explícita do usuário. */
export const MAX_MEDIA_SYNC_ATTEMPTS = 3;



export interface PendingCheckin {
  id: string;
  clientUuid?: string;
  payload: Record<string, any>;
  fotoBlob?: Blob;
  fotoFileName?: string;
  fotoMimeType?: string;
  /** Foto já no storage */
  fotoUploaded?: boolean;
  fotoRemotePath?: string | null;
  fotoUploadAttempts?: number;
  fotoLastError?: string | null;
  createdAt: string;
  syncingAt?: number | null;
  /** Fase 12.8 · Fase 3: último erro de sincronização (para reconciliação). */
  lastSyncError?: string | null;
}

/**
 * Mapeamento local→remoto preservado após a sincronização.
 * Permite resolver /app/visita/novo?local_id=... para o registro remoto
 * mesmo após a pendência ter sido removida da fila.
 */
export interface SyncedVisitMapping {
  localId: string;
  clientUuid: string;
  remoteId: string;
  version?: number | null;
  syncedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_REGISTROS)) {
        db.createObjectStore(STORE_REGISTROS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FOTOS)) {
        const store = db.createObjectStore(STORE_FOTOS, { keyPath: "id" });
        store.createIndex("byRegistro", "registroLocalId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CHECKINS)) {
        db.createObjectStore(STORE_CHECKINS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SYNCED_MAPPINGS)) {
        const store = db.createObjectStore(STORE_SYNCED_MAPPINGS, { keyPath: "localId" });
        store.createIndex("byClientUuid", "clientUuid", { unique: false });
        store.createIndex("bySyncedAt", "syncedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CAMPO)) {
        const store = db.createObjectStore(STORE_CAMPO, { keyPath: "localRegistroId" });
        store.createIndex("byClientUuid", "clientUuid", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DIAGNOSTICOS)) {
        const store = db.createObjectStore(STORE_DIAGNOSTICOS, { keyPath: "clientUuid" });
        store.createIndex("byLocalRegistroId", "localRegistroId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_RECOMENDACOES)) {
        const store = db.createObjectStore(STORE_RECOMENDACOES, { keyPath: "clientUuid" });
        store.createIndex("byLocalRegistroId", "localRegistroId", { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

/** Utilitário exclusivo para testes: fecha conexão cacheada e apaga o DB. */
export async function __resetOfflineDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
    dbPromise = null;
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function isStale(syncingAt?: number | null): boolean {
  if (!syncingAt) return true;
  return Date.now() - syncingAt > STALE_SYNC_MS;
}

export async function claimPendingRegistro(id: string): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTROS, "readwrite");
    const store = tx.objectStore(STORE_REGISTROS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingRegistro | undefined;
      if (!item || item.synced) return resolve(false);
      if (item.syncingAt && !isStale(item.syncingAt)) return resolve(false);
      store.put({ ...item, syncingAt: Date.now() });
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function claimPendingCheckin(id: string): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKINS, "readwrite");
    const store = tx.objectStore(STORE_CHECKINS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingCheckin | undefined;
      if (!item) return resolve(false);
      if (item.syncingAt && !isStale(item.syncingAt)) return resolve(false);
      store.put({ ...item, syncingAt: Date.now() });
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function releasePendingRegistro(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTROS, "readwrite");
    const store = tx.objectStore(STORE_REGISTROS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingRegistro | undefined;
      if (item) store.put({ ...item, syncingAt: null });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function releasePendingCheckin(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKINS, "readwrite");
    const store = tx.objectStore(STORE_CHECKINS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingCheckin | undefined;
      if (item) store.put({ ...item, syncingAt: null });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Atualiza o registro pendente com o ID remoto (e opcionalmente versão) após sync bem-sucedida. */
export async function setRegistroRemoteId(
  id: string,
  remoteId: string,
  version?: number | null,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTROS, "readwrite");
    const store = tx.objectStore(STORE_REGISTROS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingRegistro | undefined;
      if (item) {
        const patch: PendingRegistro = { ...item, remoteId };
        if (version !== undefined) patch.version = version;
        store.put(patch);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePendingCheckin(checkin: PendingCheckin): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKINS, "readwrite");
    tx.objectStore(STORE_CHECKINS).put({
      ...checkin,
      syncingAt: null,
      fotoUploaded: checkin.fotoUploaded ?? false,
      fotoUploadAttempts: checkin.fotoUploadAttempts ?? 0,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCheckins(): Promise<PendingCheckin[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKINS, "readonly");
    const req = tx.objectStore(STORE_CHECKINS).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result || []).filter((c: PendingCheckin) => !c.syncingAt || isStale(c.syncingAt))
      );
    req.onerror = () => reject(req.error);
  });
}

/** Sem filtro de stale — para auditoria */
export async function getAllPendingCheckinsRaw(): Promise<PendingCheckin[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKINS, "readonly");
    const req = tx.objectStore(STORE_CHECKINS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function updatePendingCheckin(
  id: string,
  patch: Partial<PendingCheckin>
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKINS, "readwrite");
    const store = tx.objectStore(STORE_CHECKINS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingCheckin | undefined;
      if (item) store.put({ ...item, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removePendingCheckin(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHECKINS, "readwrite");
    tx.objectStore(STORE_CHECKINS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePendingRegistro(registro: PendingRegistro): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTROS, "readwrite");
    tx.objectStore(STORE_REGISTROS).put({ ...registro, syncingAt: null });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingRegistroById(id: string): Promise<PendingRegistro | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTROS, "readonly");
    const req = tx.objectStore(STORE_REGISTROS).get(id);
    req.onsuccess = () => resolve((req.result as PendingRegistro) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function updatePendingRegistro(
  id: string,
  patch: Partial<PendingRegistro>
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTROS, "readwrite");
    const store = tx.objectStore(STORE_REGISTROS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingRegistro | undefined;
      if (item) store.put({ ...item, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePendingFoto(foto: PendingFoto): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readwrite");
    tx.objectStore(STORE_FOTOS).put({
      ...foto,
      uploaded: foto.uploaded ?? false,
      uploadAttempts: foto.uploadAttempts ?? 0,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updatePendingFoto(
  id: string,
  patch: Partial<PendingFoto>
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readwrite");
    const store = tx.objectStore(STORE_FOTOS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingFoto | undefined;
      if (item) store.put({ ...item, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingRegistros(): Promise<PendingRegistro[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTROS, "readonly");
    const req = tx.objectStore(STORE_REGISTROS).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result || []).filter(
          (r: PendingRegistro) => !r.synced && (!r.syncingAt || isStale(r.syncingAt))
        )
      );
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPendingRegistrosRaw(): Promise<PendingRegistro[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTROS, "readonly");
    const req = tx.objectStore(STORE_REGISTROS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getFotosForRegistro(registroLocalId: string): Promise<PendingFoto[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readonly");
    const index = tx.objectStore(STORE_FOTOS).index("byRegistro");
    const req = index.getAll(registroLocalId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Apenas mídias ainda não confirmadas no storage. */
export async function getPendingMediaForRegistro(
  registroLocalId: string
): Promise<PendingFoto[]> {
  const all = await getFotosForRegistro(registroLocalId);
  return all.filter((f) => !f.uploaded);
}

export async function removePendingRegistro(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_REGISTROS, STORE_FOTOS], "readwrite");
    tx.objectStore(STORE_REGISTROS).delete(id);
    const index = tx.objectStore(STORE_FOTOS).index("byRegistro");
    const req = index.getAllKeys(id);
    req.onsuccess = () => {
      (req.result || []).forEach((key) => {
        tx.objectStore(STORE_FOTOS).delete(key);
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const [regs, checks, campos, diags, recs, orphans] = await Promise.all([
    getPendingRegistros(),
    getPendingCheckins(),
    getPendingCampos(),
    getAllPendingDiagnosticos(),
    getAllPendingRecomendacoes(),
    getOrphanRemoteMedia(),
  ]);
  return (
    regs.length + checks.length + campos.length + diags.length + recs.length + orphans.length
  );
}



/** Conta total de mídias pendentes (registros pendentes + fotos não enviadas). */
export async function getPendingMediaCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readonly");
    const req = tx.objectStore(STORE_FOTOS).getAll();
    req.onsuccess = () => {
      const all = (req.result || []) as PendingFoto[];
      resolve(all.filter((f) => !f.uploaded).length);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Mídias pendentes vinculadas a uma visita que JÁ existe no servidor.
 * São órfãs em relação à fila de registros (não existe PendingRegistro pai)
 * e precisam de um passe próprio de reenvio.
 * Exclui itens em lease ativo (outra aba) e itens em `sync_error`
 * (esgotaram as tentativas e exigem ação explícita do usuário).
 */
export async function getOrphanRemoteMedia(): Promise<PendingFoto[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readonly");
    const req = tx.objectStore(STORE_FOTOS).getAll();
    req.onsuccess = () => {
      const all = (req.result || []) as PendingFoto[];
      resolve(
        all.filter(
          (f) =>
            !f.uploaded &&
            !!f.remoteRegistroId &&
            f.syncStatus !== "sync_error" &&
            (f.uploadAttempts ?? 0) < MAX_MEDIA_SYNC_ATTEMPTS &&
            (!f.syncingAt || isStale(f.syncingAt))
        )
      );
    };
    req.onerror = () => reject(req.error);
  });
}

/** Mídias remotas que esgotaram tentativas — visíveis para retry manual. */
export async function getFailedRemoteMedia(): Promise<PendingFoto[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readonly");
    const req = tx.objectStore(STORE_FOTOS).getAll();
    req.onsuccess = () => {
      const all = (req.result || []) as PendingFoto[];
      resolve(
        all.filter(
          (f) =>
            !f.uploaded &&
            !!f.remoteRegistroId &&
            (f.syncStatus === "sync_error" ||
              (f.uploadAttempts ?? 0) >= MAX_MEDIA_SYNC_ATTEMPTS)
        )
      );
    };
    req.onerror = () => reject(req.error);
  });
}

/** Lease atômico da mídia: apenas um processo/aba vence. */
export async function claimPendingFoto(id: string): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readwrite");
    const store = tx.objectStore(STORE_FOTOS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingFoto | undefined;
      if (!item || item.uploaded) return resolve(false);
      if (item.syncingAt && !isStale(item.syncingAt)) return resolve(false);
      store.put({ ...item, syncingAt: Date.now() });
      resolve(true);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/** Libera o lease sem apagar a mídia. */
export async function releasePendingFoto(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readwrite");
    const store = tx.objectStore(STORE_FOTOS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingFoto | undefined;
      if (item) store.put({ ...item, syncingAt: null });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Reabilita uma mídia em `sync_error` para nova rodada (ação do usuário). */
export async function retryFailedMedia(id: string): Promise<void> {
  await updatePendingFoto(id, {
    syncStatus: "pending_sync",
    uploadAttempts: 0,
    syncingAt: null,
  });
}

/** Remove SOMENTE a mídia (cleanup pós-sucesso), nunca o registro pai. */
export async function removePendingFoto(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readwrite");
    tx.objectStore(STORE_FOTOS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}




// ============================================================================
// synced_visit_mappings — sobreviver ao ciclo local → remoto
// ============================================================================

export async function saveSyncedVisitMapping(m: SyncedVisitMapping): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNCED_MAPPINGS, "readwrite");
    tx.objectStore(STORE_SYNCED_MAPPINGS).put(m);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSyncedVisitMapping(
  localId: string
): Promise<SyncedVisitMapping | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNCED_MAPPINGS, "readonly");
    const req = tx.objectStore(STORE_SYNCED_MAPPINGS).get(localId);
    req.onsuccess = () => resolve((req.result as SyncedVisitMapping) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeSyncedVisitMapping(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNCED_MAPPINGS, "readwrite");
    tx.objectStore(STORE_SYNCED_MAPPINGS).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove mappings mais antigos que o TTL (default 30 dias). */
export async function cleanupOldSyncedVisitMappings(
  ttlMs: number = MAPPING_TTL_MS
): Promise<number> {
  const db = await openDb();
  const cutoff = Date.now() - ttlMs;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNCED_MAPPINGS, "readwrite");
    const store = tx.objectStore(STORE_SYNCED_MAPPINGS);
    const req = store.getAll();
    let removed = 0;
    req.onsuccess = () => {
      const rows = (req.result || []) as SyncedVisitMapping[];
      for (const r of rows) {
        if ((r.syncedAt ?? 0) < cutoff) {
          store.delete(r.localId);
          removed++;
        }
      }
    };
    tx.oncomplete = () => resolve(removed);
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// pending_campo — Etapa 3 do wizard (evidências de campo)
// ============================================================================

export interface PendingCampo {
  /** Chave da store — sempre o ID local do registro (mesmo antes do sync). */
  localRegistroId: string;
  /** UUID idempotente do registro pai (mapeado para o servidor). */
  clientUuid?: string;
  /** ID remoto do registro (resolvido após sync). */
  remoteRegistroId?: string | null;
  /** Payload salvo (talhao, cultura, observações, etc). */
  payload: Record<string, any>;
  /** Versão local — para controle otimista contra o servidor. */
  versao: number;
  updatedAt: string;
  /** Estado de sincronização com o backend. */
  syncStatus: "local_draft" | "pending_sync" | "syncing" | "synced" | "sync_error";
  lastSyncError?: string | null;
  syncingAt?: number | null;
}

export async function savePendingCampo(entry: PendingCampo): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAMPO, "readwrite");
    tx.objectStore(STORE_CAMPO).put({ ...entry, syncingAt: null });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCampoByRegistro(
  localRegistroId: string,
): Promise<PendingCampo | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAMPO, "readonly");
    const req = tx.objectStore(STORE_CAMPO).get(localRegistroId);
    req.onsuccess = () => resolve((req.result as PendingCampo) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function updatePendingCampo(
  localRegistroId: string,
  patch: Partial<PendingCampo>,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAMPO, "readwrite");
    const store = tx.objectStore(STORE_CAMPO);
    const getReq = store.get(localRegistroId);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingCampo | undefined;
      if (item) store.put({ ...item, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removePendingCampo(localRegistroId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAMPO, "readwrite");
    tx.objectStore(STORE_CAMPO).delete(localRegistroId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCampos(): Promise<PendingCampo[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAMPO, "readonly");
    const req = tx.objectStore(STORE_CAMPO).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result || []).filter(
          (c: PendingCampo) =>
            c.syncStatus !== "synced" && (!c.syncingAt || isStale(c.syncingAt)),
        ),
      );
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// pending_diagnosticos — Etapa 4 do wizard (1:N por registro)
// ============================================================================

export interface PendingDiagnostico {
  /** Chave — UUID gerado no cliente, idempotente contra o servidor */
  clientUuid: string;
  /** ID local do registro pai (não altera após sync) */
  localRegistroId: string;
  /** ID remoto do diagnóstico após sincronização */
  remoteId?: string | null;
  payload: {
    categoria?: string | null;
    problema?: string | null;
    descricao?: string | null;
    severidade?: string | null;
    incidencia?: number | null;
    urgencia?: string | null;
    risco?: string | null;
    intervencao?: string | null;
    localizacao?: string | null;
  };
  versao: number;
  updatedAt: string;
  /** Marcado para exclusão remota */
  deleted?: boolean;
  syncStatus: "local_draft" | "pending_sync" | "syncing" | "synced" | "sync_error";
  lastSyncError?: string | null;
  syncingAt?: number | null;
}

export async function savePendingDiagnostico(entry: PendingDiagnostico): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIAGNOSTICOS, "readwrite");
    tx.objectStore(STORE_DIAGNOSTICOS).put({ ...entry, syncingAt: null });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingDiagnosticosByRegistro(
  localRegistroId: string,
): Promise<PendingDiagnostico[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIAGNOSTICOS, "readonly");
    const index = tx.objectStore(STORE_DIAGNOSTICOS).index("byLocalRegistroId");
    const req = index.getAll(localRegistroId);
    req.onsuccess = () => resolve((req.result || []) as PendingDiagnostico[]);
    req.onerror = () => reject(req.error);
  });
}

export async function updatePendingDiagnostico(
  clientUuid: string,
  patch: Partial<PendingDiagnostico>,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIAGNOSTICOS, "readwrite");
    const store = tx.objectStore(STORE_DIAGNOSTICOS);
    const getReq = store.get(clientUuid);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingDiagnostico | undefined;
      if (item) store.put({ ...item, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removePendingDiagnostico(clientUuid: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIAGNOSTICOS, "readwrite");
    tx.objectStore(STORE_DIAGNOSTICOS).delete(clientUuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllPendingDiagnosticos(): Promise<PendingDiagnostico[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIAGNOSTICOS, "readonly");
    const req = tx.objectStore(STORE_DIAGNOSTICOS).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result || []).filter(
          (d: PendingDiagnostico) =>
            d.syncStatus !== "synced" && (!d.syncingAt || isStale(d.syncingAt)),
        ),
      );
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// pending_recomendacoes — Etapa 5 do wizard (1:N por registro)
// ============================================================================

export interface PendingRecomendacao {
  /** Chave — UUID gerado no cliente, idempotente contra o servidor */
  clientUuid: string;
  localRegistroId: string;
  remoteId?: string | null;
  payload: {
    recomendacao_tecnica?: string | null;
    objetivo_recomendacao?: string | null;
    estrategia_manejo?: string | null;
    microrganismo_id?: string | null;
    produto_biologico_sugerido_id?: string | null;
    dose_recomendada_valor?: number | null;
    dose_recomendada_unidade?: string | null;
    volume_calda?: string | null;
    volume_total_recomendado?: number | null;
    numero_aplicacoes?: number | null;
    intervalo_aplicacoes?: string | null;
    modo_aplicacao?: string | null;
    momento_aplicacao?: string | null;
    cuidados_operacionais?: string | null;
    compatibilidade_observacoes?: string | null;
    observacoes_finais?: string | null;
    encaminhar_para_os?: boolean | null;
  };
  versao: number;
  updatedAt: string;
  deleted?: boolean;
  syncStatus: "local_draft" | "pending_sync" | "syncing" | "synced" | "sync_error";
  lastSyncError?: string | null;
  syncingAt?: number | null;
}

export async function savePendingRecomendacao(entry: PendingRecomendacao): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOMENDACOES, "readwrite");
    tx.objectStore(STORE_RECOMENDACOES).put({ ...entry, syncingAt: null });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingRecomendacoesByRegistro(
  localRegistroId: string,
): Promise<PendingRecomendacao[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOMENDACOES, "readonly");
    const index = tx.objectStore(STORE_RECOMENDACOES).index("byLocalRegistroId");
    const req = index.getAll(localRegistroId);
    req.onsuccess = () => resolve((req.result || []) as PendingRecomendacao[]);
    req.onerror = () => reject(req.error);
  });
}

export async function updatePendingRecomendacao(
  clientUuid: string,
  patch: Partial<PendingRecomendacao>,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOMENDACOES, "readwrite");
    const store = tx.objectStore(STORE_RECOMENDACOES);
    const getReq = store.get(clientUuid);
    getReq.onsuccess = () => {
      const item = getReq.result as PendingRecomendacao | undefined;
      if (item) store.put({ ...item, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removePendingRecomendacao(clientUuid: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOMENDACOES, "readwrite");
    tx.objectStore(STORE_RECOMENDACOES).delete(clientUuid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllPendingRecomendacoes(): Promise<PendingRecomendacao[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECOMENDACOES, "readonly");
    const req = tx.objectStore(STORE_RECOMENDACOES).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result || []).filter(
          (r: PendingRecomendacao) =>
            r.syncStatus !== "synced" && (!r.syncingAt || isStale(r.syncingAt)),
        ),
      );
    req.onerror = () => reject(req.error);
  });
}
