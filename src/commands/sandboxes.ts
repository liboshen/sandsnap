/**
 * sandboxer sandboxes - List and manage running sandboxes
 */

import { Client } from "@deno/sandbox";
import { getClient } from "../lib/client.js";
import { table, formatDate } from "../lib/output.js";
import { success, error, info } from "../lib/output.js";

interface SandboxesOptions {
  json?: boolean;
}

export async function listSandboxes(options: SandboxesOptions): Promise<void> {
  const client = getClient();
  
  try {
    const sandboxes = await client.sandboxes.list();
    
    if (options.json) {
      const data = sandboxes.map((s: { id: string; region: string; status: string; createdAt: Date; labels: Record<string, string> }) => ({
        id: s.id,
        region: s.region,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        labels: s.labels,
      }));
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    
    if (sandboxes.length === 0) {
      console.log("No running sandboxes.");
      return;
    }
    
    const headers = ["ID", "REGION", "STATUS", "CREATED"];
    const rows = sandboxes.map((s: { id: string; region: string; status: string; createdAt: Date }) => [
      s.id,
      s.region,
      s.status,
      formatDate(s.createdAt),
    ]);
    
    console.log(table(headers, rows));
  } catch (err) {
    error(`Failed to list sandboxes: ${err}`);
    process.exit(1);
  }
}

export async function killSandbox(id: string): Promise<void> {
  try {
    const { Sandbox } = await import("@deno/sandbox");
    const sandbox = await Sandbox.connect(id);
    await sandbox.kill();
    success(`Killed sandbox ${id}`);
  } catch (err) {
    error(`Failed to kill sandbox: ${err}`);
    process.exit(1);
  }
}

export async function killAllSandboxes(): Promise<void> {
  const client = getClient();
  
  try {
    const allSandboxes = await client.sandboxes.list();
    const sandboxes = allSandboxes.filter((s: { status: string }) => s.status === "running");
    
    if (sandboxes.length === 0) {
      info("No running sandboxes to kill.");
      return;
    }
    
    info(`Killing ${sandboxes.length} sandbox(es)...`);
    
    const { Sandbox } = await import("@deno/sandbox");
    for (const s of sandboxes) {
      try {
        const sandbox = await Sandbox.connect(s.id);
        await sandbox.kill();
        success(`Killed ${s.id}`);
      } catch (err) {
        error(`Failed to kill ${s.id}: ${err}`);
      }
    }
  } catch (err) {
    error(`Failed: ${err}`);
    process.exit(1);
  }
}
