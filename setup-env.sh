#!/bin/bash
# Setup script for Haven Relay Umbrel App
# Supports both Docker and Podman

set -e

echo "Haven Relay - Environment Setup"
echo "================================"
echo ""

# Detect container runtime
if command -v podman &> /dev/null; then
    RUNTIME="podman"
    echo "✓ Detected: Podman"
elif command -v docker &> /dev/null; then
    RUNTIME="docker"
    echo "✓ Detected: Docker"
else
    echo "✗ Error: Neither Docker nor Podman found"
    echo "Please install Docker or Podman first"
    exit 1
fi

# Set up environment variables
export APP_DATA_DIR="${APP_DATA_DIR:-$(pwd)/data}"
echo "✓ Data directory: $APP_DATA_DIR"

# Set socket path for Podman
if [ "$RUNTIME" = "podman" ]; then
    if [ -S "/run/user/$UID/podman/podman.sock" ]; then
        export DOCKER_SOCK="/run/user/$UID/podman/podman.sock"
        echo "✓ Using rootless Podman socket: $DOCKER_SOCK"
    elif [ -S "/run/podman/podman.sock" ]; then
        export DOCKER_SOCK="/run/podman/podman.sock"
        echo "✓ Using rootful Podman socket: $DOCKER_SOCK"
    else
        echo "⚠ Warning: Podman socket not found. Starting Podman socket service..."
        systemctl --user enable --now podman.socket 2>/dev/null || true
        export DOCKER_SOCK="/run/user/$UID/podman/podman.sock"
        echo "✓ Podman socket: $DOCKER_SOCK"
    fi
else
    export DOCKER_SOCK="${DOCKER_SOCK:-/var/run/docker.sock}"
    echo "✓ Docker socket: $DOCKER_SOCK"
fi

# Create data directories
mkdir -p "$APP_DATA_DIR"/{config,blossom,db,templates}
echo "✓ Created data directories"

# Write environment to .env file for docker-compose
cat > .env <<EOF
APP_DATA_DIR=$APP_DATA_DIR
DOCKER_SOCK=$DOCKER_SOCK
CONTAINER_RUNTIME=$RUNTIME
APP_HAVEN_CONFIG_UI_PORT=8080
EOF

echo "✓ Created .env file"
echo ""
echo "Environment setup complete!"
echo ""
echo "Next steps:"
echo "  1. Build and start: ${RUNTIME}-compose up -d"
echo "  2. View logs: ${RUNTIME}-compose logs -f"
echo "  3. Access config UI: http://localhost:8080"
echo ""
