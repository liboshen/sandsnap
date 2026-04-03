import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseCapacity,
  parseMemory,
  parseTimeout,
  parseRegion,
  parseCopySpec,
} from "./parse.js";

describe("parseCapacity", () => {
  it("parses valid GiB format", () => {
    assert.strictEqual(parseCapacity("10GiB"), "10GiB");
    assert.strictEqual(parseCapacity("2GiB"), "2GiB");
  });

  it("parses valid MiB format", () => {
    assert.strictEqual(parseCapacity("512MiB"), "512MiB");
  });

  it("parses valid GB format", () => {
    assert.strictEqual(parseCapacity("10GB"), "10GB");
  });

  it("parses valid MB format", () => {
    assert.strictEqual(parseCapacity("500MB"), "500MB");
  });

  it("throws on invalid format", () => {
    assert.throws(() => parseCapacity("10"), /Invalid capacity format/);
    assert.throws(() => parseCapacity("10g"), /Invalid capacity format/);
    assert.throws(() => parseCapacity("abc"), /Invalid capacity format/);
    assert.throws(() => parseCapacity("10 GiB"), /Invalid capacity format/);
  });
});

describe("parseMemory", () => {
  it("parses valid GiB format", () => {
    assert.strictEqual(parseMemory("1GiB"), "1GiB");
    assert.strictEqual(parseMemory("4GiB"), "4GiB");
  });

  it("parses valid MiB format", () => {
    assert.strictEqual(parseMemory("1280MiB"), "1280MiB");
    assert.strictEqual(parseMemory("768MiB"), "768MiB");
  });

  it("throws on invalid format", () => {
    assert.throws(() => parseMemory("1"), /Invalid memory format/);
    assert.throws(() => parseMemory("1g"), /Invalid memory format/);
    assert.throws(() => parseMemory("lots"), /Invalid memory format/);
  });
});

describe("parseTimeout", () => {
  it("parses session timeout", () => {
    assert.strictEqual(parseTimeout("session"), "session");
  });

  it("parses minutes format", () => {
    assert.strictEqual(parseTimeout("10m"), "10m");
    assert.strictEqual(parseTimeout("30m"), "30m");
  });

  it("parses seconds format", () => {
    assert.strictEqual(parseTimeout("600s"), "600s");
    assert.strictEqual(parseTimeout("30s"), "30s");
  });

  it("throws on invalid format", () => {
    assert.throws(() => parseTimeout("10"), /Invalid timeout format/);
    assert.throws(() => parseTimeout("10h"), /Invalid timeout format/);
    assert.throws(() => parseTimeout("forever"), /Invalid timeout format/);
  });
});

describe("parseRegion", () => {
  it("parses ord region", () => {
    assert.strictEqual(parseRegion("ord"), "ord");
  });

  it("parses ams region", () => {
    assert.strictEqual(parseRegion("ams"), "ams");
  });

  it("throws on invalid region", () => {
    assert.throws(() => parseRegion("us-east"), /Invalid region/);
    assert.throws(() => parseRegion(""), /Invalid region/);
    assert.throws(() => parseRegion("ORD"), /Invalid region/);
  });
});

describe("parseCopySpec", () => {
  it("parses simple file copy spec", () => {
    const result = parseCopySpec("./local.txt:/remote.txt");
    assert.deepStrictEqual(result, {
      src: "./local.txt",
      dst: "/remote.txt",
    });
  });

  it("parses directory copy spec", () => {
    const result = parseCopySpec("/tmp/mydir:/app");
    assert.deepStrictEqual(result, {
      src: "/tmp/mydir",
      dst: "/app",
    });
  });

  it("handles paths with multiple colons (Windows-style or URLs)", () => {
    // Only first colon is the separator
    const result = parseCopySpec("C:/Users/file.txt:/app/file.txt");
    assert.deepStrictEqual(result, {
      src: "C",
      dst: "/Users/file.txt:/app/file.txt",
    });
  });

  it("throws on missing colon", () => {
    assert.throws(() => parseCopySpec("./local.txt"), /Invalid copy spec/);
    assert.throws(() => parseCopySpec("nocolon"), /Invalid copy spec/);
  });

  it("handles empty src or dst", () => {
    const result1 = parseCopySpec(":/dst");
    assert.deepStrictEqual(result1, { src: "", dst: "/dst" });

    const result2 = parseCopySpec("src:");
    assert.deepStrictEqual(result2, { src: "src", dst: "" });
  });
});
