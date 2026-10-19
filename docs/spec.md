# layerdesk design

## Goal

A browser layer editor for PSD files. It must work offline after the first load and never send files to a server. The first release edits layer arrangement and properties, not pixels.

## Architecture

- React, TypeScript, Vite, static site deployable to GitHub Pages
- `ag-psd` (MIT) to read and write PSD files, running in a Web Worker so large files do not block the interface
- Canvas 2D compositor that renders the layer tree, with an offscreen canvas per layer
- `fflate` (MIT) for ZIP export
- Every asset the app needs at runtime is served from the app itself. No CDN requests at runtime.
- A service worker caches the app shell for offline use and installation as a PWA
- Content Security Policy that blocks network access except the app's own origin

## Supported files

| Case | Behavior |
| --- | --- |
| PSD, 8-bit RGB | Full support |
| PSB (large document format) | Open if the library can read it, otherwise show a clear message |
| 16-bit or 32-bit, CMYK, Lab, grayscale, indexed | Open read-only when the library can decode it, show which edits are disabled and why |
| Corrupt or unsupported file | Error message with the reason, the app keeps working |

Show a progress indicator while a file is parsed. Warn before opening a file larger than a configurable size, default 500 MB.

## Document model

- An immutable document tree: groups and layers with id, name, visibility, opacity, blend mode, clipping flag, lock flags, bounds and a reference to the pixel data
- Every edit is a command that produces a new tree, so undo and redo are a stack of trees or inverse commands
- Pixel data is never copied for edits that only change properties or position

## Canvas

- Zoom with the mouse wheel and pinch, pan with space-drag, middle-drag or two-finger drag
- Fit to window, 100 percent, and a zoom readout
- Transparent areas shown as a checkerboard
- Click selects the topmost visible layer with a non-transparent pixel under the cursor. Shift-click adds to the selection. Alt-click selects through to the next layer below.
- Selected layers show their bounds and transform handles

## Editing

- Move: drag, or arrow keys by 1 pixel and Shift+arrow by 10 pixels
- Free transform: scale from corners and edges, Shift to keep proportions, rotate outside the corners, Enter to apply and Escape to cancel. Applying a scale or rotation resamples the layer pixels and is recorded as one undo step.
- Layer panel: show and hide, opacity, blend mode, rename by double-click, drag to reorder and into or out of groups, collapse groups, create group from selection, ungroup, duplicate, delete, lock position
- Undo and redo with Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, with a history list
- Keyboard shortcuts listed in a help dialog

## Compositing

- Normal, multiply, screen, overlay, darken, lighten, color dodge, color burn, hard light, soft light, difference, exclusion, hue, saturation, color and luminosity map to Canvas 2D composite operations. Linear dodge (add) maps to `lighter`.
- Other blend modes render as normal and are listed in the check panel
- Group opacity and pass-through groups, clipping masks and layer masks are rendered
- Layer effects, adjustment layers, smart object contents and text are not re-rendered. They are drawn from the pixel data stored in the file, and the check panel says so.
- While a document is unchanged, the panel can compare the app's composite against the composite image stored in the PSD and report the difference

## Saving and export

- Save as PSD: write the edited tree. Layers that were not edited keep their original data, including properties the app does not understand, as far as the library allows. List anything that could not be preserved before saving.
- Export the composite as PNG
- Export every layer as PNG in a ZIP, cropped to its bounds, with a JSON file that lists names, positions and order. Option to keep the folder structure from groups.
- Files are saved with the browser download or the File System Access API when available

## Rigging check panel

Rules, each with an id, a severity and a target, so they can be filtered and tested one by one:

- Blend mode other than normal on a layer that will become an art mesh or attachment
- Clipping masks and layer masks
- Layer effects, adjustment layers, fill layers, smart objects and text layers that should be rasterized first
- Duplicate layer names inside the same group
- Empty layers and layers fully outside the canvas
- Hidden layers that will still be imported
- Very large canvas or very large single layer
- Names with characters that some tools handle badly

Targets: Live2D Cubism, Spine, or both. Clicking a finding selects the layer. Export the findings as Markdown or JSON.

The rules describe how these tools are documented to behave. They do not use any code, SDK or sample file from Live2D or Esoteric Software.

## Internationalization

- Traditional Chinese (Taiwan) and English, switchable at runtime, defaulting to the browser language
- Taiwan vocabulary in Chinese text

## Quality

- Unit tests with Vitest for the document model, every edit command, undo and redo, blend mode mapping, each check rule and PSD round trips
- Round-trip tests: generate a PSD in the test, open it, edit it, save it, open it again and compare layers, positions and pixels
- End-to-end tests with Playwright: open a file, drag a layer, transform it, undo, save, reopen and confirm the change; export PNG and ZIP; run the check panel
- Fixtures are generated in code or hand-made simple shapes. Do not commit real artwork, character models or files downloaded from other projects.
- Performance budget: a 4000 by 4000 PSD with 200 layers opens and stays responsive while dragging on a mid-range laptop

## Out of scope for the first release

- Painting, erasing, selections, filters and text editing
- Creating new documents from scratch beyond an empty canvas
- Mesh deformation, bones or any rigging features
- Cloud storage, accounts or collaboration
