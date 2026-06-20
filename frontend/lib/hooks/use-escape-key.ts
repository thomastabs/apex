import { useEffect } from "react";

/**
 * Calls `onEscape` when the user presses Escape, while `active` is true.
 * Used to make portal modals dismissible by keyboard (a11y).
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}
