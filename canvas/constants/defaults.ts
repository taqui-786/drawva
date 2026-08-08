export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;
export const ZOOM_STEP = 1.1;

export const GRID_SIZE = 20;

export const ARROW_KEY_STEP = 1;
export const ARROW_KEY_STEP_SHIFT = 10;

/** Hit-test tolerance in screen px, converted to scene units by dividing by zoom. */
export const HIT_TOLERANCE_SCREEN_PX = 8;

export const HANDLE_SIZE_SCREEN_PX = 8;
export const ROTATION_HANDLE_OFFSET_SCREEN_PX = 24;

export const DEFAULT_CANVAS_BACKGROUND = "#ffffff";

export const SELECTION_COLOR = "#4c6fff";
export const CANVA_FILE_VERSION = 1;
export const CANVA_FILE_TYPE = "drawva";

export const AUTOSAVE_DEBOUNCE_MS = 1000;
export const LOCAL_STORAGE_KEY = "drawva:document";

export const STROKE_COLORS = [
  "#1e1e1e",
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f08c00",
  "#9c36b5",
];

export const BACKGROUND_COLORS = [
  "transparent",
  "#ffc9c9",
  "#b2f2bb",
  "#a5d8ff",
  "#ffec99",
  "#eebefa",
];
