# SVG Drawing App

A lightweight, browser-based vector drawing application with layer support, SVG import/export, viewport navigation, and path editing capabilities. Built entirely with vanilla JavaScript and HTML Canvas.

## Features

### Drawing Tools
- **Brush (B)** — Freehand drawing with adjustable size and opacity. Automatically converts strokes into optimized bezier curves (RDP simplification + Catmull-Rom handle fitting) for fewer points and smoother results.
- **Line (L)** — Straight line tool.
- **Rectangle (R)** — Draw rectangles with stroke.
- **Circle (C)** — Draw ellipses and circles.
- **Fill (F)** — Flood fill tool that creates closed paths with fill color. Automatically expands boundaries to avoid gaps with stroked objects.

### Selection & Manipulation
- **Select Tool (V)** — Click to select, drag for rectangular selection. Supports:
  - **Move** — Drag selected objects to reposition.
  - **Resize** — Corner and edge handles for scaling objects (min 32px). Corner resize maintains aspect ratio. CTRL+edge handle also maintains aspect ratio.
  - **Rotate** — Rotation handle above the selection bounding box.
  - **Center Horizontal** / **Center Vertical** — Align selected objects to canvas center.
- **Image objects** — Imported images can be selected, moved, resized, and rotated like any other object.

### Path Editing
- **Toggle Path Edit (E)** — Enter/exit path edit mode to modify individual points on brush strokes.
- **Point Types** — Set point type to Corner, Smooth, or Symmetric via dropdown. Smooth handles move independently; Symmetric mirrors handles.
- **Add Point** — Click on a path segment to insert a new point.
- **Delete Point** — Remove selected points from the path.

### Layers
- **Add / Delete** layers.
- **Reorder** layers (move up/down).
- **Merge Down** — Merge the active layer with the layer below.
- **Rename** layers (F2 or button).
- **Clear Layer** — Remove all objects from the active layer.
- **Move to Layer** — Move selected objects to another layer via dropdown.
- **Layer Opacity** — Adjust transparency per layer.
- **Blend Modes** — 16 blend modes including Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, and Luminosity. Blend modes are preserved when exporting to and importing from SVG.

### Viewport Navigation
- **Pan** — Middle mouse button drag.
- **Zoom** — Ctrl+scroll wheel, or Ctrl+middle mouse button + drag up/down.
- **Rotate Viewport** — Shift+middle mouse button + circular motion. Rotate in 5° increments using Ctrl+[ (left) and Ctrl+] (right). Reset rotation with Ctrl+Shift+[.
- **Rotate Controls** — Slider (-180° to 180°), spinbox, and reset button in the layer panel.
- **Zoom Reset (Ctrl+0)** — Resets zoom, pan, and rotation to default.

### Undo / Redo
- **Undo (Ctrl+Z)** / **Redo (Ctrl+Y)** with full state history.

### Import / Export
- **Open SVG** — Import SVG files with support for:
  - Layer groups (`inkscape:groupmode="layer"`).
  - Implicit line commands in `d` attributes (Inkscape compatibility).
  - SVG elements outside the default canvas area (auto-scaling).
  - `mix-blend-mode` CSS property restoration on import.
  - `<image>` elements (raster images embedded in SVG).
- **Import Image** — Import raster images (PNG, JPEG, etc.) into the active layer as an image object.
- **Export SVG** — Export as a clean SVG file with layer grouping, blend modes, opacity, and embedded images. Overwrites original file via File System Access API when available; otherwise downloads.
- **Export PNG** — Flatten all visible layers to a PNG image with an optional white background.

## Keyboard Shortcuts

| Shortcut                  | Action                        |
|---------------------------|-------------------------------|
| **B**                     | Brush tool                    |
| **V**                     | Select tool                   |
| **L**                     | Line tool                     |
| **R**                     | Rectangle tool                |
| **C**                     | Circle tool                   |
| **F**                     | Fill tool                     |
| **E**                     | Toggle path edit mode         |
| **Ctrl+Z**                | Undo                          |
| **Ctrl+Y** / **Ctrl+Shift+Z** | Redo                      |
| **Ctrl+A**                | Select all                    |
| **Ctrl+S**                | Export SVG                    |
| **Ctrl+0**                | Reset zoom, pan & rotation    |
| **Delete / Backspace**    | Delete selected objects       |
| **F2**                    | Rename active layer           |
| **[ / ]**                 | Adjust brush size (±1)        |
| **[ / ]** (Fill tool)     | Adjust expand offset (±0.5)   |
| **Ctrl+[**                | Rotate viewport left 5°       |
| **Ctrl+]**                | Rotate viewport right 5°      |
| **Ctrl+Shift+[ / ]**      | Reset viewport rotation       |
| **Middle btn drag**           | Pan canvas                |
| **Ctrl+Middle btn drag**  | Zoom in/out                   |
| **Shift+Middle btn drag** | Rotate viewport               |
| **Ctrl+Scroll**           | Zoom in/out                   |

## File Structure

```
svg-drawing/
├── index.html    # Main HTML structure
├── style.css     # Dark theme styling
└── app.js        # Core application logic
```

## Usage

1. Open `index.html` in a modern web browser. No server required.
2. Select a drawing tool and start creating on the canvas.
3. Use the Select tool (V) to select, move, resize, and rotate objects.
4. Manage layers in the right panel — add, reorder, rename, merge, and adjust opacity/blend mode.
5. Use the Rotate controls or shortcuts to navigate the viewport.
6. Export your work as SVG or PNG.

## Browser Compatibility

Works in all modern browsers that support:
- Canvas 2D API
- `mix-blend-mode` CSS property
- ES6+ (classes, arrow functions, etc.)
- File System Access API (for direct file overwrite on export — optional, falls back to download)

## Notes

- Blend modes are exported as CSS `mix-blend-mode` on `<g>` elements. While fully functional in browsers, some desktop vector editors (Inkscape, Illustrator) may not render CSS blend modes.
- The flood fill tool works on pixel data and creates vector path representations of filled regions.
- Brush strokes are automatically simplified and fitted with bezier curves on completion, reducing point count while preserving shape.
