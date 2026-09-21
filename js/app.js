import { FdxParseError, filenameToTitle, parseFdx } from "./fdx-parser.js";
import { BrowserSpeechEngine, voiceKey } from "./speech-engine.js";
import { hashFile, loadLastScreenplay, loadScreenplay, saveScreenplay } from "./storage.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  landing: $("#landing-view"), player: $("#player-view"), headerActions: $("#player-header-actions"),
  fileInput: $("#file-input"), replaceFileInput: $("#replace-file-input"), dropZone: $("#drop-zone"),
  resumeCard: $("#resume-card"), resumeTitle: $("#resume-title"), resumeDetail: $("#resume-detail"), resumeProgress: $("#resume-progress"), resumeButton: $("#resume-button"),
  brandButton: $("#brand-button"), scriptTitle: $("#script-title"), scriptMeta: $("#script-meta"), scriptPages: $("#script-pages"),
  currentScene: $("#current-scene"), currentSpeaker: $("#current-speaker"), nowPlaying: $("#now-playing-heading"), passageKind: $("#passage-kind"),
  playButton: $("#play-button"), previousButton: $("#previous-button"), nextButton: $("#next-button"), progressSlider: $("#progress-slider"), progressCurrent: $("#progress-current"), progressTotal: $("#progress-total"),
  sceneSelect: $("#scene-select"), speedSelect: $("#speed-select"), narrationToggle: $("#narration-toggle"), toast: $("#toast"),
  voicesButton: $("#voices-button"), voiceModal: $("#voice-modal"), voiceList: $("#voice-list"), closeVoicesButton: $("#close-voices-button"), doneVoicesButton: $("#done-voices-button"), autoAssignButton: $("#auto-assign-button")
};

const speech = new BrowserSpeechEngine();
const state = {
  record: null,
  index: 0,
  isPlaying: false,
  voices: [],
  voiceAssignments: {},
  narration: true,
  rate: 1,
  saveTimer: null,
  lastFocused: null
};

function showToast(message, duration = 3600) {
  clearTimeout(showToast.timer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, duration);
}

function errorMessage(error) {
  if (error instanceof FdxParseError) return error.message;
  if (error?.message?.includes("storage")) return "This browser could not save the screenplay. You can still listen during this session.";
  return "Something went wrong while opening that screenplay. Please try another .fdx file.";
}

function defaultPreferences() {
  return { currentIndex: 0, narration: true, rate: 1, voiceAssignments: {} };
}

function autoAssignVoices(force = false) {
  const voices = state.voices;
  if (!voices.length || !state.record) return;
  const preferred = voices.filter((voice) => /^en(-|_)/i.test(voice.lang || ""));
  const pool = preferred.length ? preferred : voices;
  const assignments = force ? {} : { ...state.voiceAssignments };
  const validKeys = new Set(voices.map(voiceKey));
  if (force || !validKeys.has(assignments.NARRATOR)) assignments.NARRATOR = voiceKey(pool.find((voice) => voice.default) || pool[0]);

  state.record.script.characters.forEach((character, index) => {
    if (force || !validKeys.has(assignments[character.id])) {
      assignments[character.id] = voiceKey(pool[(index + 1) % pool.length]);
    }
  });
  state.voiceAssignments = assignments;
}

function shouldSkip(unit) {
  return !state.narration && unit.type === "action";
}

function findPlayableIndex(start, direction = 1) {
  const units = state.record?.script.units || [];
  let index = Math.max(0, Math.min(units.length - 1, start));
  while (units[index] && shouldSkip(units[index])) index += direction;
  if (index < 0 || index >= units.length) return null;
  return index;
}

function unitLabel(unit) {
  return unit.type === "scene" ? "scene heading" : unit.type;
}

