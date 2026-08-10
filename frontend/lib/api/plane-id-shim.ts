/**
 * Plane id shim, extracted from plane-direct.ts (2026-08-06, phase 4a) into
 * its own module so client.ts can use resolveId() in contextHeaders() without
 * a circular import (plane-direct.ts itself imports from client.ts for
 * ApiError/getApiBaseUrl). plane-direct.ts re-exports mintId/resolveId from
 * here so every existing import of them is unaffected.
 *
 * Plane's ids are UUIDs, but the shared Epic/Story types (used well beyond
 * the adapter layer, in board rendering etc.) type id/ref as number — reused
 * directly from Taiga's real numeric ids today. Rather than widen that shared
 * type (tried; cascades into 30+ unrelated call sites), this mints a
 * synthetic per-session int for id via mintId()/resolveId() below, and
 * carries the real UUID in pm_epic_id/pm_story_id for any call that needs to
 * dial Plane (or, since phase 4a, Apex's own backend) again. The mapping is
 * an in-memory module singleton — it does not survive a page reload.
 *
 * Deliberately zero imports from ./client (ApiError etc.) — client.ts needs
 * resolveId() for contextHeaders(), and plane-direct.ts already imports from
 * client.ts, so this module importing back from client.ts would cycle.
 * resolveId() throws a plain Error instead of ApiError; nothing downstream
 * inspects this specific throw's type/status (confirmed via grep), only its
 * message.
 */

let _nextMintedId = 1;
const _uuidToMinted = new Map<string, number>();
const _mintedToUuid = new Map<number, string>();

export function mintId(realId: string): number {
  const existing = _uuidToMinted.get(realId);
  if (existing != null) return existing;
  const minted = _nextMintedId++;
  _uuidToMinted.set(realId, minted);
  _mintedToUuid.set(minted, realId);
  return minted;
}

export function resolveId(mintedId: string | number): string {
  const key = typeof mintedId === "number" ? mintedId : parseInt(mintedId, 10);
  const uuid = _mintedToUuid.get(key);
  if (!uuid) {
    throw new Error(
      `Unknown Plane id ${mintedId} — the board must be re-fetched (its id mapping is session-local and does not survive a reload).`,
    );
  }
  return uuid;
}
