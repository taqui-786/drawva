import { Camera } from "./camera";
import { SIZE } from "./constants";
import type { CanvasMode, Point } from "./types";
import {
  MAX_CONTENT_H,
  MAX_CONTENT_W,
  normalizeWidgetGeometry,
  resizeWidgetGeometry,
  settleWidgetContent,
  type WidgetResizeMode,
} from "./widgetGeometry";

export type WidgetKind = "html" | "diagram";
export type WidgetStatus = "draft" | "accepted";

export interface WidgetItem {
  id: string;
  kind: WidgetKind;
  pluginId: string;
  sourceFormat?: string;
  diagramKind?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  contentW: number;
  contentH: number;
  title: string;
  html: string;
  copyText?: string;
  copyLabel?: string;
  status: WidgetStatus;
  userResized?: boolean;
  resizeMode?: WidgetResizeMode;
  cachedImage?: HTMLImageElement | HTMLCanvasElement;
  locked?: boolean;
  createdAt?: number;
}

export interface WidgetCallbacks {
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, e: PointerEvent) => void;
  onDragMove?: (id: string, e: PointerEvent) => void;
  onDragEnd?: (id: string) => void;
  onResizeStart?: (id: string, mode: WidgetResizeMode, e: PointerEvent) => void;
  onResizeMove?: (id: string, mode: WidgetResizeMode, e: PointerEvent) => void;
  onResizeEnd?: (id: string) => void;
  onRemove?: (id: string) => void;
  onAccept?: (id: string) => void;
  onAiRefine?: (id: string) => void;
}

export interface WidgetMountOptions {
  engineContainer: HTMLElement;
  camera: Camera;
  hostUrl?: string;
  callbacks?: WidgetCallbacks;
}

const WIDGET_HOST_URL = "/widget-host.html";
const MAX_CONTENT_FIT_GROWS = 4;

