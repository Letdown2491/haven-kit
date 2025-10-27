// State management
let relayConfigs = {
    blastr: [],
    import: []
};

let currentStep = 0;
const totalSteps = 8; // Total number of steps (0-7)
const lastStep = 7; // Last step index in Full Configuration
let configMode = null; // 'simple' or 'full'

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadEnvConfig();
    loadConfigIntoForm();
    loadRelayConfig('blastr');
    loadRelayConfig('import');
    checkStatus();
    loadVersion();
    loadTorInfo(); // Load Tor .onion address (Umbrel only)
    loadRelayUrlDisplay(); // Load relay URL for Get Started page
    updateWizardStep(); // Initialize navigation buttons
    syncNpubFields(); // Sync npub fields between simple and full mode

    // Check status every 10 seconds
    setInterval(checkStatus, 10000);
});

// Sync npub fields between simple and full mode
function syncNpubFields() {
    const simpleInput = document.getElementById('OWNER_NPUB');
    const fullInput = document.getElementById('OWNER_NPUB_FULL');

    if (simpleInput && fullInput) {
        // When simple input changes, update full input
        simpleInput.addEventListener('input', () => {
            fullInput.value = simpleInput.value;
        });

        // When full input changes, update simple input
        fullInput.addEventListener('input', () => {
            simpleInput.value = fullInput.value;
        });
    }

    // Sync RELAY_URL fields between simple and full mode
    const simpleUrlInput = document.getElementById('RELAY_URL_SIMPLE');
    const fullUrlInput = document.querySelector('[name="RELAY_URL"]');

    if (simpleUrlInput && fullUrlInput) {
        // When simple input changes, update full input
        simpleUrlInput.addEventListener('input', () => {
            fullUrlInput.value = simpleUrlInput.value;
        });

        // When full input changes, update simple input
        fullUrlInput.addEventListener('input', () => {
            simpleUrlInput.value = fullUrlInput.value;
        });
    }
}

