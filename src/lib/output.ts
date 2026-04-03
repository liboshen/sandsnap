/**
 * Output formatting utilities
 */

let _verbose = false;

export function setVerbose(v: boolean): void {
  _verbose = v;
}

export function isVerbose(): boolean {
  return _verbose;
}

/** Always shown */
export function success(message: string): void {
  console.error(`✓ ${message}`);
}

/** Always shown */
export function error(message: string): void {
  console.error(`✗ ${message}`);
}

/** Only shown in verbose mode */
export function info(message: string): void {
  if (_verbose) {
    console.error(`ℹ ${message}`);
  }
}

/** Only shown in verbose mode */
export function warn(message: string): void {
  if (_verbose) {
    console.error(`⚠ ${message}`);
  }
}

/** Only shown in verbose mode */
export function step(n: number, total: number, message: string): void {
  if (_verbose) {
    console.error(`[${n}/${total}] ${message}`);
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let unitIndex = 0;
  let value = bytes;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Simple table formatter
 */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => (r[i] || "").length));
    return Math.max(h.length, maxRow);
  });
  
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join("   ");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell || "").padEnd(widths[i])).join("   ")
  );
  
  return [headerLine, ...dataLines].join("\n");
}
