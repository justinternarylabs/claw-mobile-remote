# Release 1.0.0 validation

## Camera correction in 1.0.1

Added full-screen vertical camera gutters and viewport resize tracking. The avatar stays at the 45% height anchor at both world boundaries and follows immediately when leaving an edge. Checks cover 390×844 and 430×932 portrait, 844×390 landscape, 320×568 narrow portrait, and height-only resizing. The tall portrait case has a map shorter than its viewport. The correction was applied to both the customized running installation and the portable upstream overlay. Package tests, affected mobile component tests, production builds, and installer/removal checks were repeated; backend source is unchanged.

The following records the broader original release validation.

Baseline: official Claw-Empire 2.0.4, commit `66a24ea7df2435ef897c48c147deb7ec572c01c2`.

Environment: Windows, Node 24.16, pnpm via Corepack. The source extraction and the installation check used separate fresh upstream checkouts. No personalized theme, agent roster, CLI integration, provider credentials, production database, or private network configuration was used.

## Automated checks

- Package: 13 passing tests covering reversible installation, preservation of patch-compatible changes, collision rejection, dependency/write rollback, guarded removal, symlink/traversal rejection, environment preservation, dry runs, and private Serve conflict checks.
- Actual installer: doctor and dry run, real source/dependency installation, repeat-install idempotence, production build, backend type checking, and uninstall returning the clean checkout to its original tracked state.
- Installed Claw frontend: 31 test files, **98 tests passed**.
- Installed Claw backend: 48 test files, **220 tests passed**, including pairing, device sessions, CSRF/origin checks, push validation, expiry, and revocation.
- Production build passed. Vite's existing large-chunk warning remains; it is not a build failure.
- Release tarball contents and the packed CLI were checked separately. Source manifest includes SHA-256 hashes and the complete patch hash.

## Browser checks on the isolated native Claw installation

Headless Chromium mobile emulation at 320 px, 390 px, and 844 px landscape showed no page errors or horizontal page overflow. The 390 × 844 full-screen office filled the viewport; interaction and movement controls remained within its bounds with at least 44 px targets. A real emulated touch held for 1.1 seconds stayed active, cleared on release, and selected no text. Return and browser Back both left game mode.

Native Claw agents, office artwork, themes, and desktop navigation were retained. Local pairing generation, manifest, service worker, and all icon routes were checked. The QR fragment flow is covered by tests.

## Limits of the validation

This release's Tailscale helper was tested using injected CLI responses without changing the publisher's existing network or `.env`. Every recipient must complete Tailscale login/HTTPS approval, pairing, and a real notification test on their own devices. The original feature was previously exercised on an iPhone, but the redistributed neutral package was not installed onto a second physical iPhone during this release test.

Tests do not guarantee future upstream compatibility, mobile browser behavior on every device, uninterrupted PC availability, push delivery timing, or macOS/Linux setup. Run doctor before installation and follow the per-device test in the README.
