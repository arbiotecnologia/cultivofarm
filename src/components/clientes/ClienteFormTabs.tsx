import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFormContext, useFieldArray, Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, Plus, Trash2, Phone } from "lucide-react";
import { fetchCEP } from "@/lib/api/viacep";
import type { BrasilAPI_CNPJ } from "@/lib/api/brasilapi";
import { validateCNPJ } from "@/lib/validators/cpfCnpj";
import { toast } from "sonner";
import { ClienteContatosTab } from "./ClienteContatosTab";
import { ClienteDocumentosTab } from "./ClienteDocumentosTab";
import { AcessoPortalTab } from "./AcessoPortalTab";
import { useCanManageClienteDocs } from "@/hooks/useCanManageClienteDocs";
import { useCommercialRegistrationScope } from "@/hooks/useCommercialRegistrationScope";
import { useAuth } from "@/hooks/useAuth";
import { MoneyInput } from "../ui/money-input";
import { InscricaoEstadualCadastroInput } from "./InscricaoEstadualCadastroInput";


interface ClienteFormTabsProps {
  clienteId?: string;
  /** Aba inicial (retomada de navegação); só aplicada se a aba estiver autorizada. */
  initialTab?: string;
  onTabChange?: (tab: string) => void;
}

// MaskedInput integrado com RHF via Controller — garante que o valor
// seja reidratado quando o form chama reset() (uncontrolled register não
// aciona re-render do MaskedInput após reset).
function MaskedField({
  name,
  mask,
  placeholder,
  className,
  autoCase,
  onBlurExtra,
  uf,
}: {
  name: string;
  mask: any;
  placeholder?: string;
  className?: string;
  autoCase?: "title" | "upper" | "lower";
  onBlurExtra?: (value: string) => void;
  uf?: string | null;
}) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <MaskedInput
          mask={mask}
          uf={uf ?? undefined}
          value={field.value ?? ""}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={(e) => {
            field.onBlur();
            onBlurExtra?.(e.target.value);
          }}
          placeholder={placeholder}
          className={className}
          autoCase={autoCase}
        />
      )}
    />
  );
}

