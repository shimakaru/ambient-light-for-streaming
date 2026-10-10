const DEFAULTS = {
  enabled: true,
  strength: 65,
  fps: 24
};

const enabledToggle = document.getElementById('enabledToggle');
const strengthInput = document.getElementById('strength');
const strengthValue = document.getElementById('strengthValue');
const fpsSelect = document.getElementById('fps');

let saveTimer = null;

function save(partial) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set(partial);
  }, 120);
}

chrome.storage.sync.get(DEFAULTS, (items) => {
  enabledToggle.checked = !!items.enabled;
  strengthInput.value = items.strength;
  strengthValue.textContent = items.strength;
  fpsSelect.value = String(items.fps);
});

enabledToggle.addEventListener('change', () => {
  save({ enabled: enabledToggle.checked });
});

strengthInput.addEventListener('input', () => {
  strengthValue.textContent = strengthInput.value;
  save({ strength: Number(strengthInput.value) });
});

fpsSelect.addEventListener('change', () => {
  save({ fps: Number(fpsSelect.value) });
});
