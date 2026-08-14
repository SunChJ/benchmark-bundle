import sharp from 'sharp';

const WIDTH = 1876;
const HEIGHT = 826;
const PLOT = { left: 145, right: 1770, top: 170, bottom: 660 };
const X_MIN = 2.5;
const X_MAX = 80;
const Y_MIN = 50;
const Y_MAX = 100;

const COLORS = {
  Codex: '#3b9cf6',
  Pi: '#ff7426',
  DSH: '#0fbd5b',
};

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function xScale(value) {
  const logMin = Math.log2(X_MIN);
  const logMax = Math.log2(X_MAX);
  return PLOT.left + ((Math.log2(value) - logMin) / (logMax - logMin)) * (PLOT.right - PLOT.left);
}

function yScale(value) {
  return PLOT.bottom - ((value - Y_MIN) / (Y_MAX - Y_MIN)) * (PLOT.bottom - PLOT.top);
}

function overlaps(a, b, padding = 7) {
  return !(
    a.right + padding < b.left ||
    a.left - padding > b.right ||
    a.bottom + padding < b.top ||
    a.top - padding > b.bottom
  );
}

function placeLabels(rows) {
  const occupied = [];
  const pointBoxes = rows.map((row) => {
    const x = xScale(row.duration_min);
    const y = yScale(row.quality_score);
    return { left: x - 10, right: x + 10, top: y - 10, bottom: y + 10 };
  });

  return [...rows]
    .sort((a, b) => b.quality_score - a.quality_score || a.duration_min - b.duration_min)
    .map((row) => {
      const x = xScale(row.duration_min);
      const y = yScale(row.quality_score);
      const labelWidth = Math.max(112, row.case_label.length * 10.5);
      const labelHeight = 22;
      const horizontalOffset = labelWidth * 0.58 + 16;
      const candidates = [
        [0, -18],
        [0, 32],
        [-horizontalOffset, -16],
        [horizontalOffset, -16],
        [-horizontalOffset, 10],
        [horizontalOffset, 10],
        [-horizontalOffset, 34],
        [horizontalOffset, 34],
        [0, -48],
        [0, 58],
      ];
      let selected;

      for (const [dx, dy] of candidates) {
        const centerX = x + dx;
        const baselineY = y + dy;
        const box = {
          left: centerX - labelWidth / 2,
          right: centerX + labelWidth / 2,
          top: baselineY - labelHeight,
          bottom: baselineY + 4,
        };
        const inside =
          box.left >= PLOT.left &&
          box.right <= PLOT.right &&
          box.top >= PLOT.top - 18 &&
          box.bottom <= PLOT.bottom + 4;
        const hitsLabel = occupied.some((other) => overlaps(box, other));
        const hitsPoint = pointBoxes.some((other) => overlaps(box, other, 3));
        if (inside && !hitsLabel && !hitsPoint) {
          selected = { x: centerX, y: baselineY, box };
          break;
        }
      }

      if (!selected) {
        const baselineY = Math.max(PLOT.top, y - 20);
        selected = {
          x,
          y: baselineY,
          box: {
            left: x - labelWidth / 2,
            right: x + labelWidth / 2,
            top: baselineY - labelHeight,
            bottom: baselineY + 4,
          },
        };
      }
      occupied.push(selected.box);
      return { ...row, pointX: x, pointY: y, labelX: selected.x, labelY: selected.y };
    });
}

export async function renderFrontierChart(rows) {
  const plotted = placeLabels(rows);
  const xTicks = [5, 10, 20, 40, 80];
  const yTicks = [50, 60, 70, 80, 90, 100];

  const grid = [
    ...yTicks.map((tick) => {
      const y = yScale(tick);
      return `<line x1="${PLOT.left}" y1="${y}" x2="${PLOT.right}" y2="${y}" stroke="#313131" stroke-width="1"/>`;
    }),
    ...xTicks.map((tick) => {
      const x = xScale(tick);
      return `<text x="${x}" y="699" fill="#c9c9c9" font-size="22" text-anchor="middle">${tick}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = yScale(tick);
      return `<text x="126" y="${y + 8}" fill="#c9c9c9" font-size="22" text-anchor="end">${tick}</text>`;
    }),
  ].join('');

  const marks = plotted
    .map((row) => {
      const labelDistance = Math.hypot(row.labelX - row.pointX, row.labelY - row.pointY);
      const leader =
        labelDistance > 45
          ? `<line x1="${row.pointX}" y1="${row.pointY}" x2="${row.labelX}" y2="${row.labelY - 7}" stroke="#5b5b5b" stroke-width="1.5"/>`
          : '';
      return (
        leader +
        `<circle cx="${row.pointX}" cy="${row.pointY}" r="9" fill="${COLORS[row.harness]}"/>` +
        `<text x="${row.labelX}" y="${row.labelY}" fill="#dddddd" font-size="19" font-weight="650" text-anchor="middle" paint-order="stroke" stroke="#171717" stroke-width="5" stroke-linejoin="round">${escapeXml(row.case_label)}</text>`
      );
    })
    .join('');

  const legend = ['Codex', 'Pi', 'DSH']
    .map((name, index) => {
      const x = 545 + index * 135;
      return `<circle cx="${x}" cy="780" r="7" fill="${COLORS[name]}"/><text x="${x + 18}" y="788" fill="#cfcfcf" font-size="22">${name}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#171717"/>
    <g font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <text x="38" y="72" fill="#f4f4f4" font-size="32" font-weight="600">Adjusted completion time vs implementation quality</text>
      <text x="38" y="120" fill="#eeeeee" font-size="27">Focused quality scale (50–100) and logarithmic time scale expand the competitive cluster.</text>
      ${grid}
      <text x="958" y="735" fill="#f3f3f3" font-size="24" font-weight="600" text-anchor="middle">Adjusted completion time (min, log scale)</text>
      <text x="54" y="415" fill="#f3f3f3" font-size="24" font-weight="600" text-anchor="middle" transform="rotate(-90 54 415)">Quality score / 100</text>
      ${marks}
      ${legend}
      <text x="945" y="788" fill="#bdbdbd" font-size="20">Direct labels: cli-model/reasoning</text>
    </g>
  </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
