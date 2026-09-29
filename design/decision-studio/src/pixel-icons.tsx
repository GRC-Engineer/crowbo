import type { SVGProps } from "react";

// Crowbo's icons are drawn on an 8 by 8 grid of square pixels, the same way
// the crow and the feathers are drawn. Each icon is eight rows of text where
// "#" is a filled pixel. Icons render at whole multiples of the grid so every
// pixel stays square.

type Bitmap = readonly string[];

export type PixelIconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  size?: number;
};

const GRID = 8;

function renderedSize(requested: number) {
  if (requested >= 32) return 32;
  if (requested > 20) return 24;
  return 16;
}

function flip(rows: Bitmap): Bitmap {
  return rows.map((row) => [...row].reverse().join(""));
}

function turn(rows: Bitmap): Bitmap {
  return rows.map((_, column) =>
    rows
      .map((row) => row[column])
      .reverse()
      .join(""),
  );
}

function pathFor(rows: Bitmap) {
  let path = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < GRID) {
      if (row[x] !== "#") {
        x += 1;
        continue;
      }
      let end = x;
      while (end < GRID && row[end] === "#") end += 1;
      path += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return path;
}

function icon(name: string, rows: Bitmap) {
  const path = pathFor(rows);
  function PixelIcon({ size = 16, ...props }: PixelIconProps) {
    const side = renderedSize(size);
    return (
      <svg
        width={side}
        height={side}
        viewBox={`0 0 ${GRID} ${GRID}`}
        fill="currentColor"
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d={path} />
      </svg>
    );
  }
  PixelIcon.displayName = name;
  return PixelIcon;
}

const arrowRight: Bitmap = [
  "........",
  "....#...",
  ".....#..",
  ".######.",
  ".....#..",
  "....#...",
  "........",
  "........",
];
const chevronDown: Bitmap = [
  "........",
  "........",
  ".#....#.",
  "..#..#..",
  "...##...",
  "........",
  "........",
  "........",
];

export const ArrowRight = icon("ArrowRight", arrowRight);
export const ArrowDown = icon("ArrowDown", turn(arrowRight));
export const ArrowLeft = icon("ArrowLeft", flip(arrowRight));
export const ArrowUp = icon("ArrowUp", turn(flip(arrowRight)));
export const ChevronDown = icon("ChevronDown", chevronDown);
export const ChevronRight = icon("ChevronRight", turn(turn(turn(chevronDown))));

