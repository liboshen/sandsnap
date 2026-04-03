/**
 * sandboxer evolve - Create a new snapshot by running commands on a base state
 */

import { spawn } from "node:child_process";
import { Sandbox } from "@deno/sandbox";
import type { Region } from "@deno/sandbox";
import { getClient, snapshotExists, tempVolumeSlug } from "../lib/client.js";
import { isInteractive, readStdin, readScriptFile, promptOnFailure } from "../lib/stdin.js";
import { info, success, error, step } from "../lib/output.js";
import { copyToSandbox } from "../lib/copy.js";

type Capacity = `${number}GiB` | `${number}MiB` | `${number}GB` | `${number}MB`;
type Memory = `${number}GiB` | `${number}MiB` | `${number}GB` | `${number}MB`;
type Timeout = `${number}m` | `${number}s` | "session";

interface EvolveOptions {
  from?: string;
  timeout: string;
  capacity: string;
  memory: string;
  region: string;
  copy: string[];
  script?: string;
  overwrite?: boolean;
}

function parseCapacity(s: string): Capacity {
  // Validate and return as proper type
  if (/^\d+(GiB|MiB|GB|MB)$/.test(s)) {
    return s as Capacity;
  }
  throw new Error(`Invalid capacity format: ${s}. Use formats like 2GiB, 10GB, 512MiB`);
}

function parseMemory(s: string): Memory {
  if (/^\d+(GiB|MiB|GB|MB)$/.test(s)) {
    return s as Memory;
  }
  throw new Error(`Invalid memory format: ${s}. Use formats like 1GiB, 2GiB, 4GiB (768MiB-4GiB)`);
}

function parseTimeout(s: string): Timeout {
  if (s === "session") return "session";
  if (/^\d+[ms]$/.test(s)) {
    return s as Timeout;
  }
  throw new Error(`Invalid timeout format: ${s}. Use formats like 10m, 600s, or session`);
}

function parseRegion(s: string): Region {
  if (s === "ord" || s === "ams") {
    return s;
  }
  throw new Error(`Invalid region: ${s}. Use ord or ams`);
}

export async function evolve(name: string, options: EvolveOptions): Promise<void> {
  const client = getClient();
  const volumeSlug = tempVolumeSlug();
  
  // Parse and validate options
  const capacity = parseCapacity(options.capacity);
  const timeout = parseTimeout(options.timeout);
  const region = parseRegion(options.region);
  const memory = parseMemory(options.memory);
  
  // Determine the source for the volume
  const fromSource = options.from || "builtin:debian-13";
  
  try {
    // Check if target snapshot already exists
    if (!options.overwrite && await snapshotExists(name)) {
      error(`Snapshot '${name}' already exists. Use --overwrite to replace it.`);
      process.exit(1);
    }
    
    // If overwriting, delete existing snapshot first
    if (options.overwrite && await snapshotExists(name)) {
      info(`Deleting existing snapshot '${name}'...`);
      await client.snapshots.delete(name);
    }
    
    // Determine script source
    let script: string | null = null;
    const interactive = isInteractive();
    
    if (options.script) {
      script = await readScriptFile(options.script);
    } else if (!interactive) {
      // Read from stdin (heredoc or pipe)
      script = await readStdin();
    }
    
    // Step 1: Create bootable volume
    step(1, 4, `Creating volume from ${options.from ? `snapshot '${options.from}'` : "base image"}...`);
    const volume = await client.volumes.create({
      slug: volumeSlug,
      region: region,
      capacity: capacity,
      from: fromSource,
    });
    info(`Volume created: ${volume.id}`);
    
    let shouldSnapshot = false;
    
    // Step 2 & 3: Boot sandbox and execute commands
    // Use a block so sandbox is closed before we snapshot
    {
      step(2, 4, "Booting sandbox...");
      await using sandbox = await Sandbox.create({
        region: region,
        root: volumeSlug,
        timeout: timeout,
        memory: memory,
      });
      info(`Sandbox ready: ${sandbox.id}`);
      
      // Copy files into sandbox
      if (options.copy.length > 0) {
        await copyToSandbox(sandbox, options.copy);
      }
      
      // Step 3: Execute commands
      step(3, 4, script ? "Executing script..." : "Opening interactive shell...");
      
      shouldSnapshot = true;
      
      if (script) {
        // Write script to temp file and execute
        await sandbox.fs.writeTextFile("/tmp/sandboxer-script.sh", script);
        try {
          await sandbox.sh`bash /tmp/sandboxer-script.sh`;
        } catch (err) {
          shouldSnapshot = false;
          error(`Script failed: ${err}`);
          
          // Prompt user for action
          const action = await promptOnFailure();
          if (action === "shell") {
            info("Opening shell for debugging...");
            await openInteractiveShell(sandbox);
            // After shell, ask again
            const action2 = await promptOnFailure();
            shouldSnapshot = action2 === "save";
          } else {
            shouldSnapshot = action === "save";
          }
        }
      } else {
        // Interactive mode
        await openInteractiveShell(sandbox);
        shouldSnapshot = true; // User explicitly exited
      }
      
      // Explicitly kill sandbox before snapshotting
      info("Stopping sandbox...");
      await sandbox.kill();
      
      // Wait a moment for volume to unmount
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    // Sandbox is now stopped
    
    if (!shouldSnapshot) {
      info("Discarding changes...");
      // Clean up volume
      try {
        await client.volumes.delete(volumeSlug);
      } catch {
        // Ignore
      }
      return;
    }
    
    // Step 4: Create snapshot (sandbox must be closed first)
    step(4, 4, `Creating snapshot '${name}'...`);
    await client.volumes.snapshot(volume.id, {
      slug: name,
    });
    success(`Snapshot '${name}' created!`);
    
    // Note: We don't delete the volume here because the snapshot
    // depends on it (copy-on-write). The volume is now "owned" by
    // the snapshot and will be managed by the Deno Sandbox service.
    
  } catch (err) {
    error(`Failed: ${err}`);
    // Attempt to clean up volume on error
    try {
      await client.volumes.delete(volumeSlug);
    } catch {
      // Ignore cleanup errors
    }
    process.exit(1);
  }
}

/**
 * Open an interactive SSH shell to the sandbox
 */
async function openInteractiveShell(sandbox: Sandbox): Promise<void> {
  const ssh = await sandbox.exposeSsh();
  
  info(`Connecting via SSH to ${ssh.username}@${ssh.hostname}...`);
  console.log("(Type 'exit' when done)\n");
  
  return new Promise((resolve, reject) => {
    const sshProcess = spawn("ssh", [
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "LogLevel=ERROR",
      "-t",
      `${ssh.username}@${ssh.hostname}`,
    ], {
      stdio: "inherit",
    });
    
    sshProcess.on("close", () => {
      console.log("");
      resolve();
    });
    
    sshProcess.on("error", reject);
  });
}
