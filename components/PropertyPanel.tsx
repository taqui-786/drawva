"use client";

import { BACKGROUND_COLORS, STROKE_COLORS } from "@canvas/constants/defaults";
import type { Editor } from "@/canvas/core/Editor";
import type { CanvasElement, FillStyle, StrokeStyle } from "@/canvas/model/types";
import { useEffect, useState } from "react";

interface PropertyPanelProps {
  editor: Editor | null;
}

export function PropertyPanel({ editor }: PropertyPanelProps) {
  const [selectedElements, setSelectedElements] = useState<CanvasElement[]>([]);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      setSelectedElements(editor.getSelectedElements());
    };
    update();
    const unsubSelection = editor.on("selectionChange", update);
    const unsubChange = editor.on("change", update);
    return () => {
      unsubSelection();
      unsubChange();
    };
  }, [editor]);

  if (!editor || selectedElements.length === 0) return null;

  // Derive common properties across selection
  const first = selectedElements[0];
  const strokeColor = first.strokeColor;
  const backgroundColor = first.backgroundColor;
  const fillStyle = first.fillStyle;
  const strokeWidth = first.strokeWidth;
  const strokeStyle = first.strokeStyle;
  const roughness = first.roughness;
  const opacity = first.opacity;

  const updateStyle = (key: string, value: unknown) => {
    editor.updateSelectedStyle({ [key]: value });
  };

  return (
    <div className="absolute left-4 top-20 z-20 flex w-56 flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur max-h-[calc(100vh-120px)] overflow-y-auto text-xs">
      {/* Stroke Color */}
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground">Stroke</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STROKE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={
                "h-6 w-6 rounded-md border border-border/40 transition-transform hover:scale-110 " +
                (strokeColor === color ? "ring-2 ring-primary ring-offset-1" : "")
              }
              style={{ backgroundColor: color }}
              onClick={() => updateStyle("strokeColor", color)}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Background Color */}
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground">Background</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {BACKGROUND_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={
                "h-6 w-6 rounded-md border border-border/40 transition-transform hover:scale-110 flex items-center justify-center " +
                (backgroundColor === color ? "ring-2 ring-primary ring-offset-1" : "")
              }
              style={{ backgroundColor: color === "transparent" ? "transparent" : color }}
              onClick={() => updateStyle("backgroundColor", color)}
              title={color === "transparent" ? "None" : color}
            >
              {color === "transparent" && <span className="text-[10px] text-muted-foreground font-bold">✕</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Fill Style */}
      {backgroundColor !== "transparent" && (
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-muted-foreground">Fill</span>
          <div className="grid grid-cols-3 gap-1 bg-muted/50 p-1 rounded-lg">
            {(["solid", "hachure", "cross-hatch"] as FillStyle[]).map((f) => (
              <button
                key={f}
                type="button"
                className={
                  "rounded py-1 capitalize text-center text-[11px] font-medium transition-colors " +
                  (fillStyle === f ? "bg-background shadow-xs text-foreground" : "hover:bg-background/50 text-muted-foreground")
                }
                onClick={() => updateStyle("fillStyle", f)}
              >
                {f === "cross-hatch" ? "Cross" : f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stroke Width */}
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground">Stroke Width</span>
        <div className="grid grid-cols-3 gap-1 bg-muted/50 p-1 rounded-lg">
          {[
            { label: "Thin", val: 1 },
            { label: "Medium", val: 2 },
            { label: "Bold", val: 4 },
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              className={
                "rounded py-1 text-center text-[11px] font-medium transition-colors " +
                (strokeWidth === item.val ? "bg-background shadow-xs text-foreground" : "hover:bg-background/50 text-muted-foreground")
              }
              onClick={() => updateStyle("strokeWidth", item.val)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stroke Style */}
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground">Stroke Style</span>
        <div className="grid grid-cols-3 gap-1 bg-muted/50 p-1 rounded-lg">
          {(["solid", "dashed", "dotted"] as StrokeStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              className={
                "rounded py-1 capitalize text-center text-[11px] font-medium transition-colors " +
                (strokeStyle === s ? "bg-background shadow-xs text-foreground" : "hover:bg-background/50 text-muted-foreground")
              }
              onClick={() => updateStyle("strokeStyle", s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Sloppiness / Roughness */}
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-muted-foreground">Sloppiness</span>
        <div className="grid grid-cols-3 gap-1 bg-muted/50 p-1 rounded-lg">
          {[
            { label: "Architect", val: 0 },
            { label: "Artist", val: 1 },
            { label: "Cartoon", val: 2 },
          ].map((item) => (
            <button
              key={item.val}
              type="button"
              className={
                "rounded py-1 text-center text-[11px] font-medium transition-colors " +
                (roughness === item.val ? "bg-background shadow-xs text-foreground" : "hover:bg-background/50 text-muted-foreground")
              }
              onClick={() => updateStyle("roughness", item.val)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-muted-foreground">Opacity</span>
          <span className="tabular-nums text-muted-foreground">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => updateStyle("opacity", parseFloat(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-primary"
        />
      </div>
    </div>
  );
}
