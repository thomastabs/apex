"use client";
import { useEffect, useState } from "react";
import { Bot, ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAiConfig, useDeleteAiKey, useSaveAiConfig, useSaveAiKey } from "@/lib/hooks/use-workspace";
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

const PROVIDER_KEY_META: Record<ProviderKey, { envVar: string; getKeyUrl: string; placeholder: string }> = {
  anthropic: { envVar: "ANTHROPIC_API_KEY", getKeyUrl: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-…" },
  openai:    { envVar: "OPENAI_API_KEY",    getKeyUrl: "https://platform.openai.com/api-keys",         placeholder: "sk-…" },
  google:    { envVar: "GOOGLE_API_KEY",    getKeyUrl: "https://aistudio.google.com/apikey",            placeholder: "AIza…" },
};

function modelProvider(m: ModelEntry): ProviderKey {
  return (m.provider ?? "anthropic") as ProviderKey;
}

/** Small text input + Save, used both for the first-time "add your own key"
 *  form and for replacing an already-saved key. */
function AddKeyForm({ provider, dark, onSaved }: { provider: ProviderKey; dark: boolean; onSaved?: () => void }) {
  const [input, setInput] = useState("");
  const saveAiKeyMutation = useSaveAiKey();
  const meta = PROVIDER_KEY_META[provider];

  function save() {
    const apiKey = input.trim();
    if (!apiKey) return;
    saveAiKeyMutation.mutate({ provider, apiKey }, {
      onSuccess: () => { setInput(""); toast.success("Personal API key saved to your account."); onSaved?.(); },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save API key."),
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={meta.placeholder}
          autoComplete="off"
          autoFocus
          className={cn("h-8 min-w-0 flex-1 rounded border px-2 text-xs outline-none focus:border-violet-500", dark ? "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-600" : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400")}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        <button
          className="h-8 shrink-0 rounded bg-neutral-800 px-2.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
          disabled={!input.trim() || saveAiKeyMutation.isPending}
          onClick={save}
        >
          {saveAiKeyMutation.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      <a href={meta.getKeyUrl} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 text-[11px] hover:underline", dark ? "text-violet-400" : "text-violet-600")}>
        Get an API key <ExternalLink className="size-2.5" />
      </a>
    </div>
  );
}

/** Lets each provider be backed by either the deployment's own key (set once
 *  in the Azure/backend env — "system") or a personal key saved to *your*
 *  Taiga/Jira account, encrypted server-side so it follows you across
 *  sessions. A saved personal key is ALWAYS used once it exists — it takes
 *  priority over the system key unconditionally; removing it is the only way
 *  back to the shared key, which keeps the choice unambiguous. */
function KeySourcePanel({
  provider, dark, systemAvailable, personalSaved,
}: {
  provider: ProviderKey; dark: boolean; systemAvailable: boolean; personalSaved: boolean;
}) {
  const [addingKey, setAddingKey] = useState(false);
  const deleteAiKeyMutation = useDeleteAiKey();
  const meta = PROVIDER_KEY_META[provider];

  // A saved personal key always wins, system key or not — nothing to choose.
  if (personalSaved) {
    return (
      <div className={cn("mt-1.5 flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs", dark ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
        <span className="flex items-center gap-1.5"><KeyRound className="size-3" /> Using your saved key</span>
        <button
          className="font-semibold underline-offset-2 hover:underline disabled:opacity-50"
          disabled={deleteAiKeyMutation.isPending}
          onClick={() => deleteAiKeyMutation.mutate(provider, {
            onSuccess: () => toast.info(systemAvailable ? "Personal API key removed — using the shared key again." : "Personal API key removed."),
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove API key."),
          })}
        >
          {deleteAiKeyMutation.isPending ? "Removing…" : "Remove"}
        </button>
      </div>
    );
  }

  // No personal key — using the system key if there is one, with the option
  // to add a personal key (which will immediately take over).
  if (systemAvailable) {
    return (
      <div className="mt-1.5 space-y-1">
        <div className={cn("flex items-center justify-between gap-2 text-xs", dark ? "text-neutral-500" : "text-slate-500")}>
          <span>Using the deployment&apos;s shared key.</span>
          {!addingKey && (
            <button className={cn("font-semibold hover:underline", dark ? "text-violet-400" : "text-violet-600")} onClick={() => setAddingKey(true)}>
              + Use my own key
            </button>
          )}
        </div>
        {addingKey && <AddKeyForm provider={provider} dark={dark} onSaved={() => setAddingKey(false)} />}
      </div>
    );
  }

  // Neither a system key nor a personal key — must add one to use this provider.
  return (
    <div className="mt-1.5 space-y-1">
      <p className={cn("text-xs", dark ? "text-amber-400" : "text-amber-600")}>
        Requires {meta.envVar} in the backend env, or save your own key below.
      </p>
      <AddKeyForm provider={provider} dark={dark} />
    </div>
  );
}

function ModelSelect({ models, value, onChange, dark }: { models: ModelEntry[]; value: string; onChange: (v: string) => void; dark: boolean }) {
  return (
    <select
      className={cn("h-9 w-full rounded border px-2 text-sm", dark ? "border-neutral-600 bg-neutral-950 text-white" : "border-slate-300 bg-white text-slate-900")}
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
  const systemProviders = aiConfig.data?.system_providers ?? [];
  const personalProviders = aiConfig.data?.personal_providers ?? [];

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
    <div {...(dragHandlers ?? {})} className={shellClass}>
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
              <p className={cn("mb-2 text-xs", dark ? "text-neutral-500" : "text-slate-500")}>Provider</p>
              <div className={cn("flex overflow-hidden rounded border", dark ? "border-neutral-700" : "border-slate-300")}>
                {(["anthropic", "openai", "google"] as ProviderKey[]).map((p) => (
                  <button
                    key={p}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-semibold transition-colors",
                      localProvider === p
                        ? "bg-violet-700 text-white"
                        : dark ? "bg-neutral-900 text-neutral-400 hover:bg-neutral-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
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
              <KeySourcePanel
                provider={localProvider}
                dark={dark}
                systemAvailable={systemProviders.includes(localProvider)}
                personalSaved={personalProviders.includes(localProvider)}
              />
            </div>
            {(() => {
              const providerModels = availableModels.filter((m) => modelProvider(m) === localProvider);
              const effectiveModel = (localModel && providerModels.some((m) => m.id === localModel))
                ? localModel
                : (providerModels[0]?.id ?? "");
              return (
                <>
                  <div>
                    <label className={cn("mb-1.5 block text-xs font-semibold", dark ? "text-neutral-400" : "text-slate-600")}>Model</label>
                    <ModelSelect models={providerModels} value={effectiveModel} onChange={setLocalModel} dark={dark} />
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
              <p className={cn("text-center text-xs", dark ? "text-emerald-400" : "text-emerald-600")}>Model config saved.</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