const ACCEPT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M1.25,12 C1.25,6.072 6.072,1.25 12,1.25 C17.928,1.25 22.75,6.072 22.75,12 C22.75,17.928 17.928,22.75 12,22.75 C6.072,22.75 1.25,17.928 1.25,12 Z M2.75,12 C2.75,17.1 6.9,21.25 12,21.25 C17.1,21.25 21.25,17.1 21.25,12 C21.25,6.9 17.1,2.75 12,2.75 C6.9,2.75 2.75,6.9 2.75,12 Z M9.757,15.385 C9.071,14.239 7.642,13.409 7.628,13.401 C7.269,13.195 7.145,12.737 7.35,12.378 C7.556,12.019 8.013,11.894 8.372,12.099 C8.426,12.13 9.405,12.695 10.266,13.605 C11.18,11.911 13.156,8.701 15.641,7.342 C16.004,7.143 16.46,7.277 16.659,7.64 C16.858,8.003 16.724,8.459 16.361,8.658 C13.42,10.266 11.106,15.262 11.083,15.312 C10.967,15.565 10.72,15.733 10.442,15.749 C10.435,15.749 10.428,15.749 10.421,15.75 C10.414,15.75 10.407,15.75 10.401,15.75 L10.4,15.75 C10.137,15.75 9.892,15.612 9.757,15.385 Z"></path></svg>`;
const REMOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M12.75,22.75 C6.813,22.75 2,17.937 2,12 C2,6.063 6.813,1.25 12.75,1.25 C18.687,1.25 23.5,6.063 23.5,12 C23.5,17.937 18.687,22.75 12.75,22.75 Z M3.5,12 C3.5,17.109 7.641,21.25 12.75,21.25 C17.859,21.25 22,17.109 22,12 C22,6.891 17.859,2.75 12.75,2.75 C7.641,2.75 3.5,6.891 3.5,12 Z M10.28,8.47 L12.75,10.94 L15.22,8.47 C15.512,8.177 15.987,8.177 16.28,8.47 C16.573,8.763 16.573,9.237 16.28,9.53 L13.811,12 L16.28,14.47 C16.573,14.763 16.573,15.238 16.28,15.53 C15.987,15.823 15.512,15.823 15.219,15.53 L12.75,13.061 L10.281,15.53 C9.988,15.823 9.513,15.823 9.22,15.53 C8.927,15.238 8.927,14.763 9.22,14.47 L11.689,12 L9.22,9.53 C8.927,9.237 8.927,8.763 9.22,8.47 C9.513,8.177 9.987,8.177 10.28,8.47 Z"></path></svg>`;
const DRAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M12.25 3.25C13.2174 3.25 14.0541 3.80066 14.4697 4.60449C14.8444 4.38042 15.2817 4.25 15.75 4.25C17.0349 4.25 18.0917 5.21952 18.2324 6.4668C18.5434 6.328 18.8875 6.25 19.25 6.25C20.6307 6.25 21.75 7.36929 21.75 8.75V12.7998C21.75 17.1905 18.1905 20.75 13.7998 20.75H10.0586C5.74608 20.7499 2.25012 17.2539 2.25 12.9414V12C2.25 10.4812 3.48122 9.25 5 9.25C5.45058 9.25 5.87468 9.36065 6.25 9.55273V6.75C6.25 5.36929 7.36929 4.25 8.75 4.25C9.21802 4.25 9.65476 4.38069 10.0293 4.60449C10.4449 3.80044 11.2825 3.25 12.25 3.25ZM12.25 4.75C11.6977 4.75 11.25 5.19772 11.25 5.75V8C11.25 8.41421 10.9142 8.75 10.5 8.75C10.0858 8.75 9.75 8.41421 9.75 8V6.75C9.75 6.19772 9.30228 5.75 8.75 5.75C8.19772 5.75 7.75 6.19772 7.75 6.75V12.9414C7.74988 13.3555 7.41414 13.6914 7 13.6914C6.58586 13.6914 6.25012 13.3555 6.25 12.9414V12C6.25 11.3096 5.69036 10.75 5 10.75C4.30964 10.75 3.75 11.3096 3.75 12V12.9414C3.75012 16.4255 6.57451 19.2499 10.0586 19.25H13.7998C17.362 19.25 20.25 16.362 20.25 12.7998V8.75C20.25 8.19772 19.8023 7.75 19.25 7.75C18.6977 7.75 18.25 8.19772 18.25 8.75V9.5C18.25 9.91421 17.9142 10.25 17.5 10.25C17.0858 10.25 16.75 9.91421 16.75 9.5V6.75C16.75 6.19772 16.3023 5.75 15.75 5.75C15.1977 5.75 14.75 6.19772 14.75 6.75V8.5C14.75 8.91421 14.4142 9.25 14 9.25C13.5858 9.25 13.25 8.91421 13.25 8.5V5.75C13.25 5.19772 12.8023 4.75 12.25 4.75Z" fill="currentColor"></path></svg>`;
const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" color="currentColor" fill="none"><path d="M3 5.25C3.41421 5.25 3.75 5.58579 3.75 6V15C3.75 16.6709 3.75128 17.8488 3.87109 18.7402C3.98805 19.6102 4.20568 20.0943 4.55566 20.4443C4.90565 20.7943 5.38983 21.0119 6.25977 21.1289C7.15123 21.2487 8.32908 21.25 10 21.25H17C17.4142 21.25 17.75 21.5858 17.75 22C17.75 22.4142 17.4142 22.75 17 22.75H10C8.37129 22.75 7.07426 22.7517 6.05957 22.6152C5.02332 22.4759 4.17025 22.18 3.49512 21.5049C2.81999 20.8298 2.52409 19.9767 2.38477 18.9404C2.24834 17.9257 2.25 16.6287 2.25 15V6C2.25 5.58579 2.58579 5.25 3 5.25ZM14 1.25C15.6287 1.25 16.9257 1.24834 17.9404 1.38477C18.9767 1.52409 19.8298 1.81999 20.5049 2.49512C21.18 3.17025 21.4759 4.02332 21.6152 5.05957C21.7517 6.07426 21.75 7.37129 21.75 9V11C21.75 12.6287 21.7517 13.9257 21.6152 14.9404C21.4759 15.9767 21.18 16.8298 20.5049 17.5049C19.8298 18.18 18.9767 18.4759 17.9404 18.6152C16.9257 18.7517 15.6287 18.75 14 18.75C12.3713 18.75 11.0743 18.7517 10.0596 18.6152C9.02332 18.4759 8.17025 18.18 7.49512 17.5049C6.81998 16.8298 6.52409 15.9767 6.38477 14.9404C6.24834 13.9257 6.25 12.6287 6.25 11V9C6.25 7.37129 6.24834 6.07426 6.38477 5.05957C6.52409 4.02332 6.81998 3.17025 7.49512 2.49512C8.17025 1.81998 9.02332 1.52409 10.0596 1.38477C11.0743 1.24834 12.3713 1.25 14 1.25ZM14 2.75C12.3291 2.75 11.1512 2.75128 10.2598 2.87109C9.38983 2.98805 8.90565 3.20568 8.55566 3.55566C8.20568 3.90565 7.98805 4.38983 7.87109 5.25977C7.75128 6.15123 7.75 7.32908 7.75 9V11C7.75 12.6709 7.75128 13.8488 7.87109 14.7402C7.98805 15.6102 8.20568 16.0943 8.55566 16.4443C8.90565 16.7943 9.38983 17.0119 10.2598 17.1289C11.1512 17.2487 12.3291 17.25 14 17.25C15.6709 17.25 16.8488 17.2487 17.7402 17.1289C18.6102 17.0119 19.0943 16.7943 19.4443 16.4443C19.7943 16.0943 20.0119 15.6102 20.1289 14.7402C20.2487 13.8488 20.25 12.6709 20.25 11V9C20.25 7.32908 20.2487 6.15123 20.1289 5.25977C20.0119 4.38983 19.7943 3.90565 19.4443 3.55566C19.0943 3.20568 18.6102 2.98805 17.7402 2.87109C16.8488 2.75128 15.6709 2.75 14 2.75Z" fill="currentColor"></path></svg>`;
const RESIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path d="M16.435 18.7485C16.245 18.7485 16.055 18.6785 15.905 18.5285C15.615 18.2385 15.615 17.7585 15.905 17.4685L17.905 15.4685C18.195 15.1785 18.675 15.1785 18.965 15.4685C19.255 15.7585 19.255 16.2385 18.965 16.5285L16.965 18.5285C16.815 18.6785 16.625 18.7485 16.435 18.7485ZM11.435 18.7485C11.245 18.7485 11.055 18.6785 10.905 18.5285C10.615 18.2385 10.615 17.7585 10.905 17.4685L17.905 10.4685C18.195 10.1785 18.675 10.1785 18.965 10.4685C19.255 10.7585 19.255 11.2385 18.965 11.5285L11.965 18.5285C11.815 18.6785 11.625 18.7485 11.435 18.7485ZM6.435 18.7485C6.245 18.7485 6.055 18.6785 5.905 18.5285C5.615 18.2385 5.615 17.7585 5.905 17.4685L17.905 5.46848C18.195 5.17848 18.675 5.17848 18.965 5.46848C19.255 5.75848 19.255 6.23848 18.965 6.52848L6.965 18.5285C6.815 18.6785 6.625 18.7485 6.435 18.7485Z" fill="currentColor"></path></svg>`;
const RESIZE_WIDTH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M13.25,20 L13.25,4 C13.25,3.586 13.585,3.25 14,3.25 C14.413,3.25 14.75,3.586 14.75,4 L14.75,11.25 L17.46,11.25 C16.765,9.873 16.521,9.227 16.952,8.628 L17.101,8.422 L17.215,8.388 C17.493,8.219 17.872,8.207 18.353,8.355 C19.031,8.563 20.048,9.103 20.94,9.73 C22.538,10.852 22.737,11.522 22.75,11.928 C22.792,13.41 19.579,15.217 18.552,15.588 C18.41,15.64 18.108,15.749 17.792,15.749 L17.791,15.749 C17.517,15.749 17.229,15.668 17.02,15.4 C16.469,14.698 16.889,13.641 17.337,12.75 L14.75,12.75 L14.75,20 C14.75,20.414 14.413,20.75 14,20.75 C13.585,20.75 13.25,20.414 13.25,20 Z M9.25,20 L9.25,12.75 L6.54,12.75 C7.235,14.126 7.479,14.772 7.048,15.371 L6.898,15.577 L6.784,15.611 C6.636,15.702 6.458,15.747 6.251,15.747 C6.071,15.747 5.871,15.713 5.648,15.644 C4.969,15.436 3.952,14.896 3.06,14.269 C1.462,13.147 1.262,12.477 1.25,12.071 C1.207,10.589 4.422,8.782 5.448,8.411 C5.714,8.314 6.525,8.021 6.98,8.599 C7.531,9.301 7.111,10.359 6.663,11.25 L9.25,11.25 L9.25,4 C9.25,3.586 9.586,3.25 10,3.25 C10.413,3.25 10.75,3.586 10.75,4 L10.75,20 C10.75,20.414 10.413,20.75 10,20.75 C9.586,20.75 9.25,20.414 9.25,20 Z M18.538,10.047 C18.676,10.335 18.847,10.672 19.02,11.01 L19.086,11.139 C19.351,11.653 19.36,12.022 19.124,12.549 C19.07,12.669 18.99,12.823 18.896,13.002 L18.895,13.005 C18.792,13.201 18.559,13.645 18.403,14.027 C18.74,13.87 19.188,13.627 19.698,13.288 C20.625,12.672 21.084,12.184 21.219,11.97 C21.076,11.76 20.605,11.283 19.669,10.684 C19.237,10.408 18.851,10.197 18.538,10.047 Z M4.33,13.316 C4.762,13.592 5.147,13.803 5.46,13.953 C5.323,13.665 5.151,13.328 4.979,12.99 L4.913,12.861 C4.648,12.347 4.639,11.978 4.875,11.451 C4.929,11.331 5.009,11.177 5.103,10.998 L5.104,10.995 C5.207,10.799 5.44,10.355 5.595,9.973 C5.258,10.13 4.811,10.373 4.301,10.712 C3.374,11.328 2.915,11.816 2.78,12.03 C2.923,12.24 3.394,12.717 4.33,13.316 Z"></path></svg>`;
const RESIZE_HEIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" color="currentColor" fill="none"><path fill="currentColor" d="M4,13.25 L20,13.25 C20.414,13.25 20.75,13.586 20.75,14 C20.75,14.414 20.414,14.75 20,14.75 L12.75,14.75 L12.75,17.461 C13.186,17.242 13.559,17.062 13.866,16.942 C14.083,16.858 14.316,16.783 14.545,16.759 C14.778,16.734 15.09,16.753 15.37,16.955 L15.373,16.957 L15.377,16.96 C15.616,17.135 15.702,17.377 15.731,17.537 C15.761,17.696 15.75,17.846 15.735,17.96 C15.703,18.19 15.622,18.441 15.529,18.678 C15.339,19.162 15.035,19.744 14.691,20.299 C14.348,20.854 13.946,21.415 13.55,21.85 C13.352,22.066 13.139,22.27 12.92,22.426 C12.719,22.569 12.422,22.739 12.073,22.75 C11.714,22.76 11.404,22.601 11.193,22.462 C10.965,22.312 10.743,22.113 10.539,21.901 C10.128,21.474 9.712,20.918 9.356,20.365 C9.001,19.813 8.685,19.232 8.486,18.746 C8.389,18.508 8.304,18.256 8.268,18.023 C8.251,17.908 8.239,17.758 8.266,17.599 C8.292,17.44 8.372,17.201 8.599,17.022 C8.992,16.712 9.47,16.737 9.766,16.787 C10.092,16.841 10.428,16.964 10.719,17.09 C10.902,17.169 11.083,17.256 11.25,17.34 L11.25,14.75 L4,14.75 C3.586,14.75 3.25,14.414 3.25,14 C3.25,13.586 3.586,13.25 4,13.25 Z M15.401,6.978 C15.008,7.288 14.53,7.263 14.234,7.213 C13.908,7.159 13.572,7.036 13.281,6.91 C13.098,6.831 12.917,6.745 12.75,6.661 L12.75,9.25 L20,9.25 C20.414,9.25 20.75,9.586 20.75,10 C20.75,10.414 20.414,10.75 20,10.75 L4,10.75 C3.586,10.75 3.25,10.414 3.25,10 C3.25,9.586 3.586,9.25 4,9.25 L11.25,9.25 L11.25,6.539 C10.814,6.758 10.441,6.938 10.134,7.058 C9.917,7.142 9.684,7.217 9.455,7.241 C9.222,7.266 8.91,7.247 8.63,7.045 L8.627,7.043 L8.625,7.041 L8.623,7.04 C8.384,6.866 8.298,6.623 8.269,6.463 C8.239,6.304 8.25,6.154 8.265,6.04 C8.297,5.81 8.378,5.559 8.471,5.322 C8.661,4.838 8.966,4.256 9.309,3.701 C9.652,3.146 10.054,2.585 10.45,2.15 C10.648,1.934 10.861,1.73 11.08,1.574 C11.281,1.431 11.578,1.261 11.927,1.25 C12.286,1.24 12.596,1.399 12.807,1.538 C13.035,1.688 13.257,1.887 13.461,2.099 C13.872,2.526 14.288,3.082 14.644,3.635 C14.999,4.187 15.315,4.768 15.514,5.254 C15.611,5.492 15.696,5.744 15.732,5.977 C15.749,6.092 15.761,6.242 15.734,6.401 C15.708,6.56 15.628,6.799 15.401,6.978 Z M11.951,2.795 C11.849,2.868 11.716,2.988 11.558,3.162 C11.244,3.506 10.897,3.985 10.585,4.49 C10.376,4.827 10.192,5.161 10.049,5.458 C10.339,5.321 10.696,5.139 11.142,4.911 C11.321,4.82 11.555,4.715 11.84,4.706 C12.126,4.698 12.366,4.791 12.548,4.872 C12.673,4.928 12.846,5.019 13.017,5.11 C13.063,5.134 13.108,5.158 13.152,5.181 C13.383,5.302 13.632,5.428 13.875,5.533 C13.927,5.555 13.978,5.576 14.026,5.595 C13.868,5.256 13.644,4.852 13.382,4.446 C13.06,3.945 12.703,3.474 12.381,3.14 C12.219,2.972 12.084,2.858 11.983,2.791 Z M13.951,18.542 C13.661,18.679 13.304,18.861 12.858,19.089 C12.679,19.18 12.445,19.285 12.16,19.294 C11.874,19.302 11.634,19.209 11.452,19.128 C11.327,19.072 11.154,18.981 10.983,18.89 L10.982,18.89 C10.937,18.866 10.892,18.842 10.848,18.819 C10.617,18.698 10.368,18.572 10.125,18.467 C10.073,18.445 10.022,18.424 9.974,18.405 C10.132,18.744 10.356,19.148 10.618,19.554 C10.94,20.055 11.297,20.526 11.619,20.86 C11.781,21.028 11.916,21.142 12.017,21.209 L12.03,21.218 L12.049,21.205 C12.15,21.132 12.284,21.012 12.442,20.838 C12.756,20.494 13.103,20.015 13.415,19.51 C13.624,19.173 13.808,18.839 13.951,18.542 Z"></path></svg>`;

