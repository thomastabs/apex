"use client";

import { Callout } from "@/components/ui/primitives";

/**
 * "Sign in required" blocker shown on a phase/tool surface when there is no
 * active session + project. Render it when `useApiContext()` is null.
 * `unlocks` names what signing in enables.
 */
export function SignInRequired({ unlocks }: { unlocks: string }) {
  return (
    <div className="mb-6">
      <Callout variant="warning">
        <p className="font-semibold">Sign in required</p>
        <p className="mt-0.5">Sign in and select a project in the sidebar to unlock {unlocks}.</p>
      </Callout>
    </div>
  );
}
