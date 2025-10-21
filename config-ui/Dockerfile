FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Install system dependencies (docker-cli works with both Docker and Podman sockets)
# We create a 'podman' symlink so the Python code can use either command
# Also install py3-pip for podman-compose
RUN apk add --no-cache docker-cli py3-pip && \
    ln -s /usr/bin/docker /usr/bin/podman && \
    pip3 install --break-system-packages podman-compose

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .
COPY templates/ ./templates/
COPY static/ ./static/

# Expose port for web UI
EXPOSE 8080

# Run the Flask app
CMD ["python", "/app/app.py"]
