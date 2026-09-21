const READABLE_TYPES = new Set(["scene heading", "action", "dialogue", "transition"]);
const CHARACTER_MODIFIERS = new Set([
  "CONT'D", "CONT’D", "CONTINUED", "V.O.", "VO", "V/O", "VOICE OVER",
  "O.S.", "OS", "O/S", "OFF SCREEN", "O.C.", "OC", "OFF CAMERA", "FILTERED"
]);

function directTextContent(paragraph) {
  if (!paragraph) return "";
  const textNodes = Array.from(paragraph.getElementsByTagName("Text"));
  return textNodes
    .map((node) => node.textContent || "")
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeCharacterName(cue) {
  let value = String(cue || "").replace(/\s+/g, " ").trim();
  let previous = "";
  while (value && previous !== value) {
    previous = value;
    value = value.replace(/\s*\(([^()]*)\)\s*$/, (match, inner) => {
      const normalized = inner.replace(/\s+/g, " ").trim().toUpperCase();
      return CHARACTER_MODIFIERS.has(normalized) ? "" : match;
    }).trim();
  }
  return value || String(cue || "").trim() || "Unknown Character";
}

function extractTitle(xmlDocument, fallbackTitle) {
  const titlePages = xmlDocument.getElementsByTagName("TitlePage");
  if (titlePages.length) {
    const paragraphs = Array.from(titlePages[0].getElementsByTagName("Paragraph"));
    const explicitlyTitled = paragraphs.find((p) => (p.getAttribute("Type") || "").toLowerCase() === "title");
    const title = directTextContent(explicitlyTitled || paragraphs[0]);
    if (title) return title;
  }

  const documentTitle = xmlDocument.documentElement?.getAttribute("Title");
  if (documentTitle?.trim()) return documentTitle.trim();
  return fallbackTitle || "Untitled Screenplay";
}

function makeId(index) {
  return `unit-${index}`;
}

export class FdxParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FdxParseError";
    this.code = code;
  }
}

export function parseFdx(xmlText, fallbackTitle = "Untitled Screenplay") {
  if (typeof DOMParser === "undefined") {
    throw new FdxParseError("unsupported", "This browser cannot read Final Draft files.");
  }

  const document = new DOMParser().parseFromString(String(xmlText || ""), "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new FdxParseError("malformed", "This file is damaged or is not a valid Final Draft screenplay.");
  }

  const rootName = document.documentElement?.localName?.toLowerCase();
  if (rootName !== "finaldraft") {
    throw new FdxParseError("invalid", "This does not appear to be a Final Draft .fdx file.");
  }

  const content = Array.from(document.documentElement.childNodes || [])
    .find((element) => element.nodeType === 1 && element.localName === "Content")
    || document.getElementsByTagName("Content")[0];
  if (!content) {
    throw new FdxParseError("empty", "No readable screenplay content was found in this file.");
  }

  const units = [];
  const scenes = [];
  const characterMap = new Map();
  let currentCharacter = null;
  let currentCue = null;
  let currentScene = "Opening";

  const paragraphs = Array.from(content.getElementsByTagName("Paragraph"));
  for (const paragraph of paragraphs) {
    const type = (paragraph.getAttribute("Type") || "").trim().toLowerCase();
    const text = directTextContent(paragraph);
    if (!text) continue;

    if (type === "character") {
      currentCue = text;
      currentCharacter = normalizeCharacterName(text);
      const key = currentCharacter.toLocaleUpperCase();
      if (!characterMap.has(key)) {
        characterMap.set(key, { id: key, name: currentCharacter, displayCues: new Set() });
      }
      characterMap.get(key).displayCues.add(text);
      continue;
    }

    if (type === "parenthetical") continue;
    if (!READABLE_TYPES.has(type)) {
      currentCharacter = null;
      currentCue = null;
      continue;
    }

    if (type === "scene heading") {
      currentScene = text;
      scenes.push({ title: text, unitIndex: units.length });
      currentCharacter = null;
      currentCue = null;
    }

    const isDialogue = type === "dialogue";
    const unit = {
      id: makeId(units.length),
      type: type === "scene heading" ? "scene" : type,
      text,
      scene: currentScene,
      speaker: isDialogue ? (currentCharacter || "Unknown Character") : "Narrator",
      characterId: isDialogue ? (currentCharacter || "Unknown Character").toLocaleUpperCase() : null,
      displayCue: isDialogue ? (currentCue || currentCharacter || "Unknown Character") : null
    };
    units.push(unit);

    if (!isDialogue) {
      currentCharacter = null;
      currentCue = null;
    }
  }

  if (!units.length) {
    throw new FdxParseError("empty", "No readable screenplay content was found in this file.");
  }

  if (!scenes.length) scenes.push({ title: "Opening", unitIndex: 0 });

  const characters = Array.from(characterMap.values()).map((character) => ({
    id: character.id,
    name: character.name,
    displayCues: Array.from(character.displayCues)
  }));

  return {
    title: extractTitle(document, fallbackTitle),
    units,
    scenes,
    characters,
    format: "Final Draft"
  };
}

export function filenameToTitle(filename = "") {
  return filename.replace(/\.fdx$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled Screenplay";
}
