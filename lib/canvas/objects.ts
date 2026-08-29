import { Camera } from "./camera";
import { SIZE } from "./constants";
import type { CanvasMode, Point } from "./types";
import { type AnimationScene, renderAnimationScene } from "./animation";

export type ObjectKind = "text" | "formula" | "plot" | "animation";
export type ObjectStatus = "draft" | "accepted";

export interface ObjectItem {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
  contentW: number;
  contentH: number;
  source: string;
  color: string;
  fontSize: number;
  maxWidth?: number;
  status: ObjectStatus;
  image?: HTMLCanvasElement;
  animationScene?: AnimationScene;
  paused?: boolean;
  playheadMs?: number;
  startedAt?: number;
  locked?: boolean;
}

export type ObjectResizeMode = "corner" | "horizontal" | "vertical";

export interface ObjectCallbacks {
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, e: PointerEvent) => void;
  onDragMove?: (id: string, e: PointerEvent) => void;
  onDragEnd?: (id: string) => void;
  onResizeStart?: (id: string, mode: ObjectResizeMode, e: PointerEvent) => void;
  onResizeMove?: (id: string, mode: ObjectResizeMode, e: PointerEvent) => void;
  onResizeEnd?: (id: string) => void;
  onRemove?: (id: string) => void;
  onAccept?: (id: string) => void;
  onMerge?: (id: string) => void;
}