function renderScript() {
  const { script } = state.record;
  elements.scriptTitle.textContent = script.title;
  elements.scriptMeta.textContent = `${script.scenes.length} ${script.scenes.length === 1 ? "scene" : "scenes"} · ${script.characters.length} ${script.characters.length === 1 ? "character" : "characters"}`;
  elements.scriptPages.replaceChildren();
  const fragment = document.createDocumentFragment();
  let lastCue = null;

  script.units.forEach((unit, index) => {
    if (unit.type === "dialogue" && unit.displayCue !== lastCue) {
      const cue = document.createElement("p");
      cue.className = "script-unit character";
      cue.textContent = unit.displayCue;
      cue.setAttribute("aria-hidden", "true");
      fragment.appendChild(cue);
      lastCue = unit.displayCue;
    } else if (unit.type !== "dialogue") {
      lastCue = null;
    }
    const paragraph = document.createElement("p");
    paragraph.id = unit.id;
    paragraph.className = `script-unit ${unit.type}`;
    paragraph.textContent = unit.text;
    paragraph.dataset.index = String(index);
    fragment.appendChild(paragraph);
  });
  elements.scriptPages.appendChild(fragment);

  elements.sceneSelect.replaceChildren();
  script.scenes.forEach((scene) => {
    const option = document.createElement("option");
    option.value = String(scene.unitIndex);
    option.textContent = scene.title;
    elements.sceneSelect.appendChild(option);
  });
  elements.progressSlider.max = String(Math.max(0, script.units.length - 1));
  elements.progressTotal.textContent = String(script.units.length);
}

function updateNowPlaying({ scroll = false } = {}) {
  const units = state.record?.script.units;
  if (!units?.length) return;
  state.index = Math.max(0, Math.min(units.length - 1, state.index));
  const unit = units[state.index];
  elements.currentScene.textContent = unit.scene || "Opening";
  elements.currentSpeaker.textContent = unit.type === "dialogue" ? unit.displayCue : "Narrator";
  elements.nowPlaying.textContent = unit.text;
  elements.passageKind.textContent = unitLabel(unit);
  elements.progressSlider.value = String(state.index);
  elements.progressCurrent.textContent = String(state.index + 1);
  elements.speedSelect.value = String(state.rate);
  elements.narrationToggle.checked = state.narration;

  const active = elements.scriptPages.querySelector(".is-active");
  active?.classList.remove("is-active");
  const next = document.getElementById(unit.id);
  next?.classList.add("is-active");
  if (scroll) next?.scrollIntoView({ behavior: "smooth", block: "center" });

  const scene = [...state.record.script.scenes].reverse().find((item) => item.unitIndex <= state.index);
  if (scene) elements.sceneSelect.value = String(scene.unitIndex);
  queueSave();
}

function setPlaying(value) {
  state.isPlaying = value;
  elements.playButton.classList.toggle("is-playing", value);
  elements.playButton.setAttribute("aria-label", value ? "Pause" : "Play");
  if (!value) speech.stop();
}

function playCurrent() {
  if (!state.record) return;
  const playable = findPlayableIndex(state.index, 1);
  if (playable === null) {
    setPlaying(false);
    showToast("You’ve reached the end of the screenplay.");
    return;
  }
  state.index = playable;
  updateNowPlaying({ scroll: true });
  setPlaying(true);

  const unit = state.record.script.units[state.index];
  const assignmentKey = unit.type === "dialogue" ? unit.characterId : "NARRATOR";
  const voice = speech.resolveVoice(state.voiceAssignments[assignmentKey], state.index);
  speech.speak(unit.text, {
    voice,
    rate: state.rate,
    onEnd: () => {
      if (!state.isPlaying) return;
      const next = findPlayableIndex(state.index + 1, 1);
      if (next === null) {
        setPlaying(false);
        showToast("Screenplay finished.");
        return;
      }
      state.index = next;
      playCurrent();
    },
    onError: () => {
      setPlaying(false);
      showToast("Speech playback stopped. Tap Play to continue.");
    }
  });
}

function togglePlayback() {
  if (state.isPlaying) setPlaying(false);
  else playCurrent();
}

function move(direction) {
  if (!state.record) return;
  const next = findPlayableIndex(state.index + direction, direction);
  if (next === null) return;
  const wasPlaying = state.isPlaying;
  setPlaying(false);
  state.index = next;
  updateNowPlaying({ scroll: true });
  if (wasPlaying) playCurrent();
}

