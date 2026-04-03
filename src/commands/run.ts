/**
 * sandboxer run - Run commands in an ephemeral sandbox
 */

import { spawn } from "node:child_process";
import { Sandbox } from "@deno/sandbox";
import { snapshotExists } from "../lib/client.js";
import { isInteractive, readStdin, readScriptFile } from "../lib/stdin.js";
import { info, success, error, step } from "../lib/output.js";
import { copyToSandbox, copyFromSandbox } from "../lib/copy.js";
import { parseMemory, parseTimeout, parseRegion, parseEnvVars } from "../lib/parse.js";

interface RunOptions {
  timeout: string;
  memory: string;
  region: string;
  env: string[];
  copy: string[];
  copyOut: string[];
  script?: string;
}

export async function run(snapshot: string, options: RunOptions): Promise<void> {
  // Parse and validate options
  const timeout = parseTimeout(options.timeout);
  const region = parseRegion(options.region);
  const memory = parseMemory(options.memory);
  const env = parseEnvVars(options.env);
  
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
      memory: memory,
      env: Object.keys(env).length > 0 ? env : undefined,
    });
    info(`Sandbox ready: ${sandbox.id}`);
    
    // Copy files into sandbox
    if (options.copy.length > 0) {
      await copyToSandbox(sandbox, options.copy);
    }
    
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
        await sandbox.fs.writeTextFile("/tmp/sandsnap-script.sh", script);
        try {
          await sandbox.sh`bash /tmp/sandsnap-script.sh`;
        } catch (err: unknown) {
          if (err && typeof err === "object" && "code" in err) {
            error(`Script failed with exit code ${err.code}`);
            // Still try to copy out files before exiting
            if (options.copyOut.length > 0) {
              await copyFromSandbox(sandbox, options.copyOut);
            }
            await cleanup();
            process.exit(typeof err.code === "number" ? err.code : 1);
          }
          throw err;
        }
      } else {
        // Interactive mode
        await openInteractiveShell(sandbox);
      }
      
      // Copy files out from sandbox
      if (options.copyOut.length > 0) {
        await copyFromSandbox(sandbox, options.copyOut);
      }
      
      success(script ? "Script completed successfully." : "Session ended.");
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
