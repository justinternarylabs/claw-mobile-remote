import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { doctor, install, uninstall, loadPayload } from "../lib/installer.mjs";

const fixtures = [];
const sha = (text) => createHash("sha256").update(text).digest("hex");
function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
afterEach(() => {
  mock.restoreAll();
  for (const root of fixtures.splice(0))
    if (
      path.dirname(fs.realpathSync(root)) === fs.realpathSync(os.tmpdir()) &&
      path.basename(root).startsWith("claw-mobile-installer-test-")
    )
      fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "claw-mobile-installer-test-")),
  );
  fixtures.push(root);
  const target = path.join(root, "target"),
    pkg = path.join(root, "addon"),
    payloadDir = path.join(pkg, "payload");
  fs.mkdirSync(path.join(target, "src"), { recursive: true });
  fs.mkdirSync(payloadDir, { recursive: true });
  const before =
    Array.from({ length: 20 }, (_, i) => `export const value${i} = ${i};`).join(
      "\n",
    ) + "\n";
  const after = before.replace("value0 = 0", "value0 = 42");
  const packageText =
    JSON.stringify(
      {
        name: "climpire",
        version: "2.0.4",
        dependencies: { qrcode: "^1.0.0" },
      },
      null,
      2,
    ) + "\n";
  fs.writeFileSync(path.join(target, "package.json"), packageText);
  fs.writeFileSync(path.join(target, "src/main.mjs"), before);
  git(target, "init", "-q");
  git(target, "config", "core.autocrlf", "false");
  git(target, "add", ".");
  git(
    target,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  fs.writeFileSync(path.join(target, "src/main.mjs"), after);
  const added = "export const mobile = true;\n";
  const patch =
    git(target, "diff", "--binary", "--no-ext-diff") +
    "\n" +
    "diff --git a/src/mobile.mjs b/src/mobile.mjs\nnew file mode 100644\n--- /dev/null\n+++ b/src/mobile.mjs\n@@ -0,0 +1 @@\n+export const mobile = true;\n";
  fs.writeFileSync(path.join(target, "src/main.mjs"), before);
  fs.writeFileSync(path.join(payloadDir, "mobile-remote.patch"), patch);
  const manifest = {
    schema: 1,
    id: "claw-mobile-remote",
    version: "1.0.0",
    upstream: { version: "2.0.4", commit: git(target, "rev-parse", "HEAD") },
    patch: "mobile-remote.patch",
    patch_sha256: sha(patch),
    files: [
      { path: "src/main.mjs", before: sha(before), after: sha(after) },
      { path: "src/mobile.mjs", before: null, after: sha(added) },
    ],
    dependencies: {
      runtime: { qrcode: "^1.5.4", "web-push": "^3.6.7" },
      dev: { "@types/web-push": "^3.6.4" },
    },
  };
  fs.writeFileSync(
    path.join(payloadDir, "manifest.json"),
    JSON.stringify(manifest),
  );
  return {
    root,
    target,
    pkg,
    payload: loadPayload(pkg),
    before,
    after,
    packageText,
    manifest,
    payloadDir,
  };
}
test("doctor is read-only, checks patch applicability and reports missing dependencies", () => {
  const f = fixture();
  const result = doctor(f.target, f.payload);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missingDependencies, ["web-push", "@types/web-push"]);
  assert.equal(git(f.target, "status", "--porcelain"), "");
  assert.equal(
    fs.existsSync(path.join(f.target, ".git/claw-mobile-remote")),
    false,
  );
});
test("install preserves dependency versions, is idempotent, and uninstall restores actual bytes", async () => {
  const f = fixture();
  await install(f.target, f.payload, { skipDependencies: true });
  assert.equal(
    fs.readFileSync(path.join(f.target, "src/main.mjs"), "utf8"),
    f.after,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.target, "package.json"), "utf8"))
      .dependencies.qrcode,
    "^1.0.0",
  );
  assert.equal(
    (
      await install(f.target, f.payload, {
        installDependencies: () => assert.fail("must not reinstall"),
      })
    ).installed,
    true,
  );
  assert.equal(uninstall(f.target, { dryRun: true }).ok, true);
  assert.equal(fs.existsSync(path.join(f.target, "src/mobile.mjs")), true);
  uninstall(f.target);
  assert.equal(
    fs.readFileSync(path.join(f.target, "package.json"), "utf8"),
    f.packageText,
  );
  assert.equal(git(f.target, "status", "--porcelain"), "");
  assert.equal(uninstall(f.target).installed, false);
});
test("patch-compatible local edits and unrelated files survive install and restore", async () => {
  const f = fixture(),
    edited = f.before.replace("value19 = 19", "value19 = 999");
  fs.writeFileSync(path.join(f.target, "src/main.mjs"), edited);
  fs.writeFileSync(path.join(f.target, "personal.txt"), "keep me");
  assert.deepEqual(doctor(f.target, f.payload).locallyModified, [
    "src/main.mjs",
  ]);
  await install(f.target, f.payload, { skipDependencies: true });
  assert.match(
    fs.readFileSync(path.join(f.target, "src/main.mjs"), "utf8"),
    /value19 = 999/,
  );
  uninstall(f.target);
  assert.equal(
    fs.readFileSync(path.join(f.target, "src/main.mjs"), "utf8"),
    edited,
  );
  assert.equal(
    fs.readFileSync(path.join(f.target, "personal.txt"), "utf8"),
    "keep me",
  );
});
test("a conflicting patch never partially applies or overwrites existing new files", async () => {
  const f = fixture();
  const conflict = f.before.replace("value0 = 0", "value0 = 8");
  fs.writeFileSync(path.join(f.target, "src/main.mjs"), conflict);
  await assert.rejects(
    install(f.target, f.payload, { skipDependencies: true }),
    /cannot apply cleanly/,
  );
  assert.equal(
    fs.readFileSync(path.join(f.target, "src/main.mjs"), "utf8"),
    conflict,
  );
  assert.equal(fs.existsSync(path.join(f.target, "src/mobile.mjs")), false);
  fs.writeFileSync(path.join(f.target, "src/main.mjs"), f.before);
  fs.writeFileSync(path.join(f.target, "src/mobile.mjs"), "my implementation");
  await assert.rejects(
    install(f.target, f.payload, { skipDependencies: true }),
    /already exists/,
  );
  assert.equal(
    fs.readFileSync(path.join(f.target, "src/mobile.mjs"), "utf8"),
    "my implementation",
  );
});
test("dependency failure rolls back source, added files, package manifest and lockfile", async () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.target, "pnpm-lock.yaml"), "original-lock\n");
  await assert.rejects(
    install(f.target, f.payload, {
      installDependencies: (root) => {
        fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "changed-lock\n");
        throw Error("dependency failure");
      },
    }),
    /rolled back/,
  );
  assert.equal(
    fs.readFileSync(path.join(f.target, "src/main.mjs"), "utf8"),
    f.before,
  );
  assert.equal(
    fs.readFileSync(path.join(f.target, "package.json"), "utf8"),
    f.packageText,
  );
  assert.equal(
    fs.readFileSync(path.join(f.target, "pnpm-lock.yaml"), "utf8"),
    "original-lock\n",
  );
  assert.equal(fs.existsSync(path.join(f.target, "src/mobile.mjs")), false);
});
test("write failure rolls back without leaving a partial install", async () => {
  const f = fixture(),
    original = fs.writeFileSync;
  let failed = false;
  mock.method(fs, "writeFileSync", (filename, ...args) => {
    if (!failed && path.basename(filename) === "package.json") {
      failed = true;
      throw Error("simulated disk failure");
    }
    return original(filename, ...args);
  });
  await assert.rejects(
    install(f.target, f.payload, { skipDependencies: true }),
    /rolled back/,
  );
  assert.equal(
    fs.readFileSync(path.join(f.target, "src/main.mjs"), "utf8"),
    f.before,
  );
  assert.equal(fs.existsSync(path.join(f.target, "src/mobile.mjs")), false);
});
test("restore refuses later edits before changing any other file", async () => {
  const f = fixture();
  await install(f.target, f.payload, { skipDependencies: true });
  fs.appendFileSync(
    path.join(f.target, "src/mobile.mjs"),
    "// personal change\n",
  );
  assert.throws(() => uninstall(f.target), /Refusing to overwrite/);
  assert.equal(
    fs.readFileSync(path.join(f.target, "src/main.mjs"), "utf8"),
    f.after,
  );
});
test("malicious manifest paths and symlink source files are rejected", () => {
  const f = fixture();
  fs.writeFileSync(
    path.join(f.payloadDir, "manifest.json"),
    JSON.stringify({
      ...f.manifest,
      files: [{ path: "../outside", before: null, after: sha("x") }],
    }),
  );
  assert.throws(() => loadPayload(f.pkg), /Unsafe payload path/);
  fs.unlinkSync(path.join(f.target, "src/main.mjs"));
  try {
    fs.symlinkSync(
      path.join(f.root, "missing"),
      path.join(f.target, "src/main.mjs"),
    );
  } catch (error) {
    if (error.code === "EPERM") return;
    throw error;
  }
  assert.throws(() => doctor(f.target, f.payload), /symlink/);
});

test("payload cannot introduce symlinks", () => {
  const f = fixture();
  const patch = fs
    .readFileSync(f.payload.patch, "utf8")
    .replace("new file mode 100644", "new file mode 120000");
  fs.writeFileSync(f.payload.patch, patch);
  fs.writeFileSync(
    path.join(f.payloadDir, "manifest.json"),
    JSON.stringify({ ...f.manifest, patch_sha256: sha(patch) }),
  );
  assert.throws(() => loadPayload(f.pkg), /Symlinks and submodules/);
  assert.equal(fs.existsSync(path.join(f.target, "src/mobile.mjs")), false);
});
