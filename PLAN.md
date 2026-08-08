# PROJECT SPECIFICATION / EXTERNAL SOURCE DATA

# Build an Independent Excalidraw-Class Infinite Canvas Engine

## 0. ROLE AND OBJECTIVE

You are an expert frontend systems engineer specializing in browser graphics engines, HTML Canvas, geometry, interaction systems, editors, and TypeScript.

We are building a completely independent infinite-canvas drawing application inspired by the feature set and interaction model of Excalidraw.

The host application already exists:

* Framework: Next.js, latest version
* Language: TypeScript
* UI: shadcn/ui
* Styling: Tailwind CSS
* Project: fresh application
* Canvas engine: MUST be built from scratch
* Rendering: MUST be implemented directly using browser APIs
* Do NOT use Excalidraw as a dependency.
* Do NOT use tldraw.
* Do NOT use Fabric.js.
* Do NOT use Konva.
* Do NOT use PixiJS.
* Do NOT use React Flow as the canvas engine.
* Do NOT use Rough.js.
* Do NOT use Perfect Freehand.
* Do NOT use any other third-party canvas/drawing engine.

shadcn/ui may be used for normal application UI components such as dialogs, dropdowns, popovers, buttons and menus.

The objective is not to make a simple drawing demo.

The objective is to build a reusable, production-quality canvas engine with feature parity with the major editing behavior of modern Excalidraw, including:

* infinite canvas
* pan
* zoom
* selection
* multi-selection
* lasso
* rectangle
* ellipse
* diamond
* line
* multi-point line
* arrow
* curved arrow
* elbow arrow
* freehand drawing
* text
* bound text
* images
* frames
* embeds/iframes
* hyperlinks
* grouping
* locking
* layers/z-order
* resizing
* rotating
* flipping
* alignment
* distribution
* snapping
* grid
* undo/redo
* copy/paste
* style copy/paste
* keyboard shortcuts
* context menus
* command palette
* export PNG
* export SVG
* native JSON save/load
* clipboard integration
* local persistence
* image management
* dark/light themes
* mobile/touch support
* pointer/stylus support
* deterministic rendering
* performance optimization
* optional real-time collaboration architecture
* extensible element system

The engine must be designed so collaboration can be added later without rewriting the core.

---

# 1. MOST IMPORTANT ARCHITECTURAL PRINCIPLE

Do NOT make React the canvas engine.

React should control:

* toolbar
* menus
* dialogs
* property panels
* command palette
* application shell
* settings
* file dialogs
* collaboration UI

The canvas engine should control:

* scene
* elements
* geometry
* viewport
* rendering
* pointer interaction
* hit testing
* selection
* transformations
* history
* serialization
* clipboard
* snapping
* bindings

The canvas engine should be usable independently from React.

Ideal conceptual architecture:

Application UI
|
v
Canvas Editor Controller
|
+------------------+
|                  |
v                  v
Document/Scene         Interaction Manager
|                  |
v                  v
Element System        Tool State Machine
|                  |
+--------+---------+
|
v
Geometry
|
v
Renderer
|
+------+------+
|             |
v             v
Static Layer   Interactive Layer

---

# 2. USE A DEDICATED ENGINE DIRECTORY

Create something approximately like:

src/
canvas/
core/
CanvasEngine.ts
Editor.ts
Scene.ts
Store.ts
History.ts
Commands.ts

```
model/
  types.ts
  element.ts
  elementFactory.ts
  elementUtils.ts
  elementDefaults.ts

geometry/
  point.ts
  vector.ts
  rectangle.ts
  bounds.ts
  transform.ts
  intersection.ts
  distance.ts
  curves.ts
  ellipse.ts
  polygon.ts
  snapping.ts

elements/
  rectangle.ts
  ellipse.ts
  diamond.ts
  line.ts
  arrow.ts
  freedraw.ts
  text.ts
  image.ts
  frame.ts
  embed.ts

tools/
  Tool.ts
  SelectTool.ts
  RectangleTool.ts
  EllipseTool.ts
  DiamondTool.ts
  LineTool.ts
  ArrowTool.ts
  FreedrawTool.ts
  TextTool.ts
  ImageTool.ts
  EraserTool.ts
  HandTool.ts
  FrameTool.ts
  LaserTool.ts
  LassoTool.ts

interaction/
  PointerManager.ts
  KeyboardManager.ts
  GestureManager.ts
  SelectionManager.ts
  TransformManager.ts
  TextEditor.ts
  DragManager.ts

rendering/
  CanvasRenderer.ts
  StaticRenderer.ts
  InteractiveRenderer.ts
  renderElement.ts
  renderRectangle.ts
  renderEllipse.ts
  renderDiamond.ts
  renderLine.ts
  renderArrow.ts
  renderFreedraw.ts
  renderText.ts
  renderImage.ts
  renderFrame.ts
  renderGrid.ts
  renderSelection.ts

viewport/
  Camera.ts
  CoordinateSystem.ts
  Zoom.ts

persistence/
  serializer.ts
  deserializer.ts
  migrations.ts
  localStorage.ts
  indexedDb.ts

clipboard/
  clipboard.ts

export/
  exportPng.ts
  exportSvg.ts
  exportJson.ts

collaboration/
  protocol.ts
  reconciliation.ts
  versioning.ts

constants/
  tools.ts
  shortcuts.ts
  defaults.ts

tests/
  geometry/
  elements/
  history/
  selection/
  transformations/
  serialization/
  shortcuts/
  rendering/
```

The exact file organization can differ, but the separation of responsibilities must remain.

---

# 3. CORE DATA MODEL

The canvas must be document-oriented.

Do not store the actual document as DOM nodes.

The document should be a serializable collection of elements.

Conceptually:

type Scene = {
elements: Element[];
appState: SerializableAppState;
files: Record<FileId, BinaryFile>;
};

Every element should have:

* id
* type
* x
* y
* width
* height
* angle
* strokeColor
* backgroundColor
* fillStyle
* strokeWidth
* strokeStyle
* roughness
* opacity
* roundness
* seed
* version
* versionNonce
* isDeleted
* groupIds
* frameId
* boundElements
* updated
* link
* locked
* customData

This mirrors the conceptual design used by Excalidraw, where the element itself is intended to be JSON serializable and free of peer-local runtime state.

Current Excalidraw's source defines these common fields and uses `version`, `versionNonce`, and fractional ordering indexes for reconciliation/order management.

IMPORTANT:

Do not blindly copy Excalidraw's exact schema.

Create our own schema.

For example:

type CanvasElement =
| RectangleElement
| EllipseElement
| DiamondElement
| LineElement
| ArrowElement
| FreedrawElement
| TextElement
| ImageElement
| FrameElement
| EmbedElement;

---

# 4. ELEMENT TYPE SYSTEM

Implement these elements.

## 4.1 Rectangle

Properties:

* x
* y
* width
* height
* rotation
* fill
* stroke
* strokeWidth
* strokeStyle
* cornerRadius
* opacity
* roughness

Interaction:

* drag creation
* resize
* rotate
* move
* duplicate
* delete
* lock
* group
* link
* add text
* bind arrow

---

# 5. ELLIPSE

Represent ellipse using bounding rectangle:

x
y
width
height
rotation

Render with Canvas ellipse/path primitives.

Support:

* circle constraint using Shift
* resize
* rotate
* fill
* stroke
* dashed
* dotted
* opacity
* text container
* arrow binding

