# v1.0.0 — Claw Mobile Remote

Portable mobile UI, fullscreen office controls, local device pairing, private Tailscale HTTPS setup, and browser push notifications for Claw-Empire 2.0.4.

- Reversible installer with compatibility checks, dependency merging, backups, rollback, and guarded removal.
- Detailed PC/iPhone setup, device revocation, notification troubleshooting, and recovery guide.
- Keeps upstream themes, agent roster, office art, and desktop features.
- No account credentials, database, device keys, or machine-specific network settings included.

Validation: 13 package tests, 98 frontend tests, 220 backend tests, production build, touch/viewport checks, and real source/archive install-remove round trips passed on Windows with Node 24. See `docs/VALIDATION.md` for scope and limitations.

Download the `.tgz` asset and extract it, or clone/fork this public repository. Start with `README.md`; run `node bin/claw-mobile-remote.mjs doctor --target <your-claw-checkout>` before installation. The SHA-256 checksum file covers the release archive. No account is needed to download it.

Tested baseline: upstream commit `66a24ea7df2435ef897c48c147deb7ec572c01c2`. Future Claw versions require compatibility validation. Each recipient supplies their own Claw accounts, Tailscale login, and device pairing.
