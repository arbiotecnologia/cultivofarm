/** HTTPS-only documentary links. Never normalizes credentials or controls away. */
export function safeSourceUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    value !== value.trim() ||
    /[\s\\\u0000-\u001f\u007f]/.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname ||
      !/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:[/?#]|$)/.test(value) ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local")
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function validateOptionalSourceUrl(value: unknown) {
  if (value == null || value === "") return;
  if (!safeSourceUrl(value))
    throw new Error(
      "Informe uma URL HTTPS sem credenciais, espaços ou caracteres de controle.",
    );
}
