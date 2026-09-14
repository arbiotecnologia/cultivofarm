/**
 * Cópia de texto para a área de transferência com degradação segura.
 * Nunca lança: devolve false quando a cópia não pôde ser confirmada,
 * para que a interface ofereça o link em modo selecionável.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  if (!texto) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // segue para o método alternativo
  }
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  let area: HTMLTextAreaElement | null = null;
  try {
    area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    // O campo auxiliar sai do DOM mesmo quando execCommand lança.
    try {
      area?.remove();
    } catch {
      /* noop */
    }
  }
}

export const MSG_COPIA_INDISPONIVEL =
  "Não foi possível copiar automaticamente. Selecione e copie o link abaixo.";
