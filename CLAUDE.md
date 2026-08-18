# Timed Comic Thumbnailing Tool — Architecture Reference

> This file is the authoritative design record. Read it before touching any feature code.
> Append one line to the Decision Log whenever the brief is silent or ambiguous.

---

## 1. Data Model

```ts
type Unit      = 'mm' | 'cm' | 'in' | 'px';
type Direction = 'rtl' | 'ltr';
type LineWidth = 'thin' | 'medium' | 'thick';   // resolved to 0.4 / 0.8 / 1.4 mm

type Point  = { x: number; y: number };          // mm, relative to owning panel top-left
type Stroke = { id: string; points: Point[]; width: number }; // width in mm

type Panel = {
  id: string;
  x: number; y: number; width: number; height: number; // mm
  order: number | null;   // null = unordered
  strokes: Stroke[];
};

type Page = { id: string; panels: Panel[] };

type Project = {
  id: string;
  name: string;
  createdAt: number;
  pageWidthMm: number;
  pageHeightMm: number;
  direction: Direction;
  firstPageIsSingle: boolean;
  pages: Page[];
  settings: { secondsPerPanel: number; lineWidth: LineWidth; snap: boolean };
  activeSession: SessionState | null;
};

type SessionState = {
  pageId: string;
  panelIndex: number;     // index into ordered panels
  remainingMs: number;    // frozen value; only meaningful while paused
  status: 'running' | 'paused' | 'finished';
};
```

Key invariants:
- Strokes live **on the panel**, never on the page or globally.
- `order` is **always set explicitly by the artist**; never inferred from position or direction.
- `activeSession` is the only "live" state; everything else is pure data.

---

## 2. Three Coordinate Systems

| System | Unit | Origin | Used for | Stored? |
|--------|------|---------|----------|---------|
| **Logical (page)** | mm (float) | Top-left of page | Panel geometry (x, y, w, h) | **Yes** |
| **Logical (panel)** | mm (float) | Top-left of owning panel | Every stroke point | **Yes** |
| **Display** | CSS pixels | Top-left of viewport | Rendering, hit-testing pointer input | No — derived per render |
| **Export** | device pixels at target DPI | Top-left of page | Output file rasterisation | No — derived at export time |

### Conversion rules

```
// page-mm → display-px
displayX = pageOffsetX + (logicalX * scale)
displayY = pageOffsetY + (logicalY * scale)
scale     = (CSS pixel width of the rendered page) / pageWidthMm

// display-px → page-mm  (inverse)
logicalX = (displayX - pageOffsetX) / scale
logicalY = (displayY - pageOffsetY) / scale

// panel-mm → page-mm
pageX = panel.x + pointX
pageY = panel.y + pointY

// page-mm → export-px
exportX = pageMmX / 25.4 * dpi   (rounded)
```

All conversions live in **`src/coords.ts`** and nowhere else.

### Round-trip unit test (required in Phase 1)
Convert a point at scales 0.5×, 1×, and 2.5× through both directions and assert the round-trip error is < 0.001 mm.

---

## 3. Phase List

### Phase 1 — Model + Project Shell
**Gate:** a project persists across a browser refresh.

- IndexedDB persistence, ~500 ms debounced autosave
- Project creation wizard: page count, page size (A5 / A4 / Square / Custom + unit picker), direction, first-page behaviour
- `coords.ts` with round-trip unit test
- Pages overview: numbered thumbnails, open / add / delete / reorder / duplicate page, duplicate-layout-only, drawn-indicator badge
- Spread pairing via `getSpreads(pageCount, direction, firstPageIsSingle): (Page|null)[][]`
  ```
  RTL example, firstPageIsSingle=true (8 pages):
       [01]
  [03] [02]
  [05] [04]
  [07] [06]
       [08]
  ```

### Phase 2 — Build Grid
**Gate:** three panels drawn, dragged, resized, undone, and still correct after rotating the viewport.

- Blank white canvas per page; tap "+ Panel" to place a default rectangle
- Drag (body) and resize (corners + edges, ≥ 44 px touch target)
- Panels clamped inside page bounds; may overlap freely
- Snap ± 2 mm in logical space; Snap On/Off toggle
- Undo/Redo via full geometry snapshots of the panel array

### Phase 3 — Panel Order
**Gate:** order survives save/reload; session blocked until complete.

- "Set Panel Order" locks geometry; artist taps panels to assign 1, 2, 3 …
- Undo Last and Clear Order controls
- Session start gated: every panel must have a non-null order

### Phase 4 — Timed Session
**Gate:** full run through three panels at 15 s with correct locking.