---

# 6. DIAMOND

The basic geometry is:

top    = (width / 2, 0)
right  = (width, height / 2)
bottom = (width / 2, height)
left   = (0, height / 2)

Connect these points.

Support:

* fill
* stroke
* roundness
* resize
* rotation
* text
* arrow binding

---

# 7. LINE

Line must support multiple points.

Example:

points = [
[0, 0],
[100, 50],
[200, 20]
]

IMPORTANT:

Store points relative to the element origin.

The first point should normally be:

[0, 0]

When the first point moves, normalize the point list and update the element x/y.

This makes transforms and bindings easier.

Features:

* straight line
* multi-point line
* click-to-add points
* double click / Enter to finish
* point editing
* midpoint handles
* point insertion
* point deletion
* Shift angle snapping
* closed polygon
* optional start/end markers

---

# 8. ARROW

Arrow should extend the linear element system.

Properties:

* points
* startArrowhead
* endArrowhead
* startBinding
* endBinding
* label
* elbowed
* optional routing information

Arrowheads should support multiple styles.

Current Excalidraw's element types include:

* arrow
* bar
* circle
* circle outline
* triangle
* triangle outline
* diamond
* diamond outline
* cardinality variants

Implement the common styles first:

* none
* arrow
* triangle
* circle
* bar
* diamond

Then add cardinality styles.

---

# 9. ARROW BINDING

This is one of the most important advanced systems.

An arrow endpoint should be able to bind to:

* rectangle
* ellipse
* diamond
* text container
* image
* frame
* embed

Do NOT store only the absolute endpoint.

Store a relationship.

Conceptually:

binding = {
elementId: targetId,
fixedPoint: [normalizedX, normalizedY],
mode: "inside" | "orbit"
}

Example:

fixedPoint = [0.5, 0]

means:

center of top edge.

If the target shape moves or resizes, the arrow must move with it.

If the target is rotated, the binding must remain visually attached.

Binding must update when:

* target moves
* target resizes
* target rotates
* target flips
* target is duplicated
* target is deleted
* arrow endpoint moves

If target is deleted:

remove or invalidate the binding.

---

# 10. ELBOW ARROWS

Treat elbow arrows as a specialized routing system.

They are not simply normal arrows with 90-degree segments.

Need:

* orthogonal routing
* horizontal/vertical segments
* start/end bindings
* automatic rerouting
* draggable endpoints
* fixed segments
* route preservation when possible
* obstacle awareness
* rerouting after connected shapes move

A basic implementation can begin with:

1. determine source anchor
2. determine target anchor
3. calculate candidate horizontal/vertical routes
4. score routes
5. choose shortest valid route
6. simplify unnecessary points

Later implement proper grid/A* routing.

Excalidraw's current elbow-arrow implementation uses a dedicated routing system and A* style search over a dynamic grid. This is a major subsystem, not a simple drawing feature.

---

# 11. FREEHAND DRAWING

Do not simply connect raw pointer positions with straight lines.

The engine should implement:

INPUT POINTS
|
v
point filtering
|
v
streamlining
|
v
pressure handling
|
v
stroke outline generation
|
v
filled polygon/path
|
v
render

Each point should conceptually support:

x
y
pressure

Support:

* mouse
* touch
* stylus
* PointerEvent.pressure

If pressure is unavailable:

simulate pressure based on velocity.

Implement options for:

* smoothing
* streamline
* thinning
* pressure
* start taper
* end taper
* cap
* variable width

Do not use Perfect Freehand.

Study its algorithm for conceptual understanding, then implement an independent version.

---

# 12. HAND-DRAWN RENDERING

Excalidraw's visual identity comes partly from sketch-like rendering.

Do not use Rough.js.

Build a small internal sketch renderer.

For shapes:

1. calculate canonical geometry
2. generate deterministic perturbations
3. create one or more slightly displaced strokes
4. use element seed to make the result deterministic
5. cache generated geometry
6. render through Canvas

Example:

seed + element geometry + style
|
v
deterministic RNG
|
v
sketch geometry
|
v
canvas

The same element must produce the same visual result after:

* rerender
* zoom
* save/load
* browser refresh
* collaboration

This is why each element needs a deterministic seed.

---

# 13. FILL STYLES

Implement:

* solid
* hachure
* cross-hatch
* zigzag

Potential future styles:

* dots
* diagonal
* pattern

For hachure:

1. construct shape boundary
2. calculate scan lines
3. intersect scan lines with polygon/shape
4. draw resulting segments
5. apply angle and gap
6. clip to shape

Do not use an external hatch library.

---

# 14. STROKE STYLES

Implement:

* solid
* dashed
* dotted

Stroke width:

* thin
* medium
* bold
* custom numeric width

---

# 15. ROUNDNESS

Support:

* sharp
* rounded
* adaptive radius

For rectangles, calculate rounded corners.

For diamonds and lines, use curve/arc approximation where appropriate.

Roundness must be applied consistently to:

* rendering
* hit testing
* bounds
* SVG export

Do not render one geometry but hit-test another unrelated geometry.

---

# 16. COORDINATE SYSTEM

Use three coordinate spaces.

## Screen coordinates

Browser pointer coordinates.

Example:

mouseX = 500
mouseY = 300

## Viewport/canvas coordinates

Coordinates relative to the canvas element.

## Scene/world coordinates

Infinite canvas coordinates.

The core conversion must be:

screen -> viewport -> scene

and:

scene -> viewport -> screen

Camera:

camera = {
x,
y,
zoom
}

Conceptually:

screenX = (sceneX - camera.x) * zoom
screenY = (sceneY - camera.y) * zoom

Inverse:

sceneX = screenX / zoom + camera.x
sceneY = screenY / zoom + camera.y

Every tool must use scene coordinates internally.

Never mix screen coordinates with document coordinates.

---

# 17. INFINITE CANVAS

Canvas itself should not have a giant fixed width.

The world is infinite.

Only the viewport is finite.

The renderer calculates which scene elements intersect the visible viewport.

Implement viewport bounds:

visibleSceneRect = {
x,
y,
width,
height
}

Use this for:

* rendering
* culling
* zoom-to-fit
* selection
* search
* export

---

# 18. ZOOM

Support:

* zoom in
* zoom out
* reset zoom
* zoom to content
* zoom to selection
* zoom around cursor

Critical behavior:

When zooming around cursor, the scene coordinate underneath the cursor should remain underneath the cursor.

Do not simply change zoom.

Algorithm:

1. capture scene point under cursor
2. change zoom
3. calculate new camera position
4. restore cursor scene point

This makes zoom feel natural.

Recommended conceptual limits:

minimum around 0.1
maximum around 30

Use configurable values.

---

# 19. PAN

Support:

* middle mouse drag
* Space + drag
* hand tool
* trackpad pan
* touch pan

Pan must work independently from selection.

During panning:

* don't select elements
* don't create elements
* cursor changes to grab/grabbing
* update camera efficiently

---

# 20. HIGH DPI / DEVICE PIXEL RATIO

Canvas must render correctly on:

* DPR 1
* DPR 1.25
* DPR 1.5
* DPR 2
* DPR 3

Do not use CSS size as the actual backing resolution.

Example concept:

canvas.width = cssWidth * devicePixelRatio
canvas.height = cssHeight * devicePixelRatio

Then configure the context transform accordingly.

This prevents blurry rendering.

---

