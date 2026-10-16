import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const hash = (filename) =>
  fs.existsSync(filename) ? digest(fs.readFileSync(filename)) : null;
function lstat(filename) {
  try {
    return fs.lstatSync(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw Error(
      `${command} ${args[0]} failed: ${(result.error?.message || result.stderr || result.stdout || "unknown error").trim().slice(0, 1500)}`,
    );
  return result.stdout.trim();
}
function git(cwd, ...args) {
  return run("git", args, cwd);
}
function safeRelative(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    /[\x00-\x1f:]/.test(value) ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error(`Unsafe payload path: ${value}`);
  if (
    value
      .split("/")
      .some(
        (part) =>
          [".git", ".env", "node_modules", ".codex"].includes(part) ||
          (part.startsWith(".env.") &&
            ![".env.example", ".env.sample"].includes(part)) ||
          /\.sqlite(?:-|$)|web-push-vapid/i.test(part),
      )
  )
    throw Error(`Protected path in payload: ${value}`);
  return value;
}
function safeFile(root, relative) {
  safeRelative(relative);
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (lstat(current)?.isSymbolicLink())
      throw Error(`Refusing symlink: ${relative}`);
  }
  if (fs.existsSync(current) && !fs.statSync(current).isFile())
    throw Error(`Expected a regular file: ${relative}`);
  return current;
}
function repo(target) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13))
    throw Error("Node.js 22.13 or newer is required.");
  const requested = fs.realpathSync(target);
  const root = fs.realpathSync(git(requested, "rev-parse", "--show-toplevel"));
  const stateDir = path.resolve(
    root,
    git(root, "rev-parse", "--git-path", "claw-mobile-remote"),
  );
  if (lstat(stateDir)?.isSymbolicLink())
    throw Error("Installer state is a symlink.");
  return { root, stateDir, stateFile: path.join(stateDir, "state.json") };
}
export function loadPayload(packageRoot) {
  const directory = path.join(packageRoot, "payload");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
  );
  if (
    manifest.schema !== 1 ||
    manifest.id !== "claw-mobile-remote" ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length
  )
    throw Error("Unsupported or empty payload manifest.");
  const seen = new Set();
  for (const file of manifest.files) {
    safeRelative(file.path);
    if (seen.has(file.path))
      throw Error(`Duplicate payload path: ${file.path}`);
    seen.add(file.path);
    for (const key of ["before", "after"])
      if (file[key] !== null && !/^[a-f0-9]{64}$/.test(file[key] || ""))
        throw Error(`Invalid ${key} hash for ${file.path}`);
  }
  const patch = safeFile(directory, manifest.patch);
  if (!fs.existsSync(patch)) throw Error("Payload patch is missing.");
  if (
    /^(?:(?:new file mode|old mode|new mode|deleted file mode) (?:120000|160000)|index[^\r\n]* (?:120000|160000))\r?$/m.test(
      fs.readFileSync(patch, "utf8"),
    )
  )
    throw Error("Symlinks and submodules are not supported in the payload.");
  if (manifest.patch_sha256 && hash(patch) !== manifest.patch_sha256)
    throw Error("Payload patch integrity check failed.");
  return { manifest, patch };
}
function inspect(target, payload) {
  const location = repo(target);
  const { root, stateFile } = location;
  const state = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : null;
  if (
    !state &&
    fs.existsSync(location.stateDir) &&
    fs.readdirSync(location.stateDir).some((name) => name !== "install.lock")
  )
    throw Error(
      "Existing installer backup directory needs recovery; it was left untouched.",
    );
  if (state) {
    validateState(state);
    if (state.status !== "installed")
      throw Error(
        "An interrupted installation needs recovery; inspect the backup state in Git's claw-mobile-remote directory.",
      );
    for (const file of state.files)
      if (
        file.before !== null &&
        hash(path.join(location.stateDir, "backups", file.backup)) !==
          file.before
      )
        throw Error(`Backup integrity check failed: ${file.path}`);
    const changed = state.files
      .filter((file) => hash(safeFile(root, file.path)) !== file.after)
      .map((file) => file.path);
    return { ...location, state, changed, alreadyInstalled: true };
  }
  const pkg = JSON.parse(
    fs.readFileSync(safeFile(root, "package.json"), "utf8"),
  );
  if (
    pkg.name !== "climpire" ||
    pkg.version !== payload.manifest.upstream.version
  )
    throw Error(
      `Unsupported checkout: expected Claw-Empire ${payload.manifest.upstream.version}.`,
    );
  const declared = new Set(payload.manifest.files.map((file) => file.path));
  const actual = git(root, "apply", "--numstat", "-z", "--", payload.patch)
    .split("\0")
    .filter(Boolean)
    .map((line) => line.split("\t").slice(2).join("\t"));
  if (
    actual.length !== declared.size ||
    actual.some((file) => !declared.has(file))
  )
    throw Error("Patch paths do not match the manifest.");
  const locallyModified = [];
  for (const file of payload.manifest.files) {
    const filename = safeFile(root, file.path),
      current = hash(filename);
    if (file.before === null && current !== null)
      throw Error(`New payload file already exists: ${file.path}`);
    if (file.before !== null && current === null)
      throw Error(`Required source file is missing: ${file.path}`);
    if (current !== file.before) locallyModified.push(file.path);
  }
  try {
    git(root, "apply", "--check", "--whitespace=nowarn", "--", payload.patch);
  } catch (error) {
    throw Error(
      `Mobile overlay cannot apply cleanly. No files changed. ${error.message}`,
    );
  }
  return {
    ...location,
    pkg,
    locallyModified,
    commit: git(root, "rev-parse", "HEAD"),
    alreadyInstalled: false,
  };
}
export function doctor(target, payload) {
  const check = inspect(target, payload);
  if (check.alreadyInstalled)
    return {
      ok: check.changed.length === 0,
      installed: true,
      changed: check.changed,
      message: check.changed.length
        ? `Installed overlay has user changes: ${check.changed.join(", ")}`
        : "Mobile remote overlay is already installed and intact.",
    };
  const dependencies = {
    ...payload.manifest.dependencies?.runtime,
    ...payload.manifest.dependencies?.dev,
  };
  const missingDependencies = Object.keys(dependencies).filter(
    (name) =>
      !check.pkg.dependencies?.[name] && !check.pkg.devDependencies?.[name],
  );
  let dependencyCommand, dependencyError;
  try {
    dependencyCommand = dependencyPlan(check.root, check.pkg);
  } catch (error) {
    dependencyError = error.message;
  }
  return {
    ok: !dependencyError,
    installed: false,
    compatible: true,
    node: process.version,
    git: git(check.root, "--version"),
    upstream: check.commit,
    locallyModified: check.locallyModified,
    missingDependencies,
    dependencyCommand,
    ...(dependencyError ? { dependencyError } : {}),
    message:
      dependencyError ||
      `Compatible Claw-Empire checkout. ${payload.manifest.files.length} overlay files; ${missingDependencies.length} dependencies to add. Local edits outside patch hunks will be preserved.`,
  };
}
function writeJson(filename, data) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
}
function validateState(state) {
  if (
    state.schema !== 1 ||
    state.id !== "claw-mobile-remote" ||
    !Array.isArray(state.files)
  )
    throw Error("Invalid installer state.");
  for (const file of state.files) {
    safeRelative(file.path);
    if (!/^\d{5,}$/.test(file.backup))
      throw Error("Unsafe backup path in installer state.");
    for (const field of ["before", "after"])
      if (file[field] !== null && !/^[a-f0-9]{64}$/.test(file[field] || ""))
        throw Error("Invalid backup fingerprint.");
  }
}
function cleanState(stateDir) {
  const backupDir = path.join(stateDir, "backups");
  if (fs.existsSync(backupDir)) {
    for (const entry of fs.readdirSync(backupDir))
      fs.unlinkSync(path.join(backupDir, entry));
    fs.rmdirSync(backupDir);
  }
  for (const name of ["state.json", "install.lock"]) {
    const filename = path.join(stateDir, name);
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }
  fs.rmdirSync(stateDir);
}
function restoreFiles(root, stateDir, files) {
  for (const file of files) {
    const destination = safeFile(root, file.path);
    if (file.before === null) {
      if (fs.existsSync(destination)) fs.unlinkSync(destination);
    } else {
      const source = path.join(stateDir, "backups", file.backup);
      if (hash(source) !== file.before)
        throw Error(`Backup integrity check failed: ${file.path}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      if (file.mode) fs.chmodSync(destination, file.mode);
    }
  }
}
function mergeDependencies(pkg, manifest) {
  for (const [section, dependencies] of [
    ["dependencies", manifest.dependencies?.runtime],
    ["devDependencies", manifest.dependencies?.dev],
  ]) {
    for (const [name, version] of Object.entries(dependencies || {})) {
      // Existing versions and dependency placement belong to the checkout owner.
      if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) continue;
      pkg[section] ??= {};
      pkg[section][name] = version;
    }
  }
}
function dependencyPlan(root, pkg) {
  const manager =
    pkg.packageManager?.split("@")[0] ||
    (fs.existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm" : "npm");
  const nodeDirs = [
    ...new Set([
      path.dirname(process.execPath),
      ...(process.env.PATH || process.env.Path || "").split(path.delimiter),
      ...(process.env.APPDATA ? [path.join(process.env.APPDATA, "npm")] : []),
    ]),
  ];
  const findTool = (relative) =>
    nodeDirs
      .map((dir) => path.join(dir, "node_modules", ...relative.split("/")))
      .find((file) => fs.existsSync(file));
  if (manager === "pnpm") {
    // On Windows Corepack's JS entry avoids cmd.exe argument interpolation.
    const corepack =
      process.platform === "win32"
        ? findTool("corepack/dist/corepack.js")
        : null;
    if (process.platform === "win32" && !corepack)
      throw Error(
        "Corepack's Node entry point was not found. Install Corepack, or use --skip-dependencies and run pnpm install manually.",
      );
    return corepack
      ? {
          command: process.execPath,
          args: [
            corepack,
            manager,
            "install",
            "--no-frozen-lockfile",
            "--ignore-scripts",
          ],
        }
      : {
          command: "corepack",
          args: [
            manager,
            "install",
            "--no-frozen-lockfile",
            "--ignore-scripts",
          ],
        };
  }
  if (manager !== "npm") throw Error(`Unsupported package manager: ${manager}`);
  const npm =
    process.platform === "win32" ? findTool("npm/bin/npm-cli.js") : null;
  if (process.platform === "win32" && !npm)
    throw Error(
      "npm's Node entry point was not found. Use --skip-dependencies and install the declared dependencies manually.",
    );
  return npm
    ? { command: process.execPath, args: [npm, "install", "--ignore-scripts"] }
    : { command: "npm", args: ["install", "--ignore-scripts"] };
}
function defaultDependencies(root, pkg) {
  const plan = dependencyPlan(root, pkg);
  return run(plan.command, plan.args, root);
}
export async function install(target, payload, options = {}) {
  const check = inspect(target, payload);
  if (check.alreadyInstalled) return doctor(target, payload);
  const { root, stateDir, stateFile } = check;
  fs.mkdirSync(stateDir, { recursive: true });
  const lock = path.join(stateDir, "install.lock");
  let lockHandle;
  try {
    lockHandle = fs.openSync(lock, "wx");
  } catch {
    throw Error("Another installation is running; no files changed.");
  }
  fs.closeSync(lockHandle);
  const extra = [
    "package.json",
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
  ];
  const paths = [
    ...new Set([...payload.manifest.files.map((file) => file.path), ...extra]),
  ];
  const files = [];
  const state = {
    schema: 1,
    id: payload.manifest.id,
    version: payload.manifest.version,
    status: "writing",
    installedAt: new Date().toISOString(),
    files,
  };
  try {
    // Recheck after acquiring the lock. No git reset, stash, index changes, or project-wide cleanup.
    git(root, "apply", "--check", "--whitespace=nowarn", "--", payload.patch);
    fs.mkdirSync(path.join(stateDir, "backups"));
    for (const [index, relative] of paths.entries()) {
      const filename = safeFile(root, relative),
        before = hash(filename),
        backup = String(index).padStart(5, "0");
      const file = {
        path: relative,
        before,
        after: null,
        backup,
        mode: before === null ? null : fs.statSync(filename).mode,
      };
      if (before !== null)
        fs.copyFileSync(filename, path.join(stateDir, "backups", backup));
      files.push(file);
    }
    writeJson(stateFile, state);
    git(root, "apply", "--whitespace=nowarn", "--", payload.patch);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    mergeDependencies(pkg, payload.manifest);
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify(pkg, null, 2) + "\n",
    );
    if (!options.skipDependencies)
      await (options.installDependencies || defaultDependencies)(root, pkg);
    for (const file of files) file.after = hash(safeFile(root, file.path));
    state.status = "installed";
    writeJson(stateFile, state);
    return {
      ok: true,
      installed: true,
      dependenciesInstalled: !options.skipDependencies,
      message: options.skipDependencies
        ? "Mobile overlay installed. Dependency declarations added; run your package manager install before building."
        : "Mobile overlay and dependencies installed. Build Claw-Empire, then configure private remote access.",
    };
  } catch (error) {
    try {
      restoreFiles(root, stateDir, files);
      cleanState(stateDir);
    } catch (rollbackError) {
      state.status = "recovery_required";
      writeJson(stateFile, state);
      throw Error(
        `${error.message}; rollback could not finish: ${rollbackError.message}. Backups retained in ${stateDir}`,
      );
    }
    throw Error(`Installation rolled back: ${error.message}`);
  } finally {
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
  }
}
export function uninstall(target, options = {}) {
  const { root, stateDir, stateFile } = repo(target);
  if (!fs.existsSync(stateFile))
    return {
      ok: true,
      installed: false,
      message: "No mobile overlay installation found.",
    };
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  validateState(state);
  if (state.schema !== 1 || state.status !== "installed")
    throw Error(
      "Installation state requires manual recovery; backups were retained.",
    );
  const changed = state.files
    .filter((file) => hash(safeFile(root, file.path)) !== file.after)
    .map((file) => file.path);
  if (changed.length)
    throw Error(
      `Refusing to overwrite changes made after installation: ${changed.join(", ")}. Save those changes before restoring the backed-up files.`,
    );
  for (const file of state.files)
    if (
      file.before !== null &&
      hash(path.join(stateDir, "backups", file.backup)) !== file.before
    )
      throw Error(`Backup integrity check failed: ${file.path}`);
  if (options.dryRun)
    return {
      ok: true,
      installed: true,
      message: `Restore check passed for ${state.files.length} files. No files changed.`,
    };
  const lock = path.join(stateDir, "install.lock");
  let handle;
  try {
    handle = fs.openSync(lock, "wx");
  } catch {
    throw Error("Another installer operation is running; no files changed.");
  }
  fs.closeSync(handle);
  try {
    if (
      state.files.some((file) => hash(safeFile(root, file.path)) !== file.after)
    )
      throw Error(
        "Files changed while the restore was being prepared; no files changed.",
      );
    const current = state.files.map((file) => ({
      ...file,
      contents:
        file.after === null ? null : fs.readFileSync(safeFile(root, file.path)),
    }));
    try {
      restoreFiles(root, stateDir, state.files);
    } catch (error) {
      for (const file of current) {
        const filename = safeFile(root, file.path);
        if (file.contents === null) {
          if (fs.existsSync(filename)) fs.unlinkSync(filename);
        } else {
          fs.mkdirSync(path.dirname(filename), { recursive: true });
          fs.writeFileSync(filename, file.contents);
        }
      }
      throw Error(
        `Restore could not finish; installed files retained: ${error.message}`,
      );
    }
    cleanState(stateDir);
    return {
      ok: true,
      installed: false,
      message:
        "Original source files and package manifests restored. Reinstall dependencies to reconcile node_modules; remote-access configuration is retained.",
    };
  } finally {
    if (fs.existsSync(lock)) fs.unlinkSync(lock);
  }
}
