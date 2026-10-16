# Claw Mobile Remote

Phone control, a full-screen office, private remote access, and web push notifications for [Claw-Empire](https://github.com/GreenSheep01201/claw-empire). This is an independent, reversible source add-on. It keeps Claw's original agents, office art, themes, and desktop workflow.

Each friend runs their **own Claw installation on their own PC**, connects their own phone, and uses their own agent accounts. Installing this package does not connect anyone to the publisher's PC. No credentials, device sessions, databases, model accounts, or private network addresses are included.

## What it adds

- Responsive navigation, chat, settings, agent forms, and task controls on narrow screens.
- A full-screen office game with safe-area-aware movement and interaction controls. Holding a direction moves continuously without selecting text. Return and browser Back restore the main interface.
- Private HTTPS access through Tailscale Serve, without a public tunnel or router port forwarding.
- Local-PC enrollment of trusted phones using a short-lived code or QR link; device sessions can be revoked from the PC.
- An installable web app with notifications for completed/failed tasks and decisions needing attention.

## Compatibility

Version 1.0.1 targets **Claw-Empire 2.0.4**, upstream commit `66a24ea7df2435ef897c48c147deb7ec572c01c2`. It was built and tested against a fresh upstream checkout, without the author's customized theme or integrations. It is not a promise of compatibility with every historical or future Claw release.

`doctor` checks the actual source patch before installation. Compatible local edits outside changed patch hunks are preserved. A conflicting file or unsupported Claw version stops installation before source changes. Do not force a patch over a conflict; use a matching Claw version or port/review the changes first.

## Requirements

- A working Claw-Empire checkout and its existing `.env` setup. Complete the [upstream setup instructions](https://github.com/GreenSheep01201/claw-empire#readme) first.
- Node.js **22.13+**, Git, and Claw's package manager (pnpm through Corepack for the tested upstream version). Node 24 was used for validation.
- A PC that stays awake with Claw running and outbound internet access for notifications.
- Tailscale on both PC and phone, signed in to the same personal tailnet. Each friend should use their own tailnet. The helper expects the PC to be connected already.
- For iPhone push: iOS 16.4 or later, installed to the Home Screen, with notification permission granted from that installed app. See [WebKit's platform requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Windows was used for the full integration test. The installer and helper use portable Node APIs, but macOS/Linux end-to-end setup has not been verified for this release.

## 1. Get the add-on

This repository is public: anyone can download, use, or fork it under Apache-2.0. Repository access does not grant access to anyone's running Claw PC. Every installation uses its own private network, local configuration, and enrolled devices.

With Git:

```sh
git clone https://github.com/justinternarylabs/claw-mobile-remote.git
```

Or download the versioned archive from this repository's Releases page. The release also includes an npm-format `.tgz`; extract it and run the same CLI from the extracted `package` folder. No GitHub or npm login is required to download public releases. The npm manifest intentionally has `private: true` to prevent accidental registry publication; it does not restrict use or forking of this public repository.

Keep the add-on outside your Claw checkout, for example:

```text
workspace/
  claw-empire/
  claw-mobile-remote/
```

## 2. Install into your Claw checkout

Stop your Claw server first. Save your work and make a normal backup of the Claw database and `.env` before updating any software.

From the add-on directory:

```sh
node bin/claw-mobile-remote.mjs doctor --target ../claw-empire
node bin/claw-mobile-remote.mjs install --target ../claw-empire --dry-run
node bin/claw-mobile-remote.mjs install --target ../claw-empire
```

The installer applies the reviewed source overlay, merges four required dependency entries into your existing `package.json`, and installs dependencies with the detected package manager. It stores the original bytes and a recovery journal in Git's private `claw-mobile-remote` directory. It does not reset your checkout, replace your database, or configure agent/provider accounts. See [installer behavior and recovery](docs/installer.md).

Use `--skip-dependencies` only if you will install dependencies yourself before building. Dry runs make no changes.

## 3. Set up private remote HTTPS

Install [Tailscale](https://tailscale.com/download) on the PC and phone, sign in, and connect both. Then preview the PC configuration from the add-on directory:

```sh
node bin/claw-mobile-remote.mjs remote --target ../claw-empire --dry-run
node bin/claw-mobile-remote.mjs remote --target ../claw-empire --serve
```

The helper discovers **your PC's** Tailscale HTTPS name. It backs up `.env`, binds Claw to loopback, allows that exact HTTPS origin, clears broad origin suffixes, and sets a valid Web Push sender. `--serve` maps private HTTPS port 443 to the local Claw port. It refuses an existing public Funnel configuration or a conflicting root proxy.

Tailscale may print an approval link on first use. Open it, approve **HTTPS/Serve**, and leave **Funnel disabled**. If the command times out awaiting approval, finish approval and rerun it. The prepared `.env` and backup remain available. Learn more in the [official Serve guide](https://tailscale.com/docs/features/tailscale-serve).

Build and start Claw from its directory:

```sh
cd ../claw-empire
corepack pnpm run build
corepack pnpm start
```

Use `start`, not the upstream `start:tailscale` script that overrides the loopback binding. The helper does not restart processes or install a startup service. Your existing process manager may restart Claw instead, provided it respects `.env` and serves the production build.

For a different local port, add `--port 8791` to the helper. For an existing private HTTPS reverse proxy, use `--origin https://your-own-host.example` without `--serve`; you are responsible for that proxy's access restrictions, forwarding WebSockets, and preserving Host/Origin correctly. Never expose Claw's raw HTTP port to the internet.

## 4. Pair the iPhone

1. On the **PC**, open `http://127.0.0.1:8790` (use your configured port), then **Settings → General → Remote access**.
2. Generate a pairing code or QR link. Codes expire after five minutes and can be used once. Keep the code private.
3. With Tailscale connected on the phone, open the private HTTPS address printed by the helper. Scan the QR or enter the code and a recognizable device name.
4. In Safari, choose **Share → Add to Home Screen**. Open Claw from that icon. If the installed app asks to pair again, generate a fresh code on the PC; Safari and installed web apps can have separate storage.
5. In the installed app's notification settings, enable notifications and choose **Send test**. A permission request must follow your tap.

Android users can install from Chrome's app/install menu and enable notifications from the installed app. Normal browser control also works without installation, subject to browser notification support.

The phone has operator access to your Claw instance, including its task controls. Enroll only devices you trust. On the local PC, revoke a lost/unwanted device from Remote access; its API access, active socket, and associated push subscription are revoked. Enrollment and device management require local-PC access. Up to 20 devices can be paired, with 30-day sessions; expired devices need pairing again. Pairing uses a Secure, HttpOnly, SameSite=Strict cookie rather than a long-lived token in a shareable URL.

## Daily use

Open the Home Screen app with Tailscale connected. The phone navigation exposes office, tasks, agents, chat, and settings. Enter the full-screen office to move around and interact; use **Return** or browser Back to leave it. The movement pad supports press-and-hold and clears input on release, cancellation, or loss of focus.

The camera follows through the top and bottom of the map, with extra travel beyond world edges to keep the avatar away from the fixed HUD and controls. It recenters after rotation or a changing browser viewport. If upgrading from 1.0.0, uninstall that version with its original CLI, then install 1.0.1 and rebuild.

Notifications use generic event summaries rather than task prompts or agent output. Apple/Google/Mozilla push infrastructure still transports the encrypted notification to the device. Claw and the PC must be running when an event occurs; this is not an offline task runner. Keep Tailscale connected when opening the app or following a notification. OS Focus modes, permissions, and delivery delays can affect alerts.

For unattended operation, use your usual OS login/startup process manager and prevent the PC from sleeping while you need access. Test that Claw and Tailscale return after a reboot. Automatic startup and wake-from-sleep are not installed by this add-on.

## Configuration and private data

| Setting/file | Purpose |
| --- | --- |
| `HOST=127.0.0.1` | Local Claw listener behind private HTTPS Serve. |
| `PORT` | Local HTTP port, normally 8790. |
| `ALLOWED_ORIGINS` | Exact HTTPS origin added by the helper; existing exact entries are retained. |
| `ALLOWED_ORIGIN_SUFFIXES` | Cleared by the helper to avoid broad trust in unrelated hosts. |
| `CLAW_PUSH_SUBJECT` | Your own HTTPS workspace origin or valid `mailto:` contact used for VAPID. |
| `<DB_PATH>.remote-auth.sqlite` | Hashed pairing/device secrets and session metadata; defaults beside `claw-empire.sqlite`. |
| `.climpire/web-push-vapid.json` | Per-installation notification signing keys, generated locally. |
| `.env.mobile-backup-*` | Private pre-helper configuration backups. |

Do not upload `.env`, backups, databases, device cookies, or VAPID keys to GitHub or send them to friends. Each installation generates its own keys and enrolls its own devices. Preserve the VAPID keys when moving the same installation; replacing them requires phones to subscribe again. The installer never packages these runtime files. Existing legacy API token support remains available; phone pairing does not require sharing that token.

There is no publisher account, shared access token, publisher server connection, analytics, or automatic diagnostic upload in this add-on. Remote setup configures the installing PC's own hostname. Push delivery uses the recipient's browser push endpoint and locally generated keys. See [security and privacy](SECURITY.md) for boundaries and the public release audit.

## Update, uninstall, and recovery

Stop Claw before changing installed sources. Keep the add-on version you installed until removal is complete.

```sh
node bin/claw-mobile-remote.mjs doctor --target ../claw-empire
node bin/claw-mobile-remote.mjs uninstall --target ../claw-empire --dry-run
node bin/claw-mobile-remote.mjs uninstall --target ../claw-empire
```

Uninstall restores original source/package/lockfile bytes only when installed files have not changed since installation. If you edited those files, it stops rather than discarding your work. See [manual recovery](docs/installer.md) to compare your changes with the saved originals. Reinstall dependencies and rebuild after removal. For an add-on update, remove the old version before installing a compatible new release.

Remote `.env` changes and Tailscale Serve are deliberately separate from source uninstall. To disable this mapping, run `tailscale serve --https=443 off` on the PC. Restore the appropriate private `.env.mobile-backup-*` only after comparing any newer settings. Device databases and push keys are retained; removing source code is not a device-data deletion tool.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Private address will not open | Both devices are connected to the same authorized tailnet; PC awake; Claw running; Serve approval complete; local port matches. Run `tailscale status` and `tailscale serve status` locally. |
| Pairing rejected/expired | Create a new code on the PC, use private HTTPS, check the clock and exact allowed origin, and pair the installed app if browser storage differs. |
| Notifications unavailable on iPhone | Use the Home Screen app on iOS 16.4+, grant permission after tapping Enable, and check OS notification/Focus settings. |
| `push_delivery_failed` / Apple JWT failure | Set `CLAW_PUSH_SUBJECT` to your own real HTTPS origin using the helper, restart Claw, then retry. Avoid placeholder localhost subjects. |
| Subscription no longer works after moving Claw | Preserve signing keys or disable/re-enable notifications to resubscribe. Revoked/expired devices must pair again. |
| Old mobile UI persists | Rebuild, restart, close/reopen the installed app, and reload. The service worker does not cache authenticated API responses. |
| Installer reports conflict/version mismatch | Keep your checkout intact. Use the tested upstream version or review and port the overlay; do not bypass the check with a forced patch. |
| Dependency install failed | Installer attempts rollback and retains recovery evidence if rollback cannot complete. Restore dependency installation before restarting; see installer docs. |

## Development and verification

```sh
node --test test/*.test.mjs
node --check bin/configure-remote.mjs
```

The payload is an inspectable Git binary patch plus a SHA-256 manifest. [Validation notes](docs/VALIDATION.md) record the tested baseline, phone checks, and installation round trip. This release is a source integration, not an upstream-supported plugin API; review the patch before installing in a heavily customized checkout.

Licensed under Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Claw-Empire and Tailscale retain their respective names and ownership. This add-on is not an official release of either project.
