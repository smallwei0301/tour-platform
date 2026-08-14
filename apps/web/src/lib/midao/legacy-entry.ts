export const MIDAO_LEGACY_ENTRY_DESTINATIONS = {
  'public-profile': '/guide/profile',
} as const;

type MidaoLegacyCapability = keyof typeof MIDAO_LEGACY_ENTRY_DESTINATIONS;

export function safeMidaoReturnPath(value: string | null): '/midao/me' | null {
  if (value !== '/midao/me') return null;
  return value;
}

export function resolveMidaoLegacyEntry(capability: string, returnTo: string | null): string | null {
  if (!(capability in MIDAO_LEGACY_ENTRY_DESTINATIONS)) return null;
  const safeReturnPath = safeMidaoReturnPath(returnTo);
  if (safeReturnPath === null) return null;
  const destination = MIDAO_LEGACY_ENTRY_DESTINATIONS[capability as MidaoLegacyCapability];
  return `${destination}?returnTo=${encodeURIComponent(safeReturnPath)}`;
}
