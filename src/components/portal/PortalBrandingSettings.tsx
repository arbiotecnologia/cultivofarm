import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePortalBranding, type BrandingScope } from "@/hooks/useBranding";

const MIME_PERMITIDOS = ["image/png", "image/jpeg", "image/webp"] as const;
const EXTENSAO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

const PASTA: Record<BrandingScope, string> = {
  cliente: "clientes",
  parceiro: "parceiros",
};
const RPC: Record<BrandingScope, string> = {
  cliente: "save_client_portal_branding",
  parceiro: "save_partner_portal_branding",
};

interface Props {
  scope: BrandingScope;
  /** Id do cliente ou do parceiro dono da marca. */
  id: string | null | undefined;
  /** Desabilita a edição (ex.: usuário sem permissão de gestor). */
  disabled?: boolean;
  disabledReason?: string;
}

export function PortalBrandingSettings({ scope, id, disabled, disabledReason }: Props) {
  const queryClient = useQueryClient();
  const { marcaPropria, isLoading, error, logoUrl, nome } = usePortalBranding(scope, id);
  const fileRef = useRef<HTMLInputElement>(null);

  const [marcaNome, setMarcaNome] = useState("");
  const [cor, setCor] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroCampo, setErroCampo] = useState<string | null>(null);

  useEffect(() => {
    if (!marcaPropria) return;
    setMarcaNome(marcaPropria.nome ?? "");
    setCor(marcaPropria.corPrimaria ?? "");
    setLogo(marcaPropria.logoUrl ?? null);
  }, [marcaPropria]);

  const bloqueado = !!disabled || !id;

  const enviarLogo = async (file: File) => {
    if (!id) return;
    if (!MIME_PERMITIDOS.includes(file.type as (typeof MIME_PERMITIDOS)[number])) {
      setErroCampo("Envie uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (file.size <= 0 || file.size > TAMANHO_MAXIMO) {
      setErroCampo("A imagem deve ter até 2 MB.");
      return;
    }
    setErroCampo(null);
    setSalvando(true);
    const caminho = `${PASTA[scope]}/${id}/${crypto.randomUUID()}.${EXTENSAO[file.type]}`;
    const { error: upErr } = await supabase.storage
      .from("logos")
      .upload(caminho, file, { contentType: file.type, upsert: false });
    setSalvando(false);
    if (upErr) {
      toast.error("Não foi possível enviar a imagem. Tente novamente.");
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(caminho);
    setLogo(data.publicUrl);
    toast.success("Imagem carregada. Clique em salvar para aplicar.");
  };

  const salvar = async () => {
    if (!id) return;
    const nomeLimpo = marcaNome.trim();
    if (nomeLimpo && (nomeLimpo.length < 2 || nomeLimpo.length > 80)) {
      setErroCampo("O nome deve ter entre 2 e 80 caracteres.");
      return;
    }
    if (cor && !/^#[0-9a-fA-F]{6}$/.test(cor)) {
      setErroCampo("Escolha uma cor válida.");
      return;
    }
    setErroCampo(null);
    setSalvando(true);
    const params =
      scope === "cliente"
        ? {
            p_cliente_id: id,
            p_marca_nome: nomeLimpo || null,
            p_marca_logo_url: logo,
            p_marca_cor_primaria: cor || null,
          }
        : {
            p_partner_id: id,
            p_marca_nome: nomeLimpo || null,
            p_marca_logo_url: logo,
            p_marca_cor_primaria: cor || null,
          };
    const { error: rpcErr } = await (supabase as any).rpc(RPC[scope], params);
    setSalvando(false);
    if (rpcErr) {
      toast.error("Não foi possível salvar a identidade visual.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["portal-branding", scope, id] });
    toast.success("Identidade visual atualizada.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identidade visual</CardTitle>
        <CardDescription>
          Defina o nome, a logomarca e a cor que aparecem para a sua equipe neste portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {bloqueado && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {disabledReason ?? "Apenas o responsável pela conta pode alterar a identidade visual."}
            </AlertDescription>
          </Alert>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        {error && !isLoading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Não foi possível carregar a identidade visual.</AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && (
          <>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-md border bg-muted/40 flex items-center justify-center overflow-hidden">
                {logo || logoUrl ? (
                  <img
                    src={logo ?? logoUrl ?? ""}
                    alt={`Logomarca de ${nome}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void enviarLogo(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bloqueado || salvando}
                  onClick={() => fileRef.current?.click()}
                >
                  Enviar logomarca
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPEG ou WebP, até 2 MB.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marca-nome">Nome exibido</Label>
                <Input
                  id="marca-nome"
                  value={marcaNome}
                  maxLength={80}
                  disabled={bloqueado || salvando}
                  placeholder={nome}
                  onChange={(e) => setMarcaNome(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="marca-cor">Cor principal</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="marca-cor"
                    type="color"
                    className="h-10 w-16 p-1"
                    value={cor || "#087f5b"}
                    disabled={bloqueado || salvando}
                    onChange={(e) => setCor(e.target.value)}
                  />
                  {cor && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={bloqueado || salvando}
                      onClick={() => setCor("")}
                    >
                      Usar cor padrão
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {erroCampo && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{erroCampo}</AlertDescription>
              </Alert>
            )}

            <Button type="button" disabled={bloqueado || salvando} onClick={() => void salvar()}>
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar identidade visual
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
