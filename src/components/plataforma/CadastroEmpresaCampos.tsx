import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FUSOS_BRASIL, UFS_BRASIL } from "@/lib/saas/orgOnboarding";
import { limiteCampo, mascaraCep, mascaraTelefoneBR, type CampoCadastro, type DadosCadastro } from "./empresaEdicao";

type Secao = "contatos" | "endereco" | "fiscal" | "fuso";

export interface CadastroEmpresaCamposProps {
  idPrefix: string;
  value: DadosCadastro;
  onChange: (next: DadosCadastro) => void;
  secoes: Secao[];
  /** Marca com * os campos obrigatórios (empresas novas). */
  marcarObrigatorios?: boolean;
  disabled?: boolean;
}

const OBRIG = new Set<CampoCadastro>(["telefone", "cep", "logradouro", "numero", "bairro", "cidade", "uf"]);

/** Campos de contato/endereço/IE reutilizados na Nova Empresa e na edição da ficha. */
export function CadastroEmpresaCampos({ idPrefix, value, onChange, secoes, marcarObrigatorios = false, disabled = false }: CadastroEmpresaCamposProps) {
  const set = (c: CampoCadastro, v: string) => onChange({ ...value, [c]: v });
  const rotulo = (c: CampoCadastro, txt: string) => `${txt}${marcarObrigatorios && OBRIG.has(c) ? " *" : ""}`;
  const texto = (c: CampoCadastro, txt: string, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}, cls = "") => (
    <div className={`space-y-1 ${cls}`}>
      <Label htmlFor={`${idPrefix}-${c}`}>{rotulo(c, txt)}</Label>
      <Input id={`${idPrefix}-${c}`} value={value[c] ?? ""} maxLength={limiteCampo(c)} disabled={disabled}
        onChange={(e) => set(c, e.target.value)} {...extra} />
    </div>
  );
  return (
    <div className="space-y-4">
      {secoes.includes("contatos") && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Contatos</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-telefone`}>{rotulo("telefone", "Telefone")}</Label>
              <Input id={`${idPrefix}-telefone`} inputMode="tel" placeholder="(00) 00000-0000" disabled={disabled}
                value={mascaraTelefoneBR(value.telefone ?? "")} onChange={(e) => set("telefone", mascaraTelefoneBR(e.target.value))} />
            </div>
            {texto("email_contato", "E-mail de contato", { type: "email", autoComplete: "off" })}
            {texto("responsavel_nome", "Contato responsável")}
            {texto("responsavel_cargo", "Cargo")}
          </div>
        </fieldset>
      )}
      {secoes.includes("endereco") && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Endereço</legend>
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`${idPrefix}-cep`}>{rotulo("cep", "CEP")}</Label>
              <Input id={`${idPrefix}-cep`} inputMode="numeric" placeholder="00000-000" disabled={disabled}
                value={mascaraCep(value.cep ?? "")} onChange={(e) => set("cep", mascaraCep(e.target.value))} />
            </div>
            {texto("logradouro", "Logradouro", {}, "sm:col-span-4")}
            {texto("numero", "Número", {}, "sm:col-span-2")}
            {texto("complemento", "Complemento", {}, "sm:col-span-4")}
            {texto("bairro", "Bairro", {}, "sm:col-span-3")}
            {texto("cidade", "Cidade", {}, "sm:col-span-2")}
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor={`${idPrefix}-uf`}>{rotulo("uf", "UF")}</Label>
              <Select value={(value.uf ?? "").toUpperCase() || undefined} onValueChange={(v) => set("uf", v)} disabled={disabled}>
                <SelectTrigger id={`${idPrefix}-uf`} aria-label="UF"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS_BRASIL.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </fieldset>
      )}
      {(secoes.includes("fiscal") || secoes.includes("fuso")) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {secoes.includes("fiscal") && texto("inscricao_estadual", "Inscrição estadual (opcional)", { autoComplete: "off" })}
          {secoes.includes("fuso") && (
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-fuso`}>Fuso horário</Label>
              <Select value={value.fuso_horario || undefined} onValueChange={(v) => set("fuso_horario", v)} disabled={disabled}>
                <SelectTrigger id={`${idPrefix}-fuso`}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{FUSOS_BRASIL.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
