import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Copy, Printer } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { copiarTexto, MSG_COPIA_INDISPONIVEL } from "@/lib/entregas/copiarLink";

interface Props {
  validationToken: string;
  numeroFormulario?: string | null;
  size?: number;
  showActions?: boolean;
}

export function buildValidationUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/validar-entrega/${token}`;
}

export function QRCodeComprovante({ validationToken, numeroFormulario, size = 140, showActions = true }: Props) {
  const url = buildValidationUrl(validationToken);
  const [linkManual, setLinkManual] = useState(false);
  const copy = async () => {
    const ok = await copiarTexto(url);
    if (ok) {
      setLinkManual(false);
      toast({ title: "Link copiado", description: url });
      return;
    }
    setLinkManual(true);
    toast({ title: "Não foi possível copiar", description: MSG_COPIA_INDISPONIVEL, variant: "destructive" });
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-white p-2 rounded-md border">
        <QRCodeSVG value={url} size={size} level="M" includeMargin={false} />
      </div>
      {numeroFormulario && <div className="text-xs font-mono">{numeroFormulario}</div>}
      <p className="text-[10px] text-muted-foreground text-center max-w-[200px]">
        Escaneie para validar este comprovante no sistema Cultivo Farm.
      </p>
      {showActions && (
        <div className="flex gap-1 print:hidden">
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            <Copy className="h-3 w-3 mr-1" /> Copiar link
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-3 w-3 mr-1" /> Imprimir
          </Button>
        </div>
      )}
      {linkManual && (
        <input
          readOnly
          aria-label="Link de validação para cópia manual"
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full max-w-[220px] text-[10px] font-mono border rounded px-2 py-1 print:hidden"
        />
      )}
    </div>
  );
}