export const ArrowUpRight = icon("ArrowUpRight", [
  "........",
  "..#####.",
  ".....##.",
  "....#.#.",
  "...#..#.",
  "..#...#.",
  ".#......",
  "........",
]);
export const CornerDownRight = icon("CornerDownRight", [
  ".#......",
  ".#......",
  ".#..#...",
  ".#...#..",
  ".######.",
  ".....#..",
  "....#...",
  "........",
]);
export const Check = icon("Check", [
  "........",
  ".......#",
  "......#.",
  "#....#..",
  ".#..#...",
  "..##....",
  "........",
  "........",
]);
export const X = icon("X", [
  "........",
  ".#....#.",
  "..#..#..",
  "...##...",
  "...##...",
  "..#..#..",
  ".#....#.",
  "........",
]);
export const Minus = icon("Minus", [
  "........",
  "........",
  "........",
  ".######.",
  "........",
  "........",
  "........",
  "........",
]);
export const Menu = icon("Menu", [
  "........",
  ".######.",
  "........",
  ".######.",
  "........",
  ".######.",
  "........",
  "........",
]);
export const Search = icon("Search", [
  ".###....",
  "#...#...",
  "#...#...",
  "#...#...",
  ".###....",
  "....#...",
  ".....#..",
  "......#.",
]);
export const Play = icon("Play", [
  "........",
  ".##.....",
  ".####...",
  ".######.",
  ".######.",
  ".####...",
  ".##.....",
  "........",
]);
export const Pause = icon("Pause", [
  "........",
  ".##..##.",
  ".##..##.",
  ".##..##.",
  ".##..##.",
  ".##..##.",
  ".##..##.",
  "........",
]);
export const LockKeyhole = icon("LockKeyhole", [
  "..###...",
  ".#...#..",
  ".#...#..",
  "#######.",
  "#.....#.",
  "#..#..#.",
  "#.....#.",
  "#######.",
]);
export const Home = icon("Home", [
  "...##...",
  "..#..#..",
  ".#....#.",
  "########",
  ".#....#.",
  ".#.##.#.",
  ".#.##.#.",
  ".######.",
]);
export const Settings = icon("Settings", [
  "...##...",
  ".#.##.#.",
  "..####..",
  "###..###",
  "###..###",
  "..####..",
  ".#.##.#.",
  "...##...",
]);
export const Users = icon("Users", [
  ".##..##.",
  ".##..##.",
  "........",
  "####.###",
  "####.###",
  "####.###",
  "........",
  "........",
]);
export const History = icon("History", [
  "..####..",
  ".#....#.",
  "#..#...#",
  "#..#...#",
  "#..###.#",
  "#......#",
  ".#....#.",
  "..####..",
]);
export const RotateCcw = icon("RotateCcw", [
  ".#.###..",
  "##....#.",
  "###....#",
  ".......#",
  ".......#",
  "#.....#.",
  ".#####..",
  "........",
]);
export const MessageSquare = icon("MessageSquare", [
  "########",
  "#......#",
  "#......#",
  "#......#",
  "########",
  ".##.....",
  ".#......",
  "........",
]);
export const MessageCircle = icon("MessageCircle", [
  "########",
  "#......#",
  "#.####.#",
  "#......#",
  "########",
  ".....##.",
  "......#.",
  "........",
]);
export const Command = icon("Command", [
  ".#....#.",
  "#.#..#.#",
  ".######.",
  "..#..#..",
  "..#..#..",
  ".######.",
  "#.#..#.#",
  ".#....#.",
]);
export const CodeXml = icon("CodeXml", [
  "........",
  "..#..#..",
  ".#....#.",
  "#......#",
  ".#....#.",
  "..#..#..",
  "........",
  "........",
]);
export const BookOpen = icon("BookOpen", [
  "........",
  "###..###",
  "#..##..#",
  "#..##..#",
  "#..##..#",
  "#..##..#",
  "########",
  "........",
]);
export const GitCompareArrows = icon("GitCompareArrows", [
  "..#.....",
  ".######.",
  "..#.....",
  "........",
  ".....#..",
  ".######.",
  ".....#..",
  "........",
]);
export const Feather = icon("Feather", [
  "....###.",
  "...####.",
  "..###.#.",
  "..##.#..",
  ".#.##...",
  ".##.....",
  "#.......",
  "........",
]);
export const Fingerprint = icon("Fingerprint", [
  ".######.",
  "#......#",
  "#.####.#",
  "#.#..#.#",
  "#.#..#.#",
  "#.#.##.#",
  "#.#.....",
  "..#.###.",
]);
export const Plug = icon("Plug", [
  "..#..#..",
  "..#..#..",
  ".######.",
  ".######.",
  ".######.",
  "..####..",
  "...##...",
  "...##...",
]);
// An open square bracket around an empty pixel: the piece that is not there
// yet. Used where the interface asks what is missing.
export const MissingPiece = icon("MissingPiece", [
  "###..###",
  "#......#",
  "#......#",
  "........",
  "........",
  "#......#",
  "#......#",
  "###..###",
]);

export const pixelIcons = {
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Check,
  X,
  Minus,
  Menu,
  Search,
  Play,
  Pause,
  LockKeyhole,
  Home,
  Settings,
  Users,
  History,
  RotateCcw,
  MessageSquare,
  MessageCircle,
  Command,
  CodeXml,
  BookOpen,
  GitCompareArrows,
  Feather,
  Fingerprint,
  Plug,
  MissingPiece,
} as const;
