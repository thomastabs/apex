// Effort badge tones. Only DESIGN.md-sanctioned hues (emerald=success/small,
// amber=caution/large, red=danger/largest); mid-range sizes stay neutral so
// violet remains the app's only meaning-carrying accent (One-Signal Rule).
export const EFFORT_COLORS: Record<string, string> = {
  XS: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  S: "bg-neutral-500/15 text-neutral-400 ring-neutral-500/30",
  M: "bg-neutral-500/25 text-neutral-300 ring-neutral-500/40",
  L: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  XL: "bg-red-500/15 text-red-400 ring-red-500/30",
};
