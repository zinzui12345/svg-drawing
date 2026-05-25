# SVG Drawing App

A lightweight, browser-based vector drawing application with layer support, layer folders, SVG import/export, viewport navigation, path editing, and gradient fills. Built entirely with vanilla JavaScript and HTML Canvas.

## Features

### Drawing Tools
- **Brush (B)** — Freehand drawing with adjustable size and opacity. Automatically converts strokes into optimized bezier curves (RDP simplification + Catmull-Rom handle fitting) for fewer points and smoother results.
- **Pen (P)** — Click to place points one by one, creating a manual path. Finalize with Enter, double-click, or tool switch. Right-click removes the last point (or cancels if only one point). Paths are NOT curve-fitted on completion — all points remain Corner type for precise control.
- **Line (L)** — Straight line tool.
- **Rectangle (R)** — Draw rectangles with stroke.
- **Circle (C)** — Draw ellipses and circles.
- **Fill (F)** — Flood fill tool that creates closed paths with fill color. Automatically expands boundaries to avoid gaps with stroked objects.
- **Eraser (E)** — Erase parts of objects on selected layers with a freehand stroke. Uses polygon boolean subtraction (via PolyBool) to cut holes or trim shapes. Supports round lineCap and lineJoin for smooth results. For stroke paths, eraser splits the path into separate stroke objects instead of converting to fill outlines, preserving bezier curves via de Casteljau subdivision. Hidden when using Select tool with an active selection to avoid conflicts with path edit mode (E).

### Selection & Manipulation
- **Select Tool (V)** — Click to select, drag for rectangular selection. Supports:
  - **Move** — Drag selected objects to reposition.
  - **Resize** — Corner and edge handles for scaling objects (min 1px). Corner resize maintains aspect ratio. CTRL+edge handle also maintains aspect ratio.
  - **Rotate** — Rotation handle above the selection bounding box.
  - **Center Horizontal** / **Center Vertical** — Align selected objects to canvas center.
- **Escape** or **Ctrl+Shift+A** — Deselect all objects.

### Gradient Fills
- **Linear & Radial Gradients** — Applied to fill-type objects via the Fill Type dropdown in the Object panel.
- **Gradient Editor** — Visual preview canvas, dynamic stop list with individual color, offset (0–100%), and opacity (0–100%) controls per stop. Add/remove stops with +/- buttons.
- **Linear Angle** — Adjust gradient direction via slider or spinbox (0–360°).
- **Radial Controls** — Center X, Center Y, and Radius sliders with spinboxes.
- **Import/Export** — SVG gradients (`<linearGradient>`, `<radialGradient>`) with `stop-opacity`, `xlink:href` inheritance, and `userSpaceOnUse` coordinate conversion are fully supported.
- **Undo/Redo** — All gradient edits are tracked in the undo history.

### Path Editing
- **Toggle Path Edit (E)** — Enter/exit path edit mode to modify individual points on brush strokes and closed paths. All rings (outer + holes) are editable as a flat point list.
- **Point Types** — Set point type to Corner, Smooth, or Symmetric via dropdown. Smooth handles move independently; Symmetric mirrors handles.
- **Add Point** — Click on a path segment to insert a new point within the correct ring.
- **Delete Point** — Remove selected points from the path.

### Layers
- **Add / Delete** layers. New layers are inserted above the currently selected layer and inherit the parent folder of the selected layer.
- **Reorder** layers (move up/down). Moves respect folder boundaries: moving inside a folder rearranges siblings within that folder.
- **Merge Down** — Merge the active layer with the layer below.
- **Rename** layers (F2 or button).
- **Clear Layer** — Remove all objects from the active layer.
- **Move to Layer** — Move selected objects to another layer via dropdown.
- **Layer Opacity** — Adjust transparency per layer.
- **Blend Modes** — 16 blend modes including Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, and Luminosity. Blend modes are preserved when exporting to and importing from SVG.
- **Layer Visibility** — Toggle layer visibility. Preserved through SVG export/import.

### Layer Folders
- **Add Folder** — Create a folder to organize layers. Folders can contain layers or other folders (nested).
- **Delete Folder** — Removes the folder and all its children (layers and sub-folders).
- **Fold / Unfold** — Click the fold toggle to collapse or expand a folder's children in the layer panel.
- **Visibility Cascade** — Toggling a folder's visibility applies the same state to all descendants.
- **Selectable Cascade** — Clicking a folder sets `selectable` on the folder and all its descendants.
- **Move to Folder** — Use the dropdown in the panel to move selected layers into a folder or out to root.
- **Reorder** — Move Up/Down works at the root level for folders (moves the entire folder block) and at the sibling level for items inside a folder.
- **Import/Export** — SVG export nests folder children inside `<g>` elements. SVG import detects folders and reconstructs the nesting structure with correct hierarchy and ordering.

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
  - Layer groups (`inkscape:groupmode="layer"`) with opacity and visibility.
  - Folder groups (plain `<g>` elements without `inkscape:groupmode`) — automatically detected and reconstructed as folders.
  - Implicit line commands in `d` attributes (Inkscape compatibility).
  - SVG elements outside the default canvas area (auto-scaling).
  - `mix-blend-mode` CSS property restoration on import.
  - `<image>` elements (raster images embedded in SVG).
  - Linear and radial gradients with `stop-opacity`.
