#!/bin/sh
# Wrapper entrypoint that keeps Haven's runtime .env in sync with the
# shared configuration volume before starting the relay.

set -e

CONFIG_ENV="/haven-config/.env"
TARGET_ENV="/haven/.env"

# Copy and load the latest configuration if it exists in the shared volume.
sync_config() {
    if [ -f "$CONFIG_ENV" ]; then
        # Ensure the target directory exists (it will, but this is harmless).
        mkdir -p "$(dirname "$TARGET_ENV")"
        cp "$CONFIG_ENV" "$TARGET_ENV"

        # Haven expects RELAY_URL to be a bare hostname (it prepends wss:// and
        # https:// itself), so strip any scheme or trailing path that a
        # hand-edited config may contain - otherwise Blossom media URLs come out
        # malformed (https://wss://...).
        sed -E -i \
            -e 's|^(RELAY_URL="?)[a-zA-Z][a-zA-Z0-9+.-]*://|\1|' \
            -e 's|^(RELAY_URL="?[^"/ ]+)/[^"]*|\1|' \
            "$TARGET_ENV"

        # Export all variables from the configuration so they override any stale
        # environment values that may have been baked into the container.
        set -a
        # shellcheck disable=SC1090
        . "$TARGET_ENV"
        set +a
    else
        # Guarantee the relay still has an .env file to read.
        touch "$TARGET_ENV"
    fi
}

# Haven panics on a missing or invalid npub (owner and all four per-relay
# npubs are required), so a fresh, unconfigured install would crash-loop. A
# shape check ("npub1" + 58 bech32 chars) is not enough on its own: a
# mistyped-but-well-formed npub passes it yet has a bad bech32 checksum, which
# still makes Haven panic. So verify the actual BIP-173 checksum here as a
# backstop for hand-edited config. Keep in sync with is_valid_npub() in
# config-ui/app.py and isValidNpub() in config-ui/static/script.js.
#
# BECH32_CHARSET maps each data char to its 5-bit value; the polymod is run
# over hrp_expand("npub") + data and must equal 1 for a valid checksum.
# hrp_expand("npub") is constant, precomputed here: high bits (n,p,u,b >> 5),
# separator 0, then low bits (n,p,u,b & 31).
BECH32_CHARSET="qpzry9x8gf2tvdw0s3jn54khce6mua7l"
NPUB_HRP_EXPAND="3 3 3 3 0 14 16 21 2"

# One bech32 polymod round for value $1; updates the running checksum _chk.
# Uses POSIX shell arithmetic (busybox ash supports ^, &, |, <<, >>).
_polymod_step() {
    _top=$(( _chk >> 25 ))
    _chk=$(( ((_chk & 0x1ffffff) << 5) ^ $1 ))
    [ $(( (_top >> 0) & 1 )) -eq 1 ] && _chk=$(( _chk ^ 0x3b6a57b2 ))
    [ $(( (_top >> 1) & 1 )) -eq 1 ] && _chk=$(( _chk ^ 0x26508e6d ))
    [ $(( (_top >> 2) & 1 )) -eq 1 ] && _chk=$(( _chk ^ 0x1ea119fa ))
    [ $(( (_top >> 3) & 1 )) -eq 1 ] && _chk=$(( _chk ^ 0x3d4233dd ))
    [ $(( (_top >> 4) & 1 )) -eq 1 ] && _chk=$(( _chk ^ 0x2a1462b3 ))
    return 0
}

# Return 0 only if $1 is a lowercase npub with a verifying bech32 checksum.
is_valid_npub() {
    _np=$1
    case $_np in npub1*) ;; *) return 1 ;; esac
    [ "${#_np}" -eq 63 ] || return 1
    [ "$_np" = "$(printf '%s' "$_np" | tr 'A-Z' 'a-z')" ] || return 1  # reject any uppercase

    _chk=1
    for _v in $NPUB_HRP_EXPAND; do
        _polymod_step "$_v"
    done

    _rest=${_np#npub1}   # the 58 data characters (52 payload + 6 checksum)
    while [ -n "$_rest" ]; do
        _ch=${_rest%"${_rest#?}"}   # first character
        _rest=${_rest#?}            # drop it
        _pre=${BECH32_CHARSET%%"$_ch"*}
        [ "$_pre" = "$BECH32_CHARSET" ] && return 1   # char not in bech32 charset
        _polymod_step "${#_pre}"
    done

    [ "$_chk" -eq 1 ]
}

is_configured() {
    for npub in "${OWNER_NPUB:-}" "${PRIVATE_RELAY_NPUB:-}" "${CHAT_RELAY_NPUB:-}" \
                "${OUTBOX_RELAY_NPUB:-}" "${INBOX_RELAY_NPUB:-}"; do
        is_valid_npub "$npub" || return 1
    done
}

sync_config

if ! is_configured; then
    echo "HAVEN is not configured yet: one or more npub settings are missing or still placeholders."
    echo "Open the Haven Kit app and complete the setup wizard - the relay will start automatically once configured."
    while ! is_configured; do
        sleep 5
        sync_config
    done
    echo "Configuration detected - starting HAVEN."
fi

exec "$@"
