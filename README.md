# HAVEN Kit

Simple configuration tool to set up a HAVEN Nostr relay with Docker or Podman with just a few clicks.

## What is Haven?

Haven (High Availability Vault for Events on Nostr) is designed for storing and backing up sensitive notes like eCash, private chats, and drafts.

### Four Relays + Media Server

Haven operates as four specialized relays in one application:

1. **Private Relay** - Restricted to the owner for drafts and sensitive content
2. **Chat Relay** - For direct messages with web-of-trust filtering
3. **Inbox Relay** - Aggregates notes where the owner is mentioned
4. **Outbox Relay** - Publicly accessible storage for owner's posts
5. **Blossom Media Server** - Hosts images and videos for sharing

## Features

- **Simple & Full Configuration Modes** - Choose quick setup or advanced customization
- Web-based configuration interface (no CLI needed)
- Direct .env file editing for advanced users
- Optional relay configuration for:
  - **Blastr relays**: Publish your outbox notes to additional relays
  - **Import relays**: Import your historical notes and tagged content
- One-click note import from configured relays
- One-click restart functionality
- Real-time status monitoring
- BadgerDB or LMDB database support
- Optional S3-compatible cloud backups
- Docker and Podman support

## Installation on Umbrel

### Option 1: Through Umbrel App Store (Coming Soon)
1. Open your Umbrel dashboard
2. Navigate to the App Store
3. Search for "Haven"
4. Click Install

### Option 2: Manual Installation
1. Clone this repository into your Umbrel apps directory:
   ```bash
   cd ~/umbrel/apps
   git clone <this-repo-url> haven
   ```

2. Install the app:
   ```bash
   cd ~/umbrel
   ./scripts/app install haven
   ```

## Configuration

After installation, access the Haven configuration UI through your Umbrel dashboard.

### Environment Variables (.env)

Configure the following settings through the web interface:

#### Database Settings
- `DB_ENGINE` - Choose between `badger` (default) or `lmdb`
- `LMDB_MAPSIZE` - Maximum database size in bytes (default: 273000000000 / 273GB)

#### Backup Configuration
- `BACKUP_PROVIDER` - Set to `s3` for cloud backups or `none` to disable
- `BACKUP_INTERVAL_HOURS` - How often to backup (default: 24)

#### S3 Cloud Backup (Optional)
- `S3_ACCESS_KEY_ID` - Your S3-compatible storage access key
- `S3_SECRET_KEY` - Your S3-compatible storage secret key
- `S3_ENDPOINT` - Storage provider endpoint URL
- `S3_REGION` - Geographic region for your bucket
- `S3_BUCKET_NAME` - Name of your storage bucket

#### Media Storage
- `BLOSSOM_PATH` - Directory for media files (default: /haven/blossom)

### Relay Configuration

#### Blastr Relays (relays_blastr.json)
Add relay URLs where your outbox posts will be automatically broadcasted. This helps distribute your content across the Nostr network.

Example:
```json
[
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol"
]
```

#### Import Relays (relays_import.json)
Add relay URLs from which Haven should import your old notes and tagged content.

Example:
```json
[
  "wss://relay.damus.io",
  "wss://nostr.wine"
]
```

## Accessing Your Relays

After configuration, your relays will be available at:

- **Outbox Relay**: `ws://[umbrel-ip]:3355`
- **Private Relay**: `ws://[umbrel-ip]:3355/private`
- **Chat Relay**: `ws://[umbrel-ip]:3355/chat`
- **Inbox Relay**: `ws://[umbrel-ip]:3355/inbox`
- **Blossom Media Server**: `http://[umbrel-ip]:3355`

## Architecture

This Umbrel app consists of two services:

1. **haven_relay** - The Haven relay server (port 3355)
2. **config_ui** - Web-based configuration interface (port 8080)

### File Structure

