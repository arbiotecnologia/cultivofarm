/** Local one-shot presentation permit; server audit remains mandatory. */
export function labelPrintPermit(root: HTMLElement, current: () => boolean) {
  let allowed = false;
  const close = () => { allowed = false; root.removeAttribute("data-print-authorized"); };
  const before = () => { if (!allowed || !current()) close(); };
  const keyboard = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") event.preventDefault();
  };
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", close);
  window.addEventListener("keydown", keyboard, true);
  return {
    print() {
      if (!current()) { close(); return; }
      allowed = true; root.setAttribute("data-print-authorized", "true");
      try { window.print(); } finally { close(); }
    },
    dispose() {
      close(); window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", close);
      window.removeEventListener("keydown", keyboard, true);
    },
  };
}