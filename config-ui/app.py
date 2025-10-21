#!/usr/bin/env python3
import os
import json
import subprocess
import threading
import time
import queue
from pathlib import Path
from flask import Flask, render_template, request, jsonify, Response

app = Flask(__name__)

# Paths to configuration files (shared volume with haven container)
CONFIG_DIR = Path("/haven-config")
ENV_FILE = CONFIG_DIR / ".env"
RELAYS_BLASTR_FILE = CONFIG_DIR / "relays_blastr.json"
RELAYS_IMPORT_FILE = CONFIG_DIR / "relays_import.json"

# Detect container runtime (Docker or Podman) and use the appropriate CLI
def detect_container_runtime():
    """Detect container runtime based on environment or socket path"""
    # Check environment variable first
    runtime_env = os.getenv('CONTAINER_RUNTIME', '').lower()
    if runtime_env in ['docker', 'podman']:
        return runtime_env

    # Try to detect based on socket path
    socket_path = os.getenv('DOCKER_SOCK', '/var/run/docker.sock')
    if 'podman' in socket_path:
        return 'podman'

    # Default to docker
    return 'docker'

CONTAINER_RUNTIME = detect_container_runtime()
print(f"Detected container runtime: {CONTAINER_RUNTIME}", flush=True)

# Default configurations
DEFAULT_ENV = """# Owner Configuration (REQUIRED)
# Your Nostr public key (npub format)
# Get this from your Nostr client or generate one at https://nostr.how
OWNER_NPUB=npub1YOUR_PUBLIC_KEY_HERE

# Relay URL (REQUIRED)
# The public WebSocket URL where your relay can be accessed
# For local testing: ws://localhost:3355
# For production: wss://your-domain.com
RELAY_URL=ws://localhost:3355

# Database Configuration
DB_ENGINE=badger
# LMDB_MAPSIZE=273000000000

# Backup Configuration
BACKUP_PROVIDER=none
# BACKUP_INTERVAL_HOURS=24

# S3 Cloud Backup (optional)
# S3_ACCESS_KEY_ID=
# S3_SECRET_KEY=
# S3_ENDPOINT=
# S3_REGION=
# S3_BUCKET_NAME=

# Media Storage Path
BLOSSOM_PATH=/haven/blossom
"""

DEFAULT_RELAYS = []


