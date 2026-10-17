import { useEffect, useRef, useState } from "react";
import {
  useOrderMessages,
  useSendOrderMessage,
  useSetMessageStatus,
  useMessageAttachments,
  useUploadMessageAttachment,
  getAttachmentSignedUrl,
} from "@/hooks/useCommercial";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Paperclip, FileText, FileSpreadsheet, FileImage, File as FileIcon } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";
import { toast } from "sonner";
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from "@/lib/authz/attachmentBlobGate";
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";
import { useAuthenticatedBlobUrls } from "@/hooks/useAuthenticatedBlobUrls";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

const MAX_ATTACHMENT_MB = 10;
const ACCEPTED_TYPES = ".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp";

const iconFor = (mime: string | null | undefined) => {
  if (!mime) return <FileIcon className="h-3 w-3" />;
  if (mime.startsWith("image/")) return <FileImage className="h-3 w-3" />;
  if (mime.includes("pdf")) return <FileText className="h-3 w-3" />;
  if (mime.includes("sheet") || mime.includes("excel")) return <FileSpreadsheet className="h-3 w-3" />;
  return <FileIcon className="h-3 w-3" />;
};

function AttachmentThumb({ path, fileName, mime, onOpen, prepared, busy }: { path: string; fileName: string; mime: string | null; onOpen: (path: string) => void; prepared: boolean; busy: boolean }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const access = useStorageAccessScope(`order-thumbnail:${path}`);
  const blobs = useAuthenticatedBlobUrls(mime?.startsWith("image/") ? [path] : [], "order-attachments", { enabled: AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED });
  useEffect(() => {
    let cancelled = false;
    const current = access.capture();
    setThumb(null);
    if (!AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED && access.ready && mime?.startsWith("image/")) {
      getAttachmentSignedUrl(path).then((u) => { if (!cancelled && current()) setThumb(u); });
    }
    return () => { cancelled = true; };
    // capture is intentionally bound to the current resource scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, mime, access.scope]);
  const visibleThumb = AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED ? blobs.urls[path] : access.ready ? thumb : null;

  if (visibleThumb) {
    return (
      <Button variant="ghost" type="button" disabled={busy} onClick={() => onOpen(path)} className="inline-block h-14 w-14 p-0 rounded border overflow-hidden hover:opacity-80" title={prepared ? `Baixar ${fileName}` : fileName}>
        <img src={visibleThumb} alt={fileName} className="h-full w-full object-cover" loading="lazy" />
      </Button>
    );
  }
  return (
    <Button variant="ghost"
      type="button"
      disabled={busy}
      onClick={() => onOpen(path)}
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded hover:bg-accent"
    >
      {iconFor(mime)} {fileName}
      {prepared && <span>Baixar arquivo</span>}
      {busy && <span role="status">Carregando</span>}
      {blobs.loadingPaths.includes(path) && <span role="status">Carregando</span>}
      {blobs.failed.includes(path) && <span role="alert">Anexo indisponível</span>}
    </Button>
  );
}

const STATUS_LABEL: Record<string, string> = {
  nao_lida: "Não lida",
  lida: "Lida",
  respondida: "Respondida",
  encerrada: "Encerrada",
};

function MessageItem({ m, orderId }: { m: any; orderId: string }) {
  const setStatus = useSetMessageStatus();
  const { data: attachments = [] } = useMessageAttachments(m.id);
  const upload = useUploadMessageAttachment();
  const fileRef = useRef<HTMLInputElement>(null);

  const access = useStorageAccessScope(`order:${orderId}:message:${m.id}`);
  const opener = useAuthenticatedAttachmentOpener(`order:${orderId}:message:${m.id}`, "order-attachments");
  const openAttachment = async (path: string) => {
    if (!access.ready) return;
    if (AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED) {
      if (opener.urls[path]) { opener.download(path, attachments.find(a => a.file_path === path)?.file_name || "anexo"); return; }
      await opener.open(path, () => toast.error("Anexo indisponível"));
      return;
    }
    const current = access.capture();
    const url = await getAttachmentSignedUrl(path);
    if (current() && url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="text-sm border-b py-2 last:border-b-0">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <Badge variant={m.autor_tipo === "parceiro" ? "outline" : "secondary"} className="capitalize">
          {m.autor_tipo}
        </Badge>
        <Badge
          variant={m.status === "nao_lida" ? "destructive" : m.status === "encerrada" ? "outline" : "secondary"}
          className="text-[10px]"
        >
          {STATUS_LABEL[m.status ?? "nao_lida"]}
        </Badge>
        <span className="text-muted-foreground">
          {formatDateDisplay(m.created_at)}{" "}
          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="whitespace-pre-wrap mt-1">{m.mensagem}</div>

      {attachments.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 items-center">
          {attachments.map((a) => (
            <AttachmentThumb
              key={a.id}
              path={a.file_path}
              fileName={a.file_name}
              mime={a.mime_type}
              onOpen={openAttachment}
              prepared={!!opener.urls[a.file_path]}
              busy={opener.loadingPaths.includes(a.file_path)}
            />
          ))}
        </div>
      )}

      <div className="mt-1 flex gap-2 items-center text-xs">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_TYPES}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (fileRef.current) fileRef.current.value = "";
            if (!f) return;
            if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
              toast.error(`Arquivo acima de ${MAX_ATTACHMENT_MB} MB. Reduza ou divida o anexo.`);
              return;
            }
            upload.mutate({ message_id: m.id, order_id: orderId, file: f });
          }}
        />
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo à mensagem">
          <Paperclip className="h-3 w-3 mr-1" /> Anexar
        </Button>
        {(["lida", "respondida", "encerrada"] as const).map((s) => (
          <button
            key={s}
            disabled={m.status === s || setStatus.isPending}
            onClick={() => setStatus.mutate({ id: m.id, status: s, order_id: orderId })}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OrderMessagesPanel({
  orderId,
  authorType,
}: {
  orderId: string;
  authorType: "parceiro" | "comercial" | "admin";
}) {
  const { data: messages = [], isLoading } = useOrderMessages(orderId);
  const send = useSendOrderMessage();
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim()) return;
    send.mutate(
      { order_id: orderId, mensagem: text.trim(), autor_tipo: authorType },
      { onSuccess: () => setText("") },
    );
  };

  return (
    <div className="border rounded-md flex flex-col">
      <div className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Mensagens do pedido
      </div>
      <div className="p-3 max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Carregando...</div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">Sem mensagens.</div>
        ) : (
          messages.map((m) => <MessageItem key={`${orderId}:${m.id}`} m={m} orderId={orderId} />)
        )}
      </div>
      <div className="p-2 border-t space-y-1">
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva uma mensagem..."
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSend} disabled={send.isPending || !text.trim()}>
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