export function extractHtmlDimensions(html: string): { width: number; height: number } | null {
  if (!html) return null;
  const vb = html.match(/<svg[^>]*viewBox=["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i);
  if (vb) {
    const w = parseFloat(vb[3]);
    const h = parseFloat(vb[4]);
    if (w > 20 && h > 20 && Number.isFinite(w) && Number.isFinite(h)) {
      return { width: Math.round(w), height: Math.round(h) };
    }
  }
  const svgTag = html.match(/<svg\b[^>]*>/i);
  if (svgTag) {
    const wMatch = svgTag[0].match(/\bwidth=["']([\d.]+)(?:px)?["']/i);
    const hMatch = svgTag[0].match(/\bheight=["']([\d.]+)(?:px)?["']/i);
    if (wMatch && hMatch) {
      const w = parseFloat(wMatch[1]);
      const h = parseFloat(hMatch[1]);
      if (w > 20 && h > 20 && Number.isFinite(w) && Number.isFinite(h)) {
        return { width: Math.round(w), height: Math.round(h) };
      }
    }
  }
  return null;
}

export class WidgetManager {
  private widgets = new Map<string, WidgetItem>();
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
      refine?: HTMLElement;
      overlay: HTMLElement;
      acceptBtn: HTMLElement;
    }
  >();
  private hostRoot: HTMLDivElement;
  private style: HTMLStyleElement;
  private mode: CanvasMode = "hand";
  private selectedId: string | null = null;
  private snapshotWaiters = new Map<string, Array<(img: HTMLImageElement | HTMLCanvasElement | null) => void>>();
  private lastLayoutSize = new Map<string, string>();
  private styleSizeKey = new Map<string, string>();
  private lastRenderState = new Map<string, string>();
  private lastContentFit = new Map<string, { w: number; h: number; grows: number }>();

  private onPointerMove = (e: PointerEvent) => {
    const cb = this.opts.callbacks;
    if (!cb) return;
    for (const id of this.widgets.keys()) {
      cb.onDragMove?.(id, e);
      const mode = this.widgets.get(id)?.resizeMode ?? "corner";
      cb.onResizeMove?.(id, mode, e);
    }
  };

  private onPointerUp = () => {
    const cb = this.opts.callbacks;
    if (!cb) return;
    for (const id of this.widgets.keys()) {
      cb.onDragEnd?.(id);
      cb.onResizeEnd?.(id);
    }
  };

  constructor(private opts: WidgetMountOptions) {
    this.hostRoot = document.createElement("div");
    this.hostRoot.className = "drawva-widget-host";
    this.hostRoot.dataset.mode = this.mode;
    this.hostRoot.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;";
    this.style = document.createElement("style");
    this.style.textContent = `
      .drawva-widget-shell {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        box-sizing: border-box;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        border: 2px solid transparent !important;
        box-shadow: none !important;
        background: transparent !important;
        will-change: transform;
        transform-style: preserve-3d;
        backface-visibility: hidden;
        contain: layout style;
      }
      .drawva-widget-shell[data-selected="true"],
      .drawva-widget-shell[data-status="draft"] {
        border-color: var(--primary) !important;
        border-style: dotted !important;
        border-width: 2px !important;
        box-shadow: none !important;
      }
      .drawva-widget-host[data-mode="select"] > .drawva-widget-shell:hover .drawva-widget-chrome,
      .drawva-widget-shell[data-selected="true"] .drawva-widget-chrome,
      .drawva-widget-shell[data-status="draft"] .drawva-widget-chrome {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-widget-shell:not([data-selected="true"]):not([data-status="draft"]) .drawva-widget-left-group,
      .drawva-widget-shell:not([data-selected="true"]):not([data-status="draft"]) .drawva-widget-right-group {
        display: none !important;
      }
      .drawva-widget-shell[data-selected="true"] .drawva-widget-left-group,
      .drawva-widget-shell[data-selected="true"] .drawva-widget-right-group,
      .drawva-widget-shell[data-status="draft"] .drawva-widget-left-group,
      .drawva-widget-shell[data-status="draft"] .drawva-widget-right-group {
        display: flex !important;
      }
      .drawva-widget-side-actions {
        display: none !important;
      }
      .drawva-widget-top-copy {
        display: inline-flex !important;
      }
      .drawva-widget-shell[data-narrow="true"] .drawva-widget-top-copy {
        display: none !important;
      }
      .drawva-widget-shell[data-narrow="true"] .drawva-widget-side-actions {
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
      .drawva-widget-shell[data-narrow="true"][data-selected="true"] .drawva-widget-side-actions,
      .drawva-widget-shell[data-narrow="true"][data-status="draft"] .drawva-widget-side-actions {
        display: flex !important;
        pointer-events: auto !important;
      }
      .drawva-widget-shell[data-selected="true"] .drawva-widget-resize,
      .drawva-widget-shell[data-status="draft"] .drawva-widget-resize {
        display: inline-flex !important;
        pointer-events: auto !important;
      }
      .drawva-widget-shell[data-status="draft"] iframe {
        filter: grayscale(0.15) brightness(0.98);
      }
      .drawva-widget-shell[data-status="draft"] .drawva-widget-draft-overlay {
        display: block !important;
      }
      .drawva-widget-btn,
      .drawva-widget-drag {
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
      .drawva-widget-btn:hover,
      .drawva-widget-drag:hover {
        background: rgba(241, 245, 249, 1) !important;
        border-color: var(--primary) !important;
        border-style: solid !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
      }
      .drawva-widget-btn:active,
      .drawva-widget-drag:active {
        opacity: 0.85;
      }
      .drawva-widget-btn-copy {
        gap: 5px;
        padding: 0 8px !important;
        font-size: 12px;
        font-weight: 500;
        font-family: system-ui, -apple-system, sans-serif;
        color: var(--foreground) !important;
        white-space: nowrap;
      }
      .drawva-widget-accept {
        color: var(--primary) !important;
        border-color: var(--primary) !important;
      }
      .drawva-widget-accept:hover {
        border-color: var(--primary) !important;
      }
      .drawva-widget-remove {
        color: #000000 !important;
        border-color: rgba(0, 0, 0, 0.25) !important;
      }
      .drawva-widget-remove:hover {
        color: #dc2626 !important;
        border-color: rgba(220, 38, 38, 0.5) !important;
        background: rgba(254, 242, 242, 1) !important;
      }
      .drawva-widget-drag {
        cursor: grab !important;
        color: #000000 !important;
        border-color: rgba(0, 0, 0, 0.25) !important;
      }
      .drawva-widget-resize {
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
      .drawva-widget-resize:hover {
        color: var(--primary) !important;
        opacity: 0.8;
      }
      .drawva-widget-resize:active {
        opacity: 1;
      }
      :is(.dark *) .drawva-widget-btn,
      :is(.dark *) .drawva-widget-drag {
        background: rgba(15, 23, 42, 0.92) !important;
        border-color: rgba(255, 255, 255, 0.25) !important;
        color: #ffffff !important;
      }
      :is(.dark *) .drawva-widget-btn:hover,
      :is(.dark *) .drawva-widget-drag:hover {
        background: rgba(30, 41, 59, 1) !important;
        border-color: var(--primary) !important;
        border-style: solid !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
      }
      :is(.dark *) .drawva-widget-btn-copy {
        color: var(--foreground) !important;
      }
      :is(.dark *) .drawva-widget-accept {
        color: var(--primary) !important;
        border-color: var(--primary) !important;
      }
      :is(.dark *) .drawva-widget-remove {
        color: #ffffff !important;
        border-color: rgba(255, 255, 255, 0.25) !important;
      }
      :is(.dark *) .drawva-widget-remove:hover {
        color: #f87171 !important;
        border-color: rgba(248, 113, 113, 0.5) !important;
        background: rgba(69, 10, 10, 0.5) !important;
      }
      :is(.dark *) .drawva-widget-drag {
        color: #ffffff !important;
      }
      :is(.dark *) .drawva-widget-resize {
        color: #ffffff !important;
      }
      :is(.dark *) .drawva-widget-resize:hover {
        color: var(--primary) !important;
      }
    `;
    opts.engineContainer.append(this.hostRoot, this.style);
    window.addEventListener("message", this.onMessage);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  private onMessage = (e: MessageEvent) => {
    if (e.origin !== location.origin) return;
    if (e.data?.type === "drawva-widget-pointerdown") {
      if (this.mode === "hand") return;
      for (const [id, shell] of this.shells) {
        const iframe = shell.querySelector("iframe");
        if (iframe && iframe.contentWindow === e.source) {
          this.setSelected(id);
          break;
        }
      }
    } else if (e.data?.type === "drawva-widget-snapshot") {
      const { dataUrl } = e.data as { dataUrl: string | null };
      for (const [id, shell] of this.shells) {
        const iframe = shell.querySelector("iframe");
        if (iframe && iframe.contentWindow === e.source) {
          const widget = this.widgets.get(id);
          if (!widget) break;
          if (!dataUrl) {
            this.resolveSnapshot(id, widget.cachedImage ?? null);
            break;
          }
          const img = new Image();
          img.onload = () => {
            widget.cachedImage = img;
            this.resolveSnapshot(id, img);
          };
          img.onerror = () => this.resolveSnapshot(id, widget.cachedImage ?? null);
          img.src = dataUrl;
          break;
        }
      }
    }
  };


  add(widget: WidgetItem): void {
    if (this.shells.has(widget.id)) {
      this.unmount(widget.id);
    }
    const htmlDims = extractHtmlDimensions(widget.html);
    let initialW = widget.w;
    let initialH = widget.h;
    let contentW = widget.contentW;
    let contentH = widget.contentH;
    if (htmlDims && !widget.userResized) {
      contentW = htmlDims.width;
      contentH = htmlDims.height;
      if (initialW >= 1200 && contentW < 1200) {
        initialW = contentW;
        initialH = contentH;
      }
    }
    const normalized = normalizeWidgetGeometry({
      ...widget,
      w: initialW,
      h: initialH,
      contentW: contentW || initialW,
      contentH: contentH || initialH,
    });
    this.widgets.set(widget.id, normalized);
    this.mount(normalized);
    this.position(normalized);
    this.applyMode(normalized.id);
  }

  remove(id: string): void {
    this.unmount(id);
    this.widgets.delete(id);
    if (this.selectedId === id) this.selectedId = null;
  }

  has(id: string): boolean {
    return this.widgets.has(id);
  }

  get(id: string): WidgetItem | null {
    return this.widgets.get(id) ?? null;
  }

  getShell(id: string): HTMLElement | null {
    return this.shells.get(id) ?? null;
  }

  getToolbars(id: string) {
    return this.toolbars.get(id) ?? null;
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

  getSelectedGeometry(): WidgetItem | null {
    if (this.selectedId) {
      const w = this.widgets.get(this.selectedId);
      if (w) return w;
    }
    return null;
  }

  setStatus(id: string, status: WidgetStatus): void {
    const w = this.widgets.get(id);
    if (!w) return;
    w.status = status;
    const shell = this.shells.get(id);
    if (shell) shell.dataset.status = status;
    const tb = this.toolbars.get(id);
    if (tb?.overlay) tb.overlay.style.display = status === "draft" ? "block" : "none";
    this.applyMode(id);
  }

  setMode(mode: CanvasMode): void {
    this.mode = mode;
    this.hostRoot.dataset.mode = mode;
    for (const id of this.toolbars.keys()) this.applyMode(id);
  }

  private applyMode(id: string): void {
    const tb = this.toolbars.get(id);
    if (!tb) return;
    const { chrome, dragBar, resizeHandle, resizeWidth, resizeHeight, sideActions, refine, overlay, acceptBtn } = tb;
    const shell = this.shells.get(id);
    const hand = this.mode === "hand";
    const select = this.mode === "select";
    const isSelected = this.selectedId === id;
    const widget = this.widgets.get(id);
    const isDraft = widget?.status === "draft";
    const active = isDraft || isSelected;
    const frame = shell?.querySelector("iframe") as HTMLIFrameElement | null;

    this.hostRoot.style.zIndex = active || hand || select ? "40" : "20";

    if (shell) {
      shell.dataset.selected = isSelected ? "true" : "false";
      // Hand pans through the shell; the iframe keeps pointer-events so graphs/HTML stay clickable.
      shell.style.pointerEvents = hand ? "none" : active || select ? "auto" : "none";
      shell.style.cursor = hand ? "grab" : select ? "grab" : "default";
      shell.style.borderColor = active && !hand ? "var(--primary)" : "transparent";
      shell.style.borderStyle = active && !hand ? "dotted" : "none";
      shell.style.borderWidth = "2px";
      shell.style.boxShadow = "none";
    }

    if (frame) {
      frame.style.pointerEvents = hand || active || select ? "auto" : "none";
    }

    if (chrome) {
      chrome.style.display = hand ? (isDraft ? "flex" : "none") : active ? "flex" : "";
    }
    if (sideActions) {
      const isNarrow = shell?.dataset.narrow === "true";
      sideActions.style.display = !hand && active && isNarrow ? "flex" : "none";
    }
    if (dragBar) {
      dragBar.style.display = hand && !isDraft ? "none" : "inline-flex";
    }
    if (acceptBtn) {
      acceptBtn.style.display = isDraft ? "inline-flex" : "none";
    }
    if (resizeHandle) {
      resizeHandle.style.display = active ? "inline-flex" : "none";
    }
    resizeWidth.style.display = active ? "inline-flex" : "none";
    resizeHeight.style.display = active ? "inline-flex" : "none";
    if (refine) {
      refine.style.display = active ? "inline-flex" : "none";
    }
    if (overlay) {
      overlay.style.display = isDraft ? "block" : "none";
    }
  }

  all(): WidgetItem[] {
    return [...this.widgets.values()];
  }

  clear(): void {
    for (const id of [...this.widgets.keys()]) this.remove(id);
    this.selectedId = null;
  }

  destroy(): void {
    window.removeEventListener("message", this.onMessage);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.clear();
    this.hostRoot.remove();
    this.style.remove();
  }

  sync(): void {
    for (const widget of this.widgets.values()) this.position(widget);
  }

  hitTest(point: Point): WidgetItem | null {
    let hit: WidgetItem | null = null;
    for (const w of this.widgets.values()) {
      if (point.x >= w.x && point.x <= w.x + w.w && point.y >= w.y && point.y <= w.y + w.h) hit = w;
    }
    return hit;
  }

  move(id: string, dx: number, dy: number): void {
    const w = this.widgets.get(id);
    if (!w) return;
    w.x = Math.max(0, Math.min(SIZE - w.w, w.x + dx));
    w.y = Math.max(0, Math.min(SIZE - w.h, w.y + dy));
    this.position(w);
  }

  resize(id: string, newW: number, newH: number, contentW?: number, contentH?: number, userResized?: boolean, mode: WidgetResizeMode = "corner"): void {
    const w = this.widgets.get(id);
    if (!w) return;
    const resized = typeof contentW === "number" || typeof contentH === "number"
      ? normalizeWidgetGeometry({ ...w, w: newW, h: newH, contentW: contentW ?? w.contentW, contentH: contentH ?? w.contentH, userResized: userResized ?? w.userResized, resizeMode: mode })
      : resizeWidgetGeometry(w, mode, newW, newH);
    Object.assign(w, resized, { userResized: userResized ?? resized.userResized });
    this.position(w);
  }

  /**
   * Fit the widget frame when measured content overflows the frame
   * so nothing is ever cropped. Cropping is never acceptable on the canvas.
   * Growth is capped so the measure -> relayout feedback loop cannot oscillate.
   */
  private autoFitContent(id: string, measuredW: number, measuredH: number): void {
    const widget = this.widgets.get(id);
    if (!widget || widget.userResized) return;
    const curW = Math.max(80, widget.contentW || widget.w);
    const curH = Math.max(60, widget.contentH || widget.h);
    const lastFit = this.lastContentFit.get(id);
    const grows = lastFit && lastFit.w === curW && lastFit.h === curH ? lastFit.grows : 0;
    let nextW = curW;
    let nextH = curH;
    if (measuredW > curW + 8 && grows < MAX_CONTENT_FIT_GROWS) {
      nextW = Math.min(MAX_CONTENT_W, Math.round(measuredW));
    }
    if (measuredH > curH + 8 && grows < MAX_CONTENT_FIT_GROWS) {
      nextH = Math.min(MAX_CONTENT_H, Math.round(measuredH));
    }
    if (nextW === curW && nextH === curH) return;
    const next = settleWidgetContent(widget, nextW, nextH);
    Object.assign(widget, next);
    this.lastContentFit.set(id, {
      w: next.w,
      h: next.h,
      grows: nextW > curW || nextH > curH ? grows + 1 : grows,
    });
    this.position(widget);
  }

  private mount(widget: WidgetItem): void {
    const shell = document.createElement("div");
    shell.dataset.hovered = "false";
    shell.dataset.ready = "false";
    shell.dataset.status = widget.status;
    shell.className = "drawva-widget-shell";
    shell.style.cssText =
      "position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:auto;contain:layout style;background:transparent;border:2px solid transparent;border-radius:12px;box-shadow:none;padding:0;overflow:visible;display:flex;flex-direction:column;opacity:0;transition:opacity 0.12s ease;touch-action:none;overscroll-behavior:contain;will-change:transform;backface-visibility:hidden;";

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      shell.dataset.ready = "true";
      shell.style.opacity = "1";
    };

    const readyImmediately = widget.userResized || widget.status === "accepted";
    if (readyImmediately) {
      reveal();
    }
    const fallbackReveal = readyImmediately ? 0 : window.setTimeout(reveal, 900);

    const body = document.createElement("div");
    body.className = "drawva-widget-body";
    body.style.cssText =
      "width:100%;height:100%;flex:1;position:relative;border-radius:8px;overflow:hidden;background:transparent;touch-action:none;overscroll-behavior:contain;";

    const frame = document.createElement("iframe");
    frame.style.cssText =
      "width:100%;height:100%;border:0;display:block;background:transparent;touch-action:none;";
    frame.referrerPolicy = "no-referrer";
    frame.title = widget.title;

    let initSent = false;
    const sendInit = (targetWindow: Window | null, origin?: string) => {
      if (initSent || !targetWindow) return;
      initSent = true;
      const target = typeof origin === "string" && origin !== "null" ? origin : location.origin;
      targetWindow.postMessage(
        { type: "drawva-widget-init", title: widget.title, html: widget.html },
        target
      );
      targetWindow.postMessage(
        { type: "drawva-widget-layout-size", width: Math.max(80, widget.contentW), height: Math.max(60, widget.contentH) },
        target
      );
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (event.data?.type === "drawva-widget-ready" || event.data?.type === "drawva-widget-host-ready") {
        sendInit(frame.contentWindow, event.origin);
        if (fallbackReveal) window.clearTimeout(fallbackReveal);
        requestAnimationFrame(() => requestAnimationFrame(reveal));
      } else if (event.data?.type === "drawva-widget-updated") {
        if (fallbackReveal) window.clearTimeout(fallbackReveal);
        requestAnimationFrame(() => requestAnimationFrame(reveal));
      } else if (event.data?.type === "drawva-widget-content-size") {
        const cw = Number(event.data.width);
        const ch = Number(event.data.height);
        if (Number.isFinite(cw) && Number.isFinite(ch)) this.autoFitContent(widget.id, cw, ch);
      }
    };
    window.addEventListener("message", onMessage);

    frame.onload = () => {
      setTimeout(() => sendInit(frame.contentWindow), 50);
    };

    frame.src = `${WIDGET_HOST_URL}?parent-origin=${encodeURIComponent(location.origin)}`;

    const overlay = document.createElement("div");
    overlay.className = "drawva-widget-draft-overlay";
    overlay.style.cssText =
      "position:absolute;inset:0;display:none;pointer-events:none;background:repeating-linear-gradient(45deg,rgba(59,130,246,0.03) 0 8px,transparent 8px 16px);border-radius:inherit;";

    body.append(frame, overlay);

    const chrome = document.createElement("div");
    chrome.className = "drawva-widget-chrome";
    chrome.style.cssText =
      "position:absolute;left:0;top:0;height:32px;display:none;align-items:center;justify-content:space-between;padding:0 2px;z-index:10;pointer-events:none;touch-action:none;transform-origin:0 0;";

    const leftGroup = document.createElement("div");
    leftGroup.className = "drawva-widget-left-group";
    leftGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "drawva-widget-btn drawva-widget-remove";
    closeBtn.innerHTML = REMOVE_SVG;
    closeBtn.title = "Remove widget";
    closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onRemove?.(widget.id);
    });

    leftGroup.append(closeBtn);

    const dragBar = document.createElement("div");
    dragBar.className = "drawva-widget-drag";
    dragBar.innerHTML = DRAG_SVG;
    dragBar.title = `Drag ${widget.title}`;
    dragBar.style.cssText =
      "position:absolute;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;justify-content:center;cursor:grab;pointer-events:auto;user-select:none;touch-action:none;";

    const rightGroup = document.createElement("div");
    rightGroup.className = "drawva-widget-right-group";
    rightGroup.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto;";

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "drawva-widget-btn drawva-widget-accept";
    acceptBtn.innerHTML = ACCEPT_SVG;
    acceptBtn.title = "Accept & keep widget";
    acceptBtn.style.display = widget.status === "draft" ? "inline-flex" : "none";
    acceptBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    acceptBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      (this.opts.callbacks ?? {}).onAccept?.(widget.id);
    });

    const createCopyButton = (isTop: boolean) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `drawva-widget-btn drawva-widget-btn-copy ${isTop ? "drawva-widget-top-copy" : "drawva-widget-side-copy"}`;
      btn.innerHTML = `${COPY_SVG}<span>${widget.copyLabel ? `Copy ${widget.copyLabel}` : "Copy HTML"}</span>`;
      btn.title = widget.copyLabel ? `Copy ${widget.copyLabel}` : "Copy source code";
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(widget.copyText || widget.html);
        const span = btn.querySelector("span");
        if (span) {
          const orig = span.textContent;
          span.textContent = "Copied!";
          setTimeout(() => {
            span.textContent = orig;
          }, 1200);
        }
      });
      return btn;
    };

    const copyBtnTop = createCopyButton(true);
    const copyBtnSide = createCopyButton(false);

    rightGroup.append(copyBtnTop, acceptBtn);
    chrome.append(leftGroup, dragBar, rightGroup);

    const sideActions = document.createElement("div");
    sideActions.className = "drawva-widget-side-actions";
    sideActions.style.cssText =
      "position:absolute;left:0;top:0;display:none;flex-direction:column;gap:6px;pointer-events:auto;z-index:10;transform-origin:0 0;";
    sideActions.append(copyBtnSide);

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "drawva-widget-resize drawva-widget-resize-corner";
    resizeHandle.innerHTML = RESIZE_SVG;
    resizeHandle.title = "Resize widget (scale content)";
    resizeHandle.style.cssText =
      "position:absolute;left:0;top:0;width:28px;height:28px;cursor:nwse-resize;z-index:10;display:none;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;transform-origin:0 0;";

    const resizeWidth = document.createElement("div");
    resizeWidth.className = "drawva-widget-resize drawva-widget-resize-width";
    resizeWidth.title = "Resize width (trim empty horizontal space / reflow)";
    resizeWidth.innerHTML = RESIZE_WIDTH_SVG;
    resizeWidth.style.cssText =
      "position:absolute;left:0;top:0;width:28px;height:40px;cursor:ew-resize;z-index:10;display:none;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;transform-origin:0 0;";
    
    const resizeHeight = document.createElement("div");
    resizeHeight.className = "drawva-widget-resize drawva-widget-resize-height";
    resizeHeight.title = "Resize height (trim empty vertical space)";
    resizeHeight.innerHTML = RESIZE_HEIGHT_SVG;
    resizeHeight.style.cssText =
      "position:absolute;left:0;top:0;width:40px;height:28px;cursor:ns-resize;z-index:10;display:none;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;transform-origin:0 0;";

    shell.append(body, chrome, sideActions, resizeHandle, resizeWidth, resizeHeight);

    shell.addEventListener("pointerdown", (e) => {
      if (this.mode === "hand") return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".drawva-widget-btn") && !target?.closest(".drawva-widget-resize")) {
        e.stopPropagation();
        this.setSelected(widget.id);
      }
    });

    const cb = this.opts.callbacks ?? {};
    const beginDrag = (e: PointerEvent) => {
      e.stopPropagation();
      if (this.mode !== "hand") this.setSelected(widget.id);
      dragBar.setPointerCapture?.(e.pointerId);
      cb.onDragStart?.(widget.id, e);
    };
    const beginResize = (mode: WidgetResizeMode) => (e: PointerEvent) => {
      e.stopPropagation();
      if (this.mode !== "hand") this.setSelected(widget.id);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      cb.onResizeStart?.(widget.id, mode, e);
    };
    dragBar.addEventListener("pointerdown", beginDrag);
    resizeHandle.addEventListener("pointerdown", beginResize("corner"));
    resizeWidth.addEventListener("pointerdown", beginResize("horizontal"));
    resizeHeight.addEventListener("pointerdown", beginResize("vertical"));

    this.hostRoot.append(shell);
    this.shells.set(widget.id, shell);
    this.toolbars.set(widget.id, { chrome, dragBar, resizeHandle, resizeWidth, resizeHeight, sideActions, refine: undefined, overlay, acceptBtn });
    this.applyMode(widget.id);
  }

  refreshSnapshot(id: string, timeoutMs = 1100): Promise<HTMLImageElement | HTMLCanvasElement | null> {
    const widget = this.widgets.get(id);
    const iframe = this.shells.get(id)?.querySelector("iframe");
    if (!widget) return Promise.resolve(null);
    if (!iframe?.contentWindow) return Promise.resolve(widget.cachedImage ?? null);
    const reqId = `atlas-${id}-${Date.now()}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.dropSnapshotWaiter(id, onReady);
        resolve(widget.cachedImage ?? null);
      }, Math.max(250, timeoutMs));
      const onReady = (img: HTMLImageElement | HTMLCanvasElement | null) => {
        window.clearTimeout(timer);
        resolve(img || widget.cachedImage || null);
      };
      const list = this.snapshotWaiters.get(id) ?? [];
      list.push(onReady);
      this.snapshotWaiters.set(id, list);
      iframe.contentWindow!.postMessage(
        { type: "drawva-widget-snapshot-request", reqId },
        location.origin
      );
    });
  }

  private resolveSnapshot(id: string, img: HTMLImageElement | HTMLCanvasElement | null): void {
    const waiters = this.snapshotWaiters.get(id);
    if (!waiters || waiters.length === 0) return;
    this.snapshotWaiters.delete(id);
    for (const fn of waiters) fn(img);
  }

  private dropSnapshotWaiter(
    id: string,
    waiter: (img: HTMLImageElement | HTMLCanvasElement | null) => void
  ): void {
    const list = this.snapshotWaiters.get(id);
    if (!list) return;
    const next = list.filter((fn) => fn !== waiter);
    if (next.length) this.snapshotWaiters.set(id, next);
    else this.snapshotWaiters.delete(id);
  }

  private unmount(id: string): void {
    this.resolveSnapshot(id, this.widgets.get(id)?.cachedImage ?? null);
    this.shells.get(id)?.remove();
    this.shells.delete(id);
    this.toolbars.delete(id);
    this.lastLayoutSize.delete(id);
    this.styleSizeKey.delete(id);
    this.lastRenderState.delete(id);
    this.lastContentFit.delete(id);
  }

  private sendWidgetState(widget: WidgetItem, active: boolean, scaleX: number, scaleY: number): void {
    const shell = this.shells.get(widget.id);
    const frame = shell?.querySelector("iframe");
    if (!frame?.contentWindow) return;
    const selected = this.selectedId === widget.id || widget.status === "draft";
    const stateKey = `${selected ? 1 : 0}:${active ? 1 : 0}:${scaleX.toFixed(4)}:${scaleY.toFixed(4)}`;
    if (this.lastRenderState.get(widget.id) === stateKey) return;
    this.lastRenderState.set(widget.id, stateKey);
    frame.contentWindow.postMessage(
      { type: "drawva-widget-state", selected, active, scaleX, scaleY },
      location.origin
    );
  }

  private position(widget: WidgetItem): void {
    const shell = this.shells.get(widget.id);
    if (!shell) return;
    const cam = this.opts.camera;
    const vp = cam.viewportRect;
    const viewportW = vp.w || 1920;
    const viewportH = vp.h || 1080;
    const screenX = cam.panX + widget.x * cam.scale;
    const screenY = cam.panY + widget.y * cam.scale;
    const contentW = Math.max(80, widget.contentW && widget.contentW > 10 ? widget.contentW : (widget.w || 400));
    const contentH = Math.max(60, widget.contentH && widget.contentH > 10 ? widget.contentH : (widget.h || 300));
    const scaleX = (cam.scale * widget.w) / contentW;
    const scaleY = (cam.scale * widget.h) / contentH;

    const invScaleX = 1 / (scaleX || 1);
    const invScaleY = 1 / (scaleY || 1);

    const renderedW = contentW * scaleX;
    const renderedH = contentH * scaleY;
    const isNarrow = renderedW < 340;
    if (shell.dataset.narrow !== (isNarrow ? "true" : "false")) {
      shell.dataset.narrow = isNarrow ? "true" : "false";
    }

    const sizeKey = `${contentW}x${contentH}`;
    if (this.styleSizeKey.get(widget.id) !== sizeKey) {
      this.styleSizeKey.set(widget.id, sizeKey);
      shell.style.width = `${contentW}px`;
      shell.style.height = `${contentH}px`;
    }
    shell.style.transform = `translate3d(${screenX}px,${screenY}px,0) scale(${scaleX},${scaleY})`;

    const tb = this.toolbars.get(widget.id);
    if (tb) {
      const { chrome, sideActions, resizeHandle, resizeWidth, resizeHeight } = tb;
      const chromeW = Math.max(110, renderedW);
      const chromeLeftScreen = (renderedW - chromeW) / 2;
      chrome.style.width = `${chromeW}px`;
      chrome.style.transform = `translate3d(${chromeLeftScreen * invScaleX}px,${-38 * invScaleY}px,0) scale(${invScaleX},${invScaleY})`;

      if (sideActions) {
        sideActions.style.transform = `translate3d(${contentW + 8 * invScaleX}px,0,0) scale(${invScaleX},${invScaleY})`;
      }

      if (resizeHandle) {
        resizeHandle.style.transform = `translate3d(${contentW}px,${contentH}px,0) scale(${invScaleX},${invScaleY}) translate(-50%, -50%)`;
      }
      if (resizeWidth) {
        resizeWidth.style.transform = `translate3d(${contentW}px,${contentH / 2}px,0) scale(${invScaleX},${invScaleY}) translate(-50%, -50%)`;
      }
      if (resizeHeight) {
        resizeHeight.style.transform = `translate3d(${contentW / 2}px,${contentH}px,0) scale(${invScaleX},${invScaleY}) translate(-50%, -50%)`;
      }
    }

    const frame = shell.querySelector("iframe");
    if (frame?.contentWindow && this.lastLayoutSize.get(widget.id) !== sizeKey) {
      this.lastLayoutSize.set(widget.id, sizeKey);
      frame.contentWindow.postMessage({ type: "drawva-widget-layout-size", width: contentW, height: contentH }, location.origin);
    }

    const offscreen =
      screenX > viewportW ||
      screenY > viewportH ||
      screenX + renderedW < 0 ||
      screenY + renderedH < 0;

    const isVisible = !offscreen;
    const visStr = isVisible ? "visible" : "hidden";
    if (shell.style.visibility !== visStr) {
      shell.style.visibility = visStr;
    }

    this.sendWidgetState(widget, isVisible, scaleX, scaleY);
  }
}

export { WIDGET_HOST_URL };
