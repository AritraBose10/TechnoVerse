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

/**
 * The prints of the "reboot" shirt: { front, back, sleeve } textures (transparent where the shirt
 * shows), from the official artwork in public/prints/ (converted from Captain's reference files:
 * black ink printed white on the black shirt, colours kept).
 *   chest  10.5 x 3.2 cm on the wearer's left
 *   back   25 x 45 cm, its top about 8 cm below the collar
 *   sleeve 7.5 x 4 cm on the wearer's right sleeve
 */
export function rebootPrints() {
  if (prints) return prints;
  const load = (name) => {
    const t = new THREE.TextureLoader().load(`/prints/${name}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  prints = { front: load("chest"), back: load("back"), sleeve: load("sleeve") };
  return prints;
}
