import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCNPJ, unmask, unmaskCnpj, validatePhoneBR } from "@/lib/masks";
import { validateIE, normalizeIE } from "@/lib/fiscal/ie";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchCEP } from "@/lib/api/viacep";
import { fetchCNPJ } from "@/lib/api/brasilapi";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { ParceiroUsuariosTab } from "@/components/comercial/ParceiroUsuariosTab";
import { validateCNPJ } from "@/lib/validators/cpfCnpj";
import {
  useCreateParceiroB2B,
  useUpdateParceiroB2B,
  type ParceiroB2BInput,
} from "@/hooks/useParceiroB2BMutations";
import type { ParceiroB2B } from "@/hooks/useParceirosB2B";

const emailOpt = z.string().trim().email("E-mail inválido").max(200).or(z.literal("")).optional().nullable();

const schema = z.object({
  codigo: z.string().trim().max(40).optional().nullable(),
  razao_social: z.string().trim().min(2, "Razão social obrigatória").max(200),
  nome_fantasia: z.string().trim().max(200).optional().nullable(),
  cnpj: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || validateCNPJ(v), "CNPJ inválido"),
  client_id: z.string().uuid().optional().nullable(),
  desconto_padrao: z.number().min(0).max(100),
  observacoes: z.string().trim().max(1000).optional().nullable(),
  ativo: z.boolean(),
  partner_type: z.string().optional().nullable(),
  segmento: z.string().optional().nullable(),
  porte: z.string().optional().nullable(),
  regime_tributario: z.string().optional().nullable(),
  email_comercial: emailOpt,
  email_financeiro: emailOpt,
  email_nfe: emailOpt,
  limite_credito_brl: z.number().min(0).optional().nullable(),
  comissao_percentual: z.number().min(0).max(100).optional().nullable(),
  meta_mensal_brl: z.number().min(0).optional().nullable(),
  prazo_pagamento_padrao_dias: z.number().int().min(0).optional().nullable(),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parceiro?: ParceiroB2B | null;
}

const empty: ParceiroB2BInput = {
  codigo: "",
  razao_social: "",
  nome_fantasia: "",
  cnpj: "",
  client_id: null,
  desconto_padrao: 0,
  observacoes: "",
  ativo: true,
  partner_type: null,
  segmento: null,
  porte: null,
  origem_parceiro: null,
  data_inicio_parceria: null,
  consultor_responsavel: null,
  commercial_region: null,
  commercial_state: null,
  commercial_city: null,
  inscricao_estadual: null,
  inscricao_municipal: null,
  regime_tributario: null,
  suframa: null,
  cep: null,
  endereco_logradouro: null,
  endereco_numero: null,
  endereco_complemento: null,
  endereco_bairro: null,
  email_comercial: null,
  email_financeiro: null,
  email_nfe: null,
  telefone_comercial: null,
  whatsapp_comercial: null,
  site: null,
  limite_credito_brl: null,
  prazo_pagamento_padrao_dias: null,
  condicao_pagamento_padrao: null,
  forma_pagamento_preferida: null,
  dados_bancarios: null,
  comissao_percentual: null,
  meta_mensal_brl: null,
  endereco_entrega_igual_comercial: true,
  entrega_cep: null,
  entrega_logradouro: null,
  entrega_numero: null,
  entrega_complemento: null,
  entrega_bairro: null,
  entrega_cidade: null,
  entrega_estado: null,
  transportadora_preferida: null,
  incoterm: null,
};