# 21. RENDERING ARCHITECTURE

Use two stacked canvases.

## Static canvas

Contains:

* background
* grid
* document elements
* images
* text
* frames

## Interactive canvas

Contains:

* selection box
* resize handles
* rotation handle
* hover indicators
* binding previews
* snap guides
* cursor effects
* lasso
* temporary drawing
* remote cursors
* laser pointer

This is a major performance optimization used by Excalidraw.

Do not redraw the entire expensive scene on every pointer movement if only selection handles changed.

---

# 22. RENDER CACHE

Each element should have cached render geometry.

Cache key should depend on:

* element version
* zoom-dependent values when necessary
* relevant style
* seed

When element changes:

invalidate its cache.

When only camera moves:

reuse geometry where possible.

Cache:

* bounds
* path geometry
* sketch geometry
* hit-test geometry
* text measurements

---

# 23. VIEWPORT CULLING

Do not render 10,000 offscreen elements.

Calculate:

elementBounds intersects viewport

Only render visible elements.

However:

* offscreen elements remain in the scene
* selection/search still works
* bindings still work

For very large documents, add a spatial index.

Possible internal structure:

SpatialIndex
|
+-- grid cells
+-- element IDs

Or an R-tree/quadtree implementation written internally.

Do not add a third-party spatial indexing library unless explicitly approved later.

---

# 24. HIT TESTING

Never rely only on bounding boxes.

Bounding box is the first coarse test.

Then use shape-specific geometry.

Pipeline:

pointer
|
v
viewport -> scene
|
v
candidate elements
|
v
bounding-box test
|
v
shape-specific hit test
|
v
topmost valid element

Implement:

isPointInsideRectangle
isPointInsideEllipse
isPointInsideDiamond
distanceToLine
distanceToPolyline
distanceToFreehand
pointInsideText
imageHitTest
frameHitTest

For strokes, use a tolerance that increases when zoomed out.

Hit-test tolerance should be measured in screen pixels and converted into scene units.

---

# 25. SELECTION

Support:

* single click
* Shift-click multi-select
* drag box selection
* lasso selection
* select all
* deselect
* deep select
* locked elements
* groups
* frames

Selection state should not be stored as document content.

It belongs to editor state.

Example:

selectedIds: Set<ElementId>

---

# 26. BOX SELECTION

Drag from empty canvas.

Create a temporary selection rectangle.

On release:

select elements according to selection mode.

Support:

* fully contained
* intersecting

Be consistent with expected Excalidraw behavior.

---

# 27. LASSO

Freehand loop around objects.

Algorithm:

1. collect pointer points
2. simplify path
3. close polygon
4. test element bounds/geometry against polygon
5. select matching elements

Interactive lasso should render on the interactive canvas.

---

# 28. GROUPS

Elements can belong to groups.

Support:

* group
* ungroup
* nested groups
* group selection
* move group
* resize group
* duplicate group

When selecting an element inside a group:

first click can select group.

Provide deep-select behavior with modifier.

---

# 29. FRAMES

Frames are containers.

Frame:

{
type: "frame",
x,
y,
width,
height,
name,
children
}

However, avoid duplicating ownership information unnecessarily.

An element can contain:

frameId

Frame supports:

* name
* children
* clipping
* selection
* moving
* resizing
* export
* grouping-like behavior

When moving a frame, its children should move with it according to the chosen behavior.

---

# 30. TEXT

Text is one of the hardest systems.

Do not render editable text directly inside canvas.

Use:

Canvas rendering for final text
+
DOM textarea/contenteditable overlay for editing

Workflow:

User clicks canvas
|
v
create text element
|
v
position textarea
|
v
user edits
|
v
measure text
|
v
update element
|
v
remove textarea
|
v
render text to canvas

Support:

* multiline
* wrapping
* font family
* font size
* bold
* alignment
* vertical alignment
* line height
* auto resize
* fixed width
* container-bound text
* arrow labels

---

# 31. TEXT MEASUREMENT

Never guess text dimensions.

Use:

CanvasRenderingContext2D.measureText()

But account for:

* font family
* font size
* font weight
* line height
* fallback fonts
* CJK
* emoji

Create:

TextMetricsEngine

with:

measureText()
wrapText()
measureParagraph()
calculateLineHeight()
calculateTextBounds()

Cache measurements.

---

# 32. TEXT WRAPPING

Support:

autoResize = true

and:

autoResize = false

For auto resize:

width follows text.

For fixed width:

text wraps to width.

For container text:

text wraps to inner container bounds.

Need support:

left
center
right

and:

top
middle
bottom

---

# 33. BOUND TEXT

A rectangle/diamond/ellipse/arrow can contain text.

Relationship:

containerId

The text must automatically follow the container.

If container moves:

text moves.

If container resizes:

text recalculates position and width.

If container rotates:

text rotates appropriately.

If container is deleted:

text should either be deleted, detached, or repaired according to defined product behavior.

---

# 34. ARROW LABELS

Arrows can contain text labels.

The label should be positioned relative to the arrow path.

For multi-point arrows:

* calculate path length
* find midpoint or designated label position
* position label around path
* keep readable orientation

When arrow moves or changes:

label follows.

---

# 35. IMAGE SYSTEM

Image elements should contain:

* fileId
* width
* height
* scale
* crop
* rotation
* opacity

Do not store huge base64 image data directly in every element.

Use:

files: Map<FileId, BinaryFileData>

Element:

fileId -> files[fileId]

Support:

* drag/drop
* paste
* file picker
* image URL where appropriate
* PNG
* JPEG
* WebP
* GIF where supported
* SVG where safe
* crop
* resize
* flip
* rotate
* opacity

---

# 36. IMAGE CROP

Crop should be represented in source-image coordinates.

Example:

crop = {
x,
y,
width,
height,
naturalWidth,
naturalHeight
}

Rendering:

source image
|
v
crop rectangle
|
v
destination element rectangle

Do not destructively modify the original image.

---

# 37. IMAGE FLIP

Support:

horizontal flip
vertical flip

Can be represented internally using negative scale values.

Make sure:

* rendering
* selection bounds
* resize
* rotation
* export

all respect flipping.

---

# 38. EMBEDS / IFRAMES

Implement an embed element later in the project.

It should support:

* URL
* iframe
* safe allowlist
* sandboxing
* resize
* move
* selection

Do not allow arbitrary unsafe HTML execution.

Treat embedded content as an isolated layer above the canvas.

The canvas should not directly execute third-party HTML.

---

# 39. ERASER

Eraser is an interaction tool.

It should not necessarily modify geometry.

Hovering an element:

* highlight it
* show it will be deleted

Pointer up:

* delete target elements
* commit a single history entry

For freehand erasing, decide whether to:

A. delete the whole stroke
or
B. split the stroke.

For initial parity, deleting the whole element is acceptable.

---

# 40. TRANSFORM SYSTEM

All elements need a common transformation framework.

Operations:

* move
* resize
* rotate
* flip horizontal
* flip vertical
* duplicate

Selection box:

+----------------------+
|       rotation       |
|                      |
|                      |
|                      |
+----------------------+

Handles:

* top-left
* top
* top-right
* right
* bottom-right
* bottom
* bottom-left
* left
* rotation handle

---

# 41. RESIZE

Resize must account for:

* negative width
* negative height
* rotation
* aspect ratio
* shift constraints
* opposite anchor
* locked elements
* grouped elements

