import type { Booking, LiveSessionState } from './api'

/**
 * Client-side mirror of the server join window (the server still enforces it
 * when minting tokens). Falls back to the default window (10 min early,
 * 15 min grace) when the live session row hasn't been provisioned yet.
 */
export function isJoinable(b: Booking, live?: LiveSessionState): boolean {
  if (b.status !== 'confirmed') return false
  if (live && (live.status === 'completed' || live.status === 'no_show')) return false
  const now = Date.now()
  const opens = live
    ? new Date(live.join_opens_at).getTime()
    : new Date(b.starts_at).getTime() - 10 * 60_000
  const closes = live
    ? new Date(live.join_closes_at).getTime()
    : new Date(b.ends_at).getTime() + 15 * 60_000
  return now >= opens && now <= closes
}
