# Scene Reader

Scene Reader turns a Final Draft `.fdx` screenplay into a private, voice-performed listening experience. Upload a screenplay, press Play, and the app automatically assigns available device voices to the narrator and each character.

Everything happens in the browser. The screenplay is never uploaded to a server, and the app needs no account, subscription, API key, or backend.

## What V1 includes

- Proper XML-based Final Draft parsing
- Automatic character detection and distinct voice assignment
- Narration for scene headings, action, and transitions
- A Narration On/Off control (scene headings and transitions still play when off)
- Large Play/Pause, Previous, and Next controls
- Playback speed, progress, and scene navigation
- Scrollable screenplay with the current passage highlighted
- Per-screenplay voice choices, speed, narration preference, and resume position
- Local browser storage and a polished Resume card
- Mobile-first and accessible responsive design
- Graceful error messages for invalid, damaged, empty, or unsupported files

## Project structure

```text
screenplay-reader/
├── assets/logo.svg          App icon
├── js/
│   ├── app.js               Interface and player coordination
│   ├── fdx-parser.js        Final Draft XML parser
│   ├── speech-engine.js     Browser speech layer
│   └── storage.js           Private local persistence
├── tests/                   Browser-based parser and QA tests
├── index.html               Main application
├── styles.css               Responsive visual design
├── .nojekyll                Keeps GitHub Pages simple
├── package.json             Optional local/test commands
└── README.md                This guide
```

The production app has no dependencies and no build step.

## Fastest way to publish on GitHub (beginner-friendly)

You need a free [GitHub account](https://github.com/).

### 1. Download and unzip the project

Download the project ZIP and unzip it on your computer. Open the unzipped `screenplay-reader` folder. You should see `index.html`, `styles.css`, `README.md`, and the other files shown above.

### 2. Create a GitHub repository

1. Sign in to GitHub.
2. Select the **+** button in the upper-right corner, then **New repository**.
3. Name it `screenplay-reader`.
4. Choose **Public**. (GitHub Pages on a free personal account works most simply with a public repository. Your uploaded screenplays are still private because they never go into the repository.)
5. Do **not** add a README, `.gitignore`, or license—this project already includes them.
6. Select **Create repository**.

### 3. Upload the project files

1. On the empty repository page, select **uploading an existing file**.
2. Drag **the contents inside** the unzipped `screenplay-reader` folder into the upload area. Do not drag the outer folder itself.
3. Confirm that `index.html` appears at the top level of the upload list.
4. In the box near the bottom, type `Initial Scene Reader app`.
5. Select **Commit changes**.

### 4. Turn on GitHub Pages

1. In your repository, select **Settings**.
2. In the left menu, select **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to `/ (root)`.
5. Select **Save**.

GitHub normally publishes the site within a few minutes. The Pages screen will show the finished address. It will look like:

```text
https://YOUR-GITHUB-NAME.github.io/screenplay-reader/
```

Open that address in Chrome, Edge, or Safari and upload an `.fdx` screenplay.

### Quick live-site check

After the site is published:

- Open the URL on your phone and upload a test `.fdx`.
- Confirm the title appears and tap **Play**.
- Confirm different characters use different voices.
- Turn **Narration** off and confirm action is skipped while dialogue and scene headings continue.
- Try **Previous**, **Next**, a different scene, and a different speed.
- Change one character voice in **Voices**.
- Close the tab, reopen the site, and use **Continue listening** to resume.

## How to update the app later

When you receive updated project files:

1. Open your `screenplay-reader` repository on GitHub.
2. Select **Add file** → **Upload files**.
3. Drag in the updated files and folders. GitHub will replace files with matching names.
4. Type a short description such as `Update player`.
5. Select **Commit changes**.

GitHub Pages will republish automatically, usually within a few minutes. If you still see the old version, refresh the page or close and reopen the browser tab.

## Run locally (optional)

Opening `index.html` by double-clicking may work, but some browsers restrict local modules and storage. A tiny local web server is more reliable.

If Python is installed:

1. Open Terminal (Mac) or Command Prompt/PowerShell (Windows).
2. Change into the project folder.
3. Run:

   ```bash
   python3 -m http.server 8080
   ```

   On Windows, `python -m http.server 8080` may be the correct command.

4. Open `http://localhost:8080` in your browser.

You do not need to run the app locally to use GitHub Pages.

## Run automated tests (optional, for developers)

With Node.js installed:

```bash
npm install
npm test
```

These tests exercise title extraction, natural screenplay order, scene headings, action, dialogue, transitions, skipped parentheticals, character modifiers such as `(V.O.)`, `(O.S.)`, and `(CONT'D)`, long-passage chunking, and malformed files.

For a full interaction test, install Playwright's test browser once with `npx playwright install chromium`, then run `npm run test:browser`.

## Browser and voice limitations

Scene Reader uses the free Web Speech API built into the browser/device. That keeps V1 private and free, but the browser ultimately controls the voices.

- Voice quality and selection vary by device and browser.
- A voice available on one device may not exist on another. Scene Reader automatically falls back to an available voice instead of breaking playback.
- Some devices provide extra voices only after downloading them in the device's accessibility or speech settings.
- Mobile browsers may stop speech when the screen locks, the tab goes into the background, another app plays audio, or the operating system reclaims resources.
- On browsers where true speech pause is unreliable, Pause stops safely and Play restarts the current passage.
- Voice names can change after a browser or operating-system update.
- Browser storage can be cleared by private browsing, browser cleanup, or device settings. Keep the original `.fdx` file.
- GitHub Pages serves the application files publicly, but screenplay files selected inside the app remain on the user's device.

For the most predictable experience, use current Chrome or Edge on Android/desktop, or Safari on iPhone/iPad. Keep the screen awake during long listening sessions if your device stops background speech.

## Privacy

Scene Reader has no analytics, login, cookies, backend, database, or screenplay upload endpoint. Imported screenplay data and preferences are stored locally in the browser with IndexedDB. Clearing the site's browser data removes saved screenplays and preferences from that browser.

## Future-friendly architecture

The Final Draft parser, speech engine, storage, and interface are separate modules. This leaves clear extension points for future PDF/format parsers or premium text-to-speech providers without coupling those services to the player. None of those paid or server-based features are part of V1.
