const COLORS = {
  blue: "#0d99ff",
  neutral: "#8a8f98"
};

const DEFAULT_SETTINGS = {
  color: COLORS.blue,
  mode: "blue"
};

const modeInputs = [...document.querySelectorAll("input[name='mode']")];
const customColorInput = document.querySelector("#customColor");
const customSwatch = document.querySelector("#customSwatch");

function getStorage() {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) {
    return null;
  }

  return chrome.storage.sync;
}

function updateUi(settings) {
  const mode = settings.mode || DEFAULT_SETTINGS.mode;
  const color = settings.color || DEFAULT_SETTINGS.color;

  for (const input of modeInputs) {
    input.checked = input.value === mode;
  }

  customColorInput.value = color;
  customSwatch.style.background = color;
}

function saveSettings(nextSettings) {
  const storage = getStorage();

  if (!storage) {
    updateUi(nextSettings);
    return;
  }

  storage.set(nextSettings, () => updateUi(nextSettings));
}

function loadSettings() {
  const storage = getStorage();

  if (!storage) {
    updateUi(DEFAULT_SETTINGS);
    return;
  }

  storage.get(DEFAULT_SETTINGS, updateUi);
}

for (const input of modeInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) {
      return;
    }

    const color = COLORS[input.value] || customColorInput.value;
    saveSettings({ color, mode: input.value });
  });
}

customColorInput.addEventListener("input", () => {
  saveSettings({ color: customColorInput.value, mode: "custom" });
});

loadSettings();