Normalize dimensions when needed.

For example:

if width < 0:
x += width
width = abs(width)

But perform this carefully with rotation.

---

# 42. ROTATION

Rotation should occur around selection center.

Use:

angle in radians

Pointer rotation:

angle = atan2(pointerY - centerY, pointerX - centerX)

Support snapping to fixed angle increments with Shift.

---

# 43. MOVE

Move selected elements by delta:

dx
dy

Support:

* mouse
* touch
* keyboard arrows
* Shift + arrows
* snapping

Arrow bindings must update while moving bound elements.

---

# 44. KEYBOARD MOVEMENT

Arrow keys:

move selected element by small increment.

Shift + arrow:

move by larger increment.

Current Excalidraw constants use small and larger translation amounts.

Make these configurable.

---

# 45. SNAP SYSTEM

Implement:

* grid snapping
* object snapping
* center snapping
* edge snapping
* alignment guides
* angle snapping

Grid:

gridSize
gridStep

Do not permanently modify element coordinates during visual snapping unless the user commits the movement.

During dragging:

show snap preview.

---

# 46. GRID

Support:

* enable/disable grid
* grid size
* grid step
* zoom-aware rendering
* dark/light theme
* snap-to-grid

Grid should not become part of the element array.

It is viewport/editor state.

---

# 47. STYLE SYSTEM

Each element has style properties:

strokeColor
backgroundColor
fillStyle
strokeWidth
strokeStyle
roughness
opacity
roundness

Create a reusable style object.

Example:

type ElementStyle = {
strokeColor: string;
backgroundColor: string;
fillStyle: FillStyle;
strokeWidth: number;
strokeStyle: StrokeStyle;
roughness: number;
opacity: number;
roundness: Roundness;
};

---

# 48. STYLE COPYING

Support:

Copy style
Paste style

Keyboard:

Ctrl/Cmd + Alt + C
Ctrl/Cmd + Alt + V

Style copy must not copy:

* position
* size
* ID
* bindings
* text
* image file
* group membership

Only visual properties.

---

# 49. LAYER ORDER

Support:

* bring forward
* send backward
* bring to front
* send to back

Do not rely solely on array index if collaboration is planned.

Use a stable ordering representation.

A fractional ordering key is one possible architecture.

Each element can have:

orderKey

When inserting between A and B:

generate a key between their keys.

This prevents rewriting the entire array during collaborative reordering.

---

# 50. LOCKING

Locked element:

* can be selected
* cannot normally be moved
* cannot resize
* cannot rotate
* cannot modify style
* cannot delete accidentally

Provide unlock action.

Support multi-selection containing locked/unlocked elements.

---

# 51. LINKS

Elements may contain a URL.

Support:

* add hyperlink
* update hyperlink
* remove hyperlink
* open hyperlink

Shortcut:

Ctrl/Cmd + K

Do not execute arbitrary javascript URLs.

Sanitize URLs.

---

# 52. COPY / PASTE

Support:

Ctrl/Cmd + C
Ctrl/Cmd + X
Ctrl/Cmd + V

Clipboard should support:

1. internal JSON format
2. plain text
3. HTML where useful
4. image clipboard

Internal clipboard should preserve:

* elements
* styles
* groups
* bindings
* frames
* images

When pasting:

generate new IDs.

Repair relationships.

For example:

old arrow -> old rectangle

becomes:

new arrow -> new rectangle

---

# 53. DUPLICATION

Ctrl/Cmd + D

Also support:

Alt + drag

Duplicating an element must create a new ID.

For duplicated groups:

create an oldId -> newId mapping.

Then repair:

* group IDs
* frame IDs
* container IDs
* arrow bindings
* text bindings

This is an important subsystem.

---

# 54. UNDO / REDO

Do NOT implement history as:

history.push(JSON.stringify(entireScene))

for every pointer move.

That will become expensive.

Instead create transactional history.

Concept:

beginTransaction()
mutations
commitTransaction()

One drag should become one history entry.

Example:

pointerDown
-> start transaction

pointerMove
-> update preview

pointerUp
-> commit one history entry

History:

undoStack[]
redoStack[]

Undo:

pop undo
apply inverse
push redo

Redo:

pop redo
apply forward
push undo

---

# 55. HISTORY SHOULD SUPPORT DELTAS

Prefer:

created
deleted
updated

rather than cloning the entire scene every time.

Example:

{
created: [...],
deleted: [...],
updated: [
{
id,
before,
after
}
]
}

This also prepares the engine for collaboration.

---

# 56. EPHEMERAL VS DOCUMENT STATE

Separate:

DOCUMENT STATE

from:

EDITOR STATE

Document state:

* elements
* files
* page data
* background if persistent

Editor state:

* selected IDs
* active tool
* cursor
* zoom
* camera
* hover target
* temporary element
* drag state
* resize state
* lasso
* pointer state
* dialogs
* UI state

Never serialize ephemeral interaction state into the document.

---

# 57. ACTION / COMMAND SYSTEM

Do not let UI buttons directly mutate elements.

Create commands/actions.

Examples:

createRectangle
deleteSelection
duplicateSelection
groupSelection
ungroupSelection
bringToFront
sendToBack
undo
redo
zoomIn
zoomOut
toggleGrid
toggleDarkMode

Each command should know:

* ID
* label
* shortcut
* canExecute()
* execute()

This makes:

toolbar
keyboard
context menu
command palette

all use the same command.

---

# 58. TOOL STATE MACHINE

Each tool should have lifecycle:

onEnter
onPointerDown
onPointerMove
onPointerUp
onPointerCancel
onKeyDown
onKeyUp
onExit

Example:

RectangleTool:

pointerDown -> create temporary rectangle
pointerMove -> update width/height
pointerUp -> finalize

ArrowTool:

pointerDown -> start point
pointerMove -> preview
click -> add point
doubleClick/Enter -> finalize

TextTool:

pointerDown -> create text editor

HandTool:

pointerDown -> begin camera drag
pointerMove -> pan
pointerUp -> finish

---

# 59. POINTER EVENTS

Use Pointer Events.

Support:

pointerdown
pointermove
pointerup
pointercancel
pointerenter
pointerleave

Pointer types:

mouse
pen
touch

Use pointer capture during drawing.

For example:

canvas.setPointerCapture(pointerId)

Do not depend only on mouse events.

---

# 60. TOUCH

Support:

* one-finger drawing
* two-finger pan
* pinch zoom
* touch selection
* long press where appropriate

Prevent browser scrolling when interacting with the canvas.

Use appropriate:

touch-action

settings.

---

# 61. PEN / STYLUS

Read:

event.pressure
event.tiltX
event.tiltY
event.pointerType

At minimum:

pressure

must be supported by freehand drawing.

---

# 62. KEYBOARD SHORTCUT SYSTEM

Create a centralized shortcut registry.

Current Excalidraw-style tool shortcuts include:

H = Hand
V or 1 = Selection
R or 2 = Rectangle
D or 3 = Diamond
O or 4 = Ellipse
A or 5 = Arrow
L or 6 = Line
P or 7 = Free draw
T or 8 = Text
9 = Image
E or 0 = Eraser
F = Frame
K = Laser pointer

Additional shortcuts include:

Enter = edit text / add label
Ctrl/Cmd + Enter = finish text / edit line points
Escape = finish/cancel current editing
Q = lock active tool
Ctrl/Cmd + K = hyperlink
Ctrl/Cmd + Z = undo
Ctrl/Cmd + Shift + Z = redo
Ctrl/Cmd + Y = redo on Windows
Ctrl/Cmd + C = copy
Ctrl/Cmd + X = cut
Ctrl/Cmd + V = paste
Ctrl/Cmd + A = select all
Delete = delete
Ctrl/Cmd + D = duplicate
Ctrl/Cmd + G = group
Ctrl/Cmd + Shift + G = ungroup
Ctrl/Cmd + Shift + L = lock
Shift + H = flip horizontal
Shift + V = flip vertical
Ctrl/Cmd + 0 = reset zoom
Ctrl/Cmd + - = zoom out
Ctrl/Cmd + + = zoom in
Shift + 1 = zoom to fit
Shift + 2 = zoom to selection in viewport
Shift + 3 = zoom to selection
Ctrl/Cmd + [ = send backward
Ctrl/Cmd + ] = bring forward
Ctrl/Cmd + Shift + [ = send to back on Windows/Linux
Ctrl/Cmd + Shift + ] = bring to front on Windows/Linux
Ctrl/Cmd + Alt + C = copy styles
Ctrl/Cmd + Alt + V = paste styles
Shift + Alt + C = copy as PNG
Ctrl/Cmd + Shift + E = export
Ctrl/Cmd + O = open
Ctrl/Cmd + S = save
Ctrl/Cmd + F = search
Ctrl/Cmd + Shift + P or Ctrl/Cmd + / = command palette
? = shortcuts/help
Alt + Z = zen mode
Alt + S = object snapping
Alt + R = view/read-only mode

Do not hard-code shortcuts throughout the codebase.

All shortcuts must come from one registry.

---

# 63. TOOL LOCKING

Q should keep the current tool active.

Example:

Select Rectangle
Draw rectangle
Normally return to selection.

With Q:

Draw rectangle
Remain on rectangle tool.

Q again:

unlock tool behavior.

---

# 64. MODIFIER KEYS

Implement modifier semantics carefully.

Shift:

* constrain square/circle
* angle snapping
* multi-select
* proportional resize where appropriate

Alt/Option:

* duplicate while dragging
* alternate transform behavior

Ctrl/Cmd:

* deep select
* prevent arrow binding where applicable
* platform-specific commands

Space:

* temporary pan

Do not hard-code "Ctrl" only.

Use:

isMac ? Meta : Ctrl

---

# 65. COMMAND PALETTE

Build a command palette using shadcn's command components.

It should expose:

* tools
* commands
* settings
* view commands
* export
* file operations

Support fuzzy search.

Every command should show its shortcut.

Example:

Rectangle        R
Undo             Ctrl+Z
Zoom to fit      Shift+1

This is important because it also makes the application discoverable.

---

# 66. CONTEXT MENU

Right click selected object.

Provide:

* cut
* copy
* paste
* duplicate
* delete
* group
* ungroup
* bring forward
* send backward
* bring front
* send back
* lock
* hyperlink
* copy style
* paste style
* frame
* align
* flip

Context menu should be selection-aware.

---

# 67. PROPERTY TOOLBAR

When selected, show contextual properties.

For shapes:

* stroke color
* fill color
* fill style
* stroke width
* stroke style
* roughness
* roundness
* opacity

For text:

* font family
* font size
* alignment
* vertical alignment
* line height

For arrows:

* start arrowhead
* end arrowhead
* line style
* stroke width
* label

For multiple elements:

only show properties that make sense.

---

# 68. UI / TOOLBAR STRUCTURE

Recommended:

Top-left:

* main menu
* file actions

Top-center:

* optional collaboration / document title

Bottom/center:

* tool toolbar

Bottom-right:

* zoom
* fit
* grid
* settings

Floating contextual toolbar:

* element properties

Do not couple toolbar components to canvas internals.

They communicate through the editor API.

---

# 69. ICON SYSTEM

Do not copy Excalidraw's SVG assets.

Use:

* shadcn
* your existing icon package
* custom SVG icons

Required conceptual icons:

* select
* hand
* rectangle
* diamond
* ellipse
* arrow
* line
* free draw
* text
* image
* eraser
* frame
* laser
* undo
* redo
* zoom
* fit
* grid
* settings
* menu
* lock
* link
* group
* ungroup
* bring front
* send back

Icons should have tooltips showing shortcuts.

---

# 70. ZEN MODE

Support a distraction-free mode.

Hide most UI.

Canvas remains usable.

Provide an escape mechanism.

---

# 71. DARK MODE

Canvas rendering must use theme-independent document colors where possible.

UI follows application theme.

Canvas background can be independently changed.

Do not simply invert the entire canvas with CSS because that can break:

* images
* colors
* exports

Render colors correctly for each theme.

---

# 72. EXPORT PNG

PNG export must NOT simply screenshot the entire browser viewport.

Instead:

1. calculate content bounds
2. add padding
3. create offscreen canvas
4. render scene at requested scale
5. draw background
6. draw elements
7. export Blob

Support:

* selected elements
* whole scene
* frame
* transparent background
* custom scale

---

# 73. EXPORT SVG

Build an independent SVG renderer.

Do not rasterize the canvas into SVG.

Each element must become SVG.

Rectangle:

<rect>

Ellipse:

<ellipse>

Diamond:

<path>

Line:

<path>

Arrow:

<path> + arrowhead

Text:

<text>

Image:

<image>

Frame:

<rect>

The SVG renderer must use the same geometry model as the canvas renderer.

This is extremely important.

Do not maintain two unrelated geometry implementations.

---

# 74. SINGLE GEOMETRY SOURCE OF TRUTH

Geometry functions must feed:

Canvas renderer
SVG renderer
Hit testing
Bounds
Selection
Snapping
Bindings
Export

For example:

getRectangleGeometry(element)

should be used by:

renderRectangle()
hitTestRectangle()
getRectangleBounds()
getRectangleBindingPoint()
exportRectangleSvg()

This avoids inconsistencies.

---

# 75. JSON SAVE FORMAT

Create our own file format.

Example:

{
"type": "your-canvas",
"version": 1,
"source": "your-app",
"elements": [],
"appState": {},
"files": {}
}

Do not use `.excalidraw` as the native format.

Use our own extension.

For example:

`.yourcanvas`

or whatever product name is selected.

---

# 76. VERSIONED FILE FORMAT

Every saved document needs:

type
version

Example:

version: 1

When schema changes:

v1 -> v2 migration

Never assume old files are invalid.

Create:

migrations/
v1-to-v2.ts
v2-to-v3.ts

---

# 77. RESTORATION PIPELINE

Loading external JSON should be:

raw file
|
v
parse
|
v
validate
|
v
migrate
|
v
restore defaults
|
v
repair relationships
|
v
validate geometry
|
v
scene

Repair:

* duplicate IDs
* missing IDs
* invalid frame IDs
* invalid container IDs
* invalid bindings
* invalid file IDs
* invalid numeric values

Never trust imported JSON.

---

# 78. LOCAL PERSISTENCE

Start local-first.

Autosave document to IndexedDB.

Do not write the entire document to localStorage on every pointer movement.

Use:

* debounce
* transactions
* serialized snapshots

Recommended:

pointer interaction
|
v
in-memory scene
|
v
debounced persistence
|
v
IndexedDB

---

# 79. FILE SYSTEM ACCESS

Where supported, support:

Open file
Save file
Save as

Use browser File System Access API where available.

Fallback to:

file input
download Blob

---

# 80. LIBRARY SYSTEM

Implement reusable elements later.

A library item can contain:

* element templates
* preview
* title
* ID

User can:

* save selected elements
* insert library item
* delete library item
* import/export library

When inserting:

generate new IDs and repair relationships.

---

# 81. STATS / INSPECTOR

Add an optional stats panel.

Show:

* canvas size
* selected element type
* x
* y
* width
* height
* rotation
* opacity
* stroke
* fill
* element count

For debugging, add:

* FPS
* visible element count
* total element count
* render time
* hit-test time
* cache hits/misses

This will be extremely useful while developing the engine.

---

# 82. SEARCH

Implement canvas search.

Search:

* text elements
* frame names
* links
* metadata

Search results should allow:

* select result
* zoom to result
* edit result

Keyboard:

Ctrl/Cmd + F

---

# 83. FRAME / CONTENT NAVIGATION

Zoom-to-content:

calculate union bounds of all visible non-deleted elements.

Then:

fit bounds into viewport.

Zoom-to-selection:

calculate selected element bounds.

Add configurable padding.

---

# 84. LASER POINTER

Laser pointer is ephemeral.

It should NOT become a permanent scene element.

Maintain separately:

laserPath
laserTimestamp
laserUser

Render on interactive layer.

Fade after a timeout.

For collaboration, transmit it as ephemeral data.

---

# 85. COLLABORATION ARCHITECTURE

Do NOT implement collaboration first.

The engine should first expose events like:

onElementsChanged
onElementCreated
onElementUpdated
onElementDeleted
onSelectionChanged
onCameraChanged

Then collaboration can subscribe.

Concept:

Client A
|
v
local transaction
|
v
change set
|
v
transport
|
v
server/relay
|
v
Client B

---

# 86. COLLABORATIVE DATA MODEL

Each element should eventually have:

id
version
versionNonce
updated

When an element changes:

version++

versionNonce = random value

The collaboration layer can use this to compare concurrent changes.

Do not put WebSocket code inside element rendering code.

---

# 87. COLLABORATION MESSAGE TYPES

Design protocol for:

INIT
UPDATE
CURSOR
VIEWPORT
PRESENCE
IDLE
SELECTION

Document updates should be reliable.

Cursor/presence data can be ephemeral.

---

# 88. RECONCILIATION

Concept:

existing local element
remote element

Compare:

1. ID
2. version
3. versionNonce

If remote is newer:

accept remote.

If local is newer:

keep local.

If conflict:

apply deterministic conflict resolution.

The important property is:

all clients eventually converge.

---

# 89. DO NOT START WITH CRDT

For the first collaboration implementation, versioned element reconciliation is enough.

A CRDT can be introduced later if required.

The engine must be structured so the collaboration layer can be replaced.

---

# 90. SECURITY

Never trust:

* imported files
* clipboard HTML
* image URLs
* embed URLs
* hyperlinks

Sanitize URLs.

Avoid:

javascript:
data: where inappropriate
unsafe iframe sources

For embeds:

use sandboxing.

For collaboration:

validate incoming element payloads.

---

# 91. PERFORMANCE RULES

These are mandatory.

DO NOT:

* store pointer position in React state
* rerender the entire React tree on pointermove
* recreate all element objects on every pointermove
* redraw every element for selection-handle changes
* recalculate text metrics every frame
* recalculate geometry unnecessarily
* serialize the whole scene on every mutation

DO:

* use refs for high-frequency interaction
* mutate transient interaction state outside React
* batch changes
* use requestAnimationFrame
* cache geometry
* cache text measurements
* cull invisible elements
* use two canvas layers
* use spatial indexing for large scenes
* use transactions for history
* debounce persistence

---

# 92. REQUESTANIMATIONFRAME

Pointermove should generally update an interaction state and schedule:

requestAnimationFrame(renderInteractiveLayer)

rather than immediately rendering dozens/hundreds of times per event.

Example:

pointermove
|
v
update drag state
|
v
if !framePending:
requestAnimationFrame(render)

---

# 93. RENDER INVALIDATION

Track:

staticDirty
interactiveDirty

Example:

Move element:

staticDirty = true
interactiveDirty = true

Move selection handle:

staticDirty = false
interactiveDirty = true

Change toolbar popup:

staticDirty = false
interactiveDirty = false

Camera movement:

staticDirty = true
interactiveDirty = true

This avoids unnecessary work.

---

# 94. TESTING STRATEGY

Do not rely only on visual testing.

Write unit tests for geometry.

Examples:

rectangle hit test
ellipse hit test
diamond hit test
line distance
polyline distance
rotation
bounds
intersection
arrow binding
snap
zoom conversion

Interaction tests:

create rectangle
move rectangle
resize rectangle
rotate rectangle
duplicate rectangle
delete rectangle
undo rectangle
redo rectangle

Serialization tests:

save
load
migration
corrupt data
duplicate IDs

Clipboard tests:

copy
paste
duplicate IDs
binding repair

---

# 95. GOLDEN / SNAPSHOT TESTS

For rendering, eventually create deterministic rendering tests.

Given:

same element
same seed
same viewport
same zoom

output should be deterministic.

This is especially important for hand-drawn rendering.

---

# 96. ACCESSIBILITY

Toolbar:

* keyboard accessible
* aria-label
* tooltip
* focus states

Canvas:

* keyboard shortcuts

Dialogs:

* focus trap
* escape

Color picker:

* keyboard navigation

---

# 97. RESPONSIVE UI

Desktop:

full toolbar + properties

Tablet:

compact properties

Mobile:

floating toolbar
touch-friendly controls

Do not change the underlying canvas engine.

Only UI adapts.

---

# 98. IMPLEMENTATION ORDER

Do NOT attempt all features simultaneously.

Use these phases.

## PHASE 1 - Canvas Kernel

Implement:

* canvas
* DPR
* camera
* coordinate conversion
* pan
* zoom
* render loop
* scene
* element IDs

Acceptance:

A blank infinite canvas can pan and zoom smoothly.

---

## PHASE 2 - Basic Elements

Implement:

* rectangle
* ellipse
* diamond
* line

Then:

* move
* resize
* delete
* select

Acceptance:

Basic diagram can be created and edited.

---

## PHASE 3 - Selection Engine

Implement:

* click
* multi-select
* box selection
* lasso
* selection bounds
* handles
* rotation

Acceptance:

Selection feels like a real design tool.

---

## PHASE 4 - Styling

Implement:

* stroke
* fill
* colors
* width
* dashed
* dotted
* opacity
* roundness
* roughness

---

## PHASE 5 - History

Implement:

* transactions
* undo
* redo
* keyboard shortcuts

---

## PHASE 6 - Text

Implement:

* DOM text editor
* measurement
* wrapping
* font
* alignment
* bound text

---

## PHASE 7 - Arrows

Implement:

* arrowheads
* multi-point arrows
* point editing
* labels
* bindings

---

## PHASE 8 - Freehand

Implement:

* raw points
* smoothing
* pressure
* stroke generation
* deterministic rendering

---

## PHASE 9 - Images

Implement:

* image loading
* paste
* drag/drop
* crop
* flip
* resize

---

## PHASE 10 - Advanced Containers

Implement:

* frames
* groups
* locking
* layers
* links

---

## PHASE 11 - Persistence

