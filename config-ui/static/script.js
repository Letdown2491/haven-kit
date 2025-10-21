// State management
let relayConfigs = {
    blastr: [],
    import: []
};

let currentStep = 0;
const totalSteps = 8;
let configMode = null; // 'simple' or 'full'

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadEnvConfig();
    loadConfigIntoForm();
    loadRelayConfig('blastr');
    loadRelayConfig('import');
    checkStatus();
    updateWizardStep(); // Initialize navigation buttons

    // Check status every 10 seconds
    setInterval(checkStatus, 10000);
});

// Wizard Navigation
function nextStep() {
    if (currentStep < totalSteps) {
        // Validate current step (skip validation for step 0)
        if (currentStep > 0) {
            const currentStepEl = document.querySelector(`.wizard-step[data-step="${currentStep}"]`);
            const requiredInputs = currentStepEl.querySelectorAll('[required]');
            let valid = true;

            requiredInputs.forEach(input => {
                // Only validate visible inputs
                if (input.offsetParent !== null && !input.value.trim()) {
                    input.style.borderColor = 'var(--error)';
                    valid = false;
                } else {
                    input.style.borderColor = '';
                }
            });

            if (!valid) {
                showNotification('Please fill in all required fields', 'error');
                return;
            }
        }

        // In simple mode, skip from step 1 directly to save
        if (configMode === 'simple' && currentStep === 1) {
            saveConfiguration();
            return;
        }

        currentStep++;
        updateWizardStep();
    }
}

// Set configuration mode
function setConfigMode(mode) {
    configMode = mode;
    currentStep = 1;

    // Show/hide appropriate step 1 content
    const simpleStep = document.getElementById('simple-config-step');
    const fullStep = document.getElementById('full-config-step');

    if (mode === 'simple') {
        simpleStep.style.display = 'block';
        fullStep.style.display = 'none';
        // Clear USERNAME required attribute from full mode
        document.getElementById('USERNAME').required = true;
        document.getElementById('OWNER_NPUB').required = true;
        document.getElementById('OWNER_NPUB_FULL').required = false;
    } else {
        simpleStep.style.display = 'none';
        fullStep.style.display = 'block';
        document.getElementById('USERNAME').required = false;
        document.getElementById('OWNER_NPUB').required = false;
        document.getElementById('OWNER_NPUB_FULL').required = true;
    }

    updateWizardStep();
}

function previousStep() {
    if (currentStep > 1) {
        currentStep--;
        updateWizardStep();
    } else if (currentStep === 1) {
        // Go back to config mode selection
        currentStep = 0;
        configMode = null;
        updateWizardStep();
    }
}

