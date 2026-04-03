/**
 * sandboxer list - List all snapshots
 */

import { getClient } from "../lib/client.js";
import { table, formatBytes } from "../lib/output.js";

interface ListOptions {
  region?: string;
  json?: boolean;
}

export async function list(options: ListOptions): Promise<void> {
  const client = getClient();
  
  try {
    const page = await client.snapshots.list();
    let snapshots = page.items;
    
    // Filter by region if specified
    if (options.region) {
      snapshots = snapshots.filter((s) => s.region === options.region);
    }
    
    if (options.json) {
      // Snapshot class uses getters, need to extract properties manually
      const data = snapshots.map((s) => ({
        id: s.id,
        slug: s.slug,
        region: s.region,
        allocatedSize: s.allocatedSize,
        flattenedSize: s.flattenedSize,
        isBootable: s.isBootable,
      }));
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    
    if (snapshots.length === 0) {
      console.log("No snapshots found.");
      return;
    }
    
    // Format as table
    const headers = ["NAME", "REGION", "SIZE", "BOOTABLE"];
    const rows = snapshots.map((s) => [
      s.slug || s.id,
      s.region,
      formatBytes(s.allocatedSize || 0),
      s.isBootable ? "yes" : "no",
    ]);
    
    console.log(table(headers, rows));
  } catch (err) {
    console.error("Failed to list snapshots:", err);
    process.exit(1);
  }
}