Implement:

* JSON
* open
* save
* IndexedDB
* autosave
* migrations

---

## PHASE 12 - Export

Implement:

* PNG
* SVG
* clipboard PNG
* clipboard SVG
* native JSON

---

## PHASE 13 - UX

Implement:

* command palette
* context menu
* help dialog
* shortcuts
* tooltips
* stats
* search
* zen mode
* dark mode

---

## PHASE 14 - Advanced Arrows

Implement:

* elbow arrows
* routing
* obstacle avoidance
* fixed segments

---

## PHASE 15 - Collaboration

Only after the local editor is stable.

Implement:

* room
* WebSocket
* presence
* cursors
* incremental changes
* reconciliation
* persistence
* optional encryption

---

# 99. FEATURE PARITY CHECKLIST

Before declaring the engine complete, verify:

### Canvas

[ ] Infinite canvas
[ ] Pan
[ ] Zoom
[ ] Zoom around pointer
[ ] Zoom to fit
[ ] Zoom to selection
[ ] Grid
[ ] Snap

### Tools

[ ] Selection
[ ] Lasso
[ ] Rectangle
[ ] Diamond
[ ] Ellipse
[ ] Line
[ ] Arrow
[ ] Freehand
[ ] Text
[ ] Image
[ ] Eraser
[ ] Hand
[ ] Frame
[ ] Laser
[ ] Embed

### Shapes

[ ] Fill
[ ] Stroke
[ ] Stroke width
[ ] Stroke style
[ ] Roundness
[ ] Roughness
[ ] Opacity
[ ] Rotation

### Selection

[ ] Single selection
[ ] Multi selection
[ ] Box selection
[ ] Lasso
[ ] Deep select
[ ] Group select
[ ] Locked objects

### Transformation

[ ] Move
[ ] Resize
[ ] Rotate
[ ] Flip H
[ ] Flip V
[ ] Duplicate
[ ] Keyboard movement
[ ] Shift constraints

### Ordering

[ ] Bring forward
[ ] Send backward
[ ] Bring front
[ ] Send back

### Groups

[ ] Group
[ ] Ungroup
[ ] Nested groups

### Frames

[ ] Create
[ ] Rename
[ ] Containment
[ ] Clipping
[ ] Move
[ ] Resize
[ ] Export

### Text

[ ] Multiline
[ ] Auto resize
[ ] Wrapping
[ ] Font family
[ ] Font size
[ ] Alignment
[ ] Vertical alignment
[ ] Line height
[ ] Container text
[ ] Arrow labels

### Arrows

[ ] Straight
[ ] Multi-point
[ ] Curved
[ ] Elbow
[ ] Arrowheads
[ ] Bindings
[ ] Labels
[ ] Point editing

### Freehand

[ ] Mouse
[ ] Touch
[ ] Pen
[ ] Pressure
[ ] Smoothing
[ ] Streamline
[ ] Variable width
[ ] Taper
[ ] Deterministic rendering

### Images

[ ] Paste
[ ] Drag/drop
[ ] Upload
[ ] Crop
[ ] Flip
[ ] Rotate
[ ] Resize
[ ] Export

### Persistence

[ ] JSON
[ ] Save
[ ] Load
[ ] Autosave
[ ] IndexedDB
[ ] Migration
[ ] File restoration

### Clipboard

[ ] Copy
[ ] Cut
[ ] Paste
[ ] Internal JSON
[ ] Plain text
[ ] HTML
[ ] Image
[ ] Copy as PNG
[ ] Copy style
[ ] Paste style

### Export

[ ] PNG
[ ] SVG
[ ] JSON
[ ] Clipboard PNG
[ ] Clipboard SVG
[ ] Transparent export
[ ] Scale
[ ] Padding

### UX

[ ] Toolbar
[ ] Context menu
[ ] Command palette
[ ] Shortcuts dialog
[ ] Tooltips
[ ] Stats
[ ] Search
[ ] Dark mode
[ ] Zen mode
[ ] Readonly mode

### Collaboration

[ ] Room
[ ] Presence
[ ] Cursor
[ ] Incremental updates
[ ] Reconciliation
[ ] Persistence
[ ] Conflict handling
[ ] Encryption

---

# 100. IMPORTANT ENGINE API

The final engine should expose an API conceptually similar to:

const editor = createCanvasEditor({
canvas,
overlayCanvas,
});

editor.createElement(...)
editor.updateElement(...)
editor.deleteElements(...)
editor.getElement(...)
editor.getElements(...)

editor.select(...)
editor.clearSelection()

editor.undo()
editor.redo()

editor.zoomIn()
editor.zoomOut()
editor.resetZoom()
editor.zoomToFit()
editor.zoomToSelection()

editor.setTool(...)
editor.getActiveTool()

editor.copy()
editor.cut()
editor.paste()

editor.groupSelection()
editor.ungroupSelection()

editor.bringToFront()
editor.sendToBack()

editor.exportPNG(...)
editor.exportSVG(...)

editor.save()
editor.load(...)

editor.on("change", ...)
editor.on("selectionChange", ...)
editor.on("cameraChange", ...)
editor.on("toolChange", ...)

The exact API can evolve.

The important point is:

React UI should interact with the engine through an editor API instead of reaching into internal data structures.

---

# 101. IMPORTANT STATE API

Keep an internal state similar to:

type EditorState = {
camera: Camera;
activeTool: ToolType;

selectedIds: Set<string>;

hoveredId: string | null;

editingTextId: string | null;

dragging: DragState | null;
resizing: ResizeState | null;
rotating: RotateState | null;

lasso: LassoState | null;

gridEnabled: boolean;
snapToGrid: boolean;
snapToObjects: boolean;

zoom: number;

theme: "light" | "dark";
};

Again:

this state is NOT the persisted document.

---

# 102. DO NOT MUTATE DOCUMENT DURING PREVIEW UNLESS CONTROLLED

During drag:

You can either:

A. maintain a transient preview transform

or

B. update the element in memory but don't commit history until pointerup.

Do NOT generate 100 undo entries for 100 pointermove events.

---

# 103. IMPORTANT DISTINCTION

There are three categories of state.

### Persistent document

Must be saved.

### Undoable editor state

Must be captured by history.

### Ephemeral interaction state

Must never enter history.

Example:

Mouse position = ephemeral.

Selection = editor state.

Rectangle position = persistent.

This distinction should be explicitly enforced in the architecture.

---

# 104. DO NOT BUILD THE UI FIRST

The correct development order is:

Canvas kernel
↓
Coordinate system
↓
Scene
↓
Renderer
↓
Pointer system
↓
Selection
↓
Elements
↓
History
↓
Text
↓
Advanced features
↓
UI polish

Do not spend days building a beautiful toolbar while the engine architecture is unstable.

---

# 105. DO NOT MAKE A "GIANT CANVAS COMPONENT"

Avoid:

Canvas.tsx containing 5,000 lines.

Instead:

Canvas component
|
+-- engine initialization
+-- canvas refs
+-- event binding
+-- React UI bridge

Everything else belongs in engine modules.

---

# 106. IMPORTANT PERFORMANCE RULE FOR NEXT.JS

The actual canvas editor is browser-only.

Use client-side initialization.

Do not access:

window
document
canvas
CanvasRenderingContext2D
PointerEvent

during server rendering.

The engine should be initialized after mount.

Keep browser-specific APIs isolated.

---

