import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageUp, Palette, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandingKind, PortalBranding } from "@/hooks/useBranding";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;

interface Props { kind: BrandingKind; entityId: string; branding: PortalBranding; disabled?: boolean; }
export function PortalBrandingSettings({ kind, entityId, branding, disabled }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(branding.customName ?? "");
  const [color, setColor] = useState(branding.customPrimaryColor ?? "#087f5b");
  const [logoUrl, setLogoUrl] = useState<string | null>(branding.customLogoUrl);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(branding.logoUrl);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setName(branding.customName ?? ""); setColor(branding.customPrimaryColor ?? "#087f5b"); setLogoUrl(branding.customLogoUrl); setPreview(branding.logoUrl); setFile(null); }, [entityId, branding.customName, branding.customLogoUrl, branding.customPrimaryColor, branding.logoUrl]);

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    if (!ALLOWED.has(next.type)) return toast.error("Use uma imagem PNG, JPEG ou WEBP.");
    if (next.size <= 0 || next.size > MAX_LOGO_BYTES) return toast.error("A logomarca deve ter até 2 MB.");
    setFile(next); setPreview(URL.createObjectURL(next));
  };
  const save = async () => {
    const cleanName = name.trim();
    if (cleanName && (cleanName.length < 2 || cleanName.length > 80)) return toast.error("O nome deve ter entre 2 e 80 caracteres.");
    if (!HEX.test(color)) return toast.error("Informe uma cor hexadecimal válida.");
    setSaving(true);
    try {
      let nextLogo = logoUrl;
      if (file) {
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const folder = kind === "cliente" ? "clientes" : "parceiros";
        const path = `${folder}/${entityId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        nextLogo = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
      }
      const rpc = kind === "cliente" ? "save_client_portal_branding" : "save_partner_portal_branding";
      const idKey = kind === "cliente" ? "_cliente_id" : "_partner_id";
      const { error } = await (supabase as any).rpc(rpc, { [idKey]: entityId, _marca_nome: cleanName || null, _marca_logo_url: nextLogo, _marca_cor_primaria: color.toLowerCase() });
      if (error) throw error;
      setLogoUrl(nextLogo); setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["portal-branding", kind, entityId] });
      toast.success("Identidade visual atualizada.");
    } catch { toast.error("Não foi possível salvar. Confira os dados e tente novamente."); }
    finally { setSaving(false); }
  };
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Palette className="h-5 w-5 text-primary" />Identidade visual do portal</CardTitle><CardDescription>Personalize o nome, a logomarca e a cor exibidos somente neste portal.</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      {disabled && <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">A visualização interna não permite alterar a marca do parceiro.</p>}
      <div className="space-y-2"><Label htmlFor="portal-brand-name">Nome da marca</Label><Input id="portal-brand-name" value={name} maxLength={80} disabled={disabled || saving} onChange={e => setName(e.target.value)} placeholder={branding.name} /></div>
      <div className="space-y-2"><Label htmlFor="portal-brand-color">Cor principal</Label><div className="flex gap-2"><input id="portal-brand-color" type="color" value={color} disabled={disabled || saving} onChange={e => setColor(e.target.value)} className="h-10 w-12 rounded border" /><Input value={color} disabled={disabled || saving} onChange={e => setColor(e.target.value)} className="max-w-36 font-mono" /></div></div>
      <div className="space-y-2"><Label>Logomarca</Label><div className="flex flex-wrap items-center gap-4"><div className="flex h-20 w-48 items-center justify-center overflow-hidden rounded-md border bg-white p-2"><img src={preview} alt="Prévia da logomarca" className="max-h-full max-w-full object-contain" /></div><div><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={disabled || saving} onChange={e => chooseFile(e.target.files?.[0])} /><Button type="button" variant="outline" disabled={disabled || saving} onClick={() => fileRef.current?.click()}><ImageUp className="mr-2 h-4 w-4" />Escolher imagem</Button><p className="mt-1 text-xs text-muted-foreground">PNG, JPEG ou WEBP, até 2 MB.</p></div></div></div>
      <Button type="button" disabled={disabled || saving} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar identidade"}</Button>
    </CardContent>
  </Card>;
}