```
haven-kit/
├── docker-compose.yml          # Orchestrates both services
├── umbrel-app.yml              # Umbrel app manifest
├── exports.sh                  # Environment variable exports
├── haven-relay/
│   └── Dockerfile              # Builds Haven from source
├── config-ui/
│   ├── Dockerfile              # Flask web UI container
│   ├── app.py                  # Configuration backend
│   ├── requirements.txt        # Python dependencies
│   ├── templates/
│   │   └── index.html          # Web interface
│   └── static/
│       ├── style.css           # Styling
│       └── script.js           # Client-side logic
└── data/                       # Persistent data (created at runtime)
    ├── config/                 # Configuration files
    ├── blossom/                # Media storage
    ├── db/                     # Database files
    └── templates/              # Custom templates
```

## Data Persistence

All Haven data is stored in volumes managed by Umbrel:
- Configuration files: `${APP_DATA_DIR}/config/`
- Database: `${APP_DATA_DIR}/db/`
- Media files: `${APP_DATA_DIR}/blossom/`
- Templates: `${APP_DATA_DIR}/templates/`

Your data persists across container restarts and app updates.

## Development or Running Local Instance

### Building Locally

The project supports both Docker and Podman. The configuration UI automatically detects which container runtime you're using.

#### Quick Setup (Recommended)

Use the provided setup script to automatically configure your environment:

```bash
# Run the setup script
./setup-env.sh

# The script will:
# - Detect Docker or Podman
# - Set up the correct socket path
# - Create necessary directories
# - Generate .env file

# Then start the services
docker-compose up -d   # for Docker
# OR
podman-compose up -d   # for Podman
```

#### Using Docker

```bash
# Build both services
docker-compose build

# Start the services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the services
docker-compose down
```

#### Using Podman

```bash
# Set the socket path environment variable
export DOCKER_SOCK=/run/user/$UID/podman/podman.sock

# Or for rootful Podman:
# export DOCKER_SOCK=/run/podman/podman.sock

# Build both services
podman-compose build

# Start the services
podman-compose up -d

# View logs
podman-compose logs -f

# Stop the services
podman-compose down
```

**Note**: The config UI will automatically detect whether you're using Docker or Podman and use the appropriate commands for container management (restart, status checks, etc.).

### Updating Haven Version

To use a specific version of Haven, edit `haven-relay/Dockerfile` and change the `HAVEN_VERSION` argument:

```dockerfile
ARG HAVEN_VERSION=v1.2.3  # Change to desired version/tag
```

## Troubleshooting

### Haven won't start
- Check the configuration UI for status
- Review logs: `docker-compose logs haven_relay`
- Ensure `.env` file has valid configuration
- Check database size doesn't exceed available disk space

### Configuration UI not accessible
- Verify port 8080 is not in use
- Check logs: `docker-compose logs config_ui` or `podman-compose logs config_ui`
- Ensure Docker/Podman socket is accessible
- For Podman users: Set `DOCKER_SOCK` environment variable to your Podman socket path
  - Rootless Podman: `export DOCKER_SOCK=/run/user/$UID/podman/podman.sock`
  - Rootful Podman: `export DOCKER_SOCK=/run/podman/podman.sock`

### Relay not accepting connections
- Verify port 3355 is exposed correctly
- Check firewall settings on your Umbrel
- Review Haven logs for authentication/configuration issues

## Support

- HAVEN Kit: https://github.com/Letdown2491/haven-kit
- HAVEN Project: https://github.com/bitvora/haven
- Umbrel Community: https://community.umbrel.com
- Issues: https://github.com/Letdown2491/haven-kit/issues

## License

- **HAVEN Kit** is licensed under the MIT License. See [LICENSE](LICENSE) file for details.
- **HAVEN Project** is licensed under the MIT License by Bitvora.

## Credits

- **Haven Project**: Created by [Bitvora](https://github.com/bitvora)
- **HAVEN Kit Configuration Tool**: Created by the HAVEN Kit contributors
