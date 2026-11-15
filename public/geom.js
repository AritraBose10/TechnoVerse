// Collects geometry by material and makes one mesh per material at the end, so a building made
// of thousands of parts costs only a handful of draw calls. Texture coordinates are in metres.
import * as THREE from "three";

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();

export class Batch {
  constructor(group) {
    this.group = group;
    this.buffers = new Map();
  }
  _buf(mat) {
    let b = this.buffers.get(mat);
    if (!b) this.buffers.set(mat, (b = { pos: [], nor: [], uv: [], idx: [] }));
    return b;
  }
  /** Four corners (arrays [x,y,z]) and their uvs. Faces toward `facing` if given, else by winding. */
  quad(mat, p, uv, facing) {
    _a.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
    _b.set(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
    _n.crossVectors(_a, _b).normalize();
    let order = [0, 1, 2, 3];
    if (facing && _n.x * facing[0] + _n.y * facing[1] + _n.z * facing[2] < 0) {
      order = [1, 0, 3, 2];
      _n.negate();
    }
    const b = this._buf(mat);
    const base = b.pos.length / 3;
    for (const i of order) {
      b.pos.push(p[i][0], p[i][1], p[i][2]);
      b.nor.push(_n.x, _n.y, _n.z);
      b.uv.push(uv[i][0], uv[i][1]);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(mat, p, uv, facing) {
    this.quad(mat, [p[0], p[1], p[2], p[2]], [uv[0], uv[1], uv[2], uv[2]], facing);
  }
  /** Axis-aligned box by its extents. `skip` lists faces to leave out, e.g. "-y+z". */
  box(mat, x0, x1, y0, y1, z0, z1, skip = "") {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const q = (name, p, uv) => skip.includes(name) || this.quad(mat, p, uv);
    q("+z", [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    q("-z", [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]]);
    q("+x", [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]]);
    q("-x", [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
    q("+y", [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
    q("-y", [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  }
  /** Box of size w,h,d centred on the origin, then placed by a matrix (for leaning or turned parts). */
  obox(mat, matrix, w, h, d) {
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const P = (x, y, z) => {
      _a.set(x, y, z).applyMatrix4(matrix);
      return [_a.x, _a.y, _a.z];
    };
    const f = (c, uv) => this.quad(mat, c.map((v) => P(...v)), uv);
    f([[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], [[0, 0], [w, 0], [w, h], [0, h]]);
    f([[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], [[0, 0], [w, 0], [w, h], [0, h]]);
    f([[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], [[0, 0], [d, 0], [d, h], [0, h]]);
    f([[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], [[0, 0], [d, 0], [d, h], [0, h]]);
    f([[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [[0, 0], [w, 0], [w, d], [0, d]]);
    f([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [[0, 0], [w, 0], [w, d], [0, d]]);
  }
  /** Curved wall: part of a cylinder about (cx, cz). Angle 0 points along +z, a quarter turn along +x. */
  arc(mat, cx, cz, r, a0, a1, y0, y1, { segs = 0, inside = false, u0 = 0, uScale = 1, vFit = false } = {}) {
    const n = segs || Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / 0.6));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const b = a0 + ((a1 - a0) * (i + 1)) / n;
      const pa = [cx + r * Math.sin(a), cz + r * Math.cos(a)];
      const pb = [cx + r * Math.sin(b), cz + r * Math.cos(b)];
      const mid = (a + b) / 2;
      const out = [Math.sin(mid) * (inside ? -1 : 1), 0, Math.cos(mid) * (inside ? -1 : 1)];
      this.quad(mat, [[pa[0], y0, pa[1]], [pb[0], y0, pb[1]], [pb[0], y1, pb[1]], [pa[0], y1, pa[1]]], [[u0 + r * a * uScale, vFit ? 0 : y0], [u0 + r * b * uScale, vFit ? 0 : y0], [u0 + r * b * uScale, vFit ? 1 : y1], [u0 + r * a * uScale, vFit ? 1 : y1]], out);
    }
  }
  /** Flat part of a ring (the top or underside of a curved band). */
  ring(mat, cx, cz, r0, r1, a0, a1, y, up = true, segs = 0) {
    const n = segs || Math.max(4, Math.ceil((Math.abs(a1 - a0) * r1) / 0.6));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const b = a0 + ((a1 - a0) * (i + 1)) / n;
      const pt = (r, t) => [cx + r * Math.sin(t), y, cz + r * Math.cos(t)];
      if (r0 < 1e-6) {
        const c = [pt(0, a), pt(r1, a), pt(r1, b)];
        this.tri(mat, c, c.map((v) => [v[0], v[2]]), [0, up ? 1 : -1, 0]);
        continue;
      }
      const c = [pt(r0, a), pt(r1, a), pt(r1, b), pt(r0, b)];
      this.quad(mat, c, c.map((v) => [v[0], v[2]]), [0, up ? 1 : -1, 0]);
    }
  }
  /** Flat polygon from [x, z] points at height y. */
  poly(mat, pts, y, up = true) {
    const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const c = t.map((i) => [pts[i][0], y, pts[i][1]]);
      this.tri(mat, c, c.map((v) => [v[0], v[2]]), [0, up ? 1 : -1, 0]);
    }
  }
  /** Upright cylinder (pipes, posts, tanks). */
  cyl(mat, x, z, r, y0, y1, sides = 8, cap = false) {
    this.arc(mat, x, z, r, 0, Math.PI * 2, y0, y1, { segs: sides });
    if (cap) {
      const pts = [];
      for (let i = 0; i < sides; i++) pts.push([x + r * Math.sin((i / sides) * Math.PI * 2), z + r * Math.cos((i / sides) * Math.PI * 2)]);
      this.poly(mat, pts, y1, true);
    }
  }
  /** Hipped roof over a rectangle; `ridge` = 0 makes a pyramid. Sheets run down the slope. */
  hip(mat, x0, x1, z0, z1, y, rise, ridge = null) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const alongX = x1 - x0 >= z1 - z0;
    const half = ridge === null ? Math.max(0, (alongX ? x1 - x0 - (z1 - z0) : z1 - z0 - (x1 - x0)) / 2) : ridge / 2;
    const r0 = alongX ? [cx - half, y + rise, cz] : [cx, y + rise, cz - half];
    const r1 = alongX ? [cx + half, y + rise, cz] : [cx, y + rise, cz + half];
    const c = { a: [x0, y, z1], b: [x1, y, z1], c: [x1, y, z0], d: [x0, y, z0] };
    const face = (pts, out) => {
      // u along the eave, v up the slope
      const e0 = pts[0];
      const e1 = pts[1];
      const el = Math.hypot(e1[0] - e0[0], e1[2] - e0[2]);
      const ux = (e1[0] - e0[0]) / el;
      const uz = (e1[2] - e0[2]) / el;
      const uv = pts.map((p) => {
        const dx = p[0] - e0[0];
        const dz = p[2] - e0[2];
        const along = dx * ux + dz * uz;
        const across = Math.hypot(dx - along * ux, dz - along * uz, p[1] - y);
        return [along, across];
      });
      if (pts.length === 3) this.tri(mat, pts, uv, out);
      else this.quad(mat, pts, uv, out);
    };
    if (alongX) {
      face([c.a, c.b, r1, r0], [0, 1, 1]);
      face([c.c, c.d, r0, r1], [0, 1, -1]);
      face([c.b, c.c, r1], [1, 1, 0]);
      face([c.d, c.a, r0], [-1, 1, 0]);
    } else {
      face([c.b, c.c, r0, r1], [1, 1, 0]);
      face([c.d, c.a, r1, r0], [-1, 1, 0]);
      face([c.a, c.b, r1], [0, 1, 1]);
      face([c.c, c.d, r0], [0, 1, -1]);
    }
  }
  flush({ cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [mat, b] of this.buffers) {
      if (!b.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.idx);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast && !mat.transparent;
      m.receiveShadow = receive;
      this.group.add(m);
      meshes.push(m);
    }
    this.buffers.clear();
    return meshes;
  }
}
