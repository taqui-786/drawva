import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const alt = "Drawva — AI Infinite Canvas Whiteboard";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  const fontPath = path.join(process.cwd(), "assets/fonts/MuseoModerno-Bold.ttf");
  const fontData = await fs.readFile(fontPath);

  const width = size.width;
  const height = size.height;
  const gridSize = 40;

  const lines = [];
  for (let x = 0; x <= width; x += gridSize) {
    const isMajor = x % (gridSize * 4) === 0;
    lines.push(
      <line
        key={"v" + x}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={isMajor ? "rgba(255, 255, 255, 0.07)" : "rgba(255, 255, 255, 0.025)"}
        strokeWidth={isMajor ? 1.5 : 1}
      />
    );
  }

  for (let y = 0; y <= height; y += gridSize) {
    const isMajor = y % (gridSize * 4) === 0;
    lines.push(
      <line
        key={"h" + y}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke={isMajor ? "rgba(255, 255, 255, 0.07)" : "rgba(255, 255, 255, 0.025)"}
        strokeWidth={isMajor ? 1.5 : 1}
      />
    );
  }

  const crosses = [];
  for (let x = gridSize * 4; x < width; x += gridSize * 4) {
    for (let y = gridSize * 4; y < height; y += gridSize * 4) {
      crosses.push(
        <path
          key={"c" + x + "_" + y}
          d={`M ${x - 4} ${y} L ${x + 4} ${y} M ${x} ${y - 4} L ${x} ${y + 4}`}
          stroke="rgba(190, 242, 100, 0.22)"
          strokeWidth={1.5}
        />
      );
    }
  }

  const cornerPad = 32;
  const cornerLen = 24;
  const cornerMarks = [
    <path
      key="tl"
      d={`M ${cornerPad} ${cornerPad + cornerLen} L ${cornerPad} ${cornerPad} L ${cornerPad + cornerLen} ${cornerPad}`}
      stroke="rgba(190, 242, 100, 0.4)"
      strokeWidth={2}
      fill="none"
    />,
    <path
      key="tr"
      d={`M ${width - cornerPad - cornerLen} ${cornerPad} L ${width - cornerPad} ${cornerPad} L ${width - cornerPad} ${cornerPad + cornerLen}`}
      stroke="rgba(190, 242, 100, 0.4)"
      strokeWidth={2}
      fill="none"
    />,
    <path
      key="bl"
      d={`M ${cornerPad} ${height - cornerPad - cornerLen} L ${cornerPad} ${height - cornerPad} L ${cornerPad + cornerLen} ${height - cornerPad}`}
      stroke="rgba(190, 242, 100, 0.4)"
      strokeWidth={2}
      fill="none"
    />,
    <path
      key="br"
      d={`M ${width - cornerPad - cornerLen} ${height - cornerPad} L ${width - cornerPad} ${height - cornerPad} L ${width - cornerPad} ${height - cornerPad - cornerLen}`}
      stroke="rgba(190, 242, 100, 0.4)"
      strokeWidth={2}
      fill="none"
    />,
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#090B10",
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, #111622 0%, #080a0f 100%)",
          position: "relative",
        }}
      >
        <svg
          width={width}
          height={height}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          {lines}
          {crosses}
          {cornerMarks}
        </svg>

        <div
          style={{
            position: "absolute",
            width: 600,
            height: 280,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(190, 242, 100, 0.16) 0%, rgba(132, 204, 22, 0.05) 50%, transparent 75%)",
            filter: "blur(50px)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "MuseoModerno",
            fontSize: 156,
            fontWeight: 700,
            color: "#BEF264",
            letterSpacing: "0.04em",
            textShadow:
              "0 0 45px rgba(190, 242, 100, 0.4), 0 0 90px rgba(190, 242, 100, 0.18)",
          }}
        >
          Drawva
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "MuseoModerno",
          data: fontData,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );
}
