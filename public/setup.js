const form = document.getElementById('setup-form');
const errorEl = document.getElementById('setup-error');
const producerInput = document.getElementById('producerUrl');
const portInput = document.getElementById('port');
const listingInput = document.getElementById('publicListingEnabled');
const privacyFields = document.getElementById('privacyFields');
const aliasInput = document.getElementById('publicAlias');
const countryInput = document.getElementById('countryCode');

async function loadDefaults() {
  try {
    const res = await fetch('/setup/defaults');
    if (!res.ok) return;
    const data = await res.json();
    if (data.producerUrl) producerInput.value = data.producerUrl;
    if (data.port) portInput.value = data.port;
    if (listingInput) listingInput.checked = data.publicListingEnabled === true;
    if (aliasInput) aliasInput.value = data.publicAlias || '';
    if (countryInput) countryInput.value = data.countryCode || '';
    if (privacyFields) privacyFields.classList.toggle('hidden', !listingInput?.checked);
  } catch {
    // ignore
  }
}

if (listingInput && privacyFields) {
  listingInput.addEventListener('change', () => {
    privacyFields.classList.toggle('hidden', !listingInput.checked);
  });
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.classList.add('hidden');
  const producerUrl = producerInput.value.trim();
  const port = Number(portInput.value);
  const publicListingEnabled = listingInput?.checked === true;
  const publicAlias = publicListingEnabled ? aliasInput.value.trim() : '';
  const countryCode = publicListingEnabled ? countryInput.value.trim().toUpperCase() : '';
  if (!producerUrl) {
    showError('Producer URL is required.');
    return;
  }
  if (!Number.isFinite(port) || port < 1024 || port > 65535) {
    showError('Port must be between 1024 and 65535.');
    return;
  }
  try {
    const res = await fetch('/setup/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producerUrl, port, publicListingEnabled, publicAlias, countryCode })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Failed to save settings.');
    }
    showError(`Starting observer on port ${data.port}...`);
  } catch (err) {
    showError(err.message || 'Failed to save settings.');
  }
});

loadDefaults();
