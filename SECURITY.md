# Security and privacy

This public repository distributes code, documentation, and an inspectable source patch. It does not grant access to the publisher's PC or include an operational shared service.

## Independent installations

- Every recipient runs their own Claw server and supplies their own provider accounts.
- The setup helper discovers the installing PC's own Tailscale hostname. No publisher hostname or network credential is embedded.
- Pairing codes, device sessions, browser push subscriptions, and VAPID signing keys are created locally for each installation.
- This add-on contains no publisher telemetry, analytics endpoint, automatic support upload, or publisher callback.
- Tailscale provides private networking; browser vendors provide push delivery. These external services have their own privacy policies. The underlying Claw application and configured AI providers also have their own data flows.
- GitHub receives only files you explicitly commit/push or upload. Runtime data is excluded from this distribution and ignored by the supplied source changes. Git ignore rules are not a substitute for reviewing your own commits.

## Protect your installation

Keep Serve private and Funnel disabled. Keep Claw bound to loopback behind the private HTTPS proxy. Pair only trusted devices; a paired phone has operator access. Revoke unwanted devices locally. Keep your OS, browser, Node, Tailscale, and Claw updated within tested compatibility limits.

Do not commit environment files, databases, log output, cookies, pairing codes, private network status dumps, or notification signing keys. Review your staged files before pushing a fork. Never place credentials in screenshots or public issues.

The helper makes a local environment backup before configuring remote access. Keep that backup private too. Removal of the source add-on does not delete runtime data or disable Serve automatically; follow the README's removal steps.

## Public release audit

Before public publication, the distributable source, complete public Git history, release archive file inventory/content, and checksum were reviewed for publisher-specific paths, machine/network addresses, private keys, credentials, device/session databases, environment backups, and personal author metadata.

The public repository starts with clean history using GitHub's noreply author identity. Earlier private history remains in a separate private archive and is not part of the public repository. Publicly identifying repository ownership by the GitHub username is intentional. Upstream copyright notices are retained as required by the license.

The release tarball is created from an explicit package allowlist. A SHA-256 checksum accompanies it. Source integrity and installer safety checks do not guarantee absence of all possible vulnerabilities; compatibility and functional test scope are documented in `docs/VALIDATION.md`.

## Reporting problems

For ordinary bugs, open an issue with a minimal sanitized reproduction. Do not post secrets or live installation identifiers. For a security vulnerability, use GitHub's private vulnerability reporting through the repository's Security tab when available. Include only the information needed to reproduce the problem using test data.