export function ParceiroB2BFormDialog({ open, onOpenChange, parceiro }: Props) {
  const create = useCreateParceiroB2B();
  const update = useUpdateParceiroB2B();
  const editing = !!parceiro;

  const [form, setForm] = useState<ParceiroB2BInput>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof ParceiroB2BInput>(k: K, v: ParceiroB2BInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) {
      setErrors({});
      if (parceiro) {
        setForm({
          ...empty,
          ...(parceiro as any),
          desconto_padrao: Number(parceiro.desconto_padrao ?? 0),
          limite_credito_brl: parceiro.limite_credito_brl !== null ? Number(parceiro.limite_credito_brl) : null,
          comissao_percentual: parceiro.comissao_percentual !== null ? Number(parceiro.comissao_percentual) : null,
          meta_mensal_brl: parceiro.meta_mensal_brl !== null ? Number(parceiro.meta_mensal_brl) : null,
        });
      } else {
        setForm(empty);
        (async () => {
          const { data } = await supabase
            .from("partner_accounts")
            .select("codigo")
            .like("codigo", "PARC-%")
            .order("codigo", { ascending: false })
            .limit(1);
          const last = data?.[0]?.codigo ?? "";
          const match = last.match(/^PARC-(\d+)$/);
          const next = (match ? parseInt(match[1], 10) : 0) + 1;
          setForm((f) => ({ ...f, codigo: `PARC-${String(next).padStart(3, "0")}` }));
        })();
      }
    }
  }, [open, parceiro]);

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lookup-b2b"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, razao_social")
        .order("nome")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: consultores } = useQuery({
    queryKey: ["consultores-lookup"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id, nome")
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });

  const handleCepBlur = async () => {
    const cep = form.cep ? form.cep.replace(/\D/g, "") : "";
    if (cep.length !== 8) return;
    try {
      const r = await fetchCEP(cep);
      setForm((f) => ({
        ...f,
        endereco_logradouro: r.logradouro || f.endereco_logradouro,
        endereco_bairro: r.bairro || f.endereco_bairro,
        commercial_city: r.localidade || f.commercial_city,
        commercial_state: r.uf || f.commercial_state,
      }));
    } catch (e: any) {
      toast.error(e.message || "CEP não encontrado");
    }
  };

  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const cnpjAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => cnpjAbortRef.current?.abort(), []);

  const handleCNPJLookup = async () => {
    const raw = unmaskCnpj(form.cnpj ?? "");
    if (raw.length !== 14 || !validateCNPJ(raw)) {
      toast.error("Insira um CNPJ válido para buscar", {
        description: "Verifique o número digitado e o dígito verificador.",
      });
      return;
    }

    cnpjAbortRef.current?.abort();
    const ctrl = new AbortController();
    cnpjAbortRef.current = ctrl;
    const timeoutId = setTimeout(() => ctrl.abort(), 12_000);

    setLoadingCNPJ(true);
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`, {
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        if (resp.status === 404) {
          toast.error("CNPJ não encontrado na base pública", {
            description:
              "O número é válido, mas a BrasilAPI não retornou dados cadastrais. Preencha manualmente.",
          });
        } else if (resp.status === 429) {
          toast.error("Muitas consultas recentes", {
            description: "Aguarde alguns segundos e tente novamente.",
          });
        } else if (resp.status >= 500) {
          toast.error("Base pública indisponível", {
            description: "A BrasilAPI está fora do ar no momento. Tente novamente mais tarde.",
          });
        } else {
          toast.error("Falha ao consultar CNPJ", {
            description: `Resposta inesperada da BrasilAPI (HTTP ${resp.status}).`,
          });
        }
        return;
      }

      const data = (await resp.json()) as Awaited<ReturnType<typeof fetchCNPJ>>;

      const patch = {
        razao_social: data.razao_social || form.razao_social,
        nome_fantasia:
          data.nome_fantasia || form.nome_fantasia || data.razao_social || null,
        cep: data.cep || form.cep,
        endereco_logradouro: data.logradouro || form.endereco_logradouro,
        endereco_numero: data.numero || form.endereco_numero,
        endereco_complemento: data.complemento || form.endereco_complemento,
        endereco_bairro: data.bairro || form.endereco_bairro,
        commercial_city: data.municipio || form.commercial_city,
        commercial_state: data.uf || form.commercial_state,
        telefone_comercial: form.telefone_comercial || data.ddd_telefone_1 || null,
      };

      const filledCount = [
        data.razao_social,
        data.nome_fantasia,
        data.cep,
        data.logradouro,
        data.numero,
        data.complemento,
        data.bairro,
        data.municipio,
        data.uf,
        data.ddd_telefone_1,
      ].filter((v) => typeof v === "string" && v.trim().length > 0).length;

      if (filledCount === 0) {
        toast.warning("Nenhum dado utilizável retornado", {
          description:
            "A BrasilAPI respondeu, mas não trouxe campos cadastrais preenchíveis para este CNPJ. Preencha manualmente.",
        });
        return;
      }

      setForm((f) => ({ ...f, ...patch }));
      toast.success("Dados preenchidos via BrasilAPI", {
        description: `${filledCount} campo(s) preenchido(s). Revise antes de salvar.`,
      });
    } catch (e: any) {
      if (ctrl.signal.aborted) {
        toast.error("Consulta cancelada", {
          description: "A busca demorou demais ou foi interrompida. Tente novamente.",
        });
      } else {
        toast.error("Falha de rede ao consultar CNPJ", {
          description: e?.message || "Verifique sua conexão e tente novamente.",
        });
      }
    } finally {
      clearTimeout(timeoutId);
      setLoadingCNPJ(false);
    }
  };

  const handleSubmit = async () => {
    const telCheck = validatePhoneBR(form.telefone_comercial, { fieldLabel: "Telefone comercial" });
    if (!telCheck.ok) { toast.error(telCheck.error); return; }
    const waCheck = validatePhoneBR(form.whatsapp_comercial, { fieldLabel: "WhatsApp comercial" });
    if (!waCheck.ok) { toast.error(waCheck.error); return; }
    const ieCheck = validateIE(form.commercial_state ?? null, form.inscricao_estadual, { allowIsento: true });
    if (!ieCheck.ok) { toast.error(ieCheck.error); return; }

    const payload: any = {
      ...form,
      codigo: form.codigo?.trim() || null,
      nome_fantasia: form.nome_fantasia?.trim() || null,
      cnpj: form.cnpj ? unmaskCnpj(form.cnpj) : null,
      observacoes: form.observacoes?.trim() || null,
      telefone_comercial: telCheck.value,
      whatsapp_comercial: waCheck.value,
      inscricao_estadual: normalizeIE(form.commercial_state ?? null, form.inscricao_estadual, { allowIsento: true }),
      client_id: form.client_id || null,
      dados_bancarios: form.dados_bancarios
        ? (typeof form.dados_bancarios === "string"
            ? { texto: form.dados_bancarios }
            : form.dados_bancarios)
        : null,
    };

    // Normalize empty strings → null for nullable cols
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((e) => {
        errs[String(e.path[0])] = e.message;
      });
      setErrors(errs);
      toast.error(parsed.error.errors[0].message);
      return;
    }
    const cleanData: ParceiroB2BInput = { ...(payload as ParceiroB2BInput) };
    if (editing && parceiro) {
      await update.mutateAsync({ id: parceiro.id, ...cleanData });
    } else {
      await create.mutateAsync(cleanData);
    }
    onOpenChange(false);
  };

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Parceiro B2B" : "Novo Parceiro B2B"}</DialogTitle>
          <DialogDescription>
            Cadastro completo de parceiro comercial para o módulo Pedidos B2B.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="dados">Dados Cadastrais</TabsTrigger>
            <TabsTrigger value="endereco">Endereço</TabsTrigger>
            <TabsTrigger value="contatos">Contatos</TabsTrigger>
            <TabsTrigger value="financeiro">Comercial &amp; Financeiro</TabsTrigger>
            <TabsTrigger value="logistica">Logística</TabsTrigger>
            <TabsTrigger value="usuarios" disabled={!editing}>
              Usuários
            </TabsTrigger>
          </TabsList>

          {/* DADOS CADASTRAIS */}
          <TabsContent value="dados">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <Label>Código</Label>
                <Input value={form.codigo ?? ""} readOnly className="bg-muted" />
              </div>
              <div>
                <Label>CNPJ</Label>
                <div className="flex gap-2">
                  <Input
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={18}
                    value={formatCNPJ(form.cnpj ?? "")}
                    onChange={(e) => set("cnpj", unmaskCnpj(e.target.value).slice(0, 14))}
                    placeholder="00.000.000/0000-00"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCNPJLookup}
                    disabled={loadingCNPJ || unmaskCnpj(form.cnpj ?? "").length !== 14 || !validateCNPJ(unmaskCnpj(form.cnpj ?? ""))}
                    title="Buscar dados públicos na BrasilAPI (revise antes de salvar)"
                  >
                    {loadingCNPJ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-2 hidden sm:inline">Buscar</span>
                  </Button>
                </div>

                {errors.cnpj && <p className="text-xs text-destructive mt-1">{errors.cnpj}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label>Razão Social *</Label>
                <Input value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} />
                {errors.razao_social && <p className="text-xs text-destructive mt-1">{errors.razao_social}</p>}
              </div>
              <div className="sm:col-span-2">
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia ?? ""} onChange={(e) => set("nome_fantasia", e.target.value)} />
              </div>
              <div>
                <Label>Inscrição Estadual</Label>
                <MaskedInput
                  mask="ie"
                  uf={form.commercial_state ?? undefined}
                  value={form.inscricao_estadual ?? ""}
                  onChange={(e) => set("inscricao_estadual", e.target.value)}
                  onBlur={(e) => {
                    const r = validateIE(form.commercial_state ?? null, e.target.value, { allowIsento: true });
                    setErrors((prev) => {
                      const next = { ...prev };
                      if (!r.ok) next.inscricao_estadual = r.error;
                      else delete next.inscricao_estadual;
                      return next;
                    });
                  }}
                  placeholder={form.commercial_state ? "Conforme UF selecionada (ou ISENTO)" : "ISENTO ou selecione a UF"}
                  autoCapitalize="characters"
                />
                {errors.inscricao_estadual && <p className="text-xs text-destructive mt-1">{errors.inscricao_estadual}</p>}
              </div>

              <div>
                <Label>Inscrição Municipal</Label>
                <Input value={form.inscricao_municipal ?? ""} onChange={(e) => set("inscricao_municipal", e.target.value)} />
              </div>
              <div>
                <Label>Regime Tributário</Label>
                <Select value={form.regime_tributario ?? "none"} onValueChange={(v) => set("regime_tributario", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não informado —</SelectItem>
                    <SelectItem value="simples">Simples Nacional</SelectItem>
                    <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="lucro_real">Lucro Real</SelectItem>
                    <SelectItem value="mei">MEI</SelectItem>
                    <SelectItem value="isento">Isento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>SUFRAMA</Label>
                <Input value={form.suframa ?? ""} onChange={(e) => set("suframa", e.target.value)} />
              </div>
              <div>
                <Label>Tipo de Parceiro</Label>
                <Select value={form.partner_type ?? "none"} onValueChange={(v) => set("partner_type", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não informado —</SelectItem>
                    <SelectItem value="distribuidor">Distribuidor</SelectItem>
                    <SelectItem value="revenda">Revenda</SelectItem>
                    <SelectItem value="cooperativa">Cooperativa</SelectItem>
                    <SelectItem value="produtor_parceiro">Produtor Parceiro</SelectItem>
                    <SelectItem value="canal_estrategico">Canal Estratégico</SelectItem>
                    <SelectItem value="representante">Representante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Segmento</Label>
                <Select value={form.segmento ?? "none"} onValueChange={(v) => set("segmento", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não informado —</SelectItem>
                    <SelectItem value="cooperativa">Cooperativa</SelectItem>
                    <SelectItem value="revenda_agro">Revenda Agro</SelectItem>
                    <SelectItem value="consultoria">Consultoria</SelectItem>
                    <SelectItem value="industria">Indústria</SelectItem>
                    <SelectItem value="produtor_direto">Produtor Direto</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Porte</Label>
                <Select value={form.porte ?? "none"} onValueChange={(v) => set("porte", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não informado —</SelectItem>
                    <SelectItem value="pequeno">Pequeno</SelectItem>
                    <SelectItem value="medio">Médio</SelectItem>
                    <SelectItem value="grande">Grande</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data de início da parceria</Label>
                <Input type="date" value={form.data_inicio_parceria ?? ""} onChange={(e) => set("data_inicio_parceria", e.target.value || null)} />
              </div>
              <div>
                <Label>Consultor responsável</Label>
                <Select value={form.consultor_responsavel ?? "none"} onValueChange={(v) => set("consultor_responsavel", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem responsável —</SelectItem>
                    {consultores?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Cliente vinculado (opcional)</Label>
                <Select value={form.client_id ?? "none"} onValueChange={(v) => set("client_id", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem vínculo —</SelectItem>
                    {clientes?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.razao_social || c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
                    <span className="text-sm text-muted-foreground">{form.ativo ? "Ativo" : "Inativo"}</span>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
              </div>
            </div>
          </TabsContent>

          {/* ENDEREÇO */}
          <TabsContent value="endereco">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 pt-2">
              <div className="sm:col-span-2">
                <Label>CEP</Label>
                <Input value={form.cep ?? ""} onChange={(e) => set("cep", e.target.value)} onBlur={handleCepBlur} placeholder="00000-000" />
              </div>
              <div className="sm:col-span-4">
                <Label>Logradouro</Label>
                <Input value={form.endereco_logradouro ?? ""} onChange={(e) => set("endereco_logradouro", e.target.value)} />
              </div>
              <div className="sm:col-span-1">
                <Label>Número</Label>
                <Input value={form.endereco_numero ?? ""} onChange={(e) => set("endereco_numero", e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Label>Complemento</Label>
                <Input value={form.endereco_complemento ?? ""} onChange={(e) => set("endereco_complemento", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Bairro</Label>
                <Input value={form.endereco_bairro ?? ""} onChange={(e) => set("endereco_bairro", e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Label>Cidade</Label>
                <Input value={form.commercial_city ?? ""} onChange={(e) => set("commercial_city", e.target.value)} />
              </div>
              <div className="sm:col-span-1">
                <Label>UF</Label>
                <Input maxLength={2} value={form.commercial_state ?? ""} onChange={(e) => set("commercial_state", e.target.value.toUpperCase())} />
              </div>
              <div className="sm:col-span-2">
                <Label>Região comercial</Label>
                <Input value={form.commercial_region ?? ""} onChange={(e) => set("commercial_region", e.target.value)} />
              </div>
            </div>
          </TabsContent>

          {/* CONTATOS */}
          <TabsContent value="contatos">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <Label>E-mail comercial</Label>
                <Input type="email" value={form.email_comercial ?? ""} onChange={(e) => set("email_comercial", e.target.value)} />
                {errors.email_comercial && <p className="text-xs text-destructive mt-1">{errors.email_comercial}</p>}
              </div>
              <div>
                <Label>E-mail financeiro</Label>
                <Input type="email" value={form.email_financeiro ?? ""} onChange={(e) => set("email_financeiro", e.target.value)} />
                {errors.email_financeiro && <p className="text-xs text-destructive mt-1">{errors.email_financeiro}</p>}
              </div>
              <div>
                <Label>E-mail NF-e</Label>
                <Input type="email" value={form.email_nfe ?? ""} onChange={(e) => set("email_nfe", e.target.value)} />
                {errors.email_nfe && <p className="text-xs text-destructive mt-1">{errors.email_nfe}</p>}
              </div>
              <div>
                <Label>Site</Label>
                <Input value={form.site ?? ""} onChange={(e) => set("site", e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Telefone comercial</Label>
                <MaskedInput mask="telefone" placeholder="(00) 00000-0000" value={form.telefone_comercial ?? ""} onChange={(e) => set("telefone_comercial", e.target.value)} />
              </div>
              <div>
                <Label>WhatsApp comercial</Label>
                <MaskedInput mask="telefone" placeholder="(00) 00000-0000" value={form.whatsapp_comercial ?? ""} onChange={(e) => set("whatsapp_comercial", e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Contatos pessoais adicionais (1:N) ficam disponíveis após salvar o cadastro.
            </p>
          </TabsContent>

          {/* COMERCIAL & FINANCEIRO */}
          <TabsContent value="financeiro">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <Label>Desconto Padrão (%)</Label>
                <Input type="number" min={0} max={100} step={0.01}
                  value={form.desconto_padrao}
                  onChange={(e) => set("desconto_padrao", Number(e.target.value))} />
              </div>
              <div>
                <Label>Comissão (%)</Label>
                <Input type="number" min={0} max={100} step={0.01}
                  value={form.comissao_percentual ?? ""}
                  onChange={(e) => set("comissao_percentual", num(e.target.value))} />
                {errors.comissao_percentual && <p className="text-xs text-destructive mt-1">{errors.comissao_percentual}</p>}
              </div>
              <div>
                <Label>Limite de crédito (R$)</Label>
                <MoneyInput allowEmpty
                  value={form.limite_credito_brl}
                  onValueChange={(v) => set("limite_credito_brl", v)} />
              </div>
              <div>
                <Label>Meta mensal (R$)</Label>
                <MoneyInput allowEmpty
                  value={form.meta_mensal_brl}
                  onValueChange={(v) => set("meta_mensal_brl", v)} />
              </div>
              <div>
                <Label>Prazo pagamento padrão (dias)</Label>
                <Input type="number" min={0}
                  value={form.prazo_pagamento_padrao_dias ?? ""}
                  onChange={(e) => set("prazo_pagamento_padrao_dias", num(e.target.value))} />
              </div>
              <div>
                <Label>Condição de pagamento</Label>
                <Input value={form.condicao_pagamento_padrao ?? ""}
                  onChange={(e) => set("condicao_pagamento_padrao", e.target.value)}
                  placeholder="Ex: 30/60/90" />
              </div>
              <div>
                <Label>Forma de pagamento preferida</Label>
                <Select value={form.forma_pagamento_preferida ?? "none"}
                  onValueChange={(v) => set("forma_pagamento_preferida", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não informado —</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Dados bancários</Label>
                <Textarea rows={2}
                  value={typeof form.dados_bancarios === "string" ? form.dados_bancarios : (form.dados_bancarios?.texto ?? (form.dados_bancarios ? JSON.stringify(form.dados_bancarios) : ""))}
                  onChange={(e) => set("dados_bancarios", e.target.value || null)}
                  placeholder="Banco, agência, conta, PIX..." />
              </div>
            </div>
          </TabsContent>

          {/* LOGÍSTICA */}
          <TabsContent value="logistica">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <Label>Transportadora preferida</Label>
                <Input value={form.transportadora_preferida ?? ""} onChange={(e) => set("transportadora_preferida", e.target.value)} />
              </div>
              <div>
                <Label>Incoterm</Label>
                <Select value={form.incoterm ?? "none"} onValueChange={(v) => set("incoterm", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não informado —</SelectItem>
                    <SelectItem value="CIF">CIF (frete por conta da Cultivo Farm)</SelectItem>
                    <SelectItem value="FOB">FOB (frete por conta do parceiro)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex items-center gap-2 mt-2">
                <Switch
                  checked={form.endereco_entrega_igual_comercial ?? true}
                  onCheckedChange={(v) => set("endereco_entrega_igual_comercial", v)}
                />
                <Label className="mb-0">Endereço de entrega igual ao comercial</Label>
              </div>
              {!form.endereco_entrega_igual_comercial && (
                <>
                  <div>
                    <Label>CEP entrega</Label>
                    <Input value={form.entrega_cep ?? ""} onChange={(e) => set("entrega_cep", e.target.value)} />
                  </div>
                  <div>
                    <Label>Logradouro entrega</Label>
                    <Input value={form.entrega_logradouro ?? ""} onChange={(e) => set("entrega_logradouro", e.target.value)} />
                  </div>
                  <div>
                    <Label>Número</Label>
                    <Input value={form.entrega_numero ?? ""} onChange={(e) => set("entrega_numero", e.target.value)} />
                  </div>
                  <div>
                    <Label>Complemento</Label>
                    <Input value={form.entrega_complemento ?? ""} onChange={(e) => set("entrega_complemento", e.target.value)} />
                  </div>
                  <div>
                    <Label>Bairro</Label>
                    <Input value={form.entrega_bairro ?? ""} onChange={(e) => set("entrega_bairro", e.target.value)} />
                  </div>
                  <div>
                    <Label>Cidade</Label>
                    <Input value={form.entrega_cidade ?? ""} onChange={(e) => set("entrega_cidade", e.target.value)} />
                  </div>
                  <div>
                    <Label>UF</Label>
                    <Input maxLength={2} value={form.entrega_estado ?? ""} onChange={(e) => set("entrega_estado", e.target.value.toUpperCase())} />
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {editing && parceiro && (
            <TabsContent value="usuarios" className="pt-2">
              <ParceiroUsuariosTab partnerId={parceiro.id} />
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
            {editing ? "Salvar alterações" : "Criar parceiro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