export interface ObjectMountOptions {
  engineContainer: HTMLElement;
  camera: Camera;
  callbacks?: ObjectCallbacks;
}

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="currentColor"><path d="M7 4.5v15l13-7.5L7 4.5z"/></svg>`;
const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`;
const RESTART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
const ACCEPT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M1.25,12 C1.25,6.072 6.072,1.25 12,1.25 C17.928,1.25 22.75,6.072 22.75,12 C22.75,17.928 17.928,22.75 12,22.75 C6.072,22.75 1.25,17.928 1.25,12 Z M2.75,12 C2.75,17.1 6.9,21.25 12,21.25 C17.1,21.25 21.25,17.1 21.25,12 C21.25,6.9 17.1,2.75 12,2.75 C6.9,2.75 2.75,6.9 2.75,12 Z M9.757,15.385 C9.071,14.239 7.642,13.409 7.628,13.401 C7.269,13.195 7.145,12.737 7.35,12.378 C7.556,12.019 8.013,11.894 8.372,12.099 C8.426,12.13 9.405,12.695 10.266,13.605 C11.18,11.911 13.156,8.701 15.641,7.342 C16.004,7.143 16.46,7.277 16.659,7.64 C16.858,8.003 16.724,8.459 16.361,8.658 C13.42,10.266 11.106,15.262 11.083,15.312 C10.967,15.565 10.72,15.733 10.442,15.749 C10.435,15.749 10.428,15.749 10.421,15.75 C10.414,15.75 10.407,15.75 10.401,15.75 L10.4,15.75 C10.137,15.75 9.892,15.612 9.757,15.385 Z"></path></svg>`;
const REMOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M12.75,22.75 C6.813,22.75 2,17.937 2,12 C2,6.063 6.813,1.25 12.75,1.25 C18.687,1.25 23.5,6.063 23.5,12 C23.5,17.937 18.687,22.75 12.75,22.75 Z M3.5,12 C3.5,17.109 7.641,21.25 12.75,21.25 C17.859,21.25 22,17.109 22,12 C22,6.891 17.859,2.75 12.75,2.75 C7.641,2.75 3.5,6.891 3.5,12 Z M10.28,8.47 L12.75,10.94 L15.22,8.47 C15.512,8.177 15.987,8.177 16.28,8.47 C16.573,8.763 16.573,9.237 16.28,9.53 L13.811,12 L16.28,14.47 C16.573,14.763 16.573,15.238 16.28,15.53 C15.987,15.823 15.512,15.823 15.219,15.53 L12.75,13.061 L10.281,15.53 C9.988,15.823 9.513,15.823 9.22,15.53 C8.927,15.238 8.927,14.763 9.22,14.47 L11.689,12 L9.22,9.53 C8.927,9.237 8.927,8.763 9.22,8.47 C9.513,8.177 9.987,8.177 10.28,8.47 Z"></path></svg>`;
const DRAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M12.25 3.25C13.2174 3.25 14.0541 3.80066 14.4697 4.60449C14.8444 4.38042 15.2817 4.25 15.75 4.25C17.0349 4.25 18.0917 5.21952 18.2324 6.4668C18.5434 6.328 18.8875 6.25 19.25 6.25C20.6307 6.25 21.75 7.36929 21.75 8.75V12.7998C21.75 17.1905 18.1905 20.75 13.7998 20.75H10.0586C5.74608 20.7499 2.25012 17.2539 2.25 12.9414V12C2.25 10.4812 3.48122 9.25 5 9.25C5.45058 9.25 5.87468 9.36065 6.25 9.55273V6.75C6.25 5.36929 7.36929 4.25 8.75 4.25C9.21802 4.25 9.65476 4.38069 10.0293 4.60449C10.4449 3.80044 11.2825 3.25 12.25 3.25ZM12.25 4.75C11.6977 4.75 11.25 5.19772 11.25 5.75V8C11.25 8.41421 10.9142 8.75 10.5 8.75C10.0858 8.75 9.75 8.41421 9.75 8V6.75C9.75 6.19772 9.30228 5.75 8.75 5.75C8.19772 5.75 7.75 6.19772 7.75 6.75V12.9414C7.74988 13.3555 7.41414 13.6914 7 13.6914C6.58586 13.6914 6.25012 13.3555 6.25 12.9414V12C6.25 11.3096 5.69036 10.75 5 10.75C4.30964 10.75 3.75 11.3096 3.75 12V12.9414C3.75012 16.4255 6.57451 19.2499 10.0586 19.25H13.7998C17.362 19.25 20.25 16.362 20.25 12.7998V8.75C20.25 8.19772 19.8023 7.75 19.25 7.75C18.6977 7.75 18.25 8.19772 18.25 8.75V9.5C18.25 9.91421 17.9142 10.25 17.5 10.25C17.0858 10.25 16.75 9.91421 16.75 9.5V6.75C16.75 6.19772 16.3023 5.75 15.75 5.75C15.1977 5.75 14.75 6.19772 14.75 6.75V8.5C14.75 8.91421 14.4142 9.25 14 9.25C13.5858 9.25 13.25 8.91421 13.25 8.5V5.75C13.25 5.19772 12.8023 4.75 12.25 4.75Z" fill="currentColor"></path></svg>`;
const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M3 5.25C3.41421 5.25 3.75 5.58579 3.75 6V15C3.75 16.6709 3.75128 17.8488 3.87109 18.7402C3.98805 19.6102 4.20568 20.0943 4.55566 20.4443C4.90565 20.7943 5.38983 21.0119 6.25977 21.1289C7.15123 21.2487 8.32908 21.25 10 21.25H17C17.4142 21.25 17.75 21.5858 17.75 22C17.75 22.4142 17.4142 22.75 17 22.75H10C8.37129 22.75 7.07426 22.7517 6.05957 22.6152C5.02332 22.4759 4.17025 22.18 3.49512 21.5049C2.81999 20.8298 2.52409 19.9767 2.38477 18.9404C2.24834 17.9257 2.25 16.6287 2.25 15V6C2.25 5.58579 2.58579 5.25 3 5.25ZM14 1.25C15.6287 1.25 16.9257 1.24834 17.9404 1.38477C18.9767 1.52409 19.8298 1.81999 20.5049 2.49512C21.18 3.17025 21.4759 4.02332 21.6152 5.05957C21.7517 6.07426 21.75 7.37129 21.75 9V11C21.75 12.6287 21.7517 13.9257 21.6152 14.9404C21.4759 15.9767 21.18 16.8298 20.5049 17.5049C19.8298 18.18 18.9767 18.4759 17.9404 18.6152C16.9257 18.7517 15.6287 18.75 14 18.75C12.3713 18.75 11.0743 18.7517 10.0596 18.6152C9.02332 18.4759 8.17025 18.18 7.49512 17.5049C6.81998 16.8298 6.52409 15.9767 6.38477 14.9404C6.24834 13.9257 6.25 12.6287 6.25 11V9C6.25 7.37129 6.24834 6.07426 6.38477 5.05957C6.52409 4.02332 6.81998 3.17025 7.49512 2.49512C8.17025 1.81998 9.02332 1.52409 10.0596 1.38477C11.0743 1.24834 12.3713 1.25 14 1.25ZM14 2.75C12.3291 2.75 11.1512 2.75128 10.2598 2.87109C9.38983 2.98805 8.90565 3.20568 8.55566 3.55566C8.20568 3.90565 7.98805 4.38983 7.87109 5.25977C7.75128 6.15123 7.75 7.32908 7.75 9V11C7.75 12.6709 7.75128 13.8488 7.87109 14.7402C7.98805 15.6102 8.20568 16.0943 8.55566 16.4443C8.90565 16.7943 9.38983 17.0119 10.2598 17.1289C11.1512 17.2487 12.3291 17.25 14 17.25C15.6709 17.25 16.8488 17.2487 17.7402 17.1289C18.6102 17.0119 19.0943 16.7943 19.4443 16.4443C19.7943 16.0943 20.0119 15.6102 20.1289 14.7402C20.2487 13.8488 20.25 12.6709 20.25 11V9C20.25 7.32908 20.2487 6.15123 20.1289 5.25977C20.0119 4.38983 19.7943 3.90565 19.4443 3.55566C19.0943 3.20568 18.6102 2.98805 17.7402 2.87109C16.8488 2.75128 15.6709 2.75 14 2.75Z" fill="currentColor"></path></svg>`;
const MERGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M12 3l-4 4M12 3l4 4"/><path d="M4 21h16"/></svg>`;
const RESIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M16.435 18.7485C16.245 18.7485 16.055 18.6785 15.905 18.5285C15.615 18.2385 15.615 17.7585 15.905 17.4685L17.905 15.4685C18.195 15.1785 18.675 15.1785 18.965 15.4685C19.255 15.7585 19.255 16.2385 18.965 16.5285L16.965 18.5285C16.815 18.6785 16.625 18.7485 16.435 18.7485ZM11.435 18.7485C11.245 18.7485 11.055 18.6785 10.905 18.5285C10.615 18.2385 10.615 17.7585 10.905 17.4685L17.905 10.4685C18.195 10.1785 18.675 10.1785 18.965 10.4685C19.255 10.7585 19.255 11.2385 18.965 11.5285L11.965 18.5285C11.815 18.6785 11.625 18.7485 11.435 18.7485ZM6.435 18.7485C6.245 18.7485 6.055 18.6785 5.905 18.5285C5.615 18.2385 5.615 17.7585 5.905 17.4685L17.905 5.46848C18.195 5.17848 18.675 5.17848 18.965 5.46848C19.255 5.75848 19.255 6.23848 18.965 6.52848L6.965 18.5285C6.815 18.6785 6.625 18.7485 6.435 18.7485Z" fill="currentColor"></path></svg>`;
const RESIZE_WIDTH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" color="currentColor" fill="none"><path fill="currentColor" d="M10.75,4 L10.75,20 C10.75,20.414 10.414,20.75 10,20.75 C9.586,20.75 9.25,20.414 9.25,20 L9.25,12.75 L6.539,12.75 C6.758,13.186 6.938,13.559 7.058,13.866 C7.142,14.083 7.217,14.316 7.28,14.568 C7.379,14.968 7.135,15.372 6.734,15.471 C6.334,15.57 5.931,15.326 5.832,14.926 C5.78,14.717 5.719,14.516 5.647,14.331 C5.49,13.924 5.22,13.486 4.708,12.981 C4.356,12.634 4.094,12.392 3.866,12.181 C3.834,12.152 3.804,12.124 3.774,12.096 C3.748,12.071 3.722,12.046 3.696,12.022 C3.684,12.01 3.673,11.999 3.662,11.989 C3.66,11.987 3.658,11.985 3.655,11.983 C3.652,11.979 3.65,11.977 3.648,11.974 C3.643,11.97 3.639,11.966 3.636,11.962 L3.605,11.932 L3.636,11.902 C3.639,11.898 3.643,11.894 3.648,11.89 C3.65,11.887 3.652,11.885 3.655,11.881 C3.658,11.879 3.66,11.877 3.662,11.875 C3.673,11.865 3.684,11.854 3.696,11.842 C3.722,11.818 3.748,11.793 3.774,11.768 C3.804,11.74 3.834,11.712 3.866,11.683 C4.094,11.472 4.356,11.23 4.708,10.883 C5.22,10.378 5.49,9.94 5.647,9.533 C5.719,9.348 5.78,9.147 5.832,8.938 C5.931,8.538 6.334,8.294 6.734,8.393 C7.135,8.492 7.379,8.896 7.28,9.296 C7.217,9.548 7.142,9.781 7.058,9.998 C6.938,10.305 6.758,10.678 6.539,11.114 L9.25,11.114 L9.25,4 C9.25,3.586 9.586,3.25 10,3.25 C10.414,3.25 10.75,3.586 10.75,4 Z M20.364,11.962 C20.361,11.966 20.357,11.97 20.352,11.974 C20.35,11.977 20.348,11.979 20.345,11.983 C20.342,11.985 20.34,11.987 20.338,11.989 C20.327,11.999 20.316,12.01 20.304,12.022 C20.278,12.046 20.252,12.071 20.226,12.096 C20.196,12.124 20.166,12.152 20.134,12.181 C19.906,12.392 19.644,12.634 19.292,12.981 C18.78,13.486 18.51,13.924 18.353,14.331 C18.281,14.516 18.22,14.717 18.168,14.926 C18.069,15.326 17.666,15.57 17.266,15.471 C16.865,15.372 16.621,14.968 16.72,14.568 C16.783,14.316 16.858,14.083 16.942,13.866 C17.062,13.559 17.242,13.186 17.461,12.75 L14.75,12.75 L14.75,20 C14.75,20.414 14.414,20.75 14,20.75 C13.586,20.75 13.25,20.414 13.25,20 L13.25,4 C13.25,3.586 13.586,3.25 14,3.25 C14.414,3.25 14.75,3.586 14.75,4 L14.75,11.114 L17.461,11.114 C17.242,10.678 17.062,10.305 16.942,9.998 C16.858,9.781 16.783,9.548 16.72,9.296 C16.621,8.896 16.865,8.492 17.266,8.393 C17.666,8.294 18.069,8.538 18.168,8.938 C18.22,9.147 18.281,9.348 18.353,9.533 C18.51,9.94 18.78,10.378 19.292,10.883 C19.644,11.23 19.906,11.472 20.134,11.683 C20.166,11.712 20.196,11.74 20.226,11.768 C20.252,11.793 20.278,11.818 20.304,11.842 C20.316,11.854 20.327,11.865 20.338,11.875 C20.34,11.877 20.342,11.879 20.345,11.881 C20.348,11.885 20.35,11.887 20.352,11.89 C20.357,11.894 20.361,11.898 20.364,11.902 L20.395,11.932 L20.364,11.962 Z"></path></svg>`;
const RESIZE_HEIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" color="currentColor" fill="none"><path fill="currentColor" d="M4,13.25 L20,13.25 C20.414,13.25 20.75,13.586 20.75,14 C20.75,14.414 20.414,14.75 20,14.75 L12.75,14.75 L12.75,17.461 C13.186,17.242 13.559,17.062 13.866,16.942 C14.083,16.858 14.316,16.783 14.568,16.72 C14.968,16.621 15.372,16.865 15.471,17.266 C15.57,17.666 15.326,18.069 14.926,18.168 C14.717,18.22 14.516,18.281 14.331,18.353 C13.924,18.51 13.486,18.78 12.981,19.292 C12.634,19.644 12.392,19.906 12.181,20.134 C12.152,20.166 12.124,20.196 12.096,20.226 C12.071,20.252 12.046,20.278 12.022,20.304 C12.01,20.316 11.999,20.327 11.989,20.338 C11.987,20.34 11.985,20.342 11.983,20.345 C11.979,20.348 11.977,20.35 11.974,20.352 C11.97,20.357 11.966,20.361 11.962,20.364 L11.932,20.395 L11.902,20.364 C11.898,20.361 11.894,20.357 11.89,20.352 C11.887,20.35 11.885,20.348 11.881,20.345 C11.879,20.342 11.877,20.34 11.875,20.338 C11.865,20.327 11.854,20.316 11.842,20.304 C11.818,20.278 11.793,20.252 11.768,20.226 C11.74,20.196 11.712,20.166 11.683,20.134 C11.472,19.906 11.23,19.644 10.883,19.292 C10.378,18.78 9.94,18.51 9.533,18.353 C9.348,18.281 9.147,18.22 8.938,18.168 C8.538,18.069 8.294,17.666 8.393,17.266 C8.492,16.865 8.896,16.621 9.296,16.72 C9.548,16.783 9.781,16.858 9.998,16.942 C10.305,17.062 10.678,17.242 11.114,17.461 L11.114,14.75 L4,14.75 C3.586,14.75 3.25,14.414 3.25,14 C3.25,13.586 3.586,13.25 4,13.25 Z M11.962,3.636 C11.966,3.639 11.97,3.643 11.974,3.648 C11.977,3.65 11.979,3.652 11.983,3.655 C11.985,3.658 11.987,3.66 11.989,3.662 C11.999,3.673 12.01,3.684 12.022,3.696 C12.046,3.722 12.071,3.748 12.096,3.774 C12.124,3.804 12.152,3.834 12.181,3.866 C12.392,4.094 12.634,4.356 12.981,4.708 C13.486,5.22 13.924,5.49 14.331,5.647 C14.516,5.719 14.717,5.78 14.926,5.832 C15.326,5.931 15.57,6.334 15.471,6.734 C15.372,7.135 14.968,7.379 14.568,7.28 C14.316,7.217 14.083,7.142 13.866,7.058 C13.559,6.938 13.186,6.758 12.75,6.539 L12.75,9.25 L20,9.25 C20.414,9.25 20.75,9.586 20.75,10 C20.75,10.414 20.414,10.75 20,10.75 L4,10.75 C3.586,10.75 3.25,10.414 3.25,10 C3.25,9.586 3.586,9.25 4,9.25 L11.114,9.25 L11.114,6.539 C10.678,6.758 10.305,6.938 9.998,7.058 C9.781,7.142 9.548,7.217 9.296,7.28 C8.896,7.379 8.492,7.135 8.393,6.734 C8.294,6.334 8.538,5.931 8.938,5.832 C9.147,5.78 9.348,5.719 9.533,5.647 C9.94,5.49 10.378,5.22 10.883,4.708 C11.23,4.356 11.472,4.094 11.683,3.866 C11.712,3.834 11.74,3.804 11.768,3.774 C11.793,3.748 11.818,3.722 11.842,3.696 C11.854,3.684 11.865,3.673 11.875,3.662 C11.877,3.66 11.879,3.658 11.881,3.655 C11.885,3.652 11.887,3.65 11.89,3.648 C11.894,3.643 11.898,3.639 11.902,3.636 L11.932,3.605 L11.962,3.636 Z"></path></svg>`;

