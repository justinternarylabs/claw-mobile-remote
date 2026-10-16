# v1.0.1 — Mobile camera edge tracking

The full-screen office camera now follows the avatar all the way to the top and bottom of the world. Extra camera travel keeps it clear of the HUD and touch controls, including when the map is shorter than the viewport. Rotation and height-only viewport changes recenter without requiring another movement input.

The native upstream office, themes, and agent roster are retained. No personal runtime data is included.

Existing 1.0.0 users: stop Claw, use the original 1.0.0 CLI to uninstall, install 1.0.1, then rebuild/restart. Keep runtime data and remote settings. Modified installed files require manual reconciliation before removal.

Download the `.tgz` asset and extract it, or clone/fork this public repository. Start with `README.md`; run `node bin/claw-mobile-remote.mjs doctor --target <your-claw-checkout>` before installation. The SHA-256 checksum file covers the release archive. No account is needed to download it.

Tested baseline: upstream commit `66a24ea7df2435ef897c48c147deb7ec572c01c2`. Future Claw versions require compatibility validation. Each recipient supplies their own Claw accounts, Tailscale login, and device pairing.