// Wizard Navigation
function nextStep() {
    // Allow advancing through step 6, which increments to step 7 (the last step)
    if (currentStep < lastStep) {
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
        // Set required attributes for simple mode fields
        document.getElementById('USERNAME').required = true;
        document.getElementById('OWNER_NPUB').required = true;
        document.getElementById('RELAY_URL_SIMPLE').required = true;
        // Clear required from full mode fields
        document.getElementById('OWNER_NPUB_FULL').required = false;
        const fullUrlInput = document.querySelector('[name="RELAY_URL"]');
        if (fullUrlInput) fullUrlInput.required = false;
    } else {
        simpleStep.style.display = 'none';
        fullStep.style.display = 'block';
        // Clear required from simple mode fields
        document.getElementById('USERNAME').required = false;
        document.getElementById('OWNER_NPUB').required = false;
        document.getElementById('RELAY_URL_SIMPLE').required = false;
        // Set required for full mode fields
        document.getElementById('OWNER_NPUB_FULL').required = true;
        const fullUrlInput = document.querySelector('[name="RELAY_URL"]');
        if (fullUrlInput) fullUrlInput.required = true;
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
    const restartBtn = document.getElementById('restart-btn');

    if (currentStep === 0) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        if (restartBtn) restartBtn.style.display = 'none';
    } else if (currentStep === 1) {
        prevBtn.style.display = 'inline-flex';
        if (configMode === 'simple') {
            nextBtn.innerHTML = 'Save Configuration';
            nextBtn.onclick = saveConfiguration;
            if (restartBtn) restartBtn.style.display = 'inline-flex';
        } else {
            nextBtn.innerHTML = 'Next →';
            nextBtn.onclick = nextStep;
            if (restartBtn) restartBtn.style.display = 'none';
        }
        nextBtn.style.display = 'inline-flex';
    } else {
        prevBtn.style.display = 'inline-flex';
        // On last step, change Next button to Save Configuration
        if (currentStep === lastStep) {
            nextBtn.innerHTML = 'Save Configuration';
            nextBtn.onclick = saveConfiguration;
            nextBtn.style.display = 'inline-flex';
            if (restartBtn) restartBtn.style.display = 'inline-flex';
        } else {
            nextBtn.innerHTML = 'Next →';
            nextBtn.onclick = nextStep;
            nextBtn.style.display = 'inline-flex';
            if (restartBtn) restartBtn.style.display = 'none';
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
                    const [, key, rawValue] = match;

                    // Clean value by removing quotes
                    const cleanValue = rawValue.replace(/^"(.*)"$/, '$1').trim();

                    // Special handling for OWNER_NPUB - populate both simple and full mode fields
                    if (key === 'OWNER_NPUB') {
                        const simpleInput = document.getElementById('OWNER_NPUB');
                        const fullInput = document.getElementById('OWNER_NPUB_FULL');
                        if (simpleInput) simpleInput.value = cleanValue;
                        if (fullInput) fullInput.value = cleanValue;
                        return;
                    }

                    // Special handling for OWNER_USERNAME - map to USERNAME field
                    if (key === 'OWNER_USERNAME') {
                        const usernameInput = document.getElementById('USERNAME');
                        if (usernameInput) usernameInput.value = cleanValue;
                        return;
                    }

                    // Special handling for RELAY_URL - populate both simple and full mode fields
                    if (key === 'RELAY_URL') {
                        const normalized = normalizeRelayHost(cleanValue);
                        const simpleInput = document.getElementById('RELAY_URL_SIMPLE');
                        const fullInput = form.querySelector('[name="RELAY_URL"]');
                        if (simpleInput) simpleInput.value = normalized;
                        if (fullInput) fullInput.value = normalized;
                        return;
                    }

                    // Find input field by name attribute
                    const input = form.querySelector(`[name="${key}"]`);
                    if (input) {
                        if (input.type === 'checkbox') {
                            // Handle boolean values (true/false, with or without quotes)
                            input.checked = cleanValue.toLowerCase() === 'true';
                        } else if (input.tagName === 'SELECT') {
                            // Handle select dropdowns
                            input.value = cleanValue;
                            // Trigger onchange if it exists to handle dependent fields (like S3)
                            if (input.onchange) {
                                input.onchange.call(input);
                            }
                        } else {
                            // Handle text, number, date, url inputs
                            input.value = cleanValue;
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading config into form:', error);
    }
}

// Parse existing .env file into key-value map
function parseEnvFile(envContent) {
    const envMap = new Map();
    const lines = envContent.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(/^([A-Z_]+)=(.*)$/);
        if (match) {
            const [, key, value] = match;
            envMap.set(key, value);
        }
    }

    return envMap;
}

// Generate .env file from form, merging with existing values
async function generateEnvFromForm() {
    const form = document.getElementById('config-form');
    const formData = new FormData(form);

    // Validate that we have a valid config mode
    if (!configMode || (configMode !== 'simple' && configMode !== 'full')) {
        throw new Error('Invalid configuration mode. Please restart configuration from the mode selection.');
    }

    // Get the appropriate npub based on mode
    let ownerNpub;
    if (configMode === 'simple') {
        ownerNpub = formData.get('OWNER_NPUB');
    } else {
        ownerNpub = formData.get('OWNER_NPUB_FULL');
        // Also set OWNER_NPUB for full mode (for consistency)
        formData.set('OWNER_NPUB', ownerNpub);
    }

    // Validate that we have a valid npub
    if (!ownerNpub || ownerNpub === 'null' || ownerNpub === 'undefined' || ownerNpub.trim() === '') {
        throw new Error('OWNER_NPUB is required. Please enter a valid npub.');
    }

    // Additional validation: check npub format
    if (!ownerNpub.startsWith('npub1')) {
        throw new Error('Invalid npub format. Must start with "npub1".');
    }

    // Load existing .env file to preserve values not in the form
    let existingEnv = new Map();
    try {
        const response = await fetch('/api/config/env');
        const data = await response.json();
        if (data.success) {
            existingEnv = parseEnvFile(data.content);
        }
    } catch (error) {
        console.warn('Could not load existing .env, using defaults', error);
    }

    // Helper function to get value from form, existing env, or default
    const getVal = (formKey, envKey = formKey, defaultValue = '') => {
        // If form has the field and it's not null/undefined, use it
        const formValue = formData.get(formKey);
        if (formValue !== null && formValue !== undefined) {
            return formValue;
        }
        // Otherwise use existing env value or default
        return existingEnv.get(envKey) || defaultValue;
    };

    const boolVal = (key, defaultValue) => normalizeEnvBoolean(existingEnv.get(key), defaultValue);
    const numVal = (key, defaultValue) => normalizeEnvNumber(existingEnv.get(key), defaultValue);

    // Helper for boolean values
    const getBool = (formKey, envKey = formKey, defaultValue = 'false') => {
        const formValue = formData.get(formKey);
        if (formValue !== null) {
            return formValue === 'true';
        }
        const existingValue = existingEnv.get(envKey);
        return existingValue !== undefined ? existingValue : defaultValue;
    };

    // Helper for numeric values
    const getNum = (formKey, envKey = formKey, defaultValue = 0) => {
        const formValue = formData.get(formKey);
        if (formValue !== null && formValue !== undefined && formValue !== '') {
            return formValue;
        }
        const existingValue = existingEnv.get(envKey);
        return existingValue !== undefined ? existingValue.replace(/^"(.*)"$/, '$1') : defaultValue;
    };

    // Simple mode - use defaults with username, but preserve any existing custom values
    if (configMode === 'simple') {
        const username = formData.get('USERNAME') || existingEnv.get('OWNER_USERNAME')?.replace(/^"(.*)"$/, '$1') || 'My';
        const relayUrlRaw = formData.get('RELAY_URL_SIMPLE') || existingEnv.get('RELAY_URL')?.replace(/^"(.*)"$/, '$1') || 'localhost:3355';
        const relayHost = validateRelayHost(relayUrlRaw);
        formData.set('RELAY_URL', relayHost);

        // Preserve existing icon URLs and other custom settings from existing .env
        const getExistingVal = (key) => existingEnv.get(key)?.replace(/^"(.*)"$/, '$1') || '';

        return `# Owner Configuration (REQUIRED)
# Your Nostr public key (npub format)
# Get this from your Nostr client or generate one at https://nostr.how
# **IMPORTANT**: Replace this example npub with your own npub!
OWNER_NPUB="${ownerNpub}"
OWNER_USERNAME="${username}"

# Relay Configuration (REQUIRED)
RELAY_URL="${relayHost}"
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
PRIVATE_RELAY_ICON="${getExistingVal('PRIVATE_RELAY_ICON')}"

## Private Relay Rate Limiters
PRIVATE_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${numVal('PRIVATE_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL', 50)}
PRIVATE_RELAY_EVENT_IP_LIMITER_INTERVAL=${numVal('PRIVATE_RELAY_EVENT_IP_LIMITER_INTERVAL', 1)}
PRIVATE_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${numVal('PRIVATE_RELAY_EVENT_IP_LIMITER_MAX_TOKENS', 100)}
PRIVATE_RELAY_ALLOW_EMPTY_FILTERS=${boolVal('PRIVATE_RELAY_ALLOW_EMPTY_FILTERS', true)}
PRIVATE_RELAY_ALLOW_COMPLEX_FILTERS=${boolVal('PRIVATE_RELAY_ALLOW_COMPLEX_FILTERS', true)}
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=${numVal('PRIVATE_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL', 3)}
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=${numVal('PRIVATE_RELAY_CONNECTION_RATE_LIMITER_INTERVAL', 5)}
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=${numVal('PRIVATE_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS', 9)}

## Chat Relay Settings
CHAT_RELAY_NAME="${username}'s Chat Relay"
CHAT_RELAY_NPUB="${ownerNpub}"
CHAT_RELAY_DESCRIPTION="A relay for private chats"
CHAT_RELAY_ICON="${getExistingVal('CHAT_RELAY_ICON')}"
CHAT_RELAY_WOT_DEPTH=${numVal('CHAT_RELAY_WOT_DEPTH', 3)}
CHAT_RELAY_WOT_REFRESH_INTERVAL_HOURS=${numVal('CHAT_RELAY_WOT_REFRESH_INTERVAL_HOURS', 24)}
CHAT_RELAY_MINIMUM_FOLLOWERS=${numVal('CHAT_RELAY_MINIMUM_FOLLOWERS', 3)}

## Chat Relay Rate Limiters
CHAT_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${numVal('CHAT_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL', 50)}
CHAT_RELAY_EVENT_IP_LIMITER_INTERVAL=${numVal('CHAT_RELAY_EVENT_IP_LIMITER_INTERVAL', 1)}
CHAT_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${numVal('CHAT_RELAY_EVENT_IP_LIMITER_MAX_TOKENS', 100)}
CHAT_RELAY_ALLOW_EMPTY_FILTERS=${boolVal('CHAT_RELAY_ALLOW_EMPTY_FILTERS', false)}
CHAT_RELAY_ALLOW_COMPLEX_FILTERS=${boolVal('CHAT_RELAY_ALLOW_COMPLEX_FILTERS', false)}
CHAT_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=${numVal('CHAT_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL', 3)}
CHAT_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=${numVal('CHAT_RELAY_CONNECTION_RATE_LIMITER_INTERVAL', 3)}
CHAT_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=${numVal('CHAT_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS', 9)}

## Outbox Relay Settings
OUTBOX_RELAY_NAME="${username}'s Outbox Relay"
OUTBOX_RELAY_NPUB="${ownerNpub}"
OUTBOX_RELAY_DESCRIPTION="A relay and Blossom server for public messages and media"
OUTBOX_RELAY_ICON="${getExistingVal('OUTBOX_RELAY_ICON')}"

## Outbox Relay Rate Limiters
OUTBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${numVal('OUTBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL', 10)}
OUTBOX_RELAY_EVENT_IP_LIMITER_INTERVAL=${numVal('OUTBOX_RELAY_EVENT_IP_LIMITER_INTERVAL', 60)}
OUTBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${numVal('OUTBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS', 100)}
OUTBOX_RELAY_ALLOW_EMPTY_FILTERS=${boolVal('OUTBOX_RELAY_ALLOW_EMPTY_FILTERS', false)}
OUTBOX_RELAY_ALLOW_COMPLEX_FILTERS=${boolVal('OUTBOX_RELAY_ALLOW_COMPLEX_FILTERS', false)}
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=${numVal('OUTBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL', 3)}
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=${numVal('OUTBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL', 1)}
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=${numVal('OUTBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS', 9)}

## Inbox Relay Settings
INBOX_RELAY_NAME="${username}'s Inbox Relay"
INBOX_RELAY_NPUB="${ownerNpub}"
INBOX_RELAY_DESCRIPTION="Send your interactions with my notes here"
INBOX_RELAY_ICON="${getExistingVal('INBOX_RELAY_ICON')}"
INBOX_PULL_INTERVAL_SECONDS=${numVal('INBOX_PULL_INTERVAL_SECONDS', 600)}

## Inbox Relay Rate Limiters
INBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${numVal('INBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL', 10)}
INBOX_RELAY_EVENT_IP_LIMITER_INTERVAL=${numVal('INBOX_RELAY_EVENT_IP_LIMITER_INTERVAL', 1)}
INBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${numVal('INBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS', 20)}
INBOX_RELAY_ALLOW_EMPTY_FILTERS=${boolVal('INBOX_RELAY_ALLOW_EMPTY_FILTERS', false)}
INBOX_RELAY_ALLOW_COMPLEX_FILTERS=${boolVal('INBOX_RELAY_ALLOW_COMPLEX_FILTERS', false)}
INBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=${numVal('INBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL', 3)}
INBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=${numVal('INBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL', 1)}
INBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=${numVal('INBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS', 9)}

## Import Settings
IMPORT_START_DATE="${getExistingVal('IMPORT_START_DATE') || '2025-10-13'}"
IMPORT_QUERY_INTERVAL_SECONDS=${numVal('IMPORT_QUERY_INTERVAL_SECONDS', 600)}
IMPORT_OWNER_NOTES_FETCH_TIMEOUT_SECONDS=${numVal('IMPORT_OWNER_NOTES_FETCH_TIMEOUT_SECONDS', 60)}
IMPORT_TAGGED_NOTES_FETCH_TIMEOUT_SECONDS=${numVal('IMPORT_TAGGED_NOTES_FETCH_TIMEOUT_SECONDS', 120)}
IMPORT_SEED_RELAYS_FILE="${getExistingVal('IMPORT_SEED_RELAYS_FILE') || '/haven-config/relays_import.json'}"

## Backup Settings
BACKUP_PROVIDER="${getExistingVal('BACKUP_PROVIDER') || 'none'}"
BACKUP_INTERVAL_HOURS=${numVal('BACKUP_INTERVAL_HOURS', 24)}

## Blastr Settings
BLASTR_RELAYS_FILE="${getExistingVal('BLASTR_RELAYS_FILE') || '/haven-config/relays_blastr.json'}"

## WOT Settings
WOT_FETCH_TIMEOUT_SECONDS=${numVal('WOT_FETCH_TIMEOUT_SECONDS', 60)}

## Logging
HAVEN_LOG_LEVEL="${getExistingVal('HAVEN_LOG_LEVEL') || 'INFO'}"
TZ="${getExistingVal('TZ') || 'UTC'}"
`;
    }

    // Full mode - use form values
    // Get username if it was previously set (for consistency)
    const username = formData.get('USERNAME') || existingEnv.get('OWNER_USERNAME')?.replace(/^"(.*)"$/, '$1') || '';

    // Helper for getting existing values (same as Simple mode)
    const getExistingVal = (key) => existingEnv.get(key)?.replace(/^"(.*)"$/, '$1') || '';

    const relayUrlRaw =
        formData.get('RELAY_URL') ||
        existingEnv.get('RELAY_URL')?.replace(/^"(.*)"$/, '$1') ||
        '';
    const relayHost = validateRelayHost(relayUrlRaw);
    formData.set('RELAY_URL', relayHost);

    let envContent = `# Owner Configuration (REQUIRED)
# Your Nostr public key (npub format)
# Get this from your Nostr client or generate one at https://nostr.how
# **IMPORTANT**: Replace this example npub with your own npub!
OWNER_NPUB="${ownerNpub}"
OWNER_USERNAME="${username}"

# Relay Configuration (REQUIRED)
RELAY_URL="${relayHost}"
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
PRIVATE_RELAY_ICON="${formData.get('PRIVATE_RELAY_ICON') ? formData.get('PRIVATE_RELAY_ICON') : ''}"

## Private Relay Rate Limiters
PRIVATE_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${formData.get('PRIVATE_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL')}
PRIVATE_RELAY_EVENT_IP_LIMITER_INTERVAL=${formData.get('PRIVATE_RELAY_EVENT_IP_LIMITER_INTERVAL')}
PRIVATE_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${formData.get('PRIVATE_RELAY_EVENT_IP_LIMITER_MAX_TOKENS')}
PRIVATE_RELAY_ALLOW_EMPTY_FILTERS=${formData.get('PRIVATE_RELAY_ALLOW_EMPTY_FILTERS') === 'true'}
PRIVATE_RELAY_ALLOW_COMPLEX_FILTERS=${formData.get('PRIVATE_RELAY_ALLOW_COMPLEX_FILTERS') === 'true'}
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=${numVal('PRIVATE_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL', 3)}
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=${numVal('PRIVATE_RELAY_CONNECTION_RATE_LIMITER_INTERVAL', 5)}
PRIVATE_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=${numVal('PRIVATE_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS', 9)}

## Chat Relay Settings
CHAT_RELAY_NAME="${formData.get('CHAT_RELAY_NAME')}"
CHAT_RELAY_NPUB="${ownerNpub}"
CHAT_RELAY_DESCRIPTION="${formData.get('CHAT_RELAY_DESCRIPTION')}"
CHAT_RELAY_ICON="${formData.get('CHAT_RELAY_ICON') ? formData.get('CHAT_RELAY_ICON') : ''}"
CHAT_RELAY_WOT_DEPTH=${formData.get('CHAT_RELAY_WOT_DEPTH')}
CHAT_RELAY_WOT_REFRESH_INTERVAL_HOURS=${formData.get('CHAT_RELAY_WOT_REFRESH_INTERVAL_HOURS')}
CHAT_RELAY_MINIMUM_FOLLOWERS=${formData.get('CHAT_RELAY_MINIMUM_FOLLOWERS')}

## Chat Relay Rate Limiters
CHAT_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${numVal('CHAT_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL', 50)}
CHAT_RELAY_EVENT_IP_LIMITER_INTERVAL=${numVal('CHAT_RELAY_EVENT_IP_LIMITER_INTERVAL', 1)}
CHAT_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${numVal('CHAT_RELAY_EVENT_IP_LIMITER_MAX_TOKENS', 100)}
CHAT_RELAY_ALLOW_EMPTY_FILTERS=${boolVal('CHAT_RELAY_ALLOW_EMPTY_FILTERS', false)}
CHAT_RELAY_ALLOW_COMPLEX_FILTERS=${boolVal('CHAT_RELAY_ALLOW_COMPLEX_FILTERS', false)}
CHAT_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=${numVal('CHAT_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL', 3)}
CHAT_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=${numVal('CHAT_RELAY_CONNECTION_RATE_LIMITER_INTERVAL', 3)}
CHAT_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=${numVal('CHAT_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS', 9)}

## Outbox Relay Settings
OUTBOX_RELAY_NAME="${formData.get('OUTBOX_RELAY_NAME')}"
OUTBOX_RELAY_NPUB="${ownerNpub}"
OUTBOX_RELAY_DESCRIPTION="${formData.get('OUTBOX_RELAY_DESCRIPTION')}"
OUTBOX_RELAY_ICON="${formData.get('OUTBOX_RELAY_ICON') ? formData.get('OUTBOX_RELAY_ICON') : ''}"

## Outbox Relay Rate Limiters
OUTBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${numVal('OUTBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL', 10)}
OUTBOX_RELAY_EVENT_IP_LIMITER_INTERVAL=${numVal('OUTBOX_RELAY_EVENT_IP_LIMITER_INTERVAL', 60)}
OUTBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${numVal('OUTBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS', 100)}
OUTBOX_RELAY_ALLOW_EMPTY_FILTERS=${boolVal('OUTBOX_RELAY_ALLOW_EMPTY_FILTERS', false)}
OUTBOX_RELAY_ALLOW_COMPLEX_FILTERS=${boolVal('OUTBOX_RELAY_ALLOW_COMPLEX_FILTERS', false)}
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=${numVal('OUTBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL', 3)}
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=${numVal('OUTBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL', 1)}
OUTBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=${numVal('OUTBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS', 9)}

## Inbox Relay Settings
INBOX_RELAY_NAME="${formData.get('INBOX_RELAY_NAME')}"
INBOX_RELAY_NPUB="${ownerNpub}"
INBOX_RELAY_DESCRIPTION="${formData.get('INBOX_RELAY_DESCRIPTION')}"
INBOX_RELAY_ICON="${formData.get('INBOX_RELAY_ICON') ? formData.get('INBOX_RELAY_ICON') : ''}"
INBOX_PULL_INTERVAL_SECONDS=${formData.get('INBOX_PULL_INTERVAL_SECONDS')}

## Inbox Relay Rate Limiters
INBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL=${numVal('INBOX_RELAY_EVENT_IP_LIMITER_TOKENS_PER_INTERVAL', 10)}
INBOX_RELAY_EVENT_IP_LIMITER_INTERVAL=${numVal('INBOX_RELAY_EVENT_IP_LIMITER_INTERVAL', 1)}
INBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS=${numVal('INBOX_RELAY_EVENT_IP_LIMITER_MAX_TOKENS', 20)}
INBOX_RELAY_ALLOW_EMPTY_FILTERS=${boolVal('INBOX_RELAY_ALLOW_EMPTY_FILTERS', false)}
INBOX_RELAY_ALLOW_COMPLEX_FILTERS=${boolVal('INBOX_RELAY_ALLOW_COMPLEX_FILTERS', false)}
INBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL=${numVal('INBOX_RELAY_CONNECTION_RATE_LIMITER_TOKENS_PER_INTERVAL', 3)}
INBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL=${numVal('INBOX_RELAY_CONNECTION_RATE_LIMITER_INTERVAL', 1)}
INBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS=${numVal('INBOX_RELAY_CONNECTION_RATE_LIMITER_MAX_TOKENS', 9)}

## Import Settings
IMPORT_START_DATE="${formData.get('IMPORT_START_DATE')}"
IMPORT_QUERY_INTERVAL_SECONDS=${numVal('IMPORT_QUERY_INTERVAL_SECONDS', 600)}
IMPORT_OWNER_NOTES_FETCH_TIMEOUT_SECONDS=${numVal('IMPORT_OWNER_NOTES_FETCH_TIMEOUT_SECONDS', 60)}
IMPORT_TAGGED_NOTES_FETCH_TIMEOUT_SECONDS=${numVal('IMPORT_TAGGED_NOTES_FETCH_TIMEOUT_SECONDS', 120)}
IMPORT_SEED_RELAYS_FILE="${getExistingVal('IMPORT_SEED_RELAYS_FILE') || '/haven-config/relays_import.json'}"

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
BLASTR_RELAYS_FILE="${getExistingVal('BLASTR_RELAYS_FILE') || '/haven-config/relays_blastr.json'}"

## WOT Settings
WOT_FETCH_TIMEOUT_SECONDS=${numVal('WOT_FETCH_TIMEOUT_SECONDS', 60)}

## Logging
HAVEN_LOG_LEVEL="${getExistingVal('HAVEN_LOG_LEVEL') || 'INFO'}"
TZ="${getExistingVal('TZ') || 'UTC'}"
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

        // Generate and validate configuration
        let envContent;
        try {
            envContent = await generateEnvFromForm();
        } catch (validationError) {
            // Show validation error and return early
            showNotification('❌ ' + validationError.message, 'error');
            btn.disabled = false;
            btn.innerHTML = originalContent;
            return;
        }

        const response = await fetch('/api/config/env', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: envContent })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('✓ Configuration saved successfully', 'success');
            // Update the advanced editor too
            document.getElementById('env-editor').value = envContent;
            // Reload form to ensure all fields are in sync
            loadConfigIntoForm();
            // Update relay URL display on Get Started page
            loadRelayUrlDisplay();
        } else {
            showNotification('Failed to save: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Error saving configuration: ' + error.message, 'error');
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

            // Reset wizard to step 0 when Configuration tab is clicked
            if (tabName === 'wizard') {
                currentStep = 0;
                configMode = null;
                updateWizardStep();
            }

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
    } else {
        // Handle tabs without navigation buttons (like logs)
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Remove active class from all tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show the requested tab
        const tabContent = document.getElementById(`${tabName}-tab`);
        if (tabContent) {
            tabContent.classList.add('active');

            // Special handling for logs tab - start streaming
            if (tabName === 'logs') {
                setTimeout(startLogStream, 100);
            }
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

// Version loading
async function loadVersion() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();

        const versionText = document.getElementById('version-text');
        if (versionText) {
            if (data.success && data.version) {
                versionText.textContent = `v${data.version}`;
            } else {
                versionText.textContent = 'v?.?.?';
            }
        }
    } catch (error) {
        console.error('Failed to load version:', error);
        const versionText = document.getElementById('version-text');
        if (versionText) {
            versionText.textContent = 'v?.?.?';
        }
    }
}

// Load Tor information (Umbrel only)
async function loadTorInfo() {
    try {
        const response = await fetch('/api/tor');
        const data = await response.json();

        if (data.success && data.available && data.address) {
            // Show Tor sections in both simple and full mode (config wizard)
            const torSectionSimple = document.getElementById('tor-section-simple');
            const torSectionFull = document.getElementById('tor-section-full');
            const torAddressSimple = document.getElementById('tor-address-simple');
            const torAddressFull = document.getElementById('tor-address-full');

            if (torSectionSimple) {
                torSectionSimple.style.display = 'block';
            }
            if (torSectionFull) {
                torSectionFull.style.display = 'block';
            }
            if (torAddressSimple) {
                torAddressSimple.value = data.address;
            }
            if (torAddressFull) {
                torAddressFull.value = data.address;
            }

            // Show Tor address on Get Started page
            const torUrlDisplaySection = document.getElementById('tor-url-display-section');
            const torUrlDisplay = document.getElementById('tor-url-display');

            if (torUrlDisplaySection && torUrlDisplay) {
                torUrlDisplaySection.style.display = 'flex';
                torUrlDisplay.textContent = data.address;
            }
        }
    } catch (error) {
        console.error('Failed to load Tor info:', error);
    }
}

// Load relay URL for Get Started page
async function loadRelayUrlDisplay() {
    try {
        const response = await fetch('/api/config/env');
        const data = await response.json();

        if (data.success) {
            const envContent = data.content;

            // Check if OWNER_NPUB is configured
            const npubMatch = envContent.match(/^OWNER_NPUB=(.*)$/m);
            const relayConnectionInfo = document.getElementById('relay-connection-info');
            const relaySeparator = document.getElementById('relay-separator');

            if (npubMatch) {
                const npub = npubMatch[1].replace(/^"(.*)"$/, '$1').trim();

                // Only show relay info if npub is configured and not the default placeholder
                if (npub && !npub.includes('YOUR_PUBLIC_KEY_HERE')) {
                    // Parse RELAY_URL from .env content
                    const relayUrlMatch = envContent.match(/^RELAY_URL=(.*)$/m);
                    if (relayUrlMatch) {
                        const relayUrl = relayUrlMatch[1].replace(/^"(.*)"$/, '$1').trim();
                        const relayUrlDisplay = document.getElementById('relay-url-display');

                        if (relayUrlDisplay && relayUrl) {
                            relayUrlDisplay.textContent = relayUrl;
                        }
                    }

                    // Show the relay connection info section and separator
                    if (relayConnectionInfo) {
                        relayConnectionInfo.style.display = 'flex';
                    }
                    if (relaySeparator) {
                        relaySeparator.style.display = 'block';
                    }
                } else {
                    // Hide the section if no valid npub
                    if (relayConnectionInfo) {
                        relayConnectionInfo.style.display = 'none';
                    }
                    if (relaySeparator) {
                        relaySeparator.style.display = 'none';
                    }
                }
            } else {
                // Hide the section if no npub found
                if (relayConnectionInfo) {
                    relayConnectionInfo.style.display = 'none';
                }
                if (relaySeparator) {
                    relaySeparator.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.error('Failed to load relay URL for display:', error);
    }
}

// Copy relay URL text to clipboard (for Get Started page - span elements)
function copyRelayUrlText(elementId) {
    const element = document.getElementById(elementId);
    if (element && element.textContent && element.textContent !== '-') {
        navigator.clipboard.writeText(element.textContent).then(() => {
            showNotification('Address copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showNotification('Failed to copy to clipboard', 'error');
        });
    }
}

// Copy relay URL to clipboard (for config wizard - input elements)
function copyRelayUrl(elementId) {
    const input = document.getElementById(elementId);
    if (input && input.value) {
        input.select();
        input.setSelectionRange(0, 99999); // For mobile devices

        navigator.clipboard.writeText(input.value).then(() => {
            showNotification('Address copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showNotification('Failed to copy to clipboard', 'error');
        });
    }
}

// Copy Tor address to clipboard (for config wizard)
function copyTorAddress(elementId) {
    const input = document.getElementById(elementId);
    if (input) {
        input.select();
        input.setSelectionRange(0, 99999); // For mobile devices

        navigator.clipboard.writeText(input.value).then(() => {
            showNotification('Tor address copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            showNotification('Failed to copy to clipboard', 'error');
        });
    }
}

// Status checking
async function checkStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        const indicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        const importButton = document.getElementById('run-import-btn');
        const isImportActive = ['running', 'cancelling', 'pending'].includes(importRunState);

        if (!indicator || !statusText) {
            return;
        }

        if (data.success) {
            const status = data.status || 'unknown';
            const health = data.health || 'unknown';
            const isRunning = status === 'running';
            const isHealthy = health === 'healthy';

            if (isRunning && isHealthy) {
                indicator.className = 'status-badge running';
                statusText.textContent = 'Running';
                if (importButton && !isImportActive && importButton.dataset.originalText) {
                    importButton.innerHTML = importButton.dataset.originalText;
                }
            } else if (isRunning) {
                indicator.className = 'status-badge starting';
                statusText.textContent = 'Starting...';
            } else {
                indicator.className = 'status-badge stopped';
                statusText.textContent = 'Stopped';
            }

            if (importButton && !isImportActive) {
                const disabled = !(isRunning && isHealthy);
                importButton.disabled = disabled;
                if (disabled) {
                    importButton.dataset.originalText = importButton.dataset.originalText || importButton.innerHTML;
                    importButton.innerHTML = 'Relay must be running';
                } else if (importButton.dataset.originalText) {
                    importButton.innerHTML = importButton.dataset.originalText;
                }
            }
        } else {
            indicator.className = 'status-badge stopped';
            statusText.textContent = 'Stopped';
            if (importButton && !isImportActive) {
                importButton.disabled = true;
                importButton.dataset.originalText = importButton.dataset.originalText || importButton.innerHTML;
                importButton.innerHTML = 'Relay must be running';
            }
        }
    } catch (error) {
        console.error('Status check failed:', error);
        const indicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        indicator.className = 'status-badge';
        statusText.textContent = 'Unknown';
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
            // Reload form to ensure all fields are in sync
            loadConfigIntoForm();
            // Update relay URL display on Get Started page
            loadRelayUrlDisplay();
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

function normalizeRelayHost(value) {
    if (!value) return '';
    let host = value.trim();
    host = host.replace(/^wss?:\/\//i, '');
    host = host.replace(/^https?:\/\//i, '');
    host = host.replace(/\/.*$/, '');
    return host;
}

function validateRelayHost(host) {
    const normalized = normalizeRelayHost(host);
    const hostPattern = /^[a-z0-9.-]+(?::\d{1,5})?$/i;
    if (!normalized || !hostPattern.test(normalized)) {
        throw new Error('Relay URL must be a hostname (optionally with port), e.g. relay.example.com or localhost:3355');
    }
    if (normalized.includes('localhost') && normalized.includes('127.0.0.1')) {
        throw new Error('Relay URL should not mix localhost with other hosts');
    }
    return normalized;
}

function normalizeEnvBoolean(value, defaultValue) {
    const defaultString = defaultValue ? 'true' : 'false';
    if (value === undefined || value === null || value === '') return defaultString;
    const normalized = value.toString().replace(/^"(.*)"$/, '$1').trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return 'true';
    if (['false', '0', 'no'].includes(normalized)) return 'false';
    return defaultString;
}

function normalizeEnvNumber(value, defaultValue) {
    if (value === undefined || value === null || value === '') return String(defaultValue);
    const cleaned = value.toString().replace(/^"(.*)"$/, '$1').trim();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
        return Number.isInteger(parsed) ? String(parsed) : cleaned;
    }
    return String(defaultValue);
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
let importRunState = 'idle';

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
    if (!statusElement) return;

    const runButton = document.getElementById('run-import-btn');
    const cancelButton = document.getElementById('cancel-import-btn');

    importRunState = status;

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
        case 'cancelling':
            statusElement.className = 'status-cancelling';
            statusElement.textContent = 'Cancelling...';
            break;
        case 'completed':
            statusElement.className = 'status-completed';
            statusElement.textContent = 'Completed';
            break;
        case 'failed':
            statusElement.className = 'status-failed';
            statusElement.textContent = 'Failed';
            break;
        case 'cancelled':
            statusElement.className = 'status-cancelled';
            statusElement.textContent = 'Cancelled';
            break;
        default:
            statusElement.className = 'status-idle';
            statusElement.textContent = status || 'Idle';
            break;
    }

    if (runButton && cancelButton) {
        if (status === 'running') {
            runButton.disabled = true;
            runButton.innerHTML = 'Importing...';
            cancelButton.style.display = 'inline-flex';
            cancelButton.disabled = false;
            cancelButton.innerHTML = 'Cancel Import';
            runButton.dataset.state = 'running';
            cancelButton.dataset.state = 'available';
        } else if (status === 'cancelling') {
            runButton.disabled = true;
            runButton.innerHTML = 'Cancelling...';
            cancelButton.style.display = 'inline-flex';
            cancelButton.disabled = true;
            cancelButton.innerHTML = 'Cancelling...';
            runButton.dataset.state = 'cancelling';
            cancelButton.dataset.state = 'cancelling';
        } else {
            runButton.disabled = false;
            runButton.innerHTML = 'Import Notes';
            cancelButton.disabled = true;
            cancelButton.style.display = 'none';
            cancelButton.innerHTML = 'Cancel Import';
            delete runButton.dataset.state;
            delete cancelButton.dataset.state;
        }
    }
}

function runImport() {
    const runButton = document.getElementById('run-import-btn');
    const cancelButton = document.getElementById('cancel-import-btn');
    const logContainer = document.getElementById('import-log-container');
    const logOutput = document.getElementById('import-log');

    // Confirm with user
    if (!confirm('This will stop HAVEN temporarily to import your notes. This may take several minutes.\n\nContinue with import?')) {
        return;
    }

    // Disable buttons while request is sent
    runButton.disabled = true;
    runButton.dataset.originalText = runButton.dataset.originalText || runButton.innerHTML;
    runButton.innerHTML = 'Importing...';
    runButton.dataset.state = 'pending';
    importRunState = 'pending';

    if (cancelButton) {
        cancelButton.style.display = 'inline-flex';
        cancelButton.disabled = true;
        cancelButton.innerHTML = 'Preparing...';
        cancelButton.dataset.state = 'pending';
    }

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
            if (cancelButton) {
                cancelButton.disabled = false;
                cancelButton.innerHTML = 'Cancel Import';
            }
            updateImportStatus('running');
            startImportLogStream();
        } else {
            throw new Error(data.error || 'Failed to start import');
        }
    })
    .catch(error => {
        console.error('Import error:', error);
        showNotification(`Failed to start import: ${error.message}`, 'error');
        runButton.disabled = false;
        runButton.innerHTML = 'Import Notes';
        delete runButton.dataset.state;
        importRunState = 'idle';
        if (cancelButton) {
            cancelButton.disabled = true;
            cancelButton.style.display = 'none';
            cancelButton.innerHTML = 'Cancel Import';
            delete cancelButton.dataset.state;
        }
        updateImportStatus('idle');
    });
}

function cancelImport() {
    const cancelButton = document.getElementById('cancel-import-btn');
    const runButton = document.getElementById('run-import-btn');

    if (!cancelButton || cancelButton.disabled) {
        return;
    }

    cancelButton.disabled = true;
    cancelButton.innerHTML = 'Cancelling...';
    cancelButton.dataset.state = 'cancelling';
    if (runButton) {
        runButton.innerHTML = 'Cancelling...';
    }
    updateImportStatus('cancelling');

    fetch('/api/import/cancel', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'}
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Import cancellation requested...', 'info');
            } else {
                throw new Error(data.error || 'Failed to cancel import');
            }
        })
        .catch(error => {
            console.error('Cancel import error:', error);
            showNotification(`Failed to cancel import: ${error.message}`, 'error');
            if (cancelButton) {
                cancelButton.disabled = false;
                cancelButton.innerHTML = 'Cancel Import';
                cancelButton.dataset.state = 'available';
            }
            if (runButton) {
                runButton.innerHTML = 'Importing...';
                runButton.dataset.state = 'running';
            }
            importRunState = 'running';
            updateImportStatus('running');
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
    const runButton = document.getElementById('run-import-btn');
    const cancelButton = document.getElementById('cancel-import-btn');

    importEventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);

        if (data.type === 'status') {
            updateImportStatus(data.status);

            if (['completed', 'failed', 'cancelled'].includes(data.status)) {
                importEventSource.close();
                importEventSource = null;
                runButton.disabled = false;
                runButton.innerHTML = 'Import Notes';
                delete runButton.dataset.state;
                if (cancelButton) {
                    cancelButton.disabled = true;
                    cancelButton.style.display = 'none';
                    cancelButton.innerHTML = 'Cancel Import';
                    delete cancelButton.dataset.state;
                }

                if (data.status === 'completed') {
                    showNotification('Import completed successfully!', 'success');
                } else if (data.status === 'failed') {
                    showNotification('Import failed. Check logs for details.', 'error');
                } else if (data.status === 'cancelled') {
                    showNotification('Import cancelled.', 'info');
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
        importEventSource = null;
        if (runButton) {
            runButton.disabled = false;
            runButton.innerHTML = 'Import Notes';
            delete runButton.dataset.state;
        }
        if (cancelButton) {
            cancelButton.disabled = true;
            cancelButton.style.display = 'none';
            cancelButton.innerHTML = 'Cancel Import';
            delete cancelButton.dataset.state;
        }
        importRunState = 'idle';

        const logLine = document.createElement('div');
        logLine.className = 'log-line error';
        logLine.textContent = 'Connection to import stream lost';
        logOutput.appendChild(logLine);
    };
}

// ==================== Logs Functionality ====================

let logsEventSource = null;
let logsLineCount = 0;
let logsPaused = false;
let logsPendingLines = [];

function startLogStream() {
    // Close existing connection if any
    if (logsEventSource) {
        logsEventSource.close();
    }

    const logsOutput = document.getElementById('logs-output');
    const statusText = document.getElementById('logs-status-text');
    const lineCountEl = document.getElementById('logs-line-count');
    const statusDot = document.querySelector('#logs-status .dot');

    // Clear output
    logsOutput.innerHTML = '';
    logsLineCount = 0;
    logsPendingLines = [];

    // Update status
    statusText.textContent = 'Connecting...';
    statusDot.style.background = 'var(--warning)';
    lineCountEl.textContent = '';

    // Create new EventSource for streaming logs
    logsEventSource = new EventSource('/api/logs/stream');

    logsEventSource.onopen = function() {
        statusText.textContent = 'Connected • Streaming';
        statusDot.style.background = 'var(--success)';
    };

    logsEventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);

        if (data.type === 'status' && data.status === 'connected') {
            // Initial connection confirmation
            return;
        }

        // Add log line
        const logLine = document.createElement('div');
        logLine.className = 'log-line';

        if (data.type === 'error') {
            logLine.classList.add('error');
        } else if (data.type === 'warning') {
            logLine.classList.add('warning');
        } else if (data.type === 'success') {
            logLine.classList.add('success');
        }

        logLine.textContent = data.message;

        if (logsPaused) {
            // If paused, store the line for later
            logsPendingLines.push(logLine);
        } else {
            // Add to display
            logsOutput.appendChild(logLine);
            logsLineCount++;

            // Limit to last 1000 lines to prevent memory issues
            if (logsLineCount > 1000) {
                logsOutput.removeChild(logsOutput.firstChild);
                logsLineCount--;
            }

            // Auto-scroll to bottom
            logsOutput.scrollTop = logsOutput.scrollHeight;

            // Update line count
            lineCountEl.textContent = `(${logsLineCount} lines)`;
        }
    };

    logsEventSource.onerror = function(error) {
        console.error('EventSource error:', error);
        statusText.textContent = 'Disconnected';
        statusDot.style.background = 'var(--error)';

        logsEventSource.close();
        logsEventSource = null;

        const errorLine = document.createElement('div');
        errorLine.className = 'log-line error';
        errorLine.textContent = 'Connection to log stream lost. Refresh the page to reconnect.';
        logsOutput.appendChild(errorLine);
    };
}

function stopLogStream() {
    if (logsEventSource) {
        logsEventSource.close();
        logsEventSource = null;

        const statusText = document.getElementById('logs-status-text');
        const statusDot = document.querySelector('#logs-status .dot');
        statusText.textContent = 'Disconnected';
        statusDot.style.background = 'var(--text-secondary)';
    }
}

function clearLogsDisplay() {
    const logsOutput = document.getElementById('logs-output');
    const lineCountEl = document.getElementById('logs-line-count');

    logsOutput.innerHTML = '';
    logsLineCount = 0;
    logsPendingLines = [];
    lineCountEl.textContent = '';

    const emptyLine = document.createElement('div');
    emptyLine.className = 'log-line';
    emptyLine.style.color = 'var(--text-secondary)';
    emptyLine.textContent = 'Display cleared. Logs will continue streaming...';
    logsOutput.appendChild(emptyLine);

    showNotification('Log display cleared', 'info');
}

function toggleLogsPause() {
    const pauseBtn = document.getElementById('pause-logs-btn');
    const logsOutput = document.getElementById('logs-output');

    logsPaused = !logsPaused;

    if (logsPaused) {
        pauseBtn.textContent = 'Resume';
        pauseBtn.classList.remove('btn-secondary');
        pauseBtn.classList.add('btn-warning');
        showNotification('Log streaming paused', 'info');
    } else {
        pauseBtn.textContent = 'Pause';
        pauseBtn.classList.remove('btn-warning');
        pauseBtn.classList.add('btn-secondary');

        // Add any pending lines
        if (logsPendingLines.length > 0) {
            logsPendingLines.forEach(line => {
                logsOutput.appendChild(line);
                logsLineCount++;
            });
            logsPendingLines = [];

            // Auto-scroll to bottom
            logsOutput.scrollTop = logsOutput.scrollHeight;

            // Update line count
            const lineCountEl = document.getElementById('logs-line-count');
            lineCountEl.textContent = `(${logsLineCount} lines)`;
        }

        showNotification('Log streaming resumed', 'info');
    }
}

async function downloadLogs() {
    const btn = document.getElementById('download-logs-btn');
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span> Loading...';

        const response = await fetch('/api/logs');
        const data = await response.json();

        if (data.success) {
            // Create a blob and download it
            const blob = new Blob([data.logs], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `haven-relay-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showNotification('Logs downloaded successfully', 'success');
        } else {
            showNotification('Failed to download logs: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error downloading logs:', error);
        showNotification('Error downloading logs: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// Auto-connect/disconnect when switching to/from logs tab
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            if (tabName === 'logs') {
                // Start streaming when entering logs tab
                setTimeout(startLogStream, 100);
            } else {
                // Stop streaming when leaving logs tab
                if (logsEventSource) {
                    stopLogStream();
                    logsPaused = false;
                    const pauseBtn = document.getElementById('pause-logs-btn');
                    if (pauseBtn) {
                        pauseBtn.textContent = 'Pause';
                        pauseBtn.classList.remove('btn-warning');
                        pauseBtn.classList.add('btn-secondary');
                    }
                }
            }
        });
    });
});
