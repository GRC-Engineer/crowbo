// Crowbo pixel icon set.
//
// Every icon is drawn on a 16 × 16 grid from filled rectangles, so it shares
// the stepped edges of the Modular Crow, Packet Runner and the twelve feather
// designs. The set replaces the generic Lucide stroke icons that made the
// studio look like every other dashboard. Icons are decorative: the text next
// to them carries the meaning, so each SVG is hidden from assistive technology.
//
// A rectangle is [x, y, width, height]. Icons that need a hole (a lock's
// keyhole, a gear's centre) use the even-odd fill rule so overlapping
// rectangles cut out instead of stacking.

import type { SVGProps } from "react";

export type IconProps = {
  size?: number;
  className?: string;
  /** Accepted for call-site compatibility; pixel icons have no stroke. */
  strokeWidth?: number;
} & Omit<SVGProps<SVGSVGElement>, "width" | "height">;

type Rect = [number, number, number, number];

function path(rects: Rect[]) {
  return rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`).join("");
}

function pixelIcon(rects: Rect[], evenOdd = false) {
  const d = path(rects);
  return function PixelIcon({
    size = 16,
    className = "",
    strokeWidth: _ignored,
    ...rest
  }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="currentColor"
        fillRule={evenOdd ? "evenodd" : undefined}
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
        className={`pixel-icon ${className}`.trim()}
        {...rest}
      >
        <path d={d} />
      </svg>
    );
  };
}

// Arrows. A two-pixel shaft with a stepped head.
export const ArrowRight = pixelIcon([
  [2, 7, 10, 2],
  [8, 3, 2, 2],
  [10, 5, 2, 2],
  [12, 7, 2, 2],
  [10, 9, 2, 2],
  [8, 11, 2, 2],
]);
export const ArrowLeft = pixelIcon([
  [4, 7, 10, 2],
  [6, 3, 2, 2],
  [4, 5, 2, 2],
  [2, 7, 2, 2],
  [4, 9, 2, 2],
  [6, 11, 2, 2],
]);
export const ArrowUp = pixelIcon([
  [7, 4, 2, 10],
  [3, 8, 2, 2],
  [5, 6, 2, 2],
  [7, 2, 2, 2],
  [9, 6, 2, 2],
  [11, 8, 2, 2],
]);
export const ArrowDown = pixelIcon([
  [7, 2, 2, 10],
  [3, 6, 2, 2],
  [5, 8, 2, 2],
  [7, 12, 2, 2],
  [9, 8, 2, 2],
  [11, 6, 2, 2],
]);
export const ArrowUpRight = pixelIcon([
  [6, 3, 7, 2],
  [11, 3, 2, 7],
  [9, 5, 2, 2],
  [7, 7, 2, 2],
  [5, 9, 2, 2],
  [3, 11, 2, 2],
]);
export const CornerDownRight = pixelIcon([
  [3, 2, 2, 7],
  [3, 7, 9, 2],
  [9, 4, 2, 2],
  [11, 6, 2, 2],
  [11, 8, 2, 2],
  [9, 10, 2, 2],
]);

// Chevrons and marks.
export const ChevronDown = pixelIcon([
  [2, 5, 2, 2],
  [4, 7, 2, 2],
  [6, 9, 2, 2],
  [8, 9, 2, 2],
  [10, 7, 2, 2],
  [12, 5, 2, 2],
]);
export const ChevronRight = pixelIcon([
  [5, 2, 2, 2],
  [7, 4, 2, 2],
  [9, 6, 2, 2],
  [9, 8, 2, 2],
  [7, 10, 2, 2],
  [5, 12, 2, 2],
]);
export const Check = pixelIcon([
  [2, 8, 2, 2],
  [4, 10, 2, 2],
  [6, 12, 2, 2],
  [8, 10, 2, 2],
  [10, 8, 2, 2],
  [12, 6, 2, 2],
  [14, 4, 1, 2],
]);
export const X = pixelIcon([
  [3, 3, 2, 2],
  [5, 5, 2, 2],
  [7, 7, 2, 2],
  [9, 9, 2, 2],
  [11, 11, 2, 2],
  [11, 3, 2, 2],
  [9, 5, 2, 2],
  [5, 9, 2, 2],
  [3, 11, 2, 2],
]);
export const Minus = pixelIcon([[2, 7, 12, 2]]);
export const Menu = pixelIcon([
  [2, 3, 12, 2],
  [2, 7, 12, 2],
  [2, 11, 12, 2],
]);

// Objects.
export const LockKeyhole = pixelIcon(
  [
    [5, 1, 6, 2],
    [4, 3, 2, 4],
    [10, 3, 2, 4],
    [3, 7, 10, 8],
    [7, 9, 2, 2],
    [7, 11, 2, 2],
  ],
  true,
);
export const Search = pixelIcon([
  [4, 2, 5, 2],
  [4, 9, 5, 2],
  [2, 4, 2, 5],
  [9, 4, 2, 5],
  [10, 10, 2, 2],
  [12, 12, 2, 2],
]);
export const Settings = pixelIcon(
  [
    [7, 1, 2, 3],
    [7, 12, 2, 3],
    [1, 7, 3, 2],
    [12, 7, 3, 2],
    [3, 3, 2, 2],
    [11, 3, 2, 2],
    [3, 11, 2, 2],
    [11, 11, 2, 2],
    [4, 4, 8, 8],
    [7, 7, 2, 2],
  ],
  true,
);
export const Play = pixelIcon([
  [4, 2, 2, 12],
  [6, 3, 2, 10],
  [8, 4, 2, 8],
  [10, 5, 2, 6],
  [12, 7, 2, 2],
]);
export const Pause = pixelIcon([
  [4, 2, 3, 12],
  [9, 2, 3, 12],
]);
export const RotateCcw = pixelIcon([
  [4, 2, 8, 2],
  [12, 4, 2, 6],
  [4, 12, 8, 2],
  [2, 4, 2, 5],
  [12, 10, 2, 2],
  [1, 8, 4, 2],
  [3, 10, 2, 2],
]);
export const Plug = pixelIcon([
  [5, 1, 2, 4],
  [9, 1, 2, 4],
  [3, 5, 10, 5],
  [6, 10, 4, 2],
  [7, 12, 2, 3],
]);
export const History = pixelIcon([
  [4, 2, 8, 2],
  [12, 4, 2, 8],
  [4, 12, 8, 2],
  [2, 4, 2, 8],
  [7, 5, 2, 4],
  [7, 8, 4, 2],
]);
export const Home = pixelIcon([
  [7, 1, 2, 2],
  [5, 3, 2, 2],
  [9, 3, 2, 2],
  [3, 5, 2, 2],
  [11, 5, 2, 2],
  [3, 7, 2, 7],
  [11, 7, 2, 7],
  [3, 12, 10, 2],
  [7, 9, 2, 5],
]);
export const BookOpen = pixelIcon([
  [2, 3, 5, 2],
  [2, 3, 2, 10],
  [2, 11, 5, 2],
  [7, 2, 2, 12],
  [9, 3, 5, 2],
  [12, 3, 2, 10],
  [9, 11, 5, 2],
]);
export const Command = pixelIcon(
  [
    [1, 1, 5, 5],
    [2, 2, 3, 3],
    [10, 1, 5, 5],
    [11, 2, 3, 3],
    [1, 10, 5, 5],
    [2, 11, 3, 3],
    [10, 10, 5, 5],
    [11, 11, 3, 3],
    [5, 5, 6, 6],
    [7, 7, 2, 2],
  ],
  true,
);
export const CodeXml = pixelIcon([
  [5, 3, 2, 2],
  [3, 5, 2, 2],
  [1, 7, 2, 2],
  [3, 9, 2, 2],
  [5, 11, 2, 2],
  [9, 3, 2, 2],
  [11, 5, 2, 2],
  [13, 7, 2, 2],
  [11, 9, 2, 2],
  [9, 11, 2, 2],
]);

// Conversation, people and evidence.
export const MessageSquare = pixelIcon(
  [
    [2, 2, 12, 10],
    [4, 4, 8, 6],
    [2, 12, 2, 3],
    [4, 12, 2, 1],
  ],
  true,
);
export const MessageCircle = pixelIcon([
  [5, 2, 6, 2],
  [3, 3, 2, 2],
  [11, 3, 2, 2],
  [2, 5, 2, 6],
  [12, 5, 2, 6],
  [11, 11, 2, 2],
  [5, 12, 6, 2],
  [3, 11, 2, 2],
  [2, 13, 3, 2],
]);
export const Users = pixelIcon([
  [3, 2, 4, 4],
  [1, 8, 8, 6],
  [10, 4, 3, 3],
  [10, 9, 5, 5],
]);
export const Fingerprint = pixelIcon([
  [5, 1, 6, 2],
  [3, 3, 2, 2],
  [11, 3, 2, 2],
  [2, 5, 2, 5],
  [12, 5, 2, 5],
  [6, 5, 4, 2],
  [5, 7, 2, 5],
  [9, 7, 2, 5],
  [7, 9, 2, 2],
  [7, 12, 2, 3],
  [3, 11, 2, 2],
  [11, 11, 2, 2],
]);
export const GitCompareArrows = pixelIcon(
  [
    [1, 1, 5, 5],
    [2, 2, 3, 3],
    [10, 10, 5, 5],
    [11, 11, 3, 3],
    [2, 6, 2, 6],
    [2, 12, 8, 2],
    [7, 2, 5, 2],
    [12, 2, 2, 8],
  ],
  true,
);
export const Feather = pixelIcon([
  [11, 1, 3, 2],
  [12, 3, 2, 2],
  [9, 3, 2, 2],
  [10, 5, 2, 2],
  [7, 5, 2, 2],
  [8, 7, 2, 2],
  [5, 7, 2, 2],
  [6, 9, 2, 2],
  [3, 9, 2, 2],
  [4, 11, 2, 2],
  [2, 13, 2, 2],
]);
export const Sparkles = pixelIcon([
  [7, 1, 2, 4],
  [7, 11, 2, 4],
  [1, 7, 4, 2],
  [11, 7, 4, 2],
  [6, 6, 4, 4],
  [12, 1, 2, 2],
  [2, 13, 2, 2],
]);
