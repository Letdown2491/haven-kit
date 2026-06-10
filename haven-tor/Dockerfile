# Minimal Tor sidecar that publishes the Haven relay as a hidden service.
# Used by the optional docker-compose.tor.yml overlay for local/VPS installs
# (Umbrel installs use Umbrel's own Tor instead).
FROM alpine:latest

RUN apk add --no-cache tor

# Default torrc; docker-compose.tor.yml bind-mounts the repo copy over this
# so it can be edited without rebuilding.
COPY torrc /etc/tor/torrc
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# SOCKS proxy (unused by Haven today; ready for upstream outbound-Tor support)
EXPOSE 9050

ENTRYPOINT ["/entrypoint.sh"]
CMD ["tor", "-f", "/etc/tor/torrc"]