function queueSave() {
  if (!state.record) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveState, 250);
}

async function saveState() {
  if (!state.record) return;
  state.record.preferences = {
    currentIndex: state.index,
    narration: state.narration,
    rate: state.rate,
    voiceAssignments: state.voiceAssignments
  };
  try { state.record = await saveScreenplay(state.record); }
  catch { /* Playback should keep working when persistence is unavailable. */ }
}

async function openRecord(record) {
  setPlaying(false);
  state.record = record;
  const preferences = { ...defaultPreferences(), ...(record.preferences || {}) };
  state.index = Number.isInteger(preferences.currentIndex) ? preferences.currentIndex : 0;
  state.narration = preferences.narration !== false;
  state.rate = Number(preferences.rate) || 1;
  state.voiceAssignments = preferences.voiceAssignments || {};
  autoAssignVoices();
  renderScript();
  elements.landing.hidden = true;
  elements.player.hidden = false;
  elements.headerActions.hidden = false;
  updateNowPlaying({ scroll: true });
  queueSave();
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.fdx$/i.test(file.name)) {
    showToast("Please choose a Final Draft .fdx file.");
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showToast("That file is unusually large. Please choose an FDX file under 25 MB.");
    return;
  }

  try {
    const [text, id] = await Promise.all([file.text(), hashFile(file)]);
    const script = parseFdx(text, filenameToTitle(file.name));
    let record = null;
    try { record = await loadScreenplay(id); } catch { /* This may be a new screenplay. */ }
    if (!record) record = { id, filename: file.name, script, preferences: defaultPreferences(), createdAt: Date.now() };
    await openRecord(record);
    await saveState();
    showToast(`${script.title} is ready.`);
  } catch (error) {
    console.error("Could not open screenplay:", error);
    showToast(errorMessage(error), 5200);
  } finally {
    elements.fileInput.value = "";
    elements.replaceFileInput.value = "";
  }
}

function showHome() {
  setPlaying(false);
  closeVoiceModal();
  if (state.record) populateResume(state.record);
  elements.player.hidden = true;
  elements.headerActions.hidden = true;
  elements.landing.hidden = false;
}

function voiceOptions(selectedKey) {
  return state.voices.map((voice) => {
    const option = document.createElement("option");
    option.value = voiceKey(voice);
    option.textContent = `${voice.name} · ${voice.lang || "Unknown language"}${voice.localService ? "" : " · online"}`;
    option.selected = option.value === selectedKey;
    return option;
  });
}

function renderVoiceList() {
  elements.voiceList.replaceChildren();
  const roles = [{ id: "NARRATOR", name: "Narrator", detail: "Scene headings & action" }, ...state.record.script.characters.map((character) => ({ ...character, detail: "Character" }))];
  const fragment = document.createDocumentFragment();

  roles.forEach((role) => {
    const row = document.createElement("div");
    row.className = "voice-row";
    const identity = document.createElement("div");
    identity.className = "voice-identity";
    const strong = document.createElement("strong");
    strong.textContent = role.name;
    const detail = document.createElement("span");
    detail.textContent = role.detail;
    identity.append(strong, detail);

    const select = document.createElement("select");
    select.setAttribute("aria-label", `${role.name} voice`);
    select.append(...voiceOptions(state.voiceAssignments[role.id]));
    select.addEventListener("change", () => {
      state.voiceAssignments[role.id] = select.value;
      queueSave();
    });

    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "preview-voice";
    preview.setAttribute("aria-label", `Preview ${role.name} voice`);
    preview.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5 6.5 9H3v6h3.5l4.5 4zM15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11"/></svg>';
    preview.addEventListener("click", () => {
      const voice = speech.resolveVoice(select.value);
      speech.preview(role.id === "NARRATOR" ? "The city settles into the blue hour." : `This is ${role.name}.`, voice, state.rate);
    });
    row.append(identity, select, preview);
    fragment.appendChild(row);
  });
  elements.voiceList.appendChild(fragment);
}