const MIN_W: Record<ObjectKind, number> = { text: 40, formula: 60, plot: 240, animation: 120 };
const MIN_H: Record<ObjectKind, number> = { text: 40, formula: 40, plot: 180, animation: 90 };

export function minimumObjectSize(kind: ObjectKind): { w: number; h: number } {
  return { w: MIN_W[kind], h: MIN_H[kind] };
}

export class ObjectManager {
  private items = new Map<string, ObjectItem>();
  private shells = new Map<string, HTMLElement>();
  private toolbars = new Map<
    string,
    {
      chrome: HTMLElement;
      dragBar: HTMLElement;
      resizeHandle: HTMLElement;
      resizeWidth: HTMLElement;
      resizeHeight: HTMLElement;
      sideActions?: HTMLElement;
      acceptBtn: HTMLElement;
      playPauseBtn?: HTMLElement;
      restartBtn?: HTMLElement;
      mergeBtn?: HTMLElement;
    }
  >();
  private hostRoot: HTMLDivElement;
  private style: HTMLStyleElement;
  private mode: CanvasMode = "hand";
  private selectedId: string | null = null;
  private animRafId: number | null = null;
  private animCanvases = new Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>();

  private onPointerMove = (e: PointerEvent) => {
    const cb = this.opts.callbacks;
    if (!cb) return;
    for (const id of this.items.keys()) {
      cb.onDragMove?.(id, e);
      cb.onResizeMove?.(id, "corner", e);
    }
  };

