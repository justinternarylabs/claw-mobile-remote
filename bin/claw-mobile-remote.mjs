#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { doctor, install, uninstall, loadPayload } from "../lib/installer.mjs";

const args = process.argv.slice(2);
const command = args.shift() || "help";
const flags = {};
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (["--target", "--origin", "--port"].includes(flag)) {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw Error(`${flag} requires a value.`);
      flags[flag.slice(2)] =
        flag === "--target" ? path.resolve(args[++i]) : args[++i];
    } else if (flag === "--serve") flags.serve = true;
    else if (["--dry-run", "--skip-dependencies", "--json"].includes(flag))
      flags[flag.slice(2)] = true;
    else throw Error(`Unknown option: ${flag}`);
  }
  if (["help", "--help", "-h"].includes(command)) {
    console.log(
      "claw-mobile-remote doctor|install|uninstall|remote --target <Claw-Empire checkout>\n  --dry-run            Inspect without modifying the checkout\n  --skip-dependencies  Apply source and dependency declarations, skip package installation\n  --serve              Configure private Tailscale Serve (remote command)\n  --origin <url>       Exact private HTTPS origin (remote command)\n  --port <number>      Local server port (remote command)\n  --json               Print structured results",
    );
  } else {
    if (!flags.target) throw Error("Specify --target <Claw-Empire checkout>.");
    let result;
    if (command === "remote") {
      const { configureRemote } = await import("./configure-remote.mjs");
      result = await configureRemote({
        target: flags.target,
        dryRun: !!flags["dry-run"],
        serve: !!flags.serve,
        origin: flags.origin,
        port: flags.port,
      });
    } else {
      const packageRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
      );
      const payload = loadPayload(packageRoot);
      if (command === "doctor") result = doctor(flags.target, payload);
      else if (command === "install")
        result = flags["dry-run"]
          ? doctor(flags.target, payload)
          : await install(flags.target, payload, {
              skipDependencies: !!flags["skip-dependencies"],
            });
      else if (command === "uninstall")
        result = uninstall(flags.target, { dryRun: !!flags["dry-run"] });
      else throw Error(`Unknown command: ${command}`);
    }
    console.log(
      flags.json
        ? JSON.stringify(result, null, 2)
        : result.message || JSON.stringify(result, null, 2),
    );
    if (result.ok === false) process.exitCode = 1;
  }
} catch (error) {
  console.error(`claw-mobile-remote: ${error.message}`);
  process.exitCode = 1;
}