# 107. IMPORTANT TYPESCRIPT RULE

Avoid:

any

inside the engine.

Use discriminated unions.

Example:

switch (element.type) {
case "rectangle":
...
case "ellipse":
...
case "arrow":
...
}

TypeScript should automatically narrow the element type.

---

# 108. IMPORTANT GEOMETRY RULE

Never scatter geometry formulas throughout tools.

Bad:

SelectTool calculates rectangle bounds.
Renderer calculates rectangle bounds differently.
SVG exporter calculates it again.
Binding calculates another version.

Instead:

geometry module owns geometry.

Everything calls the same functions.

---

# 109. IMPORTANT RENDERING RULE

Renderer should be dumb.

Renderer receives:

element
camera
style
geometry

and renders.

Renderer should NOT decide:

* whether an element is selected
* whether an element is locked
* whether an element belongs to a group
* whether it should be deleted

Those are editor/interaction concerns.

---

# 110. IMPORTANT INTERACTION RULE

Tools should not know how pixels are rendered.

Tool:

"create rectangle from pointer A to pointer B"

Engine:

creates rectangle.

Renderer:

renders rectangle.

This separation makes the system maintainable.

---

# 111. SOURCE MATERIAL TO STUDY

Use these projects as architectural references only.

Primary reference:

Excalidraw repository.

Study especially:

packages/element/src/types.ts
packages/element/src/binding.ts
packages/element/src/linearElementEditor.ts
packages/element/src/collision.ts
packages/element/src/bounds.ts
packages/element/src/utils.ts
packages/excalidraw/components/App.tsx
packages/excalidraw/appState.ts
packages/excalidraw/history.ts
packages/excalidraw/actions/
packages/excalidraw/renderer/
packages/excalidraw/scene/
packages/excalidraw/data/restore.ts
packages/excalidraw/clipboard.ts
packages/excalidraw/scene/export.ts
packages/excalidraw/components/Actions.tsx
packages/excalidraw/components/CommandPalette/
packages/excalidraw/components/HelpDialog.tsx

The current source confirms that Excalidraw separates:

* Scene
* Renderer
* Store
* History
* ActionManager
* AppState
* element system
* static canvas
* interactive canvas
* data restoration
* export
* collaboration

Use that architecture as a reference.

---

# 112. SECONDARY REFERENCE: TLDRAW

Study tldraw for architectural ideas around:

* editor API
* store
* shape system
* camera
* history
* transactions
* selection
* geometry caching
* viewport culling
* performance

Do not use tldraw code as a dependency.

Especially study the concepts of:

Editor
Store
Shape
ShapeUtil
Camera
History
Transactions
Spatial culling
Geometry caching

The important lesson is that a canvas editor should be treated as an editor engine, not a React component.

---

# 113. THIRD REFERENCE: ROUGH.JS

Study Rough.js to understand:

* sketch geometry
* deterministic random seeds
* hachure
* cross-hatch
* roughness
* bowing
* SVG/canvas rendering

But DO NOT install Rough.js.

Implement only the subset required by the application.

---

# 114. FOURTH REFERENCE: PERFECT FREEHAND

Study Perfect Freehand to understand:

* stroke generation
* smoothing
* streamline
* pressure
* simulated pressure
* thinning
* taper
* caps

But DO NOT install it.

Implement an internal freehand stroke engine.

---

# 115. FIFTH REFERENCE: DRAW.IO

Study draw.io for:

* diagramming behavior
* connectors
* layers
* shape libraries
* selection
* export
* large diagram handling

But do not copy its UI or assets.

---

# 116. LEGAL / LICENSE GUIDANCE

Excalidraw's repository is MIT licensed.

MIT permits reuse with the license/copyright notice requirements.

However, this project should be an independent implementation.

Therefore:

DO NOT copy:

* Excalidraw source code
* Excalidraw logos
* Excalidraw branding
* Excalidraw-specific visual assets
* Excalifont
* exact UI artwork
* proprietary hosted-service functionality

unless explicitly licensed/attributed and intentionally included.

Instead:

study behavior
study architecture
study algorithms
implement independently

If any source code from an MIT project is intentionally reused, preserve the applicable license notice.

The goal is:

"feature-compatible independent canvas engine"

not:

"copy Excalidraw source code."

---

# 117. DEVELOPMENT RULE FOR AI CODING AGENT

When implementing this project:

DO NOT attempt to write the entire engine in one response.

Work subsystem by subsystem.

Before implementing a subsystem:

1. inspect existing architecture
2. identify dependencies
3. define types
4. define interfaces
5. implement core logic
6. connect UI
7. add tests
8. verify behavior
9. move to next subsystem

Never rewrite working modules unnecessarily.

---

# 118. WHEN ADDING A FEATURE

Every feature must answer:

1. What document data does it require?
2. What editor state does it require?
3. What geometry does it require?
4. What pointer interactions does it require?
5. What keyboard shortcuts does it require?
6. What history behavior does it require?
7. What rendering does it require?
8. What serialization does it require?
9. What export behavior does it require?
10. What collaboration behavior will it eventually require?

---

# 119. DEFINITION OF DONE

The feature is NOT done when it visually works once.

It is done when:

* mouse interaction works
* touch interaction works where applicable
* keyboard works
* undo works
* redo works
* copy/paste works
* duplicate works
* save/load works
* export works
* selection works
* hit testing works
* zoom works
* rotation works
* locked state works
* group behavior works
* bindings remain correct
* reload preserves it
* deterministic rendering works
* no obvious performance regression exists

---

# 120. FINAL ENGINE QUALITY TARGET

The finished application should feel like a real professional infinite-canvas editor.

The user should be able to:

1. Open a blank canvas.
2. Draw shapes naturally.
3. Move and resize them.
4. Connect them with arrows.
5. Add text.
6. Edit text directly.
7. Draw freehand.
8. Insert images.
9. Group objects.
10. Lock objects.
11. Use frames.
12. Search the scene.
13. Copy/paste.
14. Undo/redo.
15. Zoom/pan infinitely.
16. Snap objects.
17. Export PNG/SVG.
18. Save/load the document.
19. Work offline.
20. Use keyboard shortcuts.
21. Use mouse, touch, and stylus.
22. Eventually collaborate in real time.

The application should not feel like a collection of independent drawing features.

It should feel like one coherent document editor.

---

# 121. FIRST IMPLEMENTATION TASK

Do NOT start by implementing every tool.

Start by creating the canvas kernel.

First milestone:

* Next.js client component
* canvas element
* interactive overlay canvas
* devicePixelRatio handling
* Camera class
* screen-to-scene conversion
* scene-to-screen conversion
* infinite pan
* cursor-centered zoom
* animation/render loop
* empty Scene class
* basic Editor class
* tool registry
* pointer manager

Then create a single rectangle.

The rectangle must support:

* create
* render
* select
* move
* resize
* delete
* undo
* redo
* save
* load

Only after that works cleanly should additional elements be introduced.

---

# 122. CORE PRINCIPLE

Build the engine as if it could eventually become an npm package.

Even though the immediate product is a Next.js application, the canvas engine itself should have minimal coupling to:

* React
* Next.js
* shadcn
* Tailwind

The engine should be:

TypeScript
browser-native
modular
testable
deterministic
extensible
serialization-friendly
collaboration-ready

The final architecture should make it possible to replace the current UI completely without rewriting the canvas engine.

END OF SPECIFICATION.
