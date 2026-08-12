// Shared world constants — port of penecho core.js constants (SIZE/TILE/...)
//
// PenEcho world is a FINITE 20_000 x 20_000 unit board, not an infinite grid.
// All world-space coordinates are floats in [0, SIZE]. Screen space is CSS px.

export const SIZE = 20_000;
export const TILE = 512;
export const INITIAL_VIEW_ZOOM = 1.5;

export const MIN_SCALE = 0.03;
export const MAX_SCALE = 4.0;
export const ZOOM_IN_FACTOR = 1.12;
export const ZOOM_OUT_FACTOR = 0.89;

export const GRID_STEP = 500;

export const MAX_SCALE_FOR_ATLAS = 2048;