  private onPointerUp = () => {
    const cb = this.opts.callbacks;
    if (!cb) return;
    for (const id of this.items.keys()) {
      cb.onDragEnd?.(id);
      cb.onResizeEnd?.(id);
    }
  };

  constructor(private opts: ObjectMountOptions) {
    this.hostRoot = document.createElement("div");
    this.hostRoot.className = "drawva-object-host";
    this.hostRoot.dataset.mode = this.mode;
    this.hostRoot.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;";
    this.style = document.createElement("style");
    this.style.textContent = `
      .drawva-object-shell {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        border: 2px solid transparent !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      .drawva-object-shell[data-selected="true"],
      .drawva-object-shell[data-status="draft"] {
        border-color: var(--primary) !important;
        border-style: dotted !important;
        border-width: 2px !important;
        box-shadow: none !important;
      }
      .drawva-object-host[data-mode="select"] > .drawva-object-shell:hover .drawva-object-chrome,
      .drawva-object-shell[data-selected="true"] .drawva-object-chrome,
      .drawva-object-shell[data-status="draft"] .drawva-object-chrome {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-object-shell:not([data-selected="true"]):not([data-status="draft"]) .drawva-object-left-group,
      .drawva-object-shell:not([data-selected="true"]):not([data-status="draft"]) .drawva-object-right-group {
        display: none !important;
      }
      .drawva-object-shell[data-selected="true"] .drawva-object-left-group,
      .drawva-object-shell[data-selected="true"] .drawva-object-right-group,
      .drawva-object-shell[data-status="draft"] .drawva-object-left-group,
      .drawva-object-shell[data-status="draft"] .drawva-object-right-group {
        display: flex !important;
      }
      .drawva-object-side-actions {
        display: none !important;
      }
      .drawva-object-top-copy {
        display: inline-flex !important;
      }
      .drawva-object-shell[data-narrow="true"] .drawva-object-top-copy {
        display: none !important;
      }
      .drawva-object-shell[data-narrow="true"] .drawva-object-side-actions {
        position: absolute;
        left: 0;
        top: 0;
        display: none;
        flex-direction: column;
        gap: 6px;
        pointer-events: auto;
        z-index: 10;
        transform-origin: 0 0;
      }
      .drawva-object-shell[data-narrow="true"][data-selected="true"] .drawva-object-side-actions,
      .drawva-object-shell[data-narrow="true"][data-status="draft"] .drawva-object-side-actions {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-object-shell[data-selected="true"] .drawva-object-resize,
      .drawva-object-shell[data-status="draft"] .drawva-object-resize {
        display: inline-flex !important;
        pointer-events: auto !important;
      }
      .drawva-object-btn,
      .drawva-object-drag {
        background: rgba(255, 255, 255, 0.92) !important;
        border: 1px dashed rgba(0, 0, 0, 0.25) !important;
        border-radius: 6px !important;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05) !important;
        color: #000000 !important;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        cursor: pointer;
        padding: 3px !important;
        margin: 0 !important;
        height: 28px;
        min-width: 28px;
        backdrop-filter: blur(4px);
        user-select: none;
        touch-action: none;
      }
      .drawva-object-btn:hover,
      .drawva-object-drag:hover {
        background: rgba(241, 245, 249, 1) !important;
        border-color: var(--primary) !important;
        border-style: solid !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
      }
      .drawva-object-btn:active,
      .drawva-object-drag:active {
        opacity: 0.85;
      }
      .drawva-object-btn-copy {
        gap: 5px;
        padding: 0 8px !important;
        font-size: 12px;
        font-weight: 500;
        font-family: system-ui, -apple-system, sans-serif;
        color: var(--foreground) !important;
        white-space: nowrap;
      }
      .drawva-object-accept {
        color: var(--primary) !important;
        border-color: var(--primary) !important;
      }
      .drawva-object-accept:hover {
        border-color: var(--primary) !important;
      }
      .drawva-object-remove {
        color: #000000 !important;
        border-color: rgba(0, 0, 0, 0.25) !important;
      }
      .drawva-object-remove:hover {
        color: #dc2626 !important;
        border-color: rgba(220, 38, 38, 0.5) !important;
        background: rgba(254, 242, 242, 1) !important;
      }
      .drawva-object-drag {
        cursor: grab !important;
        color: #000000 !important;
        border-color: rgba(0, 0, 0, 0.25) !important;
      }
      .drawva-object-resize {
        position: absolute;
        display: none;
        align-items: center;
        justify-content: center;
        background: transparent !important;
        border: none !important;
        color: #000000 !important;
        cursor: pointer;
        padding: 0 !important;
        margin: 0 !important;
        z-index: 10;
        pointer-events: auto;
        touch-action: none;
        transition: color 0.15s ease, opacity 0.15s ease;
      }
      .drawva-object-resize:hover {
        color: var(--primary) !important;
        opacity: 0.8;
      }
      .drawva-object-resize:active {
        opacity: 1;
      }
      :is(.dark *) .drawva-object-btn,
      :is(.dark *) .drawva-object-drag {
        background: rgba(15, 23, 42, 0.92) !important;
        border-color: rgba(255, 255, 255, 0.25) !important;
        color: #ffffff !important;
      }
      :is(.dark *) .drawva-object-btn:hover,
      :is(.dark *) .drawva-object-drag:hover {
        background: rgba(30, 41, 59, 1) !important;
        border-color: var(--primary) !important;
        border-style: solid !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
      }
      :is(.dark *) .drawva-object-btn-copy {
        color: var(--foreground) !important;
      }
      :is(.dark *) .drawva-object-accept {
        color: var(--primary) !important;
        border-color: var(--primary) !important;
      }
      :is(.dark *) .drawva-object-remove {
        color: #ffffff !important;
        border-color: rgba(255, 255, 255, 0.25) !important;
      }
      :is(.dark *) .drawva-object-remove:hover {
        color: #f87171 !important;
        border-color: rgba(248, 113, 113, 0.5) !important;
        background: rgba(69, 10, 10, 0.5) !important;
      }
      :is(.dark *) .drawva-object-drag {
        color: #ffffff !important;
      }
      :is(.dark *) .drawva-object-resize {
        color: #ffffff !important;
      }
      :is(.dark *) .drawva-object-resize:hover {
        color: var(--primary) !important;
      }
    `;
    opts.engineContainer.append(this.hostRoot, this.style);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  add(item: ObjectItem): void {
    if (this.shells.has(item.id)) {
      this.unmount(item.id);
    }
    this.items.set(item.id, item);
    this.mount(item);
    this.position(item);
    this.applyMode(item.id);
  }

  remove(id: string): void {
    this.unmount(id);
    this.items.delete(id);
    if (this.selectedId === id) this.selectedId = null;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get(id: string): ObjectItem | null {
    return this.items.get(id) ?? null;
  }

  setSelected(id: string | null): void {
    if (this.selectedId === id) return;
    const prev = this.selectedId;
    this.selectedId = id;
    if (prev) this.applyMode(prev);
    if (id) {
      this.applyMode(id);
      (this.opts.callbacks ?? {}).onSelect?.(id);
    }
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  getSelectedGeometry(): ObjectItem | null {
    if (this.selectedId) {
      const item = this.items.get(this.selectedId);
      if (item) return item;
    }
    return null;
  }

  setMode(mode: CanvasMode): void {
    this.mode = mode;
    this.hostRoot.dataset.mode = mode;
    for (const id of this.toolbars.keys()) this.applyMode(id);
  }

  setStatus(id: string, status: ObjectStatus): void {
    const item = this.items.get(id);
    if (!item) return;
    item.status = status;
    const shell = this.shells.get(id);
    if (shell) shell.dataset.status = status;
    this.applyMode(id);
  }

  private applyMode(id: string): void {
    const tb = this.toolbars.get(id);
    if (!tb) return;
    const { chrome, dragBar, resizeHandle, resizeWidth, resizeHeight, sideActions, acceptBtn } = tb;
    const shell = this.shells.get(id);
    const item = this.items.get(id);
    const hand = this.mode === "hand";
    const select = this.mode === "select";
    const isSelected = this.selectedId === id;
    const isDraft = item?.status === "draft";
    const active = isSelected || isDraft;
    this.hostRoot.style.zIndex = active || isDraft || select ? "40" : "20";
    if (shell) {
      shell.dataset.selected = isSelected ? "true" : "false";
      // Hand is pan-only: clicks pass through objects to the canvas.
      shell.style.pointerEvents = hand ? "none" : active || isDraft || select ? "auto" : "none";
      shell.style.cursor = hand ? "grab" : select ? "default" : "default";
      shell.style.borderColor = !hand && (active || isDraft) ? "var(--primary)" : "transparent";
      shell.style.borderStyle = !hand && (active || isDraft) ? "dotted" : "none";
      shell.style.borderWidth = "2px";
      shell.style.boxShadow = "none";
    }
    if (chrome) chrome.style.display = hand ? (isDraft ? "flex" : "none") : active || isDraft ? "flex" : "";
    if (sideActions) {
      const isNarrow = shell?.dataset.narrow === "true";
      sideActions.style.display = !hand && (active || isDraft) && isNarrow ? "flex" : "none";
    }
    if (dragBar) dragBar.style.display = hand && !isDraft ? "none" : "inline-flex";
    if (resizeHandle) resizeHandle.style.display = active || isDraft ? "inline-flex" : "none";
    if (resizeWidth) resizeWidth.style.display = active || isDraft ? "inline-flex" : "none";
    if (resizeHeight) resizeHeight.style.display = active || isDraft ? "inline-flex" : "none";
    if (acceptBtn) acceptBtn.style.display = isDraft ? "inline-flex" : "none";
  }

  all(): ObjectItem[] {
    return [...this.items.values()];
  }

  clear(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
    this.selectedId = null;
  }

  destroy(): void {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    if (this.animRafId != null) {
      cancelAnimationFrame(this.animRafId);
      this.animRafId = null;
    }
    this.animCanvases.clear();
    this.clear();
    this.hostRoot.remove();
    this.style.remove();
  }

  sync(): void {
    for (const item of this.items.values()) this.position(item);
  }

  hitTest(point: Point): ObjectItem | null {
    let hit: ObjectItem | null = null;
    for (const i of this.items.values()) {
      if (point.x >= i.x && point.x <= i.x + i.w && point.y >= i.y && point.y <= i.y + i.h) hit = i;
    }
    return hit;
  }

  move(id: string, dx: number, dy: number): void {
    const i = this.items.get(id);
    if (!i) return;
    i.x = Math.max(0, Math.min(SIZE - i.w, i.x + dx));
    i.y = Math.max(0, Math.min(SIZE - i.h, i.y + dy));
    this.position(i);
  }

  resize(id: string, newW: number, newH: number): void {
    const i = this.items.get(id);
    if (!i) return;
    const min = minimumObjectSize(i.kind);
    i.w = Math.max(min.w, Math.min(SIZE - i.x, Math.round(newW)));
    i.h = Math.max(min.h, Math.min(SIZE - i.y, Math.round(newH)));
    this.position(i);
  }

  private mount(item: ObjectItem): void {
    if (this.shells.has(item.id)) return;

    const shell = document.createElement("section");
    shell.dataset.objectId = item.id;
    shell.dataset.status = item.status;
    shell.dataset.selected = "false";
    shell.dataset.hovered = "false";
    shell.dataset.narrow = "false";
    shell.className = "drawva-object-shell";
    shell.style.cssText =
      "position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:auto;contain:layout style;background:transparent;border:2px solid transparent;border-radius:8px;box-shadow:none;padding:0;overflow:visible;display:flex;flex-direction:column;user-select:none;touch-action:none;overscroll-behavior:contain;";

    const body = document.createElement("div");
    body.className = "drawva-object-body";
    body.style.cssText =
      "width:100%;height:100%;flex:1;position:relative;border-radius:6px;overflow:hidden;touch-action:none;overscroll-behavior:contain;";

    if (item.kind === "animation") {
      const canvas = document.createElement("canvas");
      canvas.width = item.contentW;
      canvas.height = item.contentH;
      canvas.style.cssText =
        "width:100%;height:100%;border:0;display:block;pointer-events:none;background:transparent;";
      const ctx = canvas.getContext("2d");
      if (ctx && item.animationScene) {
        this.animCanvases.set(item.id, { canvas, ctx });
        renderAnimationScene(ctx, item.animationScene, 0);
        if (!item.paused) {
          item.startedAt = performance.now();
          this.startAnimationLoop();
        }
      }
      body.append(canvas);
    } else {
      const img = document.createElement("img");
      img.draggable = false;
      img.style.cssText =
        "width:100%;height:100%;border:0;display:block;pointer-events:none;object-fit:fill;";
      img.alt = "";
      if (item.image) img.src = item.image.toDataURL();
      body.append(img);
    }

    const chrome = document.createElement("div");
    chrome.className = "drawva-object-chrome";
    chrome.style.cssText =
      "position:absolute;left:0;top:0;height:32px;display:none;align-items:center;justify-content:space-between;padding:0 2px;z-index:10;pointer-events:none;touch-action:none;transform-origin:0 0;";

    const leftGroup = document.createElement("div");
    leftGroup.className = "drawva-object-left-group";
    leftGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "drawva-object-btn drawva-object-remove";
    removeBtn.innerHTML = REMOVE_SVG;
    removeBtn.title = "Remove";
    removeBtn.style.cssText = "pointer-events:auto;user-select:none;touch-action:none;";
    removeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onRemove?.(item.id);
    });

    leftGroup.append(removeBtn);

    let playPauseBtn: HTMLButtonElement | undefined;
    let restartBtn: HTMLButtonElement | undefined;
    let mergeBtn: HTMLButtonElement | undefined;

    if (item.kind === "animation") {
      playPauseBtn = document.createElement("button");
      playPauseBtn.type = "button";
      playPauseBtn.className = "drawva-object-btn";
      playPauseBtn.innerHTML = item.paused ? PLAY_SVG : PAUSE_SVG;
      playPauseBtn.title = item.paused ? "Play animation" : "Pause animation";
      playPauseBtn.style.cssText = "pointer-events:auto;user-select:none;touch-action:none;";
      playPauseBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      playPauseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        item.paused = !item.paused;
        if (playPauseBtn) {
          playPauseBtn.innerHTML = item.paused ? PLAY_SVG : PAUSE_SVG;
          playPauseBtn.title = item.paused ? "Play animation" : "Pause animation";
        }
        if (!item.paused) {
          item.startedAt = performance.now();
          this.startAnimationLoop();
        }
      });

      restartBtn = document.createElement("button");
      restartBtn.type = "button";
      restartBtn.className = "drawva-object-btn";
      restartBtn.innerHTML = RESTART_SVG;
      restartBtn.title = "Restart animation";
      restartBtn.style.cssText = "pointer-events:auto;user-select:none;touch-action:none;";
      restartBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      restartBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        item.startedAt = performance.now();
        item.playheadMs = 0;
        item.paused = false;
        if (playPauseBtn) {
          playPauseBtn.innerHTML = PAUSE_SVG;
          playPauseBtn.title = "Pause animation";
        }
        this.startAnimationLoop();
      });

      leftGroup.append(playPauseBtn, restartBtn);
    } else {
      mergeBtn = document.createElement("button");
      mergeBtn.type = "button";
      mergeBtn.className = "drawva-object-btn";
      mergeBtn.innerHTML = MERGE_SVG;
      mergeBtn.title = "Merge to ink (erasable)";
      mergeBtn.style.cssText = "pointer-events:auto;user-select:none;touch-action:none;";
      mergeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      mergeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        (this.opts.callbacks ?? {}).onMerge?.(item.id);
      });
      leftGroup.append(mergeBtn);
    }

    const dragBar = document.createElement("div");
    dragBar.className = "drawva-object-drag";
    dragBar.innerHTML = DRAG_SVG;
    dragBar.title = `Drag ${item.kind}`;
    dragBar.style.cssText =
      "position:absolute;left:50%;transform:translateX(-50%);pointer-events:auto;user-select:none;touch-action:none;";

    const rightGroup = document.createElement("div");
    rightGroup.className = "drawva-object-right-group";
    rightGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const kindLabel = item.kind === "text" ? "Text" : item.kind === "formula" ? "LaTeX" : item.kind === "plot" ? "Plot" : "Source";

    const createCopyButton = (isTop: boolean) => {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = `drawva-object-btn drawva-object-btn-copy ${isTop ? "drawva-object-top-copy" : "drawva-object-side-copy"}`;
      copyBtn.innerHTML = `${COPY_SVG}<span>Copy ${kindLabel}</span>`;
      copyBtn.title = `Copy ${kindLabel} to clipboard`;
      copyBtn.style.cssText = "pointer-events:auto;user-select:none;touch-action:none;";
      copyBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      copyBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await navigator.clipboard?.writeText(item.source);
        const span = copyBtn.querySelector("span");
        if (span) {
          const original = span.textContent;
          span.textContent = "Copied!";
          setTimeout(() => {
            span.textContent = original;
          }, 1500);
        }
      });
      return copyBtn;
    };

    const copyBtnTop = createCopyButton(true);

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "drawva-object-btn drawva-object-accept";
    acceptBtn.innerHTML = ACCEPT_SVG;
    acceptBtn.title = `Accept & keep ${item.kind}`;
    acceptBtn.style.cssText = "pointer-events:auto;user-select:none;touch-action:none;";
    acceptBtn.style.display = item.status === "draft" ? "inline-flex" : "none";
    acceptBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    acceptBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onAccept?.(item.id);
    });

    rightGroup.append(copyBtnTop, acceptBtn);
    chrome.append(leftGroup, dragBar, rightGroup);

    const sideActions = document.createElement("div");
    sideActions.className = "drawva-object-side-actions";
    const copyBtnSide = createCopyButton(false);
    sideActions.append(copyBtnSide);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "drawva-object-resize";
    resizeHandle.innerHTML = RESIZE_SVG;
    resizeHandle.title = "Resize";
    resizeHandle.style.cssText =
      "width:24px;height:24px;cursor:nwse-resize;z-index:10;display:none;pointer-events:auto;user-select:none;touch-action:none;transform-origin:0 0;";

    const resizeWidth = document.createElement("div");
    resizeWidth.className = "drawva-object-resize";
    resizeWidth.innerHTML = RESIZE_WIDTH_SVG;
    resizeWidth.title = "Resize width";
    resizeWidth.style.cssText =
      "width:24px;height:24px;cursor:ew-resize;z-index:10;display:none;pointer-events:auto;user-select:none;touch-action:none;transform-origin:0 0;";

    const resizeHeight = document.createElement("div");
    resizeHeight.className = "drawva-object-resize";
    resizeHeight.innerHTML = RESIZE_HEIGHT_SVG;
    resizeHeight.title = "Resize height";
    resizeHeight.style.cssText =
      "width:24px;height:24px;cursor:ns-resize;z-index:10;display:none;pointer-events:auto;user-select:none;touch-action:none;transform-origin:0 0;";

    shell.append(body, chrome, sideActions, resizeHandle, resizeWidth, resizeHeight);

    shell.addEventListener("pointerenter", () => {
      shell.dataset.hovered = "true";
      this.applyMode(item.id);
    });
    shell.addEventListener("pointerleave", () => {
      shell.dataset.hovered = "false";
      this.applyMode(item.id);
    });
    shell.addEventListener("pointerdown", (e) => {
      if (this.mode === "hand") return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".drawva-object-btn") && !target?.closest(".drawva-object-resize")) {
        e.stopPropagation();
        this.setSelected(item.id);
      }
    });

    const cb = this.opts.callbacks ?? {};
    const beginDrag = (e: PointerEvent) => {
      e.stopPropagation();
      if (this.mode !== "hand") this.setSelected(item.id);
      dragBar.setPointerCapture?.(e.pointerId);
      cb.onDragStart?.(item.id, e);
    };
    const beginResize = (mode: ObjectResizeMode) => (e: PointerEvent) => {
      e.stopPropagation();
      if (this.mode !== "hand") this.setSelected(item.id);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      cb.onResizeStart?.(item.id, mode, e);
    };

    dragBar.addEventListener("pointerdown", beginDrag);
    dragBar.addEventListener("pointermove", (e) => cb.onDragMove?.(item.id, e));
    dragBar.addEventListener("pointerup", () => cb.onDragEnd?.(item.id));
    dragBar.addEventListener("pointercancel", () => cb.onDragEnd?.(item.id));

    const wireResize = (el: HTMLElement, mode: ObjectResizeMode) => {
      el.addEventListener("pointerdown", beginResize(mode));
      el.addEventListener("pointermove", (e) => cb.onResizeMove?.(item.id, mode, e));
      el.addEventListener("pointerup", () => cb.onResizeEnd?.(item.id));
      el.addEventListener("pointercancel", () => cb.onResizeEnd?.(item.id));
    };
    wireResize(resizeHandle, "corner");
    wireResize(resizeWidth, "horizontal");
    wireResize(resizeHeight, "vertical");

    this.hostRoot.append(shell);
    this.shells.set(item.id, shell);
    this.toolbars.set(item.id, { chrome, dragBar, resizeHandle, resizeWidth, resizeHeight, sideActions, acceptBtn, playPauseBtn, restartBtn, mergeBtn });
    this.applyMode(item.id);
  }

  private startAnimationLoop(): void {
    if (this.animRafId != null) return;
    const loop = () => {
      const now = performance.now();
      let hasActive = false;
      for (const item of this.items.values()) {
        if (item.kind !== "animation" || !item.animationScene) continue;
        hasActive = true;
        const entry = this.animCanvases.get(item.id);
        if (!entry) continue;
        if (!item.paused) {
          const startedAt = item.startedAt ?? now;
          const elapsed = now - startedAt + (item.playheadMs ?? 0);
          const duration = item.animationScene.durationMs || 8000;
          const playhead = item.animationScene.loop ? elapsed % duration : Math.min(elapsed, duration);
          entry.ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
          renderAnimationScene(entry.ctx, item.animationScene, playhead);
        }
      }
      if (hasActive) {
        this.animRafId = requestAnimationFrame(loop);
      } else {
        this.animRafId = null;
      }
    };
    this.animRafId = requestAnimationFrame(loop);
  }

  private unmount(id: string): void {
    this.shells.get(id)?.remove();
    this.shells.delete(id);
    this.toolbars.delete(id);
    this.animCanvases.delete(id);
  }

  private position(item: ObjectItem): void {
    const shell = this.shells.get(item.id);
    if (!shell) return;
    const cam = this.opts.camera;
    const rect = this.opts.engineContainer.getBoundingClientRect();
    const viewportW = rect.width;
    const viewportH = rect.height;
    const relativeX = cam.panX + item.x * cam.scale;
    const relativeY = cam.panY + item.y * cam.scale;
    const scaleX = (cam.scale * item.w) / item.contentW;
    const scaleY = (cam.scale * item.h) / item.contentH;

    const invScaleX = 1 / (scaleX || 1);
    const invScaleY = 1 / (scaleY || 1);

    const renderedW = item.contentW * scaleX;
    const isNarrow = renderedW < 340;
    shell.dataset.narrow = isNarrow ? "true" : "false";

    shell.style.width = `${item.contentW}px`;
    shell.style.height = `${item.contentH}px`;
    shell.style.transform = `translate3d(${relativeX}px,${relativeY}px,0) scale(${scaleX},${scaleY})`;

    const tb = this.toolbars.get(item.id);
    if (tb) {
      const { chrome, sideActions, resizeHandle, resizeWidth, resizeHeight } = tb;
      const chromeW = Math.max(110, renderedW);
      const chromeLeftScreen = (renderedW - chromeW) / 2;
      chrome.style.width = `${chromeW}px`;
      chrome.style.transform = `translate3d(${chromeLeftScreen * invScaleX}px,${-38 * invScaleY}px,0) scale(${invScaleX},${invScaleY})`;

      if (sideActions) {
        sideActions.style.transform = `translate3d(${item.contentW + 8 * invScaleX}px,0,0) scale(${invScaleX},${invScaleY})`;
      }

      if (resizeHandle) {
        resizeHandle.style.transform = `translate3d(${item.contentW}px,${item.contentH}px,0) scale(${invScaleX},${invScaleY}) translate(-50%, -50%)`;
      }
      if (resizeWidth) {
        resizeWidth.style.transform = `translate3d(${item.contentW}px,${item.contentH / 2}px,0) scale(${invScaleX},${invScaleY}) translate(-50%, -50%)`;
      }
      if (resizeHeight) {
        resizeHeight.style.transform = `translate3d(${item.contentW / 2}px,${item.contentH}px,0) scale(${invScaleX},${invScaleY}) translate(-50%, -50%)`;
      }
    }

    const offscreen =
      relativeX > viewportW ||
      relativeY > viewportH ||
      relativeX + item.w * cam.scale < 0 ||
      relativeY + item.h * cam.scale < 0;
    shell.style.visibility = offscreen ? "hidden" : "visible";
    this.applyMode(item.id);
  }
}