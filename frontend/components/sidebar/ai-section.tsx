"use client";
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { useAiConfig, useSaveAiConfig } from "@/lib/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type ModelEntry = { id: string; label: string; role: string; provider?: string; note?: string };
type ProviderKey = "anthropic" | "openai" | "google";

const FALLBACK_MODELS: ModelEntry[] = [
  { id: "claude-haiku-4-5",                label: "Claude Haiku 4.5",      role: "Budget",   provider: "anthropic", note: "Cheapest Claude — good for simple tasks" },
  { id: "claude-sonnet-4-6",               label: "Claude Sonnet 4.6",     role: "Standard",  provider: "anthropic", note: "Recommended for most projects" },
  { id: "claude-opus-4-8",                 label: "Claude Opus 4.8",       role: "Premium",   provider: "anthropic", note: "Most capable Opus" },
  { id: "claude-fable-5",                  label: "Claude Fable 5",        role: "Flagship",  provider: "anthropic", note: "Most powerful Claude — premium cost" },
  { id: "gpt-4.1-nano",                    label: "GPT-4.1 Nano",          role: "Budget",   provider: "openai",    note: "Cheapest OpenAI model — good for simple tasks" },
  { id: "gpt-4.1-mini",                    label: "GPT-4.1 Mini",          role: "Economy",   provider: "openai",    note: "Low cost with strong capability" },
  { id: "gpt-4o-mini",                     label: "GPT-4o Mini",           role: "Economy",   provider: "openai",    note: "Reliable low-cost option" },
  { id: "gpt-4.1",                         label: "GPT-4.1",               role: "Standard",  provider: "openai",    note: "Latest GPT-4.1 — strong and efficient" },
  { id: "gpt-4o",                          label: "GPT-4o",                role: "Standard",  provider: "openai",    note: "GPT-4o flagship" },
  { id: "gemini-2.5-flash-lite",            label: "Gemini 2.5 Flash Lite", role: "Budget",   provider: "google",    note: "Cheapest Gemini model — ideal for simple tasks" },
  { id: "gemini-2.5-flash",                label: "Gemini 2.5 Flash",      role: "Standard",  provider: "google",    note: "Best Gemini balance of quality and cost" },
  { id: "gemini-2.5-pro",                  label: "Gemini 2.5 Pro",        role: "Premium",   provider: "google",    note: "Most capable Gemini model" },
];

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  anthropic: "Anthropic (Claude)",
  openai:    "OpenAI (GPT)",
  google:    "Google (Gemini)",
};

function modelProvider(m: ModelEntry): ProviderKey {
  return (m.provider ?? "anthropic") as ProviderKey;
}

function ModelSelect({ models, value, onChange }: { models: ModelEntry[]; value: string; onChange: (v: string) => void }) {
  return (
    <select
      className="h-9 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>{m.label} — {m.note ?? m.role}</option>
      ))}
    </select>
  );
}

type AiSectionProps = DragSectionProps & {
  dark: boolean;
  taigaToken: string;
};

export function AiSection({ dark, taigaToken, shellClass, dragHandlers, onDragStart }: AiSectionProps) {
  const [aiOpen, setAiOpen] = useState(false);
  const [localModel, setLocalModel] = useState("");
  const [localProvider, setLocalProvider] = useState<ProviderKey>("anthropic");

  const aiConfig = useAiConfig();
  const saveAiConfigMutation = useSaveAiConfig();

  const availableModels = aiConfig.data?.available_models ?? FALLBACK_MODELS;
  const configuredProviders = aiConfig.data?.configured_providers ?? [];

  useEffect(() => {
    if (aiConfig.data) {
      setLocalModel(aiConfig.data.model);
      const saved = aiConfig.data.available_models.find((m) => m.id === aiConfig.data!.model);
      if (saved?.provider === "openai") setLocalProvider("openai");
      else if (saved?.provider === "google") setLocalProvider("google");
    }
  }, [aiConfig.data]);

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";

  return (
    <div {...dragHandlers} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Bot className="size-4" />}
          title="AI Model"
          open={aiOpen}
          onClick={() => setAiOpen(!aiOpen)}
          onDragStart={onDragStart}
        />
        {aiOpen ? (
          <div className={cn("space-y-4 px-4 py-4 text-sm", expandedPanelClass)}>
            <div>
              <p className="mb-2 text-xs text-neutral-500">Provider</p>
              <div className="flex overflow-hidden rounded border border-neutral-700">
                {(["anthropic", "openai", "google"] as ProviderKey[]).map((p) => (
                  <button
                    key={p}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-semibold transition-colors",
                      localProvider === p ? "bg-violet-700 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800",
                    )}
                    onClick={() => {
                      setLocalProvider(p);
                      const filtered = availableModels.filter((m) => modelProvider(m) === p);
                      setLocalModel(filtered[0]?.id ?? "");
                    }}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
              {localProvider === "openai" && !configuredProviders.includes("openai") && (
                <p className="mt-1.5 text-xs text-amber-400">Requires OPENAI_API_KEY set in backend env.</p>
              )}
              {localProvider === "google" && !configuredProviders.includes("google") && (
                <p className="mt-1.5 text-xs text-amber-400">Requires GOOGLE_API_KEY set in backend env.</p>
              )}
            </div>
            {(() => {
              const providerModels = availableModels.filter((m) => modelProvider(m) === localProvider);
              const effectiveModel = (localModel && providerModels.some((m) => m.id === localModel))
                ? localModel
                : (providerModels[0]?.id ?? "");
              return (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Model</label>
                    <ModelSelect models={providerModels} value={effectiveModel} onChange={setLocalModel} />
                  </div>
                  <button
                    className="h-8 w-full rounded bg-violet-700 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
                    disabled={saveAiConfigMutation.isPending || !taigaToken}
                    onClick={() => saveAiConfigMutation.mutate({ model: effectiveModel }, {
                      onSuccess: () => toast.success("AI model saved."),
                      onError: () => toast.error("Failed to save AI model."),
                    })}
                  >
                    {!taigaToken ? "Sign in to save" : saveAiConfigMutation.isPending ? "Saving…" : "Save"}
                  </button>
                </>
              );
            })()}
            {saveAiConfigMutation.isSuccess ? (
              <p className="text-center text-xs text-emerald-400">Model config saved.</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
