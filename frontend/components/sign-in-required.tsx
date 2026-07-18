"use client";

import { Callout } from "@/components/ui/primitives";
import { useT } from "@/lib/i18n/use-translation";

/**
 * "Sign in required" blocker shown on a phase/tool surface when there is no
 * active session + project. Render it when `useApiContext()` is null.
 * `unlocks` names what signing in enables.
 */
export function SignInRequired({ unlocks }: { unlocks: string }) {
  const t = useT();
  return (
    <div className="mb-6">
      <Callout variant="warning">
        <p className="font-semibold">{t("common.signInRequired")}</p>
        <p className="mt-0.5">{t("common.signInAndSelectProject", { unlocks })}</p>
      </Callout>
    </div>
  );
}
