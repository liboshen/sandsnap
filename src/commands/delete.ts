/**
 * sandboxer delete - Delete a snapshot (and its parent volume if possible)
 */

import { getClient } from "../lib/client.js";
import { confirm } from "../lib/stdin.js";
import { success, error, info } from "../lib/output.js";

interface DeleteOptions {
  force?: boolean;
}

export async function deleteSnapshot(name: string, options: DeleteOptions): Promise<void> {
  const client = getClient();
  
  try {
    // Get snapshot to find its parent volume
    const snapshot = await client.snapshots.get(name);
    if (!snapshot) {
      error(`Snapshot '${name}' not found.`);
      process.exit(1);
    }
    
    // Confirm deletion unless --force
    if (!options.force) {
      const confirmed = await confirm(`Delete snapshot '${name}'?`);
      if (!confirmed) {
        console.log("Aborted.");
        return;
      }
    }
    
    // Get parent volume info before deleting snapshot
    const parentVolumeId = snapshot.volume?.id;
    const parentVolumeSlug = snapshot.volume?.slug;
    
    // Delete the snapshot
    await client.snapshots.delete(name);
    success(`Deleted snapshot '${name}'`);
    
    // Try to delete parent volume (smart cleanup)
    if (parentVolumeId && parentVolumeSlug) {
      // Only delete if it's a temp volume we created (starts with 'tmp-')
      if (parentVolumeSlug.startsWith('tmp-')) {
        try {
          await client.volumes.delete(parentVolumeId);
          info(`Cleaned up parent volume '${parentVolumeSlug}'`);
        } catch {
          // Volume may have other snapshots depending on it, that's ok
          info(`Parent volume '${parentVolumeSlug}' kept (may have other dependents)`);
        }
      }
    }
  } catch (err) {
    error(`Failed to delete snapshot: ${err}`);
    process.exit(1);
  }
}
