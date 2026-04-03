/**
 * File copy utilities for sandbox operations
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Sandbox } from "@deno/sandbox";
import { info, error } from "./output.js";
import { parseCopySpec } from "./parse.js";
export type { CopySpec } from "./parse.js";

/**
 * Copy files from host to sandbox
 */
export async function copyToSandbox(
  sandbox: Sandbox,
  specs: string[]
): Promise<void> {
  for (const spec of specs) {
    const { src, dst } = parseCopySpec(spec);
    
    // Check if source exists
    if (!fs.existsSync(src)) {
      throw new Error(`Source path not found: ${src}`);
    }
    
    const stat = fs.statSync(src);
    
    if (stat.isDirectory()) {
      // Upload directory
      // Note: SDK uploads the directory INTO dst, so /tmp/foo -> /app creates /app/foo/*
      info(`Copying directory ${src} → ${dst}`);
      await sandbox.fs.upload(src, dst);
    } else {
      // Upload file - ensure parent directory exists
      info(`Copying file ${src} → ${dst}`);
      const dstDir = path.dirname(dst);
      if (dstDir && dstDir !== "." && dstDir !== "/") {
        await sandbox.sh`mkdir -p ${dstDir}`.noThrow();
      }
      await sandbox.fs.upload(src, dst);
    }
  }
}

/**
 * Copy files from sandbox to host
 */
export async function copyFromSandbox(
  sandbox: Sandbox,
  specs: string[]
): Promise<void> {
  for (const spec of specs) {
    const { src, dst } = parseCopySpec(spec);
    
    try {
      // Check if it's a directory by trying to list it
      const checkResult = await sandbox.sh`test -d ${src} && echo "dir" || echo "file"`.text();
      const isDir = checkResult.trim() === "dir";
      
      if (isDir) {
        // Use tar to copy directory
        info(`Copying directory ${src} → ${dst}`);
        
        // Ensure destination directory exists
        fs.mkdirSync(dst, { recursive: true });
        
        // Create tar on sandbox, pipe to local extraction
        const proc = await sandbox.spawn("tar", {
          args: ["-cf", "-", "-C", path.dirname(src), path.basename(src)],
          stdout: "piped",
        });
        
        // Collect tar data
        const chunks: Uint8Array[] = [];
        if (proc.stdout) {
          for await (const chunk of proc.stdout) {
            chunks.push(chunk);
          }
        }
        await proc.status;
        
        // Write to temp file and extract
        const tarData = Buffer.concat(chunks);
        const tempTar = path.join(dst, ".sandsnap-temp.tar");
        fs.writeFileSync(tempTar, tarData);
        
        // Extract using local tar
        const { execSync } = await import("node:child_process");
        execSync(`tar -xf "${tempTar}" -C "${dst}"`, { stdio: "pipe" });
        fs.unlinkSync(tempTar);
        
      } else {
        // Read file directly
        info(`Copying file ${src} → ${dst}`);
        
        // Ensure destination directory exists
        const dstDir = path.dirname(dst);
        if (dstDir && dstDir !== ".") {
          fs.mkdirSync(dstDir, { recursive: true });
        }
        
        const content = await sandbox.fs.readFile(src);
        fs.writeFileSync(dst, content);
      }
    } catch (err) {
      error(`Failed to copy ${src}: ${err}`);
      // Continue with other files
    }
  }
}
