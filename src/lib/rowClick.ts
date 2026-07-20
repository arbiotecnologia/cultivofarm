import { KeyboardEvent, MouseEvent } from "react";

/**
 * Returns props for a clickable row/list item. Not a hook — safe to call inside
 * `.map()`. Preserves keyboard activation (Enter/Space) and accessibility.
 *
 * Usage:
 *   <TableRow {...rowClickProps(() => openItem(item))}>...</TableRow>
 *
 * Wrap interactive children (buttons, links, dropdowns) with `stopRowClick`
 * so they don't trigger the row click:
 *   <TableCell onClick={stopRowClick}>...</TableCell>
 */
export function rowClickProps(onActivate: () => void) {
  return {
    onClick: () => onActivate(),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
    role: "button" as const,
    tabIndex: 0,
    className:
      "cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  };
}

export const stopRowClick = (e: MouseEvent) => e.stopPropagation();