function updateWizardStep() {
    // Update steps visibility
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.remove('active');
    });
    document.querySelector(`.wizard-step[data-step="${currentStep}"]`).classList.add('active');

    // Show/hide appropriate progress steps
    const simpleProgress = document.getElementById('simple-progress');
    const fullProgress = document.getElementById('full-progress');

    if (currentStep === 0) {
        // Step 0: hide both
        simpleProgress.style.display = 'none';
        fullProgress.style.display = 'none';
    } else if (configMode === 'simple') {
        // Simple mode: show simple progress (2 steps)
        simpleProgress.style.display = 'flex';
        fullProgress.style.display = 'none';
    } else if (configMode === 'full') {
        // Full mode: show full progress (8 steps)
        simpleProgress.style.display = 'none';
        fullProgress.style.display = 'flex';
    }

    // Update progress indicators based on mode
    const progressSteps = configMode === 'simple'
        ? simpleProgress.querySelectorAll('.progress-step')
        : fullProgress.querySelectorAll('.progress-step');

    progressSteps.forEach((step) => {
        const stepNum = parseInt(step.getAttribute('data-step'));
        step.classList.remove('active', 'completed');
        step.onclick = null;

        if (stepNum < currentStep) {
            step.classList.add('completed');
            // Make completed steps clickable
            step.onclick = () => {
                currentStep = stepNum;
                updateWizardStep();
            };
        } else if (stepNum === currentStep) {
            step.classList.add('active');
        }
    });

    // Update progress bar
    let progressPercent = 0;
    if (configMode === 'simple') {
        // Simple: 2 total steps (0 and 1)
        progressPercent = (currentStep / 1) * 100;
    } else if (configMode === 'full') {
        // Full: 8 total steps (0-7)
        progressPercent = (currentStep / 7) * 100;
    }
    document.querySelector('.progress-fill').style.width = progressPercent + '%';

    // Update navigation buttons
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    if (currentStep === 0) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    } else if (currentStep === 1) {
        prevBtn.style.display = 'inline-flex';
        if (configMode === 'simple') {
            nextBtn.innerHTML = '💾 Save Configuration';
            nextBtn.onclick = saveConfiguration;
        } else {
            nextBtn.innerHTML = 'Next →';
            nextBtn.onclick = nextStep;
        }
        nextBtn.style.display = 'inline-flex';
    } else {
        prevBtn.style.display = 'inline-flex';
        // On last step, change Next button to Save Configuration
        if (currentStep === totalSteps) {
            nextBtn.innerHTML = '💾 Save Configuration';
            nextBtn.onclick = saveConfiguration;
        } else {
            nextBtn.innerHTML = 'Next →';
            nextBtn.onclick = nextStep;
            nextBtn.style.display = 'inline-flex';
        }
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Load existing config into form
async function loadConfigIntoForm() {
    try {
        const response = await fetch('/api/config/env');
        const data = await response.json();

        if (data.success) {
            const envContent = data.content;
            const form = document.getElementById('config-form');

            // Parse .env content and populate form
            envContent.split('\n').forEach(line => {
                const match = line.match(/^([A-Z_]+)=(.*)$/);
                if (match) {
                    const [, key, value] = match;
                    const input = form.querySelector(`[name="${key}"]`);
                    if (input) {
                        if (input.type === 'checkbox') {
                            input.checked = value.toLowerCase() === 'true';
                        } else {
                            // Remove quotes from value
                            input.value = value.replace(/^"(.+)"$/, '$1');
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading config into form:', error);
    }
}

// Generate .env file from form
function generateEnvFromForm() {
    const form = document.getElementById('config-form');
    const formData = new FormData(form);

    // Get the appropriate npub based on mode
    let ownerNpub;
    if (configMode === 'simple') {
        ownerNpub = formData.get('OWNER_NPUB');
    } else {
        ownerNpub = formData.get('OWNER_NPUB_FULL');
        // Also set OWNER_NPUB for full mode (for consistency)
        formData.set('OWNER_NPUB', ownerNpub);
    }

    // Simple mode - use defaults with username
    if (configMode === 'simple') {
        const username = formData.get('USERNAME') || 'My';

        return `# Owner Configuration (REQUIRED)
# Your Nostr public key (npub format)
# Get this from your Nostr client or generate one at https://nostr.how
# **IMPORTANT**: Replace this example npub with your own npub!
OWNER_NPUB="${ownerNpub}"

# Relay Configuration (REQUIRED)
RELAY_URL="ws://localhost:3355"
RELAY_PORT=3355
RELAY_BIND_ADDRESS="0.0.0.0"

# Database Configuration
DB_ENGINE="badger"
LMDB_MAPSIZE=0

# Media Storage Path
BLOSSOM_PATH="/haven/blossom"

## Private Relay Settings
PRIVATE_RELAY_NAME="${username}'s Private Relay"
PRIVATE_RELAY_NPUB="${ownerNpub}"
PRIVATE_RELAY_DESCRIPTION="A safe place to store my drafts and ecash"
PRIVATE_RELAY_ICON=""

## Private Relay Rate Limiters
PRIVATE_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=50
PRIVATE_RELAY_EVENT_IP_LIMITER_INTERVAL=1
PRIVATE_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=100
PRIVATE_RELAY_ALLOW_EMPTY_FILTERS=true
PRIVATE_RELAY_ALLOW_COMPLEX_FILTERS=true
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=3
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=5
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=9

## Chat Relay Settings
CHAT_RELAY_NAME="${username}'s Chat Relay"
CHAT_RELAY_NPUB="${ownerNpub}"
CHAT_RELAY_DESCRIPTION="A relay for private chats"
CHAT_RELAY_ICON=""
CHAT_RELAY_WOT_DEPTH=3
CHAT_RELAY_WOT_REFRESH_INTERVAL_HOURS=24
CHAT_RELAY_MINIMUM_FOLLOWERS=3

## Chat Relay Rate Limiters
CHAT_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=50
CHAT_RELAY_EVENT_IP_LIMITER_INTERVAL=1
CHAT_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=100
CHAT_RELAY_ALLOW_EMPTY_FILTERS=false
CHAT_RELAY_ALLOW_COMPLEX_FILTERS=false
CHAT_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=3
CHAT_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=3
CHAT_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=9

## Outbox Relay Settings
OUTBOX_RELAY_NAME="${username}'s Outbox Relay"
OUTBOX_RELAY_NPUB="${ownerNpub}"
OUTBOX_RELAY_DESCRIPTION="A relay and Blossom server for public messages and media"
OUTBOX_RELAY_ICON=""

## Outbox Relay Rate Limiters
OUTBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=10
OUTBOX_RELAY_EVENT_IP_LIMITER_INTERVAL=60
OUTBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=100
OUTBOX_RELAY_ALLOW_EMPTY_FILTERS=false
OUTBOX_RELAY_ALLOW_COMPLEX_FILTERS=false
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=3
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=1
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=9

## Inbox Relay Settings
INBOX_RELAY_NAME="${username}'s Inbox Relay"
INBOX_RELAY_NPUB="${ownerNpub}"
INBOX_RELAY_DESCRIPTION="Send your interactions with my notes here"
INBOX_RELAY_ICON=""
INBOX_PULL_INTERVAL_SECONDS=600

## Inbox Relay Rate Limiters
INBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=10
INBOX_RELAY_EVENT_IP_LIMITER_INTERVAL=1
INBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=20
INBOX_RELAY_ALLOW_EMPTY_FILTERS=false
INBOX_RELAY_ALLOW_COMPLEX_FILTERS=false
INBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=3
INBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=1
INBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=9

## Import Settings
IMPORT_START_DATE="2025-10-13"
IMPORT_QUERY_INTERVAL_SECONDS=600
IMPORT_OWNER_NOTES_FETCH_TIMEOUT_SECONDS=60
IMPORT_TAGGED_NOTES_FETCH_TIMEOUT_SECONDS=120
IMPORT_SEED_RELAYS_FILE="/haven-config/relays_import.json"

## Backup Settings
BACKUP_PROVIDER="none"
BACKUP_INTERVAL_HOURS=24

## Blastr Settings
BLASTR_RELAYS_FILE="/haven-config/relays_blastr.json"

## WOT Settings
WOT_FETCH_TIMEOUT_SECONDS=60

## Logging
HAVEN_LOG_LEVEL="INFO"
TZ="UTC"
`;
    }

    // Full mode - use form values
    let envContent = `# Owner Configuration (REQUIRED)
# Your Nostr public key (npub format)
# Get this from your Nostr client or generate one at https://nostr.how
# **IMPORTANT**: Replace this example npub with your own npub!
OWNER_NPUB="${ownerNpub}"

# Relay Configuration (REQUIRED)
RELAY_URL="${formData.get('RELAY_URL')}"
RELAY_PORT=${formData.get('RELAY_PORT')}
RELAY_BIND_ADDRESS="${formData.get('RELAY_BIND_ADDRESS')}"

# Database Configuration
DB_ENGINE="${formData.get('DB_ENGINE')}"
LMDB_MAPSIZE=${formData.get('LMDB_MAPSIZE')}

# Media Storage Path
BLOSSOM_PATH="${formData.get('BLOSSOM_PATH')}"

## Private Relay Settings
PRIVATE_RELAY_NAME="${formData.get('PRIVATE_RELAY_NAME')}"
PRIVATE_RELAY_NPUB="${ownerNpub}"
PRIVATE_RELAY_DESCRIPTION="${formData.get('PRIVATE_RELAY_DESCRIPTION')}"
PRIVATE_RELAY_ICON="${formData.get('PRIVATE_RELAY_ICON') || ''}"

## Private Relay Rate Limiters
PRIVATE_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${formData.get('PRIVATE_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL')}
PRIVATE_RELAY_EVENT_IP_LIMITER_INTERVAL=${formData.get('PRIVATE_RELAY_EVENT_IP_LIMITER_INTERVAL')}
PRIVATE_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${formData.get('PRIVATE_RELAY_EVENT_IP_LIMITER_MAX_TOKENS')}
PRIVATE_RELAY_ALLOW_EMPTY_FILTERS=${formData.get('PRIVATE_RELAY_ALLOW_EMPTY_FILTERS') === 'true'}
PRIVATE_RELAY_ALLOW_COMPLEX_FILTERS=${formData.get('PRIVATE_RELAY_ALLOW_COMPLEX_FILTERS') === 'true'}
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=3
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=5
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=9

## Chat Relay Settings
CHAT_RELAY_NAME="${formData.get('CHAT_RELAY_NAME')}"
CHAT_RELAY_NPUB="${ownerNpub}"
CHAT_RELAY_DESCRIPTION="${formData.get('CHAT_RELAY_DESCRIPTION')}"
CHAT_RELAY_ICON="${formData.get('CHAT_RELAY_ICON') || ''}"
CHAT_RELAY_WOT_DEPTH=${formData.get('CHAT_RELAY_WOT_DEPTH')}
CHAT_RELAY_WOT_REFRESH_INTERVAL_HOURS=${formData.get('CHAT_RELAY_WOT_REFRESH_INTERVAL_HOURS')}
CHAT_RELAY_MINIMUM_FOLLOWERS=${formData.get('CHAT_RELAY_MINIMUM_FOLLOWERS')}

## Chat Relay Rate Limiters
CHAT_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=50
CHAT_RELAY_EVENT_IP_LIMITER_INTERVAL=1
CHAT_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=100
CHAT_RELAY_ALLOW_EMPTY_FILTERS=false
CHAT_RELAY_ALLOW_COMPLEX_FILTERS=false
CHAT_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=3
CHAT_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=3
CHAT_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=9

## Outbox Relay Settings
OUTBOX_RELAY_NAME="${formData.get('OUTBOX_RELAY_NAME')}"
OUTBOX_RELAY_NPUB="${ownerNpub}"
OUTBOX_RELAY_DESCRIPTION="${formData.get('OUTBOX_RELAY_DESCRIPTION')}"
OUTBOX_RELAY_ICON="${formData.get('OUTBOX_RELAY_ICON') || ''}"

## Outbox Relay Rate Limiters
OUTBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=10
OUTBOX_RELAY_EVENT_IP_LIMITER_INTERVAL=60
OUTBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=100
OUTBOX_RELAY_ALLOW_EMPTY_FILTERS=false
OUTBOX_RELAY_ALLOW_COMPLEX_FILTERS=false
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=3
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=1
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=9

## Inbox Relay Settings
INBOX_RELAY_NAME="${formData.get('INBOX_RELAY_NAME')}"
INBOX_RELAY_NPUB="${ownerNpub}"
INBOX_RELAY_DESCRIPTION="${formData.get('INBOX_RELAY_DESCRIPTION')}"
INBOX_RELAY_ICON="${formData.get('INBOX_RELAY_ICON') || ''}"
INBOX_PULL_INTERVAL_SECONDS=${formData.get('INBOX_PULL_INTERVAL_SECONDS')}

## Inbox Relay Rate Limiters
INBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=10
INBOX_RELAY_EVENT_IP_LIMITER_INTERVAL=1
INBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=20
INBOX_RELAY_ALLOW_EMPTY_FILTERS=false
INBOX_RELAY_ALLOW_COMPLEX_FILTERS=false
INBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=3
INBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=1
INBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=9

## Import Settings
IMPORT_START_DATE="${formData.get('IMPORT_START_DATE')}"
IMPORT_QUERY_INTERVAL_SECONDS=600
IMPORT_OWNER_NOTES_FETCH_TIMEOUT_SECONDS=60
IMPORT_TAGGED_NOTES_FETCH_TIMEOUT_SECONDS=120
IMPORT_SEED_RELAYS_FILE="/haven-config/relays_import.json"

## Backup Settings
BACKUP_PROVIDER="${formData.get('BACKUP_PROVIDER')}"
BACKUP_INTERVAL_HOURS=${formData.get('BACKUP_INTERVAL_HOURS')}

`;

    // Add S3 settings if backup provider is s3
    if (formData.get('BACKUP_PROVIDER') === 's3') {
        envContent += `## S3 Backup Settings
S3_ACCESS_KEY_ID="${formData.get('S3_ACCESS_KEY_ID') || ''}"
S3_SECRET_KEY="${formData.get('S3_SECRET_KEY') || ''}"
S3_ENDPOINT="${formData.get('S3_ENDPOINT') || ''}"
S3_REGION="${formData.get('S3_REGION') || ''}"
S3_BUCKET_NAME="${formData.get('S3_BUCKET_NAME') || ''}"

`;
    }

    envContent += `## Blastr Settings
BLASTR_RELAYS_FILE="/haven-config/relays_blastr.json"

## WOT Settings
WOT_FETCH_TIMEOUT_SECONDS=60

## Logging
HAVEN_LOG_LEVEL="INFO"
TZ="UTC"
`;

    return envContent;
}

// Save configuration from wizard
async function saveConfiguration() {
    const btn = event.target;
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span> Saving...';

        const envContent = generateEnvFromForm();

        const response = await fetch('/api/config/env', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: envContent })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('✓ Configuration saved successfully! You can now restart HAVEN to apply changes.', 'success');
            // Update the advanced editor too
            document.getElementById('env-editor').value = envContent;
        } else {
            showNotification('Failed to save: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Error saving configuration', 'error');
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// Toggle S3 fields visibility
function toggleS3Fields(value) {
    const s3Fields = document.getElementById('s3-fields');
    if (value === 's3') {
        s3Fields.style.display = 'block';
    } else {
        s3Fields.style.display = 'none';
    }
}

// Toggle collapsible sections
function toggleCollapsible(element) {
    const collapsible = element.closest('.collapsible');
    collapsible.classList.toggle('open');
}


// Tab management
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            button.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');

            // Load import info when Import Notes tab is clicked
            if (tabName === 'import-notes') {
                loadImportInfo();
            }
        });
    });
}

// Switch to a specific tab (called from buttons)
function switchToTab(tabName) {
    const tabButton = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
    if (tabButton) {
        tabButton.click();
    }
}

// Show advanced config tab (without tab button)
function showAdvancedConfig() {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show advanced tab
    document.getElementById('advanced-tab').classList.add('active');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show wizard tab (back from advanced config)
function showWizardConfig() {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Show wizard tab
    document.getElementById('wizard-tab').classList.add('active');

    // Set wizard tab button as active
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector('.tab-button[data-tab="wizard"]').classList.add('active');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Status checking
async function checkStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        const indicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');

        if (data.success && data.running) {
            indicator.className = 'status-badge running';
            statusText.textContent = 'HAVEN Running';
        } else {
            indicator.className = 'status-badge stopped';
            statusText.textContent = 'HAVEN Stopped';
        }
    } catch (error) {
        console.error('Status check failed:', error);
        const indicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        indicator.className = 'status-badge';
        statusText.textContent = 'Status Unknown';
    }
}

// Environment configuration (for advanced mode)
async function loadEnvConfig() {
    try {
        const editor = document.getElementById('env-editor');
        editor.placeholder = 'Loading configuration...';

        const response = await fetch('/api/config/env');
        const data = await response.json();

        if (data.success) {
            editor.value = data.content;
            editor.placeholder = '';
        } else {
            showNotification('Failed to load environment config: ' + data.error, 'error');
            editor.placeholder = 'Error loading configuration';
        }
    } catch (error) {
        showNotification('Error loading environment config', 'error');
        console.error(error);
    }
}

async function saveEnvConfigAdvanced() {
    const btn = event.target;
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span> Saving...';

        const content = document.getElementById('env-editor').value;

        if (!content.trim()) {
            showNotification('Configuration cannot be empty', 'error');
            return;
        }

        const response = await fetch('/api/config/env', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('✓ Configuration saved successfully', 'success');
        } else {
            showNotification('Failed to save: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Error saving configuration', 'error');
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// Relay configuration
async function loadRelayConfig(type) {
    try {
        const response = await fetch(`/api/config/relays/${type}`);
        const data = await response.json();

        if (data.success) {
            relayConfigs[type] = data.relays;
            renderRelayList(type);
        } else {
            showNotification(`Failed to load ${type} relays: ` + data.error, 'error');
        }
    } catch (error) {
        showNotification(`Error loading ${type} relays`, 'error');
        console.error(error);
    }
}

function renderRelayList(type) {
    const listContainer = document.getElementById(`${type}-list`);

    if (relayConfigs[type].length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📡</div>
                <p>No relays configured yet</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = '';

    relayConfigs[type].forEach((relay, index) => {
        const item = document.createElement('div');
        item.className = 'relay-item';
        item.innerHTML = `
            <input
                type="text"
                value="${relay}"
                onchange="updateRelay('${type}', ${index}, this.value)"
                placeholder="wss://relay.example.com"
            />
            <button onclick="removeRelay('${type}', ${index})" title="Remove relay">
                Remove
            </button>
        `;
        listContainer.appendChild(item);
    });
}

function normalizeRelayUrl(url) {
    url = url.trim();
    url = url.replace(/^(wss?:\/\/)/i, '');
    url = url.replace(/\/+$/, '');
    return url;
}

function addRelay(type) {
    const input = document.getElementById(`${type}-input`);
    let relay = input.value.trim();

    if (!relay) {
        showNotification('Please enter a relay URL', 'error');
        input.focus();
        return;
    }

    relay = normalizeRelayUrl(relay);

    if (relayConfigs[type].includes(relay)) {
        showNotification('This relay is already in the list', 'error');
        return;
    }

    relayConfigs[type].push(relay);
    renderRelayList(type);
    input.value = '';
    showNotification('Relay added (remember to save)', 'info');
    input.focus();
}

function removeRelay(type, index) {
    const relay = relayConfigs[type][index];

    if (confirm(`Remove relay "${relay}"?`)) {
        relayConfigs[type].splice(index, 1);
        renderRelayList(type);
        showNotification('Relay removed (remember to save)', 'info');
    }
}

function updateRelay(type, index, value) {
    relayConfigs[type][index] = normalizeRelayUrl(value);
}

async function saveRelayConfig(type) {
    const btn = event.target;
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span> Saving...';

        const response = await fetch(`/api/config/relays/${type}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ relays: relayConfigs[type] })
        });

        const data = await response.json();

        if (data.success) {
            const typeName = type.charAt(0).toUpperCase() + type.slice(1);
            showNotification(`✓ ${typeName} configuration saved successfully`, 'success');
        } else {
            showNotification('Failed to save: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification(`Error saving ${type} relay config`, 'error');
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// Restart functionality
async function restartHaven() {
    if (!confirm('Are you sure you want to restart HAVEN?\n\nThis will briefly interrupt the relay service.')) {
        return;
    }

    const btn = event.target;
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span> Restarting...';

        showNotification('Restarting HAVEN relay...', 'info');

        const response = await fetch('/api/restart', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('✓ HAVEN relay restarted successfully', 'success');
            setTimeout(checkStatus, 3000);
        } else {
            showNotification('Failed to restart: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Error restarting HAVEN', 'error');
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// Add Enter key support for relay inputs
document.addEventListener('DOMContentLoaded', () => {
    ['blastr-input', 'import-input'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const type = id.split('-')[0];
                    addRelay(type);
                }
            });
        }
    });
});

// ==================== Import Notes Functionality ====================

let importEventSource = null;

// Load import info when tab is opened
function loadImportInfo() {
    fetch('/api/import/info')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('import-relay-count').textContent =
                    data.relay_count === 0 ? 'None configured' : `${data.relay_count} relay(s)`;
                document.getElementById('import-start-date').textContent = data.import_start_date;
                updateImportStatus(data.status);
            }
        })
        .catch(error => {
            console.error('Error loading import info:', error);
            showNotification('Failed to load import information', 'error');
        });
}

function updateImportStatus(status) {
    const statusElement = document.getElementById('import-status');
    statusElement.className = '';

    switch (status) {
        case 'idle':
            statusElement.className = 'status-idle';
            statusElement.textContent = 'Idle';
            break;
        case 'running':
            statusElement.className = 'status-running';
            statusElement.textContent = 'Running...';
            break;
        case 'completed':
            statusElement.className = 'status-completed';
            statusElement.textContent = 'Completed';
            break;
        case 'failed':
            statusElement.className = 'status-failed';
            statusElement.textContent = 'Failed';
            break;
    }
}

function runImport() {
    const button = document.getElementById('run-import-btn');
    const logContainer = document.getElementById('import-log-container');
    const logOutput = document.getElementById('import-log');

    // Confirm with user
    if (!confirm('This will stop HAVEN temporarily to import your notes. This may take several minutes.\n\nContinue with import?')) {
        return;
    }

    // Disable button
    button.disabled = true;
    button.innerHTML = '⏳ Importing...';

    // Clear previous logs
    logOutput.innerHTML = '';
    logContainer.style.display = 'flex';

    // Start import
    fetch('/api/import/run', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'}
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateImportStatus('running');
            startImportLogStream();
        } else {
            throw new Error(data.error || 'Failed to start import');
        }
    })
    .catch(error => {
        console.error('Import error:', error);
        showNotification(`Failed to start import: ${error.message}`, 'error');
        button.disabled = false;
        button.innerHTML = '📥 Import Notes';
        updateImportStatus('failed');
    });
}

function startImportLogStream() {
    // Close existing connection if any
    if (importEventSource) {
        importEventSource.close();
    }

    // Create new EventSource for streaming logs
    importEventSource = new EventSource('/api/import/stream');
    const logOutput = document.getElementById('import-log');
    const button = document.getElementById('run-import-btn');

    importEventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);

        if (data.type === 'status') {
            updateImportStatus(data.status);

            if (data.status === 'completed' || data.status === 'failed') {
                importEventSource.close();
                button.disabled = false;
                button.innerHTML = '📥 Import Notes';

                if (data.status === 'completed') {
                    showNotification('Import completed successfully!', 'success');
                } else {
                    showNotification('Import failed. Check logs for details.', 'error');
                }
            }
        } else {
            // Add log line
            const logLine = document.createElement('div');
            logLine.className = 'log-line';

            if (data.type === 'error') {
                logLine.classList.add('error');
            } else if (data.type === 'success') {
                logLine.classList.add('success');
            } else if (data.type === 'warning') {
                logLine.classList.add('warning');
            }

            logLine.textContent = data.message;
            logOutput.appendChild(logLine);

            // Auto-scroll to bottom
            logOutput.scrollTop = logOutput.scrollHeight;
        }
    };

    importEventSource.onerror = function(error) {
        console.error('EventSource error:', error);
        importEventSource.close();
        button.disabled = false;
        button.innerHTML = '📥 Import Notes';

        const logLine = document.createElement('div');
        logLine.className = 'log-line error';
        logLine.textContent = 'Connection to import stream lost';
        logOutput.appendChild(logLine);
    };
}