- **Import Image** — Import raster images (PNG, JPEG, etc.) into the active layer as an image object.
- **Export SVG** — Export as a clean SVG file with layer grouping, folder nesting, blend modes, opacity, visibility, gradients, and embedded images. Overwrites original file via File System Access API when available; otherwise downloads.
- **Export PNG** — Flatten all visible layers to a PNG image with an optional white background.

### Layer Panel Organization
The sidebar panel is organized into sections:
- **Layer** — Layer list with folder fold/unfold toggles, layer opacity slider, blend mode selector, and control buttons (add/delete layer, add/delete folder, reorder, merge, rename, clear, move to folder).
- **Object** — Size, expand offset (fill tool), object opacity, and fill controls (solid/linear/radial gradient).
- **Viewport** — Zoom and rotation sliders with spinboxes and reset buttons.

## Keyboard Shortcuts

| Shortcut                  | Action                        |
|---------------------------|-------------------------------|
| **B**                     | Brush tool                    |
| **P**                     | Pen tool                      |
| **V**                     | Select tool                   |
| **L**                     | Line tool                     |
| **R**                     | Rectangle tool                |
| **C**                     | Circle tool                   |
| **F**                     | Fill tool                     |
| **E**                     | Eraser tool (no selection) / Toggle path edit mode (selection exists) |
| **Escape**                | Clear selection (Select tool) |
| **Ctrl+Z**                | Undo                          |
| **Ctrl+Y** / **Ctrl+Shift+Z** | Redo                      |
| **Ctrl+A**                | Select all                    |
| **Ctrl+Shift+A**          | Deselect all                  |
| **Ctrl+S**                | Export SVG                    |
| **Ctrl+I**                | Import image                  |
| **Tab**                   | Toggle side panel visibility  |
| **Ctrl+0**                | Reset zoom, pan & rotation    |
| **Delete / Backspace**    | Delete selected objects       |
| **F2**                    | Rename active layer           |
| **[ / ]**                 | Adjust brush size (±1)        |
| **[ / ]** (Fill tool)     | Adjust expand offset (±0.5)   |
| **Ctrl+[**                | Rotate viewport left 5°       |
| **Ctrl+]**                | Rotate viewport right 5°      |
| **Ctrl+Shift+[ / ]**      | Reset viewport rotation       |
| **Middle btn drag**       | Pan canvas                    |
| **Ctrl+Middle btn drag**  | Zoom in/out                   |
| **Shift+Middle btn drag** | Rotate viewport               |
| **Ctrl+Scroll**           | Zoom in/out                   |
| **Middle-click layer list** | Scroll layer list           |

## File Structure

```
svg-drawing/
├── index.html    # Main HTML structure
├── style.css     # Dark theme styling
├── app.js        # Core application logic
└── lib/
    └── polybool.min.js  # Polygon boolean operations
```

## Usage

1. Open `index.html` in a modern web browser. No server required.
2. Select a drawing tool and start creating on the canvas.
3. Use the Select tool (V) to select, move, resize, and rotate objects.
4. Manage layers and folders in the right panel — add, reorder, rename, merge, adjust opacity/blend mode, toggle visibility, and organize into folders.
5. Apply gradient fills via the Fill Type dropdown in the Object section.
6. Use the Viewport controls or shortcuts to navigate the canvas.
7. Export your work as SVG or PNG.

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
- Pen tool paths are NOT curve-fitted on finalization — all points remain Corner type. Use Enter, double-click, or switch tools to finalize. Right-click removes the last point; use Escape or right-click with a single point cancels the path.
- The Eraser tool operates on all selected layers (`selectable === true`). For fill objects and brush strokes with curves, erased regions are converted to fill commands with proper hole nesting via `groupRingsIntoRegions`, ensuring cuts inside fill objects produce correct holes rather than overlapping fills. For stroke paths (Pen tool), the eraser splits the path at intersection points and creates separate stroke objects, preserving bezier curves via de Casteljau subdivision.
- Layer Folders use a flat `layers[]` array with `parentId` for nesting. Folders have no opacity, blend mode, or vector commands — only `visible`, `selectable`, and `expanded` properties. The "Delete Layer" button does not delete folders; use "Delete Folder" instead. Move Up/Down at root level moves the entire folder block as a single unit, while moving inside a folder rearranges siblings within that folder.
