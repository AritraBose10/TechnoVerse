// The players' T-shirts. Two choices on the join screen:
//   "tiu"    the original TIU polo: navy and off-white split on the diagonal, red logo on the chest
//   "reboot" the School of the Future polo Captain wears: plain black pique; on the left chest
//            the TIU mark with "School of the FUTURE"; on the back the TIU logo, "REBOOT
//            REALITY", the rainbow cube and "THE FUTURE IS NOW"
// The prints are drawn here on canvases (from photos of the real shirt) and laid onto the shirt by
// where each point sits on the body in its resting pose (see character.js), so they stay put on
// the chest and back while the character moves.
import * as THREE from "three";

export const SHIRTS = [
  { id: "tiu", label: "TIU polo" },
  { id: "reboot", label: "School of the Future polo" },
];

let prints = null;
const FONT = "'Montserrat', 'Arial Black', 'Helvetica Neue', Arial, sans-serif";

function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// the TIU mark: a red disc with the white "t4" monogram
function tiuMark(g, x, y, r) {
  g.fillStyle = "#e02a26";
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = `italic 800 ${r * 1.25}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("t4", x - r * 0.04, y + r * 0.06);
}

/** The prints of the "reboot" shirt: { front, back } textures (transparent where the shirt shows). */
export function rebootPrints() {
  if (prints) return prints;
  // left chest: 10.5 x 3.2 cm
  const front = canvas(1024, 312, (g, w, h) => {
    tiuMark(g, 120, 160, 98);
    g.fillStyle = "#ffffff";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.font = `600 78px ${FONT}`;
    g.fillText("School of the", 248, 128);
    g.font = `900 132px ${FONT}`;
    g.fillText("FUTURE", 244, 252);
    g.fillRect(244, 270, 740, 10);
    g.font = `500 30px ${FONT}`;
    g.fillText("TECHNO INDIA UNIVERSITY", 250, 304);
  });
  // back: 25 x 42 cm, from the logo under the collar to the tagline
  const back = canvas(1000, 1680, (g, w, h) => {
    // logo
    tiuMark(g, 245, 150, 95);
    g.fillStyle = "#ffffff";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.font = `700 70px ${FONT}`;
    g.fillText("techno india", 370, 140);
    g.fillText("university", 370, 205);
    g.fillRect(370, 222, 330, 3);
    g.font = `600 30px ${FONT}`;
    g.fillText("WEST BENGAL", 372, 262);
    // the line
    g.textAlign = "center";
    g.font = `900 168px ${FONT}`;
    g.fillText("REBOOT", w / 2, 500);
    g.fillText("REALITY", w / 2, 680);
    // the rainbow cube: a hollow cube seen corner-on, warm on the left face, blue on the right,
    // with square openings through each face
    const cx = w / 2;
    const cy = 1070;
    const s = 270; // edge in pixels
    const dx = s * Math.cos(Math.PI / 6);
    const dy = s * 0.5;
    const top = [[cx, cy - s], [cx + dx, cy - s + dy], [cx, cy - s + 2 * dy], [cx - dx, cy - s + dy]];
    const left = [[cx - dx, cy - s + dy], [cx, cy - s + 2 * dy], [cx, cy + s], [cx - dx, cy + s - dy]];
    const right = [[cx, cy - s + 2 * dy], [cx + dx, cy - s + dy], [cx + dx, cy + s - dy], [cx, cy + s]];
    const face = (pts, colors) => {
      const grad = g.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
      g.fillStyle = grad;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      // the opening: the face's middle 52% cut out, showing the inside
      const c0 = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
      const inner = pts.map(([x, y]) => [c0[0] + (x - c0[0]) * 0.52, c0[1] + (y - c0[1]) * 0.52]);
      g.fillStyle = "rgba(10,10,14,0.92)";
      g.beginPath();
      inner.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      // inside walls catch some colour
      const ig = g.createLinearGradient(inner[0][0], inner[0][1], inner[2][0], inner[2][1]);
      colors.forEach((c, i) => ig.addColorStop(i / (colors.length - 1), c));
      g.globalAlpha = 0.45;
      g.fillStyle = ig;
      g.beginPath();
      g.moveTo(inner[0][0], inner[0][1]);
      g.lineTo(inner[1][0], inner[1][1]);
      g.lineTo((inner[1][0] + c0[0]) / 2, (inner[1][1] + c0[1]) / 2);
      g.lineTo((inner[0][0] + c0[0]) / 2, (inner[0][1] + c0[1]) / 2);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    };
    face(left, ["#ff5a3c", "#ff2d55", "#f7c400", "#2ecf6a"]);
    face(right, ["#6a5cff", "#1fa2ff", "#1fd1ff", "#7d4dff"]);
    face(top, ["#ff7a59", "#ff4f8b", "#b46cff", "#36a3ff"]);
    // tagline
    g.fillStyle = "#ffffff";
    g.font = `800 46px ${FONT}`;
    g.fillText("THE FUTURE IS NOW", w / 2, 1440);
  });
  prints = { front, back };
  return prints;
}