def ensure_config_files():
    """Create default config files if they don't exist"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    if not ENV_FILE.exists():
        ENV_FILE.write_text(DEFAULT_ENV)

    if not RELAYS_BLASTR_FILE.exists():
        RELAYS_BLASTR_FILE.write_text(json.dumps(DEFAULT_RELAYS, indent=2))

    if not RELAYS_IMPORT_FILE.exists():
        RELAYS_IMPORT_FILE.write_text(json.dumps(DEFAULT_RELAYS, indent=2))


@app.route('/')
def index():
    """Serve the main configuration page"""
    ensure_config_files()
    return render_template('index.html')


@app.route('/api/config/env', methods=['GET'])
def get_env_config():
    """Get current .env configuration"""
    try:
        ensure_config_files()
        content = ENV_FILE.read_text()
        return jsonify({'success': True, 'content': content})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/config/env', methods=['POST'])
def save_env_config():
    """Save .env configuration"""
    try:
        data = request.get_json()
        content = data.get('content', '')
        ENV_FILE.write_text(content)
        return jsonify({'success': True, 'message': 'Environment configuration saved successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/config/relays/<relay_type>', methods=['GET'])
def get_relay_config(relay_type):
    """Get relay configuration (blastr or import)"""
    try:
        ensure_config_files()

        if relay_type == 'blastr':
            file_path = RELAYS_BLASTR_FILE
        elif relay_type == 'import':
            file_path = RELAYS_IMPORT_FILE
        else:
            return jsonify({'success': False, 'error': 'Invalid relay type'}), 400

        content = json.loads(file_path.read_text())
        return jsonify({'success': True, 'relays': content})
    except json.JSONDecodeError as e:
        return jsonify({'success': False, 'error': f'Invalid JSON: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/config/relays/<relay_type>', methods=['POST'])
def save_relay_config(relay_type):
    """Save relay configuration (blastr or import)"""
    try:
        data = request.get_json()
        relays = data.get('relays', [])

        if relay_type == 'blastr':
            file_path = RELAYS_BLASTR_FILE
        elif relay_type == 'import':
            file_path = RELAYS_IMPORT_FILE
        else:
            return jsonify({'success': False, 'error': 'Invalid relay type'}), 400

        # Validate it's a list
        if not isinstance(relays, list):
            return jsonify({'success': False, 'error': 'Relays must be an array'}), 400

        # Write JSON with proper formatting
        file_path.write_text(json.dumps(relays, indent=2))

        return jsonify({'success': True, 'message': f'Relay {relay_type} configuration saved successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/restart', methods=['POST'])
def restart_haven():
    """Restart the haven relay container"""
    try:
        # Use detected container runtime
        result = subprocess.run(
            [CONTAINER_RUNTIME, 'restart', 'haven_relay_1'],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            return jsonify({'success': True, 'message': 'Haven relay restarted successfully'})
        else:
            return jsonify({'success': False, 'error': result.stderr}), 500
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'error': 'Restart command timed out'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/status', methods=['GET'])
def get_status():
    """Get haven relay status"""
    try:
        # Use detected container runtime
        result = subprocess.run(
            [CONTAINER_RUNTIME, 'inspect', '-f', '{{.State.Status}}', 'haven_relay_1'],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode == 0:
            status = result.stdout.strip()
            return jsonify({'success': True, 'status': status, 'running': status == 'running'})
        else:
            return jsonify({'success': False, 'error': 'Could not get status'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# Import state management
import_status = {'status': 'idle', 'message': ''}
import_log_queue = queue.Queue()


@app.route('/api/import/info', methods=['GET'])
def get_import_info():
    """Get import configuration information"""
    try:
        ensure_config_files()

        # Read import relays
        relays = json.loads(RELAYS_IMPORT_FILE.read_text())
        relay_count = len(relays)

        # Read import start date from .env
        env_content = ENV_FILE.read_text()
        import_start_date = None
        for line in env_content.split('\n'):
            if line.strip().startswith('IMPORT_START_DATE='):
                import_start_date = line.split('=', 1)[1].strip()
                break

        return jsonify({
            'success': True,
            'relay_count': relay_count,
            'import_start_date': import_start_date or 'Not set',
            'status': import_status['status'],
            'message': import_status['message']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def run_import_process():
    """Background thread to run the import process"""
    global import_status

    try:
        print("run_import_process: Function started", flush=True)
        import_status = {'status': 'running', 'message': 'Starting import...'}
        import_log_queue.put({'type': 'info', 'message': 'Starting import process...'})

        # Use detected container runtime
        runtime_cmd = CONTAINER_RUNTIME
        print(f"run_import_process: Using runtime {runtime_cmd}", flush=True)
        import_log_queue.put({'type': 'info', 'message': f'Using container runtime: {runtime_cmd}'})

        # Step 1: Stop the relay
        import_log_queue.put({'type': 'info', 'message': 'Stopping HAVEN relay...'})
        stop_result = subprocess.run(
            [runtime_cmd, 'stop', 'haven_relay_1'],
            capture_output=True,
            text=True,
            timeout=30
        )

        if stop_result.returncode != 0:
            raise Exception(f'Failed to stop relay: {stop_result.stderr}')

        import_log_queue.put({'type': 'success', 'message': 'HAVEN relay stopped'})
        time.sleep(2)

        # Step 2: Run import using podman run (creates sibling container)
        import_log_queue.put({'type': 'info', 'message': 'Running haven --import...'})
        import_log_queue.put({'type': 'info', 'message': 'This may take several minutes...'})

        # Get APP_DATA_DIR from environment and resolve to absolute path
        app_data_dir = os.getenv('APP_DATA_DIR', '/var/home/martin/Projects/haven-kit/data')
        # If it's a relative path, convert relative to /var/home/martin/Projects/haven-kit
        if not os.path.isabs(app_data_dir):
            app_data_dir = os.path.abspath(os.path.join('/var/home/martin/Projects/haven-kit', app_data_dir))

        # Read environment variables from .env file (accessible via mounted volume)
        env_args = []
        env_file_path = '/haven-config/.env'
        if Path(env_file_path).exists():
            with open(env_file_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        # Split on first = only
                        key, value = line.split('=', 1)
                        # Strip quotes from value if present
                        value = value.strip('"').strip("'")
                        env_args.extend(['-e', f'{key}={value}'])

        # Use podman run to create a temporary container for import
        # This works because it creates a sibling container, not a nested one
        cmd = [
            runtime_cmd, 'run', '--rm',
            '-v', f'{app_data_dir}/config:/haven-config:z',
            '-v', f'{app_data_dir}/blossom:/haven/blossom:z',
            '-v', f'{app_data_dir}/db:/haven/db:z',
            '--network', 'haven-kit_haven_network',
        ]
        cmd.extend(env_args)
        cmd.extend([
            'localhost/haven-kit_haven_relay:latest',
            '/haven/haven', '--import'
        ])

        # Debug: Log the full command (first 20 args)
        cmd_preview = ' '.join(cmd[:20])
        print(f"Running import command: {cmd_preview}...", flush=True)
        print(f"app_data_dir resolved to: {app_data_dir}", flush=True)
        import_log_queue.put({'type': 'info', 'message': f'Executing import with {len(env_args)//2} environment variables'})
        import_log_queue.put({'type': 'info', 'message': f'Data directory: {app_data_dir}'})

        import_result = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        print(f"Import subprocess started with PID {import_result.pid}", flush=True)

        # Stream output
        for line in import_result.stdout:
            line = line.strip()
            if line:
                print(f"Import output: {line}", flush=True)  # Debug logging
                import_log_queue.put({'type': 'info', 'message': line})

        import_result.wait(timeout=600)  # 10 minute timeout

        if import_result.returncode != 0:
            error_msg = f'Import command failed with code {import_result.returncode}'
            print(f"Import error: {error_msg}", flush=True)  # Debug logging
            raise Exception(error_msg)

        import_log_queue.put({'type': 'success', 'message': 'Import completed successfully'})
        time.sleep(1)

        # Step 3: Restart the relay
        import_log_queue.put({'type': 'info', 'message': 'Starting HAVEN relay...'})
        start_result = subprocess.run(
            [runtime_cmd, 'start', 'haven_relay_1'],
            capture_output=True,
            text=True,
            timeout=30
        )

        if start_result.returncode != 0:
            raise Exception(f'Failed to start relay: {start_result.stderr}')

        import_log_queue.put({'type': 'success', 'message': 'HAVEN relay started'})
        import_log_queue.put({'type': 'success', 'message': '✓ Import process completed successfully!'})

        import_status = {'status': 'completed', 'message': 'Import completed successfully'}

    except subprocess.TimeoutExpired:
        error_msg = 'Import process timed out'
        import_log_queue.put({'type': 'error', 'message': error_msg})
        import_status = {'status': 'failed', 'message': error_msg}

        # Try to restart relay
        try:
            subprocess.run([CONTAINER_RUNTIME, 'start', 'haven_relay_1'], timeout=30)
        except:
            pass

    except Exception as e:
        error_msg = f'Import failed: {str(e)}'
        import_log_queue.put({'type': 'error', 'message': error_msg})
        import_status = {'status': 'failed', 'message': str(e)}

        # Try to restart relay
        try:
            subprocess.run([CONTAINER_RUNTIME, 'start', 'haven_relay_1'], timeout=30)
            import_log_queue.put({'type': 'warning', 'message': 'HAVEN relay restarted after error'})
        except:
            import_log_queue.put({'type': 'error', 'message': 'Failed to restart HAVEN relay'})


@app.route('/api/import/run', methods=['POST'])
def run_import():
    """Trigger the import process"""
    global import_status

    if import_status['status'] == 'running':
        return jsonify({'success': False, 'error': 'Import is already running'}), 400

    # Clear the log queue
    while not import_log_queue.empty():
        try:
            import_log_queue.get_nowait()
        except queue.Empty:
            break

    # Start import in background thread
    thread = threading.Thread(target=run_import_process, daemon=True)
    thread.start()

    return jsonify({'success': True, 'message': 'Import started'})


@app.route('/api/import/stream')
def import_stream():
    """Stream import logs using Server-Sent Events"""
    def generate():
        # Send initial status
        yield f"data: {json.dumps({'type': 'status', 'status': import_status['status']})}\n\n"

        # Stream logs
        while True:
            try:
                # Wait for new log with timeout
                log = import_log_queue.get(timeout=1)
                yield f"data: {json.dumps(log)}\n\n"

                # If import is completed or failed, send final status and end stream
                if import_status['status'] in ['completed', 'failed']:
                    time.sleep(0.5)
                    yield f"data: {json.dumps({'type': 'status', 'status': import_status['status']})}\n\n"
                    break

            except queue.Empty:
                # Send heartbeat to keep connection alive
                yield f": heartbeat\n\n"

                # If not running, end stream
                if import_status['status'] != 'running':
                    break

    return Response(generate(), mimetype='text/event-stream')


if __name__ == '__main__':
    ensure_config_files()
    app.run(host='0.0.0.0', port=8080, debug=False)
