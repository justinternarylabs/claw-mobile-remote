# Installer CLI

Requires Node.js 22.13 or newer, Git, and an existing Claw-Empire Git checkout. Version 1.0.1 targets Claw-Empire **2.0.4**, based on commit `66a24ea7df2435ef897c48c147deb7ec572c01c2`. Other source revisions are accepted only when the version matches and the complete patch passes Git's applicability check. Future versions are not assumed compatible.

From this add-on directory, inspect the intended checkout first:

```sh
node bin/claw-mobile-remote.mjs doctor --target /path/to/claw-empire --json
node bin/claw-mobile-remote.mjs install --target /path/to/claw-empire --dry-run
node bin/claw-mobile-remote.mjs install --target /path/to/claw-empire
```

On Windows, quote paths containing spaces, for example `--target "D:\Apps\Claw Empire"`. If the package's executable has been linked or installed locally, replace `node bin/claw-mobile-remote.mjs` with `claw-mobile-remote`.

`doctor` is read-only: it checks the Git checkout, Node version, supported application version, required source files, patch paths, source hash differences, patch applicability, and required dependency declarations. It reports existing installations and refuses partial source conflicts or occupied new-file paths. Local edits outside affected patch hunks may remain; the actual pre-install bytes are backed up. Symlink targets and unsafe payload paths are rejected.

`install` backs up affected source files, `package.json`, and common package-manager lockfiles inside the checkout's Git metadata directory, `claw-mobile-remote/`. It applies the overlay with `git apply`, adds missing runtime and development dependency declarations, and installs dependencies using the checkout's package manager. Existing dependency versions are preserved. Package lifecycle scripts are disabled during this dependency step. Existing `node_modules` and package-manager caches are not backed up.

To manage dependency installation yourself:

```sh
node bin/claw-mobile-remote.mjs install --target /path/to/claw-empire --skip-dependencies
```

This still adds missing declarations to `package.json`; install them before building the application. The automatic dependency step supports npm and pnpm through Corepack. Use the skip option for another package manager or an installation where Corepack cannot be located.

Configure private remote access separately; it is not exposed during installation:

```sh
node bin/claw-mobile-remote.mjs remote --target /path/to/claw-empire --dry-run
node bin/claw-mobile-remote.mjs remote --target /path/to/claw-empire --serve
```

The remote command also accepts `--origin <exact-https-url>` and `--port <local-port>`. See the main guide for the Tailscale login and phone setup steps.

To restore the original source:

```sh
node bin/claw-mobile-remote.mjs uninstall --target /path/to/claw-empire --dry-run
node bin/claw-mobile-remote.mjs uninstall --target /path/to/claw-empire
```

Restoration checks every installed file's recorded hash first. If a source file, manifest, or lockfile has changed since installation, it stops before changing anything. Save and reconcile those changes before restoring. A successful restore reinstates the backed-up source and package manifests and removes files introduced by the overlay; reinstall dependencies afterward to reconcile `node_modules`. Private HTTPS configuration and application data are retained.

Normal installation failures roll back source and manifests. If rollback itself fails, or the process is interrupted, the backups and state remain under Git's `claw-mobile-remote/` metadata directory for recovery. The installer does not use Git reset, stash, commit, or project-wide deletion. Never delete retained backups until the source has been recovered.

The release contains source patches and installer code. It does not contain device sessions, database files, `.env`, credentials, push subscriptions, or private VAPID keys.
