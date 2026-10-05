import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Palette, Upload, RotateCcw, Save, Leaf } from "lucide-react";
import { hexToHsl, hslToHex } from "@/lib/utils";
import { useSystemConfig, type SystemConfig } from "@/hooks/useSystemConfig";

export default function AparenciaTab() {
  const { config, defaults } = useSystemConfig();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nomeEmpresa, setNomeEmpresa] = useState(config?.nome_empresa || defaults.nome_empresa);
  const [corPrimaria, setCorPrimaria] = useState(hslToHex(config?.cor_primaria || defaults.cor_primaria));
  const [corSidebarBg, setCorSidebarBg] = useState(hslToHex(config?.cor_sidebar_bg || defaults.cor_sidebar_bg));
  const [corSidebarPrimary, setCorSidebarPrimary] = useState(hslToHex(config?.cor_sidebar_primary || defaults.cor_sidebar_primary));
  const [logoPreview, setLogoPreview] = useState<string | null>(config?.logo_url || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Sync state when config loads
  if (config && !initialized) {
    setNomeEmpresa(config.nome_empresa);
    setCorPrimaria(hslToHex(config.cor_primaria));
    setCorSidebarBg(hslToHex(config.cor_sidebar_bg));
    setCorSidebarPrimary(hslToHex(config.cor_sidebar_primary));
    setLogoPreview(config.logo_url);
    setInitialized(true);
  }

  // Live preview
  const applyPreview = (primary: string, sidebarBg: string, sidebarPrimary: string) => {
    const root = document.documentElement;
    root.style.setProperty("--primary", hexToHsl(primary));
    root.style.setProperty("--sidebar-background", hexToHsl(sidebarBg));
    root.style.setProperty("--sidebar-primary", hexToHsl(sidebarPrimary));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const save = useMutation({
    mutationFn: async () => {
      let logoUrl = config?.logo_url || null;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `platform/logo-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("logos").upload(path, logoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("logos").getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      }

      const updateData = {
        nome_empresa: nomeEmpresa,
        cor_primaria: hexToHsl(corPrimaria),
        cor_sidebar_bg: hexToHsl(corSidebarBg),
        cor_sidebar_primary: hexToHsl(corSidebarPrimary),
        logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("configuracoes_sistema")
        .update(updateData as any)
        .eq("id", config?.id ?? "");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-config"] });
      toast({ title: "Aparência atualizada com sucesso" });
      setLogoFile(null);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const restore = () => {
    setNomeEmpresa(defaults.nome_empresa);
    setCorPrimaria(hslToHex(defaults.cor_primaria));
    setCorSidebarBg(hslToHex(defaults.cor_sidebar_bg));
    setCorSidebarPrimary(hslToHex(defaults.cor_sidebar_primary));
    setLogoPreview(null);
    setLogoFile(null);
    applyPreview(hslToHex(defaults.cor_primaria), hslToHex(defaults.cor_sidebar_bg), hslToHex(defaults.cor_sidebar_primary));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" />Aparência da plataforma</CardTitle>
        <CardDescription>Identidade visual global exibida para todas as empresas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-lg">
        {/* Logo */}
        <div className="space-y-2">
          <Label>Logomarca da Empresa</Label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-lg border border-border flex items-center justify-center overflow-hidden bg-muted">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <Leaf className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />Enviar Logo
              </Button>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou SVG. Máx 2MB.</p>
            </div>
          </div>
        </div>

        {/* Nome da empresa */}
        <div className="space-y-2">
          <Label>Nome da Empresa</Label>
          <Input value={nomeEmpresa} onChange={e => setNomeEmpresa(e.target.value)} placeholder="Nome exibido na sidebar" />
        </div>

        {/* Cores */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Cores do Sistema</Label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Cor Primária</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={corPrimaria}
                  onChange={e => {
                    setCorPrimaria(e.target.value);
                    applyPreview(e.target.value, corSidebarBg, corSidebarPrimary);
                  }}
                  className="h-10 w-10 rounded border border-border cursor-pointer"
                />
                <Input value={corPrimaria} onChange={e => setCorPrimaria(e.target.value)} className="font-mono text-sm" />
              </div>
              <p className="text-xs text-muted-foreground">Botões, links, destaques</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Fundo da Sidebar</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={corSidebarBg}
                  onChange={e => {
                    setCorSidebarBg(e.target.value);
                    applyPreview(corPrimaria, e.target.value, corSidebarPrimary);
                  }}
                  className="h-10 w-10 rounded border border-border cursor-pointer"
                />
                <Input value={corSidebarBg} onChange={e => setCorSidebarBg(e.target.value)} className="font-mono text-sm" />
              </div>
              <p className="text-xs text-muted-foreground">Cor de fundo do menu lateral</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Destaque da Sidebar</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={corSidebarPrimary}
                  onChange={e => {
                    setCorSidebarPrimary(e.target.value);
                    applyPreview(corPrimaria, corSidebarBg, e.target.value);
                  }}
                  className="h-10 w-10 rounded border border-border cursor-pointer"
                />
                <Input value={corSidebarPrimary} onChange={e => setCorSidebarPrimary(e.target.value)} className="font-mono text-sm" />
              </div>
              <p className="text-xs text-muted-foreground">Ícone ativo e destaques</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !config}>
            <Save className="h-4 w-4 mr-2" />{save.isPending ? "Salvando..." : "Salvar Aparência"}
          </Button>
          <Button variant="outline" onClick={restore}>
            <RotateCcw className="h-4 w-4 mr-2" />Restaurar Padrão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
