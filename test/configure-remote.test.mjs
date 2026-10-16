import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configureRemote, updateRemoteEnv, assertPrivateServeCompatible } from "../bin/configure-remote.mjs";

test("private environment setup preserves secrets and adds only the exact host", () => {
  const original = 'PORT=8790\r\nOAUTH_ENCRYPTION_SECRET=keep-me\r\nALLOWED_ORIGINS="https://existing.example"\r\n  HOST = 0.0.0.0\r\n';
  const next = updateRemoteEnv(original, "https://pc.example-tailnet.ts.net", 8791);
  assert.match(next, /OAUTH_ENCRYPTION_SECRET=keep-me/);
  assert.match(next, /ALLOWED_ORIGINS=https:\/\/existing.example,https:\/\/pc.example-tailnet.ts.net/);
  assert.match(next, /HOST=127.0.0.1/);
  assert.match(next, /PORT=8791/);
  assert.match(next, /ALLOWED_ORIGIN_SUFFIXES=\r?\n/);
  assert.match(next, /CLAW_PUSH_SUBJECT=https:\/\/pc.example-tailnet.ts.net/);
  assert.equal(updateRemoteEnv(next, "https://pc.example-tailnet.ts.net", 8791), next);
});

test("rejects public Funnel ownership and unrelated HTTPS root handlers", () => {
  assert.throws(() => assertPrivateServeCompatible({ AllowFunnel: { "pc.ts.net:443": true } }, "pc.ts.net", 8790), /Funnel/);
  assert.throws(() => assertPrivateServeCompatible({ Web: { "pc.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:1234" } } } } }, "pc.ts.net", 8790), /owns/);
  assert.doesNotThrow(() => assertPrivateServeCompatible({ Web: { "pc.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:8790" } } } } }, "pc.ts.net", 8790));
});

test("rejects invalid origins and ports", () => {
  for (const origin of ["http://pc.example", "https://localhost", "https://127.0.0.2", "https://pc.example/path", "https://user:password@pc.example"])
    assert.throws(() => updateRemoteEnv("", origin, 8790));
  assert.throws(() => updateRemoteEnv("", "https://pc.example", 0));
});

test("remote dry run never writes environment or changes Tailscale", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "claw-remote-config-"));
  try {
    fs.mkdirSync(path.join(directory, "server/security"), { recursive: true });
    fs.writeFileSync(path.join(directory, "server/security/device-sessions.ts"), "fixture");
    fs.writeFileSync(path.join(directory, ".env"), "PORT=8790\nPRIVATE_KEY=unchanged\n");
    const calls = [];
    const run = (_binary, args) => {
      calls.push(args);
      if (args[0] === "status") return JSON.stringify({ BackendState: "Running", Self: { DNSName: "own-pc.tail-example.ts.net." } });
      return "{}";
    };
    await configureRemote({ target: directory, "dry-run": true, serve: true }, { run, log: () => {} });
    assert.equal(fs.readFileSync(path.join(directory, ".env"), "utf8"), "PORT=8790\nPRIVATE_KEY=unchanged\n");
    assert.deepEqual(calls, [["status", "--json"], ["serve", "status", "--json"]]);
    assert.equal(fs.readdirSync(directory).some((name) => name.startsWith(".env.mobile-backup")), false);
  } finally {
    if (path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("claw-remote-config-"))
      fs.rmSync(directory, { recursive: true, force: true });
  }
});