- Setup: time per panel + line width
- 3→2→1 countdown → panel 1 activates
- Deadline-based timer (`deadline = performance.now() + durationMs`)
- Persistent HUD: countdown + panel N / total
- Tools: Pen · Eraser (whole-stroke hit-test) · Undo (active panel only)
- Drawing: pointerType === 'pen' only; finger/mouse never marks
- Canvas: `touch-action: none`, `preventDefault()`, `setPointerCapture`, `getCoalescedEvents()`
- Canvas sized to `clientWidth * devicePixelRatio`; context scaled to match
- On expiry: commit in-progress stroke → lock panel → activate next → reset timer
- Clip strokes with `ctx.save() / ctx.clip()`, not by dropping points
- Page Visibility API: pause on hidden, show overlay on return, never auto-resume

### Phase 5 — Review + Retry
**Gate:** Retry Same Grid produces a clean page with identical layout; moving a panel after drawing carries its strokes with it (panel-relative storage makes this free); resizing a panel scales all its strokes uniformly by `min(newW/oldW, newH/oldH)` anchored at the panel centre with no distortion or loss.

- Auto-enter Review when last panel finishes
- Review shows finished page with no UI chrome
- Actions: Retry · Edit Grid · Next Page · Overview · Export
- Retry: keep layout + order + timer setting, clear all strokes, start fresh
- Reopen with unfinished session → restore paused, never auto-resume

#### Phase 3.5b — Edit Grid After Drawing (part of Phase 5)

- Edit Grid from Review → full Build Grid mode with existing strokes visible
- **Move panel:** strokes travel for free (panel-relative storage)
- **Resize panel:** scale all strokes by `min(newW/oldW, newH/oldH)`, anchored at panel centre
- **Delete panel:** confirm if has strokes, then discard strokes with it
- **Duplicate panel:** copy geometry and strokes
- **Undo/Redo:** whole-page snapshots including strokes
- **Clear Panel:** empties strokes, keeps geometry
- Panel order preserved through geometry edits; new panels require re-ordering

### Phase 6 — Export
**Gate:** 28-page RTL project exports as pages and correctly paired spreads.

- Off-screen canvas rendering from logical model at target DPI (never DOM screenshot)
- Export as Pages: `page-001.png`, `page-002.png`, …
- Export as Spreads: pairs from `getSpreads()`, respecting direction + first-page behaviour
- Formats: PNG · JPG (with quality slider)
- Resolutions: Screen / 150 DPI / 300 DPI / Custom
- Bundle via jszip
- Export Preview: Pages | Spreads toggle
- Output: white page + black 0.3 mm panel borders + black strokes only
- Cap single canvas dimension at 16 384 px; warn rather than silently blank

---

## 4. Module Map

```
src/
  coords.ts          ← ALL coordinate conversions; no conversions anywhere else
  db.ts              ← IndexedDB read/write/autosave
  spreads.ts         ← getSpreads() pure function
  model/             ← TypeScript types (no logic)
  components/
    ProjectWizard/
    PagesOverview/
    PageEditor/       ← hosts BuildGrid, OrderMode, SessionCanvas, ReviewView
    BuildGrid/
    OrderMode/
    SessionCanvas/
    ReviewView/
    ExportDialog/
  hooks/
    useProject.ts
    useTimer.ts
    usePointer.ts
  export/
    render.ts         ← off-screen canvas rasteriser
    bundle.ts         ← jszip wrapper
```

---

## 5. Decision Log

> Format: `[Phase] Topic — Decision. Reason.`

- [Phase 1] Project location — created at `C:\Users\noy50\Desktop\comic-thumbnailing`. Brief did not specify; Desktop is accessible from iPad over Wi-Fi via dev server.
- [Phase 1] Default new panel size — 40 × 30 mm, placed at page centre. Small enough to see on any page size, large enough to grab easily.
- [Phase 1] Autosave debounce — 500 ms, matching the brief's "~500 ms" guidance.
- [Phase 2] Resize anchor for uniform scale — panel centre. Keeps composition visually balanced per §3.5b.
- [Phase 4] Stroke commit on expiry — append the last coalesced point received before the deadline, then close the stroke. Avoids partial-stroke loss and is consistent with "committed as drawn up to that instant".
- [Phase 6] ZIP filename — `comic-export-<timestamp>.zip`. Brief does not specify; timestamp avoids overwrites.
- [All phases] HTTP on LAN — the tool must work over plain `http://` (iPad on local Wi-Fi). `crypto.randomUUID()` requires a secure context and throws on non-localhost HTTP. Centralised `uid()` in `factory.ts` guards with `typeof crypto.randomUUID === 'function'` and falls back to a Math.random-based UUID v4. All ID generation routes through this one function; no other secure-context APIs are used.
