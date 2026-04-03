/**
 * sandboxer prune - Clean up orphaned volumes
 * 
 * Orphaned volumes are temp volumes (tmp-*) that no longer have any
 * snapshots depending on them.
 */

import { getClient } from "../lib/client.js";
import { confirm } from "../lib/stdin.js";
import { success, error, info } from "../lib/output.js";

interface PruneOptions {
  force?: boolean;
  dryRun?: boolean;
}

export async function prune(options: PruneOptions): Promise<void> {
  const client = getClient();
  
  try {
    // Get all volumes and snapshots
    const [volumesPage, snapshotsPage] = await Promise.all([
      client.volumes.list(),
      client.snapshots.list(),
    ]);
    
    const volumes = volumesPage.items;
    const snapshots = snapshotsPage.items;
    
    // Build set of volume IDs that have snapshots depending on them
    const volumesWithSnapshots = new Set<string>();
    for (const snap of snapshots) {
      if (snap.volume?.id) {
        volumesWithSnapshots.add(snap.volume.id);
      }
    }
    
    // Find orphaned temp volumes (tmp-* with no snapshots)
    const orphanedVolumes = volumes.filter((vol: { slug: string; id: string }) => 
      vol.slug.startsWith('tmp-') && !volumesWithSnapshots.has(vol.id)
    );
    
    if (orphanedVolumes.length === 0) {
      success("No orphaned volumes to clean up.");
      return;
    }
    
    console.log(`Found ${orphanedVolumes.length} orphaned volume(s):`);
    for (const vol of orphanedVolumes) {
      console.log(`  - ${vol.slug}`);
    }
    
    if (options.dryRun) {
      info("Dry run - no volumes deleted.");
      return;
    }
    
    // Confirm unless --force
    if (!options.force) {
      const confirmed = await confirm(`Delete ${orphanedVolumes.length} orphaned volume(s)?`);
      if (!confirmed) {
        console.log("Aborted.");
        return;
      }
    }
    
    // Delete orphaned volumes
    let deleted = 0;
    let failed = 0;
    
    for (const vol of orphanedVolumes) {
      try {
        await client.volumes.delete(vol.id);
        deleted++;
        info(`Deleted volume '${vol.slug}'`);
      } catch (err) {
        failed++;
        error(`Failed to delete '${vol.slug}': ${err}`);
      }
    }
    
    if (deleted > 0) {
      success(`Cleaned up ${deleted} orphaned volume(s).`);
    }
    if (failed > 0) {
      error(`Failed to delete ${failed} volume(s).`);
    }
  } catch (err) {
    error(`Failed to prune: ${err}`);
    process.exit(1);
  }
}