function openVoiceModal() {
  if (!state.record) return;
  state.lastFocused = document.activeElement;
  setPlaying(false);
  renderVoiceList();
  elements.voiceModal.hidden = false;
  elements.closeVoicesButton.focus();
}

function closeVoiceModal() {
  if (elements.voiceModal.hidden) return;
  speech.stop();
  elements.voiceModal.hidden = true;
  state.lastFocused?.focus?.();
}

function populateResume(record) {
  const progress = Math.round(((record.preferences?.currentIndex || 0) / Math.max(1, record.script.units.length - 1)) * 100);
  elements.resumeTitle.textContent = record.script.title;
  elements.resumeDetail.textContent = progress > 1 ? `${progress}% complete` : "Ready to begin";
  elements.resumeProgress.style.width = `${progress}%`;
  elements.resumeCard.hidden = false;
  elements.resumeButton.onclick = () => openRecord(record);
}

function bindEvents() {
  elements.fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
  elements.replaceFileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
  elements.playButton.addEventListener("click", togglePlayback);
  elements.previousButton.addEventListener("click", () => move(-1));
  elements.nextButton.addEventListener("click", () => move(1));
  elements.brandButton.addEventListener("click", showHome);
  elements.voicesButton.addEventListener("click", openVoiceModal);
  elements.closeVoicesButton.addEventListener("click", closeVoiceModal);
  elements.doneVoicesButton.addEventListener("click", closeVoiceModal);
  elements.voiceModal.addEventListener("click", (event) => { if (event.target === elements.voiceModal) closeVoiceModal(); });
  elements.autoAssignButton.addEventListener("click", () => {
    autoAssignVoices(true);
    renderVoiceList();
    queueSave();
    showToast("Voices reassigned.");
  });
  elements.speedSelect.addEventListener("change", () => {
    state.rate = Number(elements.speedSelect.value) || 1;
    const wasPlaying = state.isPlaying;
    setPlaying(false);
    updateNowPlaying();
    if (wasPlaying) playCurrent();
  });
  elements.narrationToggle.addEventListener("change", () => {
    state.narration = elements.narrationToggle.checked;
    const wasPlaying = state.isPlaying;
    setPlaying(false);
    if (shouldSkip(state.record.script.units[state.index])) state.index = findPlayableIndex(state.index + 1, 1) ?? state.index;
    updateNowPlaying({ scroll: true });
    if (wasPlaying) playCurrent();
  });
  elements.sceneSelect.addEventListener("change", () => {
    setPlaying(false);
    state.index = Number(elements.sceneSelect.value) || 0;
    updateNowPlaying({ scroll: true });
  });
  elements.progressSlider.addEventListener("input", () => {
    setPlaying(false);
    const requested = Number(elements.progressSlider.value) || 0;
    state.index = findPlayableIndex(requested, 1) ?? findPlayableIndex(requested, -1) ?? requested;
    updateNowPlaying({ scroll: true });
  });
  elements.scriptPages.addEventListener("click", (event) => {
    const unit = event.target.closest("[data-index]");
    if (!unit) return;
    setPlaying(false);
    state.index = Number(unit.dataset.index);
    updateNowPlaying({ scroll: true });
  });

  ["dragenter", "dragover"].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  }));
  elements.dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));

  document.addEventListener("keydown", (event) => {
    const interactive = /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName);
    if (event.key === "Escape") closeVoiceModal();
    if (!state.record || interactive || !elements.voiceModal.hidden) return;
    if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
  });
  window.addEventListener("pagehide", () => { saveState(); speech.stop(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.isPlaying) setPlaying(false);
  });
}

async function init() {
  bindEvents();
  state.voices = await speech.loadVoices();
  if (!state.voices.length) showToast("No speech voices are available in this browser. Try Chrome, Edge, or Safari.", 6500);
  try {
    const last = await loadLastScreenplay();
    if (last) populateResume(last);
  } catch (error) {
    console.warn("Saved screenplay could not be restored:", error);
    showToast("A previously saved screenplay could not be restored. You can upload it again.", 5000);
  }
}

init();
