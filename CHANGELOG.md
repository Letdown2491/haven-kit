# Changelog

All notable changes to HAVEN Kit are documented here.

## [1.4.0] - Unreleased

### Added
- Dedicated Tor hidden service for the relay and Blossom media server on Umbrel ([#5](https://github.com/Letdown2491/haven-kit/issues/5)). The `.onion` address is shown in the configuration UI; the UI itself stays behind Umbrel's login. Replaces the previous nginx host-split proxy.
- Optional Tor hidden service for local/VPS installs via a compose overlay (`docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d`), backed by a new `haven-tor` image. The `.onion` address appears in the configuration UI; keys persist in `data/tor/`. Verified end-to-end on both Docker and rootless Podman.
- Clearer errors when the config UI and the running stack use different container engines (status now shows "Unknown" instead of "Stopped", restart failures explain the `DOCKER_SOCK`/`CONTAINER_RUNTIME` mismatch), and `setup-env.sh` accepts a `CONTAINER_RUNTIME` override when both engines are installed.
- First-boot configuration gate: on a fresh install the relay waits for the setup wizard instead of crash-looping, and starts automatically once a valid configuration is saved ([#6](https://github.com/Letdown2491/haven-kit/issues/6)). The dashboard shows "Awaiting configuration" (instead of "Stopped") while the relay is waiting.
- Owner name field in Full Configuration mode; previously only Simple mode asked for it, so full-mode setups silently kept the pre-existing `OWNER_USERNAME` ([#6](https://github.com/Letdown2491/haven-kit/issues/6)).
- `HAVEN_VERSION` can now be overridden per-build via the environment / root `.env` (wired through compose `build.args`).
- Clearnet LAN access to the relay on Umbrel (port 3355 is now actually published; previously only the UI was reachable).

### Fixed
- Blossom media downloads failed when `RELAY_URL` included a `ws://`/`wss://` scheme; the relay entrypoint now strips schemes and paths automatically on startup, and all templates/docs use bare hostnames ([#7](https://github.com/Letdown2491/haven-kit/issues/7)).
- Fresh installs no longer ship preconfigured with the maintainer's npub and relay lists; default templates are neutral placeholders ([#6](https://github.com/Letdown2491/haven-kit/issues/6)).

### Changed
- Haven is now built from a pinned upstream commit (v1.2.2 plus the `.onion` relay URL prefix fix, [barrydeen/haven#125](https://github.com/barrydeen/haven/pull/125)) instead of `master`, for reproducible builds. This also picks up upstream's pubkey whitelisting support.
- Upstream project links updated to the new repository location (`bitvora/haven` → `barrydeen/haven`).
- Local runtime config (`data/`) is no longer tracked in git.

## [1.3.3] - 2025-10-28

- Added relay URL to Get Started page; initial support for running the relay behind Tor on Umbrel.
- Added View Logs button to Get Started page; restart buttons on configuration and relays pages; version number in header.
- Display fixes across browsers and screen sizes.
- Sample Nginx configuration in README.
