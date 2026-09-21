import fs from "node:fs/promises";
import { Window } from "happy-dom";
import { indexedDB } from "fake-indexeddb";
import { webcrypto } from "node:crypto";

const window = new Window({ url: "https://example.test/screenplay-reader/" });
const document = window.document;
const voices = [
  { name: "Local One", lang: "en-US", voiceURI: "local-one", default: true, localService: true },
  { name: "Local Two", lang: "en-US", voiceURI: "local-two", default: false, localService: true },
  { name: "Local Three", lang: "en-GB", voiceURI: "local-three", default: false, localService: true }
];
const spoken = [];
const fakeSpeech = {
  speaking: false,
  getVoices: () => voices,
  addEventListener() {},
  removeEventListener() {},
  speak(utterance) { this.speaking = true; spoken.push(utterance); },
  cancel() { this.speaking = false; }
};

class FakeUtterance {
  constructor(text) { this.text = text; }
}

const globals = {
  window,
  document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  indexedDB,
  crypto: webcrypto,
  DOMParser: window.DOMParser,
  SpeechSynthesisUtterance: FakeUtterance,
  File: window.File,
  Event: window.Event
};
for (const [name, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
Object.defineProperty(window, "indexedDB", { value: indexedDB });
Object.defineProperty(window, "speechSynthesis", { value: fakeSpeech });
if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = () => {};

const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8");
document.write(html);
document.close();
await import(`../js/app.js?test=${Date.now()}`);

const fixture = await fs.readFile(new URL("./fixtures/representative.fdx", import.meta.url), "utf8");
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`✓ ${name}`); }
  catch (error) { results.push({ name, pass: false }); console.error(`✗ ${name} — ${error.message}`); }
}

await pause(20);
await test("starts on the simple upload screen", () => {
  check(!document.querySelector("#landing-view").hidden, "Landing view is hidden");
  check(document.querySelector("#player-view").hidden, "Player should start hidden");
});

await test("uploads FDX and opens a populated player", async () => {
  const input = document.querySelector("#file-input");
  const file = new window.File([fixture], "passenger.fdx", { type: "application/xml" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  await pause(80);
  check(!document.querySelector("#player-view").hidden, "Player did not open");
  check(document.querySelector("#script-title").textContent === "PASSENGER", "Title was not rendered");
  check(document.querySelectorAll(".script-unit.dialogue").length === 3, "Dialogue blocks are missing");
  check(!document.body.textContent.includes("(carefully)"), "Parenthetical leaked into listening UI");
});

await test("play pause and previous next controls update safely", () => {
  const play = document.querySelector("#play-button");
  play.click();
  check(play.getAttribute("aria-label") === "Pause", "Play did not start");
  check(spoken.at(-1)?.text === "EXT. LOS ANGELES - NIGHT", "Wrong opening speech unit");
  play.click();
  check(play.getAttribute("aria-label") === "Play", "Pause did not stop");
  document.querySelector("#next-button").click();
  check(document.querySelector("#now-playing-heading").textContent.startsWith("Traffic glows"), "Next did not advance");
  document.querySelector("#previous-button").click();
  check(document.querySelector("#now-playing-heading").textContent.startsWith("EXT. LOS"), "Previous did not return");
});

await test("narration off skips action but keeps scene headings", () => {
  const toggle = document.querySelector("#narration-toggle");
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector("#next-button").click();
  check(document.querySelector("#current-speaker").textContent === "EVAN (V.O.)", "Action was not skipped");
});

await test("speed and scene navigation update the player", () => {
  const speed = document.querySelector("#speed-select");
  speed.value = "1.5";
  speed.dispatchEvent(new window.Event("change", { bubbles: true }));
  check(speed.value === "1.5", "Speed did not update");
  const scene = document.querySelector("#scene-select");
  scene.value = "7";
  scene.dispatchEvent(new window.Event("change", { bubbles: true }));
  check(document.querySelector("#now-playing-heading").textContent.includes("TRAFFIC OPERATIONS"), "Scene jump failed");
});

await test("voice assignments are editable and can be previewed", () => {
  document.querySelector("#voices-button").click();
  const modal = document.querySelector("#voice-modal");
  check(!modal.hidden, "Voice panel did not open");
  check(document.querySelectorAll(".voice-row").length === 3, "Narrator and characters were not listed");
  const firstSelect = document.querySelector(".voice-row select");
  firstSelect.value = "local-two";
  firstSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  document.querySelector(".preview-voice").click();
  check(spoken.at(-1)?.voice?.voiceURI === "local-two", "Voice preview did not use selection");
  document.querySelector("#done-voices-button").click();
  check(modal.hidden, "Voice panel did not close");
});

await test("playback state persists and supports resume", async () => {
  await pause(400);
  document.querySelector("#brand-button").click();
  check(!document.querySelector("#resume-card").hidden, "Resume card did not appear");
  check(document.querySelector("#resume-title").textContent === "PASSENGER", "Resume title is wrong");
  document.querySelector("#resume-button").click();
  check(!document.querySelector("#player-view").hidden, "Resume did not reopen player");
  check(document.querySelector("#progress-current").textContent === "8", "Exact passage position was not restored");
});

await test("malformed FDX produces plain-language feedback", async () => {
  const input = document.querySelector("#replace-file-input");
  const file = new window.File(["<FinalDraft><Content>"], "broken.fdx", { type: "application/xml" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  await pause(40);
  check(/damaged|valid Final Draft/i.test(document.querySelector("#toast").textContent), "Friendly malformed-file error is missing");
});

if (results.some((result) => !result.pass)) process.exit(1);
