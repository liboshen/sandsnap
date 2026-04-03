/**
 * sandboxer run - Run commands in an ephemeral sandbox
 */

import { spawn } from "node:child_process";
import { Sandbox } from "@deno/sandbox";
import type { Region } from "@deno/sandbox";
import { snapshotExists } from "../lib/client.js";
import { isInteractive, readStdin, readScriptFile } from "../lib/stdin.js";
import { info, success, error, step } from "../lib/output.js";

type Timeout = `${number}m` | `${number}s` | "session";

interface RunOptions {
  timeout: string;
  region: string;
  script?: string;
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

export async function run(snapshot: string, options: RunOptions): Promise<void> {
  // Parse and validate options
  const timeout = parseTimeout(options.timeout);
  const region = parseRegion(options.region);
  
  try {
    // Check if snapshot exists
    const exists = await snapshotExists(snapshot);
    if (!exists) {
      error(`Snapshot '${snapshot}' not found. Run 'sandboxer list' to see available snapshots.`);
      process.exit(1);
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
    
    // Boot ephemeral sandbox from snapshot
    step(1, 2, `Booting sandbox from snapshot '${snapshot}'...`);
    const sandbox = await Sandbox.create({
      region: region,
      root: snapshot,
      timeout: timeout,
    });
    info(`Sandbox ready: ${sandbox.id}`);
    
    // Setup cleanup on Ctrl+C
    const cleanup = async () => {
      info("\nCleaning up sandbox...");
      try {
        await sandbox.kill();
      } catch {
        // Ignore errors during cleanup
      }
    };
    process.on("SIGINT", async () => {
      await cleanup();
      process.exit(130);
    });
    process.on("SIGTERM", async () => {
      await cleanup();
      process.exit(143);
    });
    
    try {
      // Execute commands
      step(2, 2, script ? "Executing script..." : "Opening interactive shell...");
      
      if (script) {
        // Write script to temp file and execute
        await sandbox.fs.writeTextFile("/tmp/sandboxer-script.sh", script);
        try {
          await sandbox.sh`bash /tmp/sandboxer-script.sh`;
          success("Script completed successfully.");
        } catch (err: unknown) {
          if (err && typeof err === "object" && "code" in err) {
            error(`Script failed with exit code ${err.code}`);
            await cleanup();
            process.exit(typeof err.code === "number" ? err.code : 1);
          }
          throw err;
        }
      } else {
        // Interactive mode
        await openInteractiveShell(sandbox);
        success("Session ended.");
      }
    } finally {
      // Always cleanup
      await cleanup();
    }
    
  } catch (err) {
    error(`Failed: ${err}`);
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
