(() => {
  const DEFAULT_SETTINGS = {
    color: "#0d99ff",
    mode: "blue"
  };

  const RAINBOW_TERMS = [
    "255, 0, 0",
    "255, 122",
    "255, 199",
    "255, 200",
    "255, 255, 0",
    "0, 255, 0",
    "0, 199",
    "0, 200",
    "0, 0, 255",
    "blue",
    "cyan",
    "green",
    "orange",
    "red",
    "violet",
    "yellow"
  ];

  const LOADER_SELECTORS = [
    "[class^='loader--']",
    "[class*=' loader--']",
    "[class^='loading--']",
    "[class*=' loading--']",
    "[class^='progress_bar--']",
    "[class*=' progress_bar--']",
    "[class^='progressBar--']",
    "[class*=' progressBar--']",
    "[class*='rainbow']",
    "[class*='Rainbow']",
    "[role='progressbar']"
  ];

  let settings = { ...DEFAULT_SETTINGS };
  let queued = false;
  let observer;

  function getChromeStorage() {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) {
      return null;
    }

    return chrome.storage.sync;
  }

  function updateRootVariables() {
    document.documentElement.style.setProperty("--figma-loader-replacement", settings.color);
  }

  function looksLikeRainbow(backgroundImage) {
    if (!backgroundImage || backgroundImage === "none") {
      return false;
    }

    const value = backgroundImage.toLowerCase();

    if (!value.includes("gradient")) {
      return false;
    }

    return RAINBOW_TERMS.filter((term) => value.includes(term)).length >= 3;
  }

  function looksLikeLoaderBySize(element) {
    const rect = element.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return false;
    }

    const isBar = rect.width >= 24 && rect.height > 0 && rect.height <= 16;
    const isSpinner = rect.width <= 96 && rect.height <= 96 && Math.abs(rect.width - rect.height) <= 8;

    return isBar || isSpinner;
  }

  function shouldPatchElement(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.dataset.figmaLoaderReplacement === "true") {
      return false;
    }

    const className = String(element.className || "");
    const ariaValue = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("role") || ""}`;
    const hint = `${className} ${ariaValue}`.toLowerCase();
    const hasLoaderHint =
      hint.includes("loader") ||
      hint.includes("loading") ||
      hint.includes("progress") ||
      hint.includes("rainbow");

    const style = window.getComputedStyle(element);
    const hasRainbowGradient = looksLikeRainbow(style.backgroundImage);
    const hasLoaderShape = looksLikeLoaderBySize(element);

    return hasRainbowGradient || (hasLoaderHint && hasLoaderShape);
  }

  function patchElement(element) {
    element.dataset.figmaLoaderReplacement = "true";
    element.style.setProperty("background", settings.color, "important");
    element.style.setProperty("background-color", settings.color, "important");
    element.style.setProperty("background-image", "none", "important");
    element.style.setProperty("border-color", settings.color, "important");
    element.style.setProperty("color", settings.color, "important");
    element.style.setProperty("accent-color", settings.color, "important");
  }

  function patchLoaders() {
    queued = false;
    updateRootVariables();

    const candidates = new Set();

    for (const selector of LOADER_SELECTORS) {
      for (const element of document.querySelectorAll(selector)) {
        candidates.add(element);
      }
    }

    for (const element of document.querySelectorAll("div, span, progress")) {
      if (looksLikeRainbow(window.getComputedStyle(element).backgroundImage)) {
        candidates.add(element);
      }
    }

    for (const element of candidates) {
      if (shouldPatchElement(element)) {
        patchElement(element);
      }
    }
  }

  function queuePatch() {
    if (queued) {
      return;
    }

    queued = true;
    requestAnimationFrame(patchLoaders);
  }

  function watchPage() {
    if (observer || !document.documentElement) {
      return;
    }

    observer = new MutationObserver(queuePatch);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "aria-label", "role"],
      childList: true,
      subtree: true
    });

    queuePatch();
  }

  function loadSettings() {
    const storage = getChromeStorage();

    if (!storage) {
      watchPage();
      return;
    }

    storage.get(DEFAULT_SETTINGS, (storedSettings) => {
      settings = { ...DEFAULT_SETTINGS, ...storedSettings };
      watchPage();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      settings = {
        ...settings,
        ...Object.fromEntries(
          Object.entries(changes).map(([key, change]) => [key, change.newValue])
        )
      };

      document
        .querySelectorAll("[data-figma-loader-replacement='true']")
        .forEach((element) => {
          element.dataset.figmaLoaderReplacement = "false";
        });

      queuePatch();
    });
  }

  loadSettings();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queuePatch, { once: true });
  }
})();
