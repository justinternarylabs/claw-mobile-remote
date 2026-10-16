import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function readEnvValue(text, name) {
  const match = text.match(new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*(.*)$`, "m"));
  return match?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
}

export function updateRemoteEnv(text, origin, port) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Remote origin must be a plain HTTPS origin without a path, query, or credentials.");
  if (["localhost", "0.0.0.0", "[::1]", "[::]"].includes(url.hostname) || /^127\./.test(url.hostname) || url.hostname.endsWith(".localhost"))
    throw new Error("Use the PC's private HTTPS hostname, not a loopback hostname.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be an integer from 1 to 65535.");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  let result = text;
  const put = (key, value) => {
    const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, "gm");
    if (pattern.test(result)) result = result.replace(pattern, `${key}=${value}`);
    else result = `${result.trimEnd()}${newline}${key}=${value}${newline}`;
  };
  const origins = readEnvValue(text, "ALLOWED_ORIGINS").split(",").map((item) => item.trim()).filter(Boolean);
  if (!origins.includes(url.origin)) origins.push(url.origin);
  put("ALLOWED_ORIGINS", origins.join(","));
  put("ALLOWED_ORIGIN_SUFFIXES", "");
  put("HOST", "127.0.0.1");
  put("PORT", port);
  // Apple rejects placeholder local mail addresses as a VAPID sender contact.
  put("CLAW_PUSH_SUBJECT", url.origin);
  return result;
}

export function assertPrivateServeCompatible(config, dnsName, port) {
  if (Object.values(config.AllowFunnel ?? {}).some(Boolean))
    throw new Error("Public Tailscale Funnel is enabled. Turn it off before using this private-only setup helper.");
  const handler = config.Web?.[`${dnsName}:443`]?.Handlers?.["/"];
  if (handler && handler.Proxy !== `http://127.0.0.1:${port}`)
    throw new Error("Another Tailscale service owns the HTTPS root. Its configuration was preserved.");
}

function tailscaleBinary() {
  if (process.env.TAILSCALE_BINARY) return process.env.TAILSCALE_BINARY;
  if (process.platform === "win32") {
    const candidate = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Tailscale", "tailscale.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "tailscale";
}

export async function configureRemote(options, dependencies = {}) {
  const run = dependencies.run ?? ((binary, args) => execFileSync(binary, args, {
    encoding: "utf8", timeout: 30_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  }));
  const log = dependencies.log ?? console.log;
  const target = fs.realpathSync(path.resolve(options.target));
  if (!fs.existsSync(path.join(target, "server", "security", "device-sessions.ts")))
    throw new Error("Install the mobile add-on into this Claw checkout before configuring remote access.");
  const envFile = path.join(target, ".env");
  if (!fs.existsSync(envFile) || fs.lstatSync(envFile).isSymbolicLink())
    throw new Error("Create a normal local .env using Claw's setup first. Symlinked .env files are not edited.");
  const original = fs.readFileSync(envFile, "utf8");
  const port = Number(options.port ?? (readEnvValue(original, "PORT") || 8790));
  const binary = tailscaleBinary();
  let dnsName;
  let origin = options.origin;
  if (!origin || options.serve) {
    let status;
    try { status = JSON.parse(run(binary, ["status", "--json"])); }
    catch { throw new Error("Install/open Tailscale and sign in on this PC first. Ensure its CLI is on PATH (or set TAILSCALE_BINARY)."); }
    if (status.BackendState !== "Running") throw new Error("Connect this PC to Tailscale before configuring access.");
    dnsName = String(status.Self?.DNSName ?? "").replace(/\.$/, "");
    if (!/^[a-zA-Z0-9.-]+\.ts\.net$/.test(dnsName)) throw new Error("Tailscale has not provided a valid private DNS name. Enable MagicDNS/HTTPS in your tailnet.");
    const discovered = `https://${dnsName}`;
    if (origin && new URL(origin).origin !== discovered) throw new Error("--serve can only use this PC's discovered Tailscale hostname.");
    origin = discovered;
    if (options.serve) assertPrivateServeCompatible(JSON.parse(run(binary, ["serve", "status", "--json"])), dnsName, port);
  }
  const next = updateRemoteEnv(original, origin, port);
  if (options["dry-run"] || options.dryRun) {
    log(`Would configure exact HTTPS origin ${new URL(origin).origin}, loopback port ${port}, and this installation's push contact.`);
    log(options.serve ? "Would enable private Tailscale Serve on HTTPS 443; Funnel stays disabled." : "Serve is not changed without --serve.");
    return { origin: new URL(origin).origin, port, changed: false };
  }
  let backup;
  if (next !== original) {
    backup = path.join(target, `.env.mobile-backup-${Date.now()}`);
    fs.writeFileSync(backup, original, { flag: "wx", mode: 0o600 });
    fs.writeFileSync(envFile, next, { mode: 0o600 });
  }
  log(`Configured private address: ${new URL(origin).origin}/`);
  if (backup) log(`Previous environment backed up locally: ${path.basename(backup)}`);
  if (options.serve) {
    try {
      const output = run(binary, ["serve", "--bg", "--https=443", `http://127.0.0.1:${port}`]);
      if (output.trim()) log(output.trim());
      assertPrivateServeCompatible(JSON.parse(run(binary, ["serve", "status", "--json"])), dnsName, port);
    } catch (error) {
      // Tailscale may emit an account-specific HTTPS consent URL. Never print its status JSON or environment.
      const output = [error.stdout, error.stderr].filter(Boolean).map(String).join("\n");
      const approval = output.match(/https:\/\/login\.tailscale\.com\/[A-Za-z0-9/_?=&.-]+/);
      if (approval) log(`Enable HTTPS only (leave Funnel disabled): ${approval[0]}`);
      throw new Error("Private Serve did not complete. Environment is prepared; check Tailscale HTTPS approval and rerun this command. Existing environment backup was retained.");
    }
  }
  log("Restart Claw to load .env changes. Open local Settings > General > Remote access and generate a pairing code for your phone.");
  return { origin: new URL(origin).origin, port, backup, changed: next !== original };
}

export default configureRemote;
