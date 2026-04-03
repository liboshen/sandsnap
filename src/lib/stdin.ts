/**
 * Utilities for reading from stdin
 */

import * as fs from "node:fs";
import * as readline from "node:readline";

/**
 * Check if stdin is interactive (TTY) or piped
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Read all content from stdin (for piped input / heredoc)
 */
export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    
    process.stdin.setEncoding("utf8");
    
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    
    process.stdin.on("end", () => {
      resolve(data);
    });
    
    process.stdin.on("error", reject);
  });
}

/**
 * Read script from file
 */
export async function readScriptFile(path: string): Promise<string> {
  return fs.promises.readFile(path, "utf8");
}

/**
 * Prompt user for confirmation
 */
export async function confirm(message: string): Promise<boolean> {
  if (!isInteractive()) {
    return false;
  }
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Prompt user for choice after command failure
 */
export async function promptOnFailure(): Promise<"save" | "discard" | "shell"> {
  if (!isInteractive()) {
    return "discard";
  }
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question("Command failed. [s]ave anyway, [d]iscard, [o]pen shell? ", (answer) => {
      rl.close();
      const a = answer.toLowerCase();
      if (a === "s" || a === "save") {
        resolve("save");
      } else if (a === "o" || a === "shell") {
        resolve("shell");
      } else {
        resolve("discard");
      }
    });
  });
}
