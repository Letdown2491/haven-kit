#!/bin/sh
# Wrapper entrypoint that keeps Haven's runtime .env in sync with the
# shared configuration volume before starting the relay.

set -e

CONFIG_ENV="/haven-config/.env"
TARGET_ENV="/haven/.env"

# Copy and load the latest configuration if it exists in the shared volume.
if [ -f "$CONFIG_ENV" ]; then
    # Ensure the target directory exists (it will, but this is harmless).
    mkdir -p "$(dirname "$TARGET_ENV")"
    cp "$CONFIG_ENV" "$TARGET_ENV"

    # Export all variables from the configuration so they override any stale
    # environment values that may have been baked into the container.
    set -a
    # shellcheck disable=SC1090
    . "$CONFIG_ENV"
    set +a
else
    # Guarantee the relay still has an .env file to read.
    touch "$TARGET_ENV"
fi

exec "$@"
