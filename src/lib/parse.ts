/**
 * Shared parsing utilities
 */

import type { Region } from "@deno/sandbox";

export type Capacity = `${number}GiB` | `${number}MiB` | `${number}GB` | `${number}MB`;
export type Memory = `${number}GiB` | `${number}MiB` | `${number}GB` | `${number}MB`;
export type Timeout = `${number}m` | `${number}s` | "session";

export function parseCapacity(s: string): Capacity {
  if (/^\d+(GiB|MiB|GB|MB)$/.test(s)) {
    return s as Capacity;
  }
  throw new Error(`Invalid capacity format: ${s}. Use formats like 2GiB, 10GB, 512MiB`);
}

export function parseMemory(s: string): Memory {
  if (/^\d+(GiB|MiB|GB|MB)$/.test(s)) {
    return s as Memory;
  }
  throw new Error(`Invalid memory format: ${s}. Use formats like 1GiB, 2GiB, 4GiB (768MiB-4GiB)`);
}

export function parseTimeout(s: string): Timeout {
  if (s === "session") return "session";
  if (/^\d+[ms]$/.test(s)) {
    return s as Timeout;
  }
  throw new Error(`Invalid timeout format: ${s}. Use formats like 10m, 600s, or session`);
}

export function parseRegion(s: string): Region {
  if (s === "ord" || s === "ams") {
    return s;
  }
  throw new Error(`Invalid region: ${s}. Use ord or ams`);
}

export interface CopySpec {
  src: string;
  dst: string;
}

export function parseCopySpec(spec: string): CopySpec {
  const colonIndex = spec.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(`Invalid copy spec "${spec}". Use format "src:dst"`);
  }
  return {
    src: spec.slice(0, colonIndex),
    dst: spec.slice(colonIndex + 1),
  };
}

export interface EnvVar {
  key: string;
  value: string;
}

export function parseEnvVar(spec: string): EnvVar {
  const eqIndex = spec.indexOf("=");
  if (eqIndex === -1) {
    throw new Error(`Invalid env var "${spec}". Use format "KEY=VALUE"`);
  }
  return {
    key: spec.slice(0, eqIndex),
    value: spec.slice(eqIndex + 1),
  };
}

export function parseEnvVars(specs: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const spec of specs) {
    const { key, value } = parseEnvVar(spec);
    env[key] = value;
  }
  return env;
}
