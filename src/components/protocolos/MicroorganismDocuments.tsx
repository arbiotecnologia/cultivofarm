import { useEffect, useRef, useState } from "react";
import { Download, FilePlus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";
import {
  listMicroDocuments,
  microDocumentBytes,
  uploadMicroDocument,
  verifyMicroDocument,
  type DocumentAttempt,
  type MicroDocument,
} from "@/lib/catalogo/microorganismDocuments";

export function MicroorganismDocuments({
  micro,
  organization,
  version,
  editable,
  blocked,
  onWorking,
  onCommitted,
}: {
  micro: string;
  organization: string;
  version: string | null;
  editable: boolean;
  blocked: boolean;
  onWorking(busy: boolean): void;
  onCommitted(version: string): void;
}) {
  const access = useStorageAccessScope(`micro-documents:${micro}`);
  const [rows, setRows] = useState<MicroDocument[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState<MicroDocument | null>(null);
  const [selected, setSelected] = useState<MicroDocument | null>(null);
  const attempt = useRef<DocumentAttempt | null>(null);
  const operation = useRef<AbortController | null>(null);
  const read = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const initialScope = useRef(access.scope);
  const currentScope = initialScope.current === access.scope && access.ready;
  const opener = useAuthenticatedAttachmentOpener(
    `micro-document-view:${micro}`,
    "microorganism-documents",
    async (id, signal) => {
      const doc = rows.find((row) => row.id === id);
      if (!doc) throw new Error("Documento não encontrado.");
      const blob = await microDocumentBytes("open", micro, id, signal);
      if (!(blob instanceof Blob)) throw new Error("Arquivo inválido.");
      return (await verifyMicroDocument(blob, doc)).blob;
    },
  );
  const refresh = async () => {
    if (!currentScope || lock.current) return;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    const current = access.capture();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const docs = await listMicroDocuments(
        micro,
        organization,
        controller.signal,
      );
      if (
        current() &&
        !controller.signal.aborted &&
        read.current === controller
      )
        setRows(docs);
    } catch (e) {
      if (current() && read.current === controller) {
        setRows([]);
        setError(e instanceof Error ? e.message : "Consulta indisponível.");
      }
    } finally {
      clearTimeout(timer);
      if (current() && read.current === controller) setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    return () => {
      read.current?.abort();
      operation.current?.abort();
      attempt.current = null;
      onWorking(false);
    };
  }, [access.scope, micro]);
  const submit = async () => {
    if (
      !currentScope ||
      blocked ||
      !editable ||
      !version ||
      lock.current ||
      (!attempt.current && (!file || !title.trim()))
    )
      return;
    lock.current = true;
    setBusy(true);
    onWorking(true);
    setError("");
    read.current?.abort();
    const current = access.capture();
    const controller = new AbortController();
    operation.current = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      if (!attempt.current && file) {
        const verified = await verifyMicroDocument(file);
        if (!current() || controller.signal.aborted) return;
        attempt.current = {
          key: crypto.randomUUID(),
          micro,
          organization,
          expectedRoot: version,
          document: replace?.document_id ?? null,
          previousVersion: replace?.version ?? 0,
          metadata: {
            title: title.trim(),
            file_name: file.name,
            mime: verified.mime,
            size_bytes: verified.size_bytes,
            sha256: verified.sha256,
          },
          file: verified.blob,
        };
      }
      const pending = attempt.current;
      if (!pending) return;
      const ack = await uploadMicroDocument(
        pending,
        controller.signal,
        current,
      );
      if (!current() || controller.signal.aborted) return;
      attempt.current = null;
      setFile(null);
      setTitle("");
      setReplace(null);
      onCommitted(ack.updated_at);
      lock.current = false;
      await refresh();
    } catch (e) {
      if (current())
        setError(
          e instanceof Error
            ? e.message
            : "Upload inconclusivo; tentativa preservada.",
        );
    } finally {
      clearTimeout(timer);
      lock.current = false;
      if (current()) {
        setBusy(false);
        onWorking(!!attempt.current);
      }
    }
  };
  const open = async (doc: MicroDocument) => {
    if (!currentScope || busy) return;
    if (selected) opener.discard(selected.id);
    setSelected(doc);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      await opener.open(
        doc.id,
        () => setError("Documento indisponível ou integridade não confirmada."),
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
    }
  };
  const latest = rows.filter(
    (row) =>
      !rows.some(
        (other) =>
          other.document_id === row.document_id && other.version > row.version,
      ),
  );
  const url = selected ? opener.urls[selected.id] : undefined;
  return (
    <section
      aria-label="Documentos do microrganismo"
      className="space-y-4 border-t pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Documentos do microrganismo</h3>
        <Button
          variant="ghost"
          disabled={busy || loading || !currentScope}
          onClick={() => void refresh()}
          aria-label="Atualizar documentos"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {!currentScope ? (
        <p role="alert">Contexto encerrado. Reabra a ficha.</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {loading ? (
            <p role="status">Consultando anexos…</p>
          ) : rows.length === 0 && !error ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento anexado.
            </p>
          ) : null}
          {rows.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{doc.title}</p>
                <p className="break-words text-sm text-muted-foreground">
                  {doc.file_name} · versão {doc.version} ·{" "}
                  {(doc.size_bytes / 1024).toFixed(1)} KiB
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void open(doc)}
                >
                  Consultar documento
                </Button>
                {editable && latest.includes(doc) && (
                  <Button
                    variant="ghost"
                    disabled={busy || blocked || !!attempt.current}
                    onClick={() => {
                      setReplace(doc);
                      setTitle(doc.title);
                      setFile(null);
                    }}
                  >
                    Nova versão
                  </Button>
                )}
              </div>
            </div>
          ))}
          {selected && (
            <section aria-label="Documento aberto" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="break-words font-medium">
                  {selected.title} — v{selected.version}
                </h4>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!url}
                    onClick={() =>
                      opener.download(selected.id, selected.file_name)
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Fechar documento"
                    onClick={() => {
                      opener.discard(selected.id);
                      setSelected(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {!url ? (
                <p role="status">Documento não carregado.</p>
              ) : selected.mime === "application/pdf" ? (
                <object
                  data={url}
                  type="application/pdf"
                  aria-label={selected.title}
                  className="h-96 w-full"
                >
                  <p>Prévia PDF indisponível neste navegador.</p>
                </object>
              ) : (
                <img
                  src={url}
                  alt={selected.title}
                  className="max-h-96 w-full object-contain"
                />
              )}
            </section>
          )}
          {editable && (
            <div className="space-y-3">
              <h4 className="font-medium">
                {replace
                  ? `Nova versão de ${replace.title}`
                  : "Anexar material próprio"}
              </h4>
              {blocked && (
                <p className="text-sm text-muted-foreground">
                  Salve o rascunho da ficha antes de anexar.
                </p>
              )}
              <div className="space-y-1">
                <Label htmlFor="micro-document-title">
                  Título do documento
                </Label>
                <Input
                  id="micro-document-title"
                  maxLength={200}
                  value={title}
                  disabled={busy || blocked || !!attempt.current}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="micro-document-file">
                  Arquivo PDF, PNG ou JPEG — até 10 MiB
                </Label>
                <Input
                  id="micro-document-file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  disabled={busy || blocked || !!attempt.current}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    busy ||
                    blocked ||
                    !version ||
                    (!attempt.current && (!file || !title.trim()))
                  }
                  onClick={() => void submit()}
                >
                  <FilePlus className="mr-2 h-4 w-4" />
                  {busy
                    ? "Anexando…"
                    : attempt.current
                      ? "Reconciliar mesma tentativa"
                      : "Confirmar anexo"}
                </Button>
                {busy && (
                  <Button
                    variant="outline"
                    onClick={() => operation.current?.abort()}
                  >
                    Interromper espera
                  </Button>
                )}
                {!busy && attempt.current && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      attempt.current = null;
                      setFile(null);
                      setTitle("");
                      setReplace(null);
                      onWorking(false);
                      setError(
                        "Tentativa encerrada localmente. Reserva e possível arquivo privado foram preservados; consulte os documentos antes de um novo envio.",
                      );
                    }}
                  >
                    Encerrar tentativa local
                  </Button>
                )}
                {!busy && replace && !attempt.current && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setReplace(null);
                      setTitle("");
                      setFile(null);
                    }}
                  >
                    Cancelar nova versão
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
