# Build haven from source
FROM golang:alpine AS builder

# Install build dependencies
RUN apk add --no-cache git build-base

# Set working directory
WORKDIR /build

# Clone haven repository
ARG HAVEN_VERSION=master
RUN git clone https://github.com/bitvora/haven.git . && \
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

# Create directories for data
RUN mkdir -p /haven/blossom /haven/db

# Expose the relay port
EXPOSE 3355

# Run haven
CMD ["/haven/haven"]
