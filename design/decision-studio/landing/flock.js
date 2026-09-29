const nodes = [
  [145, 95, 60],
  [330, 65, 64],
  [530, 95, 68],
  [690, 155, 60],
  [85, 220, 60],
  [245, 205, 78],
  [440, 225, 70],
  [600, 275, 84],
  [725, 330, 60],
  [130, 370, 68],
  [305, 365, 84],
  [490, 400, 76],
  [650, 445, 68],
  [80, 520, 58],
  [220, 540, 70],
  [390, 535, 74],
  [540, 575, 82],
  [715, 575, 60],
  [145, 660, 66],
  [315, 675, 60],
  [470, 695, 64],
  [655, 695, 68],
].map(([x, y, size]) => ({ x, y, size }));

const links = [
  [0, 1],
  [0, 4],
  [0, 5],
  [1, 2],
  [1, 5],
  [1, 6],
  [2, 3],
  [2, 6],
  [3, 7],
  [3, 8],
  [4, 5],
  [4, 9],
  [5, 6],
  [5, 10],
  [6, 7],
  [6, 11],
  [7, 8],
  [7, 11],
  [7, 12],
  [8, 12],
  [9, 10],
  [9, 13],
  [9, 14],
  [10, 11],
  [10, 14],
  [10, 15],
  [11, 12],
  [11, 15],
  [11, 16],
  [12, 17],
  [13, 14],
  [13, 18],
  [14, 15],
  [14, 18],
  [15, 16],
  [15, 19],
  [15, 20],
  [16, 17],
  [16, 20],
  [16, 21],
  [17, 21],
  [18, 19],
  [19, 20],
  [20, 21],
].map(([from, to], index) => {
  const a = nodes[from];
  const b = nodes[to];
  const horizontal = Math.abs(a.x - b.x) > Math.abs(a.y - b.y);
  const axis = horizontal ? "x" : "y";
  const direction = Math.sign(b[axis] - a[axis]);
  const start = { x: a.x, y: a.y };
  const end = { x: b.x, y: b.y };
  start[axis] += direction * (a.size / 2 + 5);
  end[axis] -= direction * (b.size / 2 + 5);
  const middle = (start[axis] + end[axis]) / 2;
  const points = [
    start,
    { ...start, [axis]: middle },
    { ...end, [axis]: middle },
    end,
  ];
  const lengths = points
    .slice(1)
    .map((point, i) =>
      Math.hypot(point.x - points[i].x, point.y - points[i].y),
    );
  const path = new Path2D();
  path.moveTo(start.x, start.y);
  for (const point of points.slice(1)) path.lineTo(point.x, point.y);
  return {
    from,
    to,
    path,
    points,
    lengths,
    length: lengths.reduce((sum, length) => sum + length, 0),
    strong: index % 5 === 0,
  };
});

function pointAlong(link, progress) {
  let distance = link.length * progress;
  for (let i = 0; i < link.lengths.length; i += 1) {
    const length = link.lengths[i];
    if (distance <= length && length > 0) {
      const ratio = distance / length;
      const a = link.points[i];
      const b = link.points[i + 1];
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }
    distance -= length;
  }
  return link.points.at(-1);
}

export function createFlock(canvas, source, bytes) {
  const context = canvas.getContext("2d");
  const base = document.createElement("canvas");
  base.width = canvas.width;
  base.height = canvas.height;
  const baseContext = base.getContext("2d");
  const sprite = document.createElement("canvas");
  sprite.width = 128;
  sprite.height = 122;
  const spriteContext = sprite.getContext("2d");
  spriteContext.globalAlpha = 0.8;
  spriteContext.filter = "brightness(1.65)";
  const scale = Math.min(
    sprite.width / source.naturalWidth,
    sprite.height / source.naturalHeight,
  );
  const width = source.naturalWidth * scale;
  const height = source.naturalHeight * scale;
  spriteContext.drawImage(
    source,
    (sprite.width - width) / 2,
    (sprite.height - height) / 2,
    width,
    height,
  );
  spriteContext.globalAlpha = 0.2;
  spriteContext.filter = "brightness(2.6)";
  spriteContext.drawImage(bytes, 0, 0, 128, 122);
  let selected = -1;

  for (const link of links) {
    baseContext.strokeStyle = link.strong
      ? "rgba(145, 170, 157, .34)"
      : "rgba(145, 170, 157, .16)";
    baseContext.lineWidth = link.strong ? 1.3 : 0.8;
    baseContext.stroke(link.path);
    for (const port of [link.points[0], link.points.at(-1)]) {
      baseContext.fillStyle = "rgba(145, 170, 157, .36)";
      baseContext.fillRect(port.x - 1, port.y - 1, 2, 2);
    }
  }
  for (const node of nodes) {
    baseContext.save();
    baseContext.translate(node.x, node.y);
    if (node.x > 400) baseContext.scale(-1, 1);
    baseContext.drawImage(
      sprite,
      -node.size / 2,
      -node.size * 0.475,
      node.size,
      node.size * 0.95,
    );
    baseContext.restore();
  }

  function draw(time) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(base, 0, 0);
    for (let index = 0; index < links.length; index += 1) {
      context.globalAlpha = 1;
      const link = links[index];
      const connected =
        selected >= 0 && (link.from === selected || link.to === selected);
      if (connected) {
        context.strokeStyle = "rgba(209, 138, 102, .7)";
        context.lineWidth = 1.35;
        context.stroke(link.path);
      }
      if (index % 6 !== 0 && !connected) continue;
      const progress = (time / 7 + index * 0.137) % 1;
      const point = pointAlong(link, progress);
      context.globalAlpha = Math.sin(progress * Math.PI) * 0.85;
      context.fillStyle = connected ? "#d18a66" : "#91aa9d";
      context.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
    }
    context.globalAlpha = 1;
    if (selected < 0) return;
    const node = nodes[selected];
    const side = node.size / 2 + 7;
    context.strokeStyle = "rgba(209, 138, 102, .85)";
    context.lineWidth = 1;
    for (const dx of [-1, 1]) {
      for (const dy of [-1, 1]) {
        const x = node.x + dx * side;
        const y = node.y + dy * side;
        context.beginPath();
        context.moveTo(x - dx * 6, y);
        context.lineTo(x, y);
        context.lineTo(x, y - dy * 6);
        context.stroke();
      }
    }
  }

  return {
    draw,
    focusAt(x, y) {
      selected = nodes.findIndex(
        (node) => Math.hypot(x - node.x, y - node.y) < node.size * 0.65,
      );
    },
    advance() {
      selected = (selected + 1) % nodes.length;
    },
    clear() {
      selected = -1;
    },
  };
}
