import { useMemo, useState } from "react";
import { renderTemplate, TemplateRenderError, type Canal } from "@/features/comunicacao/render/renderTemplate";
import { isComunicacaoModuleEnabled } from "@/features/comunicacao/flags";

/**
 * UI administrativa — Fase 1.
 * Somente renderiza quando a feature flag está ligada.
 * Fase 1: shell somente leitura + preview seguro. Fluxos CRUD serão ligados quando a migration estiver aplicada em staging.
 */
export default function ComunicacaoAdminPage() {
  const [aba, setAba] = useState<"templates" | "regras" | "fila" | "preferencias">("templates");

  if (!isComunicacaoModuleEnabled()) {
    return null;
  }



  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Comunicação</h1>
        <p className="text-sm text-muted-foreground">
          Fundação em construção. Envios reais desativados.
        </p>
      </header>

      <nav className="flex gap-2 border-b" role="tablist" aria-label="Seções de Comunicação">
        {(["templates", "regras", "fila", "preferencias"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={aba === k}
            className={`px-3 py-2 text-sm ${aba === k ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setAba(k)}
          >
            {labelAba(k)}
          </button>
        ))}
      </nav>

      {aba === "templates" && <TemplatesTab />}
      {aba === "regras" && <PlaceholderTab titulo="Regras por evento" />}
      {aba === "fila" && <PlaceholderTab titulo="Fila e histórico" descricao="Somente leitura." />}
      {aba === "preferencias" && <PlaceholderTab titulo="Preferências" descricao="Preferências do próprio usuário." />}
    </div>
  );
}

function labelAba(k: string) {
  return k === "templates" ? "Templates"
    : k === "regras" ? "Regras"
    : k === "fila" ? "Fila e histórico"
    : "Preferências";
}

function PlaceholderTab({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <section className="rounded-md border p-4">
      <h2 className="font-medium">{titulo}</h2>
      {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
      <p className="mt-2 text-sm">
        Configuração de canais: <strong>não configurado / desativado</strong>. Nenhum segredo exibido.
      </p>
    </section>
  );
}

function TemplatesTab() {
  const [canal, setCanal] = useState<Canal>("email");
  const [assunto, setAssunto] = useState("Olá {{nome_destinatario}}");
  const [corpo, setCorpo] = useState("Prezado(a) {{nome_destinatario}}, {{mensagem}}");
  const [variaveisTxt, setVariaveisTxt] = useState("nome_destinatario, mensagem");
  const [amostraTxt, setAmostraTxt] = useState('{"nome_destinatario":"Maria","mensagem":"Bem-vinda"}');

  const preview = useMemo(() => {
    try {
      const variaveisPermitidas = variaveisTxt.split(",").map(v => v.trim()).filter(Boolean);
      const amostra = JSON.parse(amostraTxt) as Record<string, unknown>;
      return renderTemplate(
        { canal, assunto, corpo, variaveisPermitidas },
        { variaveis: amostra },
      );
    } catch (e) {
      const msg = e instanceof TemplateRenderError
        ? `${e.code}: ${e.message}`
        : (e as Error).message;
      return { erro: msg };
    }
  }, [canal, assunto, corpo, variaveisTxt, amostraTxt]);

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <label className="block text-sm">
          Canal
          <select
            className="mt-1 w-full rounded border p-2"
            value={canal}
            onChange={(e) => setCanal(e.target.value as Canal)}
          >
            <option value="email">E-mail</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="in_app">Portal</option>
            <option value="push">Push</option>
          </select>
        </label>
        <label className="block text-sm">
          Assunto
          <input className="mt-1 w-full rounded border p-2" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </label>
        <label className="block text-sm">
          Corpo
          <textarea className="mt-1 h-40 w-full rounded border p-2" value={corpo} onChange={(e) => setCorpo(e.target.value)} />
        </label>
        <label className="block text-sm">
          Variáveis permitidas (separadas por vírgula)
          <input className="mt-1 w-full rounded border p-2" value={variaveisTxt} onChange={(e) => setVariaveisTxt(e.target.value)} />
        </label>
        <label className="block text-sm">
          Amostra JSON
          <textarea className="mt-1 h-24 w-full rounded border p-2 font-mono text-xs" value={amostraTxt} onChange={(e) => setAmostraTxt(e.target.value)} />
        </label>
      </div>

      <div className="rounded-md border p-4">
        <h3 className="font-medium">Preview seguro</h3>
        {"erro" in preview ? (
          <p className="mt-2 text-sm text-destructive">{preview.erro}</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            {preview.assunto && <div><strong>Assunto:</strong> {preview.assunto}</div>}
            <pre className="whitespace-pre-wrap font-sans">{preview.corpo}</pre>
            {preview.missing.length > 0 && (
              <p className="text-xs text-muted-foreground">Variáveis ausentes: {preview.missing.join(", ")}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
