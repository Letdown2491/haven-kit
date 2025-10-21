# Development Notes

## Before Publishing to Umbrel App Store

### Required Assets

1. **Icon** - Create `icon.svg` (512x512px recommended)
   - Should be a clean, recognizable icon for Haven
   - Place in the root directory

2. **Gallery Screenshots** - Create 3 screenshots:
   - `1.jpg` - Main configuration interface
   - `2.jpg` - Relay configuration screen
   - `3.jpg` - Status/monitoring view
   - Recommended size: 1920x1080px
   - Place in root directory

### Testing Checklist

- [ ] Build both Docker images successfully
- [ ] Config UI loads and displays properly
- [ ] Environment variables can be edited and saved
- [ ] Relay configurations (blastr/import) can be managed
- [ ] Haven relay starts with default configuration
- [ ] Restart functionality works
- [ ] Status indicator updates correctly
- [ ] Data persists across container restarts
- [ ] S3 backup configuration works (if enabled)
- [ ] All four relay endpoints are accessible
- [ ] Blossom media server responds

### Local Testing

```bash
# Set APP_DATA_DIR for local testing
export APP_DATA_DIR=./data

# Create required directories
mkdir -p data/config data/blossom data/db data/templates

# Build and start
docker-compose build
docker-compose up -d

# Watch logs
docker-compose logs -f

# Access UI
open http://localhost:8080

# Test relay
# Use a Nostr client to connect to ws://localhost:3355
```

### Environment Variable Validation

The Flask app should validate:
- `DB_ENGINE` is either 'badger' or 'lmdb'
- `LMDB_MAPSIZE` is a positive integer
- `BACKUP_PROVIDER` is either 's3' or 'none'
- S3 credentials are present if BACKUP_PROVIDER=s3
- Relay URLs start with wss:// or ws://

### Security Considerations

1. **Docker Socket Access**: The config UI needs Docker socket access to restart containers
   - This is necessary but should be documented as a security consideration
   - In Umbrel's environment, this should be properly sandboxed

2. **File Permissions**: Ensure config files are only writable by the container user

3. **Input Validation**: The Flask app validates JSON structure for relay files

### Known Limitations

1. **Container Name Hardcoding**: The restart function uses `haven_relay_1` as container name
   - Umbrel may use different naming conventions
   - May need to adjust based on actual Umbrel deployment

2. **First-time Setup**: Users need to configure at minimum:
   - No relay URLs required initially (empty arrays are valid)
   - Default .env should work out of the box

### Potential Improvements

- [ ] Add validation feedback in real-time
- [ ] Add "Test Connection" button for relays
- [ ] Show relay statistics/connection counts
- [ ] Add backup/restore functionality for configurations
- [ ] Add dark mode toggle
- [ ] Show disk usage for database
- [ ] Add log viewer in UI
- [ ] Add npub/nsec configuration helper

### Umbrel-Specific Notes

- Port 8080 for config UI should be configurable via `${APP_HAVEN_CONFIG_UI_PORT}`
- Port 3355 for relay is standard but could be made configurable
- The `${APP_DATA_DIR}` variable is provided by Umbrel
- The `${APP_HAVEN_IP}` variable is provided by Umbrel for exports.sh

### Submission to Umbrel App Store

1. Fork the [umbrel-apps repository](https://github.com/getumbrel/umbrel-apps)
2. Create a new directory: `umbrel-apps/haven/`
3. Copy all files from this repo to that directory
4. Test locally using Umbrel's testing framework
5. Submit a pull request with:
   - Clear description of the app
   - Screenshots
   - Testing evidence
   - Any special requirements or considerations

### Next Steps

1. Test the complete setup locally
2. Create proper icon and screenshots
3. Fine-tune the UI based on testing feedback
4. Add any missing error handling
5. Document any Umbrel-specific configuration needs
6. Submit to Umbrel App Store
