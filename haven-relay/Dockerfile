# Build haven from source
FROM golang:alpine AS builder

# Install build dependencies
RUN apk add --no-cache git build-base

# Set working directory
WORKDIR /build

# Clone haven repository (pinned for reproducible builds).
# Currently pinned to a commit = v1.2.2 + the .onion relay URL prefix fix
# (barrydeen/haven#125); move back to a release tag once upstream tags it.
ARG HAVEN_VERSION=c8b61d22902ce057b64a8ee2b487ab5d0a7fbd23
RUN git clone https://github.com/barrydeen/haven.git . && \
    git checkout ${HAVEN_VERSION}

# Build the binary
RUN go mod download && \
    CGO_ENABLED=1 go build -o haven .

# Final stage - minimal runtime image
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create app directory
WORKDIR /haven

# Copy binary from builder
COPY --from=builder /build/haven /haven/haven

# Copy templates (if they exist in the repo)
COPY --from=builder /build/templates /haven/templates

# Copy entrypoint script that syncs configuration before startup
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create directories for data
RUN mkdir -p /haven/blossom /haven/db

# Expose the relay port
EXPOSE 3355

# Run haven via wrapper entrypoint so configuration is refreshed each time
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/haven/haven"]