export function ClienteFormTabs({ clienteId, initialTab, onTabChange }: ClienteFormTabsProps) {
  const { register, watch, setValue, control, formState: { errors } } = useFormContext();
  const [loadingCEP, setLoadingCEP] = useState(false);
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const canManageDocs = useCanManageClienteDocs();
  const { role } = useAuth();
  const scope = useCommercialRegistrationScope();
  // Retomada de navegação: somente a aba Documentos, e só se autorizada.
  const [tab, setTabState] = useState(initialTab === "documentos" && canManageDocs ? "documentos" : "geral");
  const onTabChangeRef = useRef(onTabChange);
  onTabChangeRef.current = onTabChange;
  const setTab = useCallback((next: string) => { setTabState(next); onTabChangeRef.current?.(next); }, []);
  useEffect(() => { onTabChangeRef.current?.(tab); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cepGeneration = useRef({ endereco: 0, cobranca: 0 });
  useEffect(() => {
    const field = Object.keys(errors)[0];
    if (field) setTab(field.startsWith("endereco_") || field.startsWith("cobranca_") ? "endereco" : field.startsWith("contato_financeiro_") || field === "limite_credito" ? "financeiro" : "geral");
  }, [errors]);
  const canManagePortalAccess = role === "administrador" || role === "gestor" || role === "administrativo";

  const { fields, append, remove } = useFieldArray({
    control,
    name: "telefones_adicionais" // Vou usar um nome temporário para facilitar a manipulação
  });

  const tipoPessoa = watch("tipo_pessoa");
  const cpfCnpj = watch("cpf_cnpj");
  const cobrancaMesmoEndereco = watch("cobranca_mesmo_endereco");
  const limiteCredito = watch("limite_credito");

  // Detecção automática de tipo de pessoa — preserva a escolha manual.
  // Um CNPJ passa por 11 dígitos durante a digitação; portanto, se o usuário
  // já escolheu "Pessoa Jurídica", não podemos reclassificar como CPF nesse
  // ponto intermediário, senão a máscara volta para CPF e bloqueia o CNPJ.
  useEffect(() => {
    const raw = String(cpfCnpj || "");
    const normalized = raw.replace(/[\s.\-/]/g, "").toUpperCase();
    const digits = raw.replace(/\D/g, "");
    const hasLetters = /[A-Z]/.test(normalized);

    if ((hasLetters || normalized.length === 14 || digits.length > 11) && tipoPessoa !== "juridica") {
      setValue("tipo_pessoa", "juridica");
    } else if (digits.length === 11 && tipoPessoa !== "juridica" && tipoPessoa !== "fisica") {
      setValue("tipo_pessoa", "fisica");
    }
  }, [cpfCnpj, setValue, tipoPessoa]);

  const formatCurrency = useCallback((value: number | string | null | undefined) => {
    if (value === null || value === undefined || value === "") return "";
    const numValue = typeof value === "number" ? value : Number(String(value).replace(/\D/g, "")) / 100;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numValue);
  }, []);

  const handleCEPBlur = async (field: "endereco" | "cobranca", cep: string) => {
    if (cep?.replace(/\D/g, "").length !== 8) return;
    const current = scope.capture();
    const generation = ++cepGeneration.current[field];
    const snapshot = JSON.stringify(watch());
    setLoadingCEP(true);
    try {
      const data = await fetchCEP(cep);
      if (!current() || generation !== cepGeneration.current[field] || snapshot !== JSON.stringify(watch())) return;
      const prefix = field === "endereco" ? "endereco" : "cobranca";
      setValue(`${prefix}_logradouro`, data.logradouro);
      setValue(`${prefix}_bairro`, data.bairro);
      setValue(`${prefix}_municipio`, data.localidade);
      setValue(`${prefix}_estado`, data.uf);
    } catch (err: any) {
      if (current()) toast.error("Não foi possível consultar o CEP. Preencha o endereço manualmente.");
    } finally {
      if (current() && generation === cepGeneration.current[field]) setLoadingCEP(false);
    }
  };

  const cnpjAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => cnpjAbortRef.current?.abort(), [scope.scope, clienteId]);
  useEffect(() => {
    const field = Object.keys(errors)[0];
    if (field) setTab(field.startsWith("endereco_") || field.startsWith("cobranca_") ? "endereco" : field.startsWith("contato_financeiro_") || field === "limite_credito" ? "financeiro" : "geral");
  }, [errors]);

  const handleCNPJLookup = async () => {
    const current = scope.capture();
    const snapshot = JSON.stringify(watch());
    const cnpj = watch("cpf_cnpj");
    const clean = (cnpj ?? "").replace(/\D/g, "");
    if (clean.length !== 14 || !validateCNPJ(clean)) {
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
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
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

      const data = (await resp.json()) as BrasilAPI_CNPJ;

      if (!current() || ctrl.signal.aborted || snapshot !== JSON.stringify(watch())) return;
      const fields: Array<[string, string | undefined | null]> = [
        ["razao_social", data.razao_social],
        ["nome_fantasia", data.nome_fantasia || data.razao_social],
        ["nome", data.nome_fantasia || data.razao_social],
        ["endereco_cep", data.cep],
        ["endereco_logradouro", data.logradouro],
        ["endereco_numero", data.numero],
        ["endereco_complemento", data.complemento],
        ["endereco_bairro", data.bairro],
        ["endereco_municipio", data.municipio],
        ["endereco_estado", data.uf],
        ["telefone", data.ddd_telefone_1],
      ];

      let filledCount = 0;
      for (const [name, value] of fields) {
        if (typeof value === "string" && value.trim().length > 0) {
          const current = watch(name);
          if (!current || String(current).trim().length === 0 || name === "razao_social" || name === "nome_fantasia" || name.startsWith("endereco_")) {
            setValue(name, value, { shouldDirty: true });
          }
          filledCount++;
        }
      }

      if (filledCount === 0) {
        toast.warning("Nenhum dado utilizável retornado", {
          description:
            "A BrasilAPI respondeu, mas não trouxe campos cadastrais preenchíveis para este CNPJ. Preencha manualmente.",
        });
        return;
      }

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
      if (cnpjAbortRef.current === ctrl && current()) setLoadingCNPJ(false);
    }
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <div className="w-full overflow-x-auto no-scrollbar pb-2">
        <TabsList className="w-max sm:w-full h-auto gap-1 p-1.5 bg-muted/50 flex">
          <TabsTrigger value="geral" className="text-xs sm:text-sm py-2 min-w-[80px]">Geral</TabsTrigger>
          <TabsTrigger value="endereco" className="text-xs sm:text-sm py-2 min-w-[80px]">Endereço</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs sm:text-sm py-2 min-w-[80px]">Financeiro</TabsTrigger>
          {canManageDocs && (
            <TabsTrigger value="documentos" className="text-xs sm:text-sm py-2 min-w-[80px]">Documentos</TabsTrigger>
          )}
          {canManagePortalAccess && (
            <TabsTrigger value="portal" className="text-xs sm:text-sm py-2 min-w-[80px]">Portal</TabsTrigger>
          )}
        </TabsList>
      </div>

      <TabsContent value="geral" className="space-y-6 pt-4">
        <div className="space-y-2">
          <Label>Código do Cliente</Label>
          <Input
            value={watch("codigo_cliente") || ""}
            placeholder={clienteId ? "—" : "Gerado automaticamente ao salvar"}
            readOnly
            disabled
            className="font-mono-data font-semibold max-w-[200px] bg-muted/40"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tipo de Pessoa</Label>
            <Select value={tipoPessoa} onValueChange={v => setValue("tipo_pessoa", v, { shouldDirty: true })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fisica">Pessoa Física</SelectItem>
                <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={watch("status_cliente") || "ativo"} onValueChange={v => setValue("status_cliente", v, { shouldDirty: true })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="bloqueado_financeiro">Bloqueado Fin.</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{tipoPessoa === "juridica" ? "CNPJ" : "CPF"}</Label>
            <div className="flex gap-2 items-center">
              <MaskedField
                key={`cpf-cnpj-${tipoPessoa === "juridica" ? "cnpj" : "cpf"}`}
                name="cpf_cnpj"
                mask={tipoPessoa === "juridica" ? "cnpj" : "cpf"}
                className="h-11 sm:h-10 text-base sm:text-sm"
                placeholder={tipoPessoa === "juridica" ? "00.000.000/0000-00" : "000.000.000-00"}
              />
              {tipoPessoa === "juridica" && (
                <Button type="button" size="lg" variant="outline" onClick={handleCNPJLookup} disabled={loadingCNPJ} className="h-11 sm:h-10 px-3 shrink-0">
                  {loadingCNPJ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-2 hidden sm:inline">Buscar</span>
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Inscrição Estadual</Label>
            <Controller
              control={control}
              name="inscricao_estadual"
              render={({ field }) => <InscricaoEstadualCadastroInput {...field}
                value={field.value ?? ""} uf={watch("endereco_estado")} />}
            />
            {errors.inscricao_estadual?.message && (
              <p className="text-xs text-destructive">{String(errors.inscricao_estadual.message)}</p>
            )}
          </div>

        </div>

        <div className="space-y-2">
          <Label>Nome Fantasia / Apelido *</Label>
          <Input 
            {...register("nome_fantasia")} 
            autoCase="title" 
            required 
            onChange={(e) => {
              const val = e.target.value;
              register("nome_fantasia").onChange(e);
              if (!watch("razao_social")) {
                setValue("razao_social", val);
              }
              setValue("nome", val);
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>{tipoPessoa === "juridica" ? "Razão Social" : "Nome Completo"} *</Label>
          <Input {...register("razao_social")} autoCase="title" required />
        </div>

        <div className="border-t pt-6 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            Informações de Contato
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>E-mail Principal</Label>
              <Input type="email" {...register("email")} placeholder="exemplo@email.com" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> Telefone Principal
              </Label>
              <MaskedField name="telefone" mask="telefone" placeholder="(00) 00000-0000" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Telefones Adicionais</Label>
              <Button 
                type="button" 
                variant="outline" 
                size="lg" 
                onClick={() => append({ value: "" })}
                className="h-10 text-xs font-bold"
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar Telefone
              </Button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <MaskedField
                      name={`telefones_adicionais.${index}.value`}
                      mask="telefone"
                      placeholder={`Telefone ${index + 2}`}
                    />

                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="lg" 
                    onClick={() => remove(index)}
                    className="text-destructive shrink-0 h-11 w-11 sm:h-10 sm:w-10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <ClienteContatosTab clienteId={clienteId || ""} />
        </div>
      </TabsContent>

      <TabsContent value="endereco" className="space-y-4 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2 sm:col-span-1">
            <Label>CEP</Label>
            <MaskedField name="endereco_cep" mask="cep" onBlurExtra={(v) => handleCEPBlur("endereco", v)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Bairro</Label>
            <Input {...register("endereco_bairro")} autoCase="title" />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="space-y-2 flex-1">
            <Label>Logradouro</Label>
            <Input {...register("endereco_logradouro")} autoCase="title" />
          </div>
          <div className="space-y-2 sm:w-28">
            <Label>Número</Label>
            <Input {...register("endereco_numero")} autoCase="upper" maxLength={8} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Complemento</Label>
          <Input {...register("endereco_complemento")} autoCase="title" placeholder="Apto, bloco, ponto de referência..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Município</Label>
            <Input {...register("endereco_municipio")} autoCase="title" />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label>Estado</Label>
            <Input {...register("endereco_estado")} autoCase="upper" maxLength={2} />
          </div>
        </div>

        <div className="border-t pt-4 mt-6">
          <div className="flex items-center space-x-2 pb-4">
            <Switch checked={cobrancaMesmoEndereco} onCheckedChange={v => setValue("cobranca_mesmo_endereco", v)} id="cobranca_mesmo" />
            <Label htmlFor="cobranca_mesmo">Cobrança no mesmo endereço principal</Label>
          </div>
          
          {!cobrancaMesmoEndereco && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-1 border p-4 rounded-lg bg-muted/30">
              <h4 className="font-medium text-sm mb-2">Endereço de Cobrança</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-1">
                  <Label>CEP Cobrança</Label>
                  <MaskedField name="cobranca_cep" mask="cep" onBlurExtra={(v) => handleCEPBlur("cobranca", v)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Bairro</Label>
                  <Input {...register("cobranca_bairro")} autoCase="title" />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-2 flex-1">
                  <Label>Logradouro</Label>
                  <Input {...register("cobranca_logradouro")} autoCase="title" />
                </div>
                <div className="space-y-2 sm:w-28">
                  <Label>Número</Label>
                  <Input {...register("cobranca_numero")} autoCase="upper" maxLength={8} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input {...register("cobranca_complemento")} autoCase="title" placeholder="Apto, bloco, ponto de referência..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Município</Label>
                  <Input {...register("cobranca_municipio")} autoCase="title" />
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label>Estado</Label>
                  <Input {...register("cobranca_estado")} autoCase="upper" maxLength={2} />
                </div>
              </div>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="financeiro" className="space-y-4 pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Limite de Crédito</Label>
            <Controller
              control={control}
              name="limite_credito"
              render={({ field }) => (
                <MoneyInput
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Condição de Pagamento</Label>
            <div className="flex gap-2">
              <Input 
                type="number" 
                placeholder="Ex: 30" 
                className="flex-1"
                {...register("condicao_pagamento_valor")}
                onChange={(e) => {
                  const valor = e.target.value;
                  const unidade = watch("condicao_pagamento_unidade") || "dias";
                  setValue("condicao_pagamento", valor ? `${valor} ${unidade}` : "");
                }}
              />
              <Select 
                value={watch("condicao_pagamento_unidade") || "dias"} 
                onValueChange={(v) => {
                  setValue("condicao_pagamento_unidade", v);
                  const valor = watch("condicao_pagamento_valor");
                  setValue("condicao_pagamento", valor ? `${valor} ${v}` : "");
                }}
              >
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dias">Dias</SelectItem>
                  <SelectItem value="meses">Meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Banco</Label>
            <Input {...register("banco_nome")} />
          </div>
          <div className="space-y-2">
            <Label>Agência</Label>
            <Input {...register("banco_agencia")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Conta</Label>
            <Input {...register("banco_conta")} />
          </div>
          <div className="space-y-2">
            <Label>Chave PIX</Label>
            <Input {...register("banco_pix_chave")} />
          </div>
        </div>
      </TabsContent>

      {canManageDocs && (
        <TabsContent value="documentos" className="pt-2">
          {clienteId ? (
            <ClienteDocumentosTab clienteId={clienteId} />
          ) : (
            <p className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
              Salve o cliente para habilitar o anexo de documentos.
            </p>
          )}
        </TabsContent>
      )}

      {canManagePortalAccess && (
        <TabsContent value="portal" className="pt-2">
          <AcessoPortalTab clienteId={clienteId || ""} />
        </TabsContent>
      )}
    </Tabs>
  );
}
