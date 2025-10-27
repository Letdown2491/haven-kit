#!/usr/bin/env python3
import os
import json
import subprocess
import threading
import time
import queue
import signal
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

# Get container name with project prefix
def get_relay_container_name():
    """Get the full relay container name with project prefix"""
    # Check for explicit container name from environment (set by Umbrel or docker-compose)
    env_container_name = os.getenv('RELAY_CONTAINER_NAME', '')
    if env_container_name:
        return env_container_name

    # Fall back to compose project name logic for local development
    project_name = os.getenv('COMPOSE_PROJECT_NAME', '')
    if project_name:
        return f"{project_name}_haven_relay_1"
    return 'haven_relay_1'

RELAY_CONTAINER_NAME = get_relay_container_name()
print(f"Relay container name: {RELAY_CONTAINER_NAME}", flush=True)

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
            [CONTAINER_RUNTIME, 'restart', RELAY_CONTAINER_NAME],
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
        inspect_cmd = [
            CONTAINER_RUNTIME,
            'inspect',
            '-f',
            '{{json .State}}',
            RELAY_CONTAINER_NAME
        ]
        result = subprocess.run(
            inspect_cmd,
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode == 0:
            state_info = json.loads(result.stdout.strip())
            status = state_info.get('Status', 'unknown')
            health = state_info.get('Health', {})
            health_status = health.get('Status', 'unknown') if health else 'unknown'

            running = status == 'running' and health_status == 'healthy'
            return jsonify({
                'success': True,
                'status': status,
                'health': health_status,
                'running': running
            })
        else:
            return jsonify({'success': False, 'error': 'Could not get status'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# Import state management
import_status = {'status': 'idle', 'message': ''}
import_log_queue = queue.Queue()
import_state_lock = threading.Lock()
import_control = {
    'thread': None,
    'process': None,
    'cancel_event': None,
}


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


def run_import_process(cancel_event):
    """Background thread to run the import process"""
    global import_status, import_control

    print("run_import_process: Function started", flush=True)
    import_status = {'status': 'running', 'message': 'Starting import...'}
    import_log_queue.put({'type': 'info', 'message': 'Starting import process...'})

    runtime_cmd = CONTAINER_RUNTIME
    print(f"run_import_process: Using runtime {runtime_cmd}", flush=True)
    import_log_queue.put({'type': 'info', 'message': f'Using container runtime: {runtime_cmd}'})

    cancelled = False
    completed_requested = False
    import_result = None

    try:
        # Step 1: Stop the relay
        import_log_queue.put({'type': 'info', 'message': 'Stopping HAVEN relay...'})
        stop_result = subprocess.run(
            [runtime_cmd, 'stop', RELAY_CONTAINER_NAME],
            capture_output=True,
            text=True,
            timeout=30
        )

        if stop_result.returncode != 0:
            raise Exception(f'Failed to stop relay: {stop_result.stderr}')

        import_log_queue.put({'type': 'success', 'message': 'HAVEN relay stopped'})
        time.sleep(2)

        if cancel_event.is_set():
            cancelled = True
            import_log_queue.put({'type': 'warning', 'message': 'Import cancelled before running haven --import'})

        if not cancelled:
            # Resolve APP_DATA_DIR relative to current working directory if needed
            app_data_dir = os.getenv('APP_DATA_DIR', './data')
            if not os.path.isabs(app_data_dir):
                app_data_dir = os.path.abspath(os.path.join(os.getcwd(), app_data_dir))

            # Read environment variables from .env file (accessible via mounted volume)
            env_args = []
            env_file_path = '/haven-config/.env'
            if Path(env_file_path).exists():
                with open(env_file_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            value = value.strip('"').strip("'")
                            env_args.extend(['-e', f'{key}={value}'])

            # Determine relay image to reuse for import container
            relay_image = os.getenv('RELAY_IMAGE_NAME', '').strip()
            if not relay_image:
                try:
                    inspect_image = subprocess.run(
                        [runtime_cmd, 'inspect', '-f', '{{.Config.Image}}', RELAY_CONTAINER_NAME],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if inspect_image.returncode == 0:
                        relay_image = inspect_image.stdout.strip()
                except Exception as e:
                    print(f"Failed to detect relay image: {e}", flush=True)

            if not relay_image:
                relay_image = 'localhost/haven-kit_haven_relay:latest'
                import_log_queue.put({'type': 'warning', 'message': 'Could not detect relay image, falling back to localhost/haven-kit_haven_relay:latest'})

            # Determine the network used by the relay so the import container can connect
            relay_network = os.getenv('RELAY_NETWORK', '').strip()
            if not relay_network:
                try:
                    inspect_network = subprocess.run(
                        [runtime_cmd, 'inspect', '-f', '{{range $k, $_ := .NetworkSettings.Networks}}{{$k}}{{end}}', RELAY_CONTAINER_NAME],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if inspect_network.returncode == 0:
                        relay_network = inspect_network.stdout.strip()
                except Exception as e:
                    print(f"Failed to detect relay network: {e}", flush=True)

            if not relay_network:
                relay_network = 'haven-kit_haven_network'
                import_log_queue.put({'type': 'warning', 'message': 'Could not detect relay network, falling back to haven-kit_haven_network'})

            # Use podman run to create a temporary container for import
            cmd = [
                runtime_cmd, 'run', '--rm',
                '-v', f'{app_data_dir}/config:/haven-config:z',
                '-v', f'{app_data_dir}/blossom:/haven/blossom:z',
                '-v', f'{app_data_dir}/db:/haven/db:z',
                '--network', relay_network,
            ]
            cmd.extend(env_args)
            cmd.extend([
                relay_image,
                '/haven/haven', '--import'
            ])

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

            with import_state_lock:
                import_control['process'] = import_result

            print(f"Import subprocess started with PID {import_result.pid}", flush=True)

            try:
                for line in import_result.stdout:
                    line = line.strip()
                    if line:
                        print(f"Import output: {line}", flush=True)
                        import_log_queue.put({'type': 'info', 'message': line})

                    normalized_line = line.lower()

                    if cancel_event.is_set():
                        if not cancelled:
                            import_log_queue.put({'type': 'warning', 'message': 'Cancellation requested, stopping import process...'})
                        cancelled = True
                        break

                    if not cancelled and not completed_requested:
                        if 'tagged import complete' in normalized_line or 'please restart the relay' in normalized_line:
                            completed_requested = True
                            import_log_queue.put({'type': 'info', 'message': 'Import reported completion. Shutting down helper process...'})
                            break

                if import_result.poll() is None:
                    if cancelled:
                        try:
                            import_result.send_signal(signal.SIGINT)
                        except Exception:
                            import_result.terminate()
                        wait_timeout = 10
                    elif completed_requested:
                        try:
                            import_result.send_signal(signal.SIGINT)
                        except Exception:
                            import_result.terminate()
                        wait_timeout = 30
                    else:
                        wait_timeout = 600

                    try:
                        import_result.wait(timeout=wait_timeout)
                    except subprocess.TimeoutExpired:
                        if cancelled or completed_requested:
                            import_log_queue.put({'type': 'warning', 'message': 'Import process did not exit gracefully, forcing termination...'})
                            import_result.kill()
                            import_result.wait(timeout=10)
                        else:
                            import_log_queue.put({'type': 'warning', 'message': 'Import timed out, attempting graceful shutdown...'})
                            import_result.send_signal(signal.SIGINT)
                            import_result.wait(timeout=15)

                if not cancelled and not completed_requested and import_result.returncode != 0:
                    error_msg = f'Import command failed with code {import_result.returncode}'
                    print(f"Import error: {error_msg}", flush=True)
                    raise Exception(error_msg)

                if not cancelled and not completed_requested:
                    import_log_queue.put({'type': 'success', 'message': 'Import completed successfully'})
                    time.sleep(1)

            finally:
                with import_state_lock:
                    import_control['process'] = None

        # Step 3: Restart the relay (always attempt)
        import_log_queue.put({'type': 'info', 'message': 'Starting HAVEN relay...'})
        start_result = subprocess.run(
            [runtime_cmd, 'start', RELAY_CONTAINER_NAME],
            capture_output=True,
            text=True,
            timeout=30
        )

        if start_result.returncode != 0:
            raise Exception(f'Failed to start relay: {start_result.stderr}')

        import_log_queue.put({'type': 'success', 'message': 'HAVEN relay started'})

        if cancelled:
            import_log_queue.put({'type': 'warning', 'message': 'Import cancelled by user'})
            import_status = {'status': 'cancelled', 'message': 'Import cancelled by user'}
        else:
            if completed_requested:
                import_log_queue.put({'type': 'success', 'message': 'Import completed successfully'})
                time.sleep(1)
            import_log_queue.put({'type': 'success', 'message': '✓ Import process completed successfully!'})
            import_status = {'status': 'completed', 'message': 'Import completed successfully'}

    except Exception as e:
        cancelled = cancelled or cancel_event.is_set()
        error_msg = str(e)

        if cancelled:
            import_log_queue.put({'type': 'warning', 'message': f'Import cancelled: {error_msg}'})
            import_status = {'status': 'cancelled', 'message': 'Import cancelled by user'}
        else:
            import_log_queue.put({'type': 'error', 'message': f'Import failed: {error_msg}'})
            import_status = {'status': 'failed', 'message': error_msg}

        try:
            subprocess.run([runtime_cmd, 'start', RELAY_CONTAINER_NAME], timeout=30)
            if cancelled:
                import_log_queue.put({'type': 'warning', 'message': 'HAVEN relay restarted after cancellation'})
            else:
                import_log_queue.put({'type': 'warning', 'message': 'HAVEN relay restarted after error'})
        except Exception:
            import_log_queue.put({'type': 'error', 'message': 'Failed to restart HAVEN relay'})

    finally:
        with import_state_lock:
            import_control['process'] = None
            import_control['thread'] = None
            import_control['cancel_event'] = None


@app.route('/api/import/run', methods=['POST'])
def run_import():
    """Trigger the import process"""
    global import_status, import_control

    if import_status['status'] == 'running':
        return jsonify({'success': False, 'error': 'Import is already running'}), 400

    # Clear the log queue
    while not import_log_queue.empty():
        try:
            import_log_queue.get_nowait()
        except queue.Empty:
            break

    # Start import in background thread
    cancel_event = threading.Event()

    with import_state_lock:
        import_control['cancel_event'] = cancel_event
        import_control['process'] = None

    thread = threading.Thread(target=run_import_process, args=(cancel_event,), daemon=True)

    with import_state_lock:
        import_control['thread'] = thread

    thread.start()

    return jsonify({'success': True, 'message': 'Import started'})


@app.route('/api/import/cancel', methods=['POST'])
def cancel_import():
    """Request cancellation of the running import process"""
    global import_status, import_control

    if import_status['status'] != 'running':
        return jsonify({'success': False, 'error': 'No import is currently running'}), 400

    with import_state_lock:
        cancel_event = import_control.get('cancel_event')
        process = import_control.get('process')

    if cancel_event is None:
        return jsonify({'success': False, 'error': 'Import control state not available'}), 400

    if cancel_event.is_set():
        return jsonify({'success': False, 'error': 'Cancellation is already in progress'}), 400

    cancel_event.set()
    import_log_queue.put({'type': 'warning', 'message': 'Cancellation requested by user. Stopping import...'})

    if process and process.poll() is None:
        try:
            process.send_signal(signal.SIGINT)
        except Exception:
            try:
                process.terminate()
            except Exception:
                pass

    return jsonify({'success': True, 'message': 'Import cancellation requested'})


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

                # If import finished, send final status and end stream
                if import_status['status'] in ['completed', 'failed', 'cancelled']:
                    time.sleep(0.5)
                    yield f"data: {json.dumps({'type': 'status', 'status': import_status['status']})}\n\n"
                    break

            except queue.Empty:
                if import_status['status'] != 'running':
                    yield f"data: {json.dumps({'type': 'status', 'status': import_status['status']})}\n\n"
                    break
                # Send heartbeat to keep connection alive
                yield f": heartbeat\n\n"

    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/logs/stream', methods=['GET'])
def stream_logs():
    """Stream logs from the haven_relay container in real-time via SSE"""
    def generate():
        container_name = get_relay_container_name()
        process = None

        try:
            # Start docker logs in follow mode
            process = subprocess.Popen(
                [CONTAINER_RUNTIME, 'logs', '-f', '--tail', '100', container_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            )

            # Send initial connection success message
            yield f"data: {json.dumps({'type': 'status', 'status': 'connected'})}\n\n"

            # Stream logs line by line
            for line in iter(process.stdout.readline, ''):
                if line:
                    line = line.rstrip('\n')
                    # Determine log type based on content
                    log_type = 'info'
                    if 'ERROR' in line or 'error' in line or 'Error' in line:
                        log_type = 'error'
                    elif 'WARN' in line or 'warning' in line or 'Warning' in line:
                        log_type = 'warning'
                    elif 'success' in line.lower() or 'started' in line.lower():
                        log_type = 'success'

                    yield f"data: {json.dumps({'type': log_type, 'message': line})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Stream error: {str(e)}'})}\n\n"
        finally:
            if process:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()

    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/version', methods=['GET'])
def get_version():
    """Get the application version"""
    try:
        version_file = Path('/app/VERSION')
        if version_file.exists():
            version = version_file.read_text().strip()
            return jsonify({
                'success': True,
                'version': version
            })
        else:
            return jsonify({
                'success': False,
                'version': 'unknown'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'version': 'unknown',
            'error': str(e)
        })


@app.route('/api/tor', methods=['GET'])
def get_tor_info():
    """Get Tor .onion address information (Umbrel only)"""
    try:
        # Check for Umbrel's Tor hidden service environment variable
        onion_hostname = os.getenv('APP_HIDDEN_SERVICE')

        if onion_hostname:
            # Running on Umbrel with Tor enabled
            # Clean up the hostname (remove trailing newlines/spaces)
            onion_hostname = onion_hostname.strip()

            return jsonify({
                'success': True,
                'available': True,
                'address': f"ws://{onion_hostname}"
            })
        else:
            # Not running on Umbrel or Tor not configured
            return jsonify({
                'success': True,
                'available': False,
                'address': None
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'available': False,
            'address': None,
            'error': str(e)
        })


@app.route('/api/logs', methods=['GET'])
def get_logs():
    """Fetch logs from the haven_relay container (for download)"""
    try:
        container_name = get_relay_container_name()

        # Get logs from container (all logs, no tail limit)
        result = subprocess.run(
            [CONTAINER_RUNTIME, 'logs', container_name],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            # Combine stdout and stderr
            logs = result.stdout
            if result.stderr:
                logs += result.stderr

            return jsonify({
                'success': True,
                'logs': logs
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Failed to fetch logs: {result.stderr}'
            }), 500

    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False,
            'error': 'Request timed out while fetching logs'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# Ensure config files exist when the module is loaded (with error handling)
try:
    ensure_config_files()
except Exception as e:
    print(f"Warning: Failed to ensure config files: {e}", flush=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=False)
