/**
 * Shared client instance and utilities
 */

import { Client } from "@deno/sandbox";

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    _client = new Client();
  }
  return _client;
}

/**
 * Check if a snapshot exists
 */
export async function snapshotExists(slug: string): Promise<boolean> {
  const client = getClient();
  const snapshot = await client.snapshots.get(slug);
  return snapshot !== null;
}

/**
 * Generate a unique temporary volume slug (max 32 chars)
 */
export function tempVolumeSlug(): string {
  // Format: tmp-{timestamp-base36}-{random}
  // Keep under 32 chars
  const ts = Date.now().toString(36); // ~8 chars
  const rand = Math.random().toString(36).slice(2, 8); // 6 chars
  return `tmp-${ts}-${rand}`; // ~18 chars
}
