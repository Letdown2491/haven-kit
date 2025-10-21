#!/bin/bash

# Export environment variables for inter-app communication
export APP_HAVEN_CONFIG_UI_PORT=8080
export APP_HAVEN_RELAY_PORT=3355

# Export relay WebSocket endpoints for other apps to connect
export APP_HAVEN_OUTBOX_RELAY="ws://${APP_HAVEN_IP}:${APP_HAVEN_RELAY_PORT}"
export APP_HAVEN_PRIVATE_RELAY="ws://${APP_HAVEN_IP}:${APP_HAVEN_RELAY_PORT}/private"
export APP_HAVEN_CHAT_RELAY="ws://${APP_HAVEN_IP}:${APP_HAVEN_RELAY_PORT}/chat"
export APP_HAVEN_INBOX_RELAY="ws://${APP_HAVEN_IP}:${APP_HAVEN_RELAY_PORT}/inbox"

# Export Blossom media server URL
export APP_HAVEN_BLOSSOM_SERVER="http://${APP_HAVEN_IP}:${APP_HAVEN_RELAY_PORT}"
