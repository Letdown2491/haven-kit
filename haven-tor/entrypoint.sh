#!/bin/sh
# Tor refuses to start unless its data and hidden service directories are
# owned by the tor user with mode 0700. Bind mounts arrive owned by the host
# user, so fix ownership here (we start as root; tor itself drops privileges
# via the `User tor` torrc directive).

set -e

TOR_DIR=/var/lib/tor
HS_DIR="$TOR_DIR/relay-hidden-service"

mkdir -p "$TOR_DIR/data" "$HS_DIR"
chown -R tor:tor "$TOR_DIR"
# The mount root stays traversable so other containers can read the copied
# hostname below; tor itself enforces 0700 on the directories it manages.
chmod 755 "$TOR_DIR"
chmod 700 "$TOR_DIR/data" "$HS_DIR"

# The onion hostname is not a secret, but it lives inside the 0700 hidden
# service directory where other containers (e.g. the config UI, which may not
# run as real root under rootless Podman) cannot read it. Copy it to a
# world-readable location once tor generates it.
(
    while [ ! -s "$HS_DIR/hostname" ]; do
        sleep 1
    done
    cp "$HS_DIR/hostname" "$TOR_DIR/hostname"
    chown tor:tor "$TOR_DIR/hostname"
    chmod 644 "$TOR_DIR/hostname"
) &

exec "$@"
