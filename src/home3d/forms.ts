// Point-cloud morph targets for the homepage particle field.
// Form 0 is the iRobotX "core" lattice; 1-4 are the industry chapters.
export type FormSet = {
  count: number;
  edgeA: Float32Array;
  edgeB: Float32Array;
  robot: Float32Array;
  fin: Float32Array;
  oil: Float32Array;
  ent: Float32Array;
  rand: Float32Array;
  anim: Float32Array;
  warm: Float32Array;
};
type V = [number, number, number];
type Out = { p: V; anim?: number; warm?: number };
type Part = [weight: number, sample: () => Out];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261018);
const r = (a = 0, b = 1) => a + (b - a) * rnd();
const gauss = (s = 1) =>
  Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()) * s;
const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
const lerp = (a: V, b: V, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const jit = (p: V, s: number): V => [
  p[0] + gauss(s),
  p[1] + gauss(s),
  p[2] + gauss(s),
];
function dir(): V {
  const u = r(-1, 1),
    t = r(0, Math.PI * 2),
    s = Math.sqrt(1 - u * u);
  return [s * Math.cos(t), u, s * Math.sin(t)];
}
const ellipsoid = (c: V, rad: V): V => {
  const d = dir();
  return [c[0] + d[0] * rad[0], c[1] + d[1] * rad[1], c[2] + d[2] * rad[2]];
};
const segment = (a: V, b: V, s = 0.012): V => jit(lerp(a, b, rnd()), s);
// Point on the surface of a capsule-like cylinder between a and b.
function limb(a: V, b: V, ra: number, rb = ra): V {
  const t = rnd(),
    c = lerp(a, b, t),
    rad = ra + (rb - ra) * t;
  const ax: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...ax);
  const n: V = [ax[0] / len, ax[1] / len, ax[2] / len];
  const ref: V = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u: V = [
    n[1] * ref[2] - n[2] * ref[1],
    n[2] * ref[0] - n[0] * ref[2],
    n[0] * ref[1] - n[1] * ref[0],
  ];
  const ul = Math.hypot(...u);
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v: V = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  const th = r(0, Math.PI * 2),
    cs = Math.cos(th) * rad,
    sn = Math.sin(th) * rad;
  return [
    c[0] + u[0] * cs + v[0] * sn,
    c[1] + u[1] * cs + v[1] * sn,
    c[2] + u[2] * cs + v[2] * sn,
  ];
}
const ring = (c: V, rad: number, s = 0.015): V => {
  const t = r(0, Math.PI * 2);
  return jit([c[0] + Math.cos(t) * rad, c[1], c[2] + Math.sin(t) * rad], s);
};
// Box edges (wireframe) between min and max corners.
function boxEdges(min: V, max: V): [V, V][] {
  const [x0, y0, z0] = min,
    [x1, y1, z1] = max;
  const c = (i: number): V => [
    i & 1 ? x1 : x0,
    i & 2 ? y1 : y0,
    i & 4 ? z1 : z0,
  ];
  const e: [V, V][] = [];
  for (let i = 0; i < 8; i++)
    for (const bit of [1, 2, 4]) if (!(i & bit)) e.push([c(i), c(i | bit)]);
  return e;
}
const len = (e: [V, V]) =>
  Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1], e[1][2] - e[0][2]);
// Sample along a set of segments, weighted by length.
function lines(edges: [V, V][], s = 0.012) {
  const cum: number[] = [];
  let total = 0;
  for (const e of edges) cum.push((total += len(e)));
  return (): V => {
    const x = rnd() * total;
    let lo = 0,
      hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return segment(edges[lo][0], edges[lo][1], s);
  };
}

function fill(n: number, parts: Part[], out: Float32Array, anim: Float32Array, warm: Float32Array, ch: number) {
  const total = parts.reduce((s, [w]) => s + w, 0);
  const rows: Out[] = [];
  parts.forEach(([w, f], idx) => {
    const k =
      idx === parts.length - 1 ? n - rows.length : Math.round((w / total) * n);
    for (let i = 0; i < k && rows.length < n; i++) rows.push(f());
  });
  // Shuffle so particles travel to unrelated positions when morphing.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  rows.forEach((o, i) => {
    out.set(o.p, i * 3);
    anim[i * 4 + ch] = o.anim ?? 0;
    warm[i * 4 + ch] = o.warm ?? 0;
  });
}

function robotParts(): Part[] {
  const mirror = (f: (s: number) => V): (() => Out) => () => ({
    p: f(rnd() < 0.5 ? -1 : 1),
  });
  const visor = (): Out => {
    for (;;) {
      const d = dir();
      if (d[2] > 0.45 && d[1] > -0.12 && d[1] < 0.2)
        return { p: [d[0] * 0.5, 3.18 + d[1] * 0.62, d[2] * 0.56], warm: 1 };
    }
  };
  return [
    [8, () => ({ p: ellipsoid([0, 3.15, 0], [0.5, 0.62, 0.55]) })],
    [2.2, visor],
    [1, () => ({ p: limb([0, 2.4, 0], [0, 2.62, 0], 0.17) })],
    [14, () => ({ p: ellipsoid([0, 1.78, 0], [0.95, 0.72, 0.5]) })],
    [
      1.6,
      () => {
        const a = r(0, Math.PI * 2),
          s = Math.sqrt(rnd()) * 0.12;
        return { p: [Math.cos(a) * s, 1.9 + Math.sin(a) * s, 0.5], warm: 1 };
      },
    ],
    [
      1.4,
      () => {
        const t = r(0, Math.PI * 2);
        return { p: jit([Math.cos(t) * 0.17, 1.9 + Math.sin(t) * 0.17, 0.52], 0.01), warm: 1 };
      },
    ],
    [5, () => ({ p: limb([0, 0.62, 0], [0, 1.2, 0], 0.46, 0.58) })],
    [2, () => ({ p: ring([0, pick([0.75, 0.9, 1.05]), 0], 0.54, 0.008) })],
    [4, () => ({ p: ellipsoid([0, 0.28, 0], [0.62, 0.3, 0.42]) })],
    [4, mirror((s) => ellipsoid([s * 1.12, 2.2, 0], [0.32, 0.3, 0.32]))],
    [7, mirror((s) => limb([s * 1.2, 2.05, 0], [s * 1.42, 0.95, 0.05], 0.21, 0.18))],
    [2, mirror((s) => ellipsoid([s * 1.42, 0.95, 0.05], [0.19, 0.19, 0.19]))],
    [6, mirror((s) => limb([s * 1.42, 0.95, 0.05], [s * 1.56, -0.15, 0.18], 0.17, 0.14))],
    [2.4, mirror((s) => ellipsoid([s * 1.58, -0.42, 0.2], [0.13, 0.22, 0.1]))],
    [2, mirror((s) => ellipsoid([s * 0.36, 0.05, 0], [0.24, 0.24, 0.24]))],
    [10, mirror((s) => limb([s * 0.38, -0.05, 0], [s * 0.42, -1.6, 0.02], 0.27, 0.21))],
    [2, mirror((s) => ellipsoid([s * 0.42, -1.65, 0.04], [0.2, 0.2, 0.2]))],
    [8, mirror((s) => limb([s * 0.42, -1.7, 0.02], [s * 0.44, -3.12, 0], 0.2, 0.15))],
    [3, mirror((s) => lines(boxEdges([s * 0.45 - 0.16, -3.42, -0.15], [s * 0.45 + 0.16, -3.22, 0.42]))())],
    [3, () => ({ p: ring([0, -3.45, 0.1], r(1.6, 1.75), 0.01), warm: rnd() < 0.3 ? 1 : 0 })],
    [2.5, () => ({ p: ring([0, -3.45, 0.1], r(0.2, 2.4), 0.01) })],
    [2, () => ({ p: ring([0, r(-3, 3.8), 0], 2.15, 0.01) })],
  ];
}

function finParts(): Part[] {
  const towers: { edges: [V, V][]; warm: number }[] = [];
  const ledger: [V, V][] = [],
    wicks: [V, V][] = [];
  for (let gx = -4; gx <= 4; gx++)
    for (let gz = -3; gz <= 3; gz++) {
      if (rnd() < 0.18) continue;
      const x = gx * 1.05 + gauss(0.05),
        z = gz * 1.05 + gauss(0.05);
      const trend = ((gx + 4) / 8) * 2.2 + ((3 - gz) / 6) * 1.1;
      const h = 0.35 + rnd() * 1.1 + trend,
        w = 0.19;
      const warm = rnd() < 0.26 ? 1 : 0;
      const edges = boxEdges([x - w, -2, z - w], [x + w, -2 + h, z + w]);
      for (let y = -2 + 0.28; y < -2 + h; y += 0.28)
        ledger.push([[x - w, y, z + w], [x + w, y, z + w]], [[x + w, y, z - w], [x + w, y, z + w]]);
      wicks.push([[x, -2 + h, z], [x, -2 + h + 0.25 + rnd() * 0.6, z]]);
      towers.push({ edges, warm });
    }
  const towerLines = towers.map((t) => ({ f: lines(t.edges, 0.008), warm: t.warm }));
  const ledgerLines = lines(ledger, 0.006),
    wickLines = lines(wicks, 0.006);
  const grid: [V, V][] = [];
  for (let i = -5; i <= 5; i++) grid.push([[i, -2.02, -3.8], [i, -2.02, 3.8]]);
  for (let j = -3.75; j <= 3.8; j += 0.75) grid.push([[-5.2, -2.02, j], [5.2, -2.02, j]]);
  const chart: V[] = [];
  let y = 0.4;
  for (let x = -4.6; x <= 4.61; x += 0.46) {
    chart.push([x, y, -4.2]);
    y += 0.2 + gauss(0.28);
  }
  const chartEdges: [V, V][] = chart.slice(1).map((p, i) => [chart[i], p]);
  const lanes = [
    [1.8, -2.6],
    [2.4, -1.2],
    [3.0, 0.4],
    [2.1, 1.6],
    [2.7, 2.8],
    [3.4, -0.4],
  ];
  return [
    [30, () => { const t = pick(towerLines); return { p: t.f(), warm: t.warm }; }],
    [16, () => ({ p: ledgerLines() })],
    [4, () => ({ p: wickLines(), warm: 0.5 })],
    [12, () => ({ p: lines(grid, 0.006)() })],
    [7, () => ({ p: lines(chartEdges, 0.01)(), warm: 1 })],
    [16, () => { const [ly, lz] = pick(lanes); return { p: [r(-5, 5), ly + gauss(0.02), lz + gauss(0.04)], anim: 1, warm: rnd() < 0.15 ? 1 : 0 }; }],
  ];
}

function oilParts(): Part[] {
  const legs: [V, V][] = [],
    braces: [V, V][] = [];
  const corner = (y: number, sx: number, sz: number): V => {
    const w = 0.85 + (0.18 - 0.85) * ((y - 0.45) / 4.15);
    return [sx * w, y, sz * w];
  };
  const cs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of cs) legs.push([corner(0.45, sx, sz), corner(4.6, sx, sz)]);
  const levels = [0.45, 1.05, 1.65, 2.25, 2.85, 3.45, 4.0, 4.6];
  for (let l = 0; l < levels.length; l++)
    for (let k = 0; k < 4; k++) {
      const [ax, az] = cs[k],
        [bx, bz] = cs[(k + 1) % 4];
      braces.push([corner(levels[l], ax, az), corner(levels[l], bx, bz)]);
      if (l < levels.length - 1) {
        braces.push([corner(levels[l], ax, az), corner(levels[l + 1], bx, bz)]);
        braces.push([corner(levels[l], bx, bz), corner(levels[l + 1], ax, az)]);
      }
    }
  const derrick = lines([...legs, ...legs, ...braces], 0.01);
  const deck = lines([...boxEdges([-1.3, 0, -1.3], [1.3, 0.45, 1.3]), ...boxEdges([-0.3, 4.6, -0.3], [0.3, 4.9, 0.3])], 0.01);
  const ground: [V, V][] = [];
  for (let z = -3; z <= 3.01; z += 0.6) ground.push([[-5, 0, z], [5, 0, z]]);
  for (let x = -5; x <= 5.01; x += 1) ground.push([[x, 0, -3], [x, 0, 3]]);
  const strata = (k: number, x: number, z: number) =>
    -0.95 * (k + 1) + 0.2 * Math.sin(x * 0.55 + k * 1.7) + 0.1 * Math.cos(z * 0.9 + k);
  const tanks: V[] = [[3.4, 0, -1.5], [3.5, 0, 0.1]];
  const wellPath = (t: number): V => {
    if (t < 0.6) return [0, 0.45 - (t / 0.6) * 3.4, 0];
    const u = (t - 0.6) / 0.4,
      a = u * Math.PI * 0.5;
    return u < 0.25
      ? [0.6 - Math.cos(a * 4) * 0.6, -2.95 - Math.sin(a * 4) * 0.25, 0]
      : [0.6 + ((u - 0.25) / 0.75) * 4, -3.2, 0];
  };
  return [
    [26, () => ({ p: derrick() })],
    [5, () => ({ p: deck() })],
    [2, () => ({ p: segment([0, 0.5, 0], [0, 4.6, 0], 0.01), warm: 0.4 })],
    [9, () => ({ p: lines(ground, 0.006)() })],
    [
      22,
      () => {
        const k = Math.floor(rnd() * 4),
          x = r(-5, 5),
          z = rnd() < 0.45 ? 3 : Math.round(r(-3, 3) / 0.75) * 0.75;
        return { p: [x, strata(k, x, z), z + gauss(0.01)], warm: k === 2 ? 0.55 : 0 };
      },
    ],
    [
      6,
      () => {
        const x = r(-5, 5),
          z = r(-3, 3),
          y0 = strata(2, x, z),
          y1 = strata(3, x, z);
        return { p: [x, r(y1, y0), z], warm: 1 };
      },
    ],
    [3, () => { const y = r(-3.9, 0); return { p: [rnd() < 0.5 ? -5 : 5, y, r(-3, 3)] }; }],
    [6, () => { const t = pick(tanks), h = t[0] > 3.45 ? 1.0 : 1.3, rad = t[0] > 3.45 ? 0.5 : 0.62; return { p: rnd() < 0.7 ? limb(t, [t[0], h, t[2]], rad) : ring([t[0], pick([0, h]), t[2]], rad * r(0, 1), 0.01) }; }],
    [2, () => ({ p: segment([1.3, 0.2, 0], [3.0, 0.2, -0.6], 0.015) })],
    [5, () => ({ p: jit(wellPath(r(0, 1)), 0.05) })],
    [8, () => ({ p: [gauss(0.035), r(-3.25, 0.45), gauss(0.035)], anim: 1, warm: 1 })],
    [3, () => ({ p: jit(wellPath(r(0.75, 1)), 0.035), warm: 1 })],
  ];
}

function entParts(): Part[] {
  const stage = lines(boxEdges([-1.8, -2, -1.1], [1.8, -1.55, 1.1]), 0.01);
  const trussPts: V[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    trussPts.push([Math.cos(t) * 2.3, 3.3, Math.sin(t) * 1.6]);
  }
  const truss = lines(
    [
      ...trussPts.slice(1).map((p, i) => [trussPts[i], p] as [V, V]),
      ...trussPts.slice(1).map((p, i) => [[trussPts[i][0], 3.5, trussPts[i][2]], [p[0], 3.5, p[2]]] as [V, V]),
    ],
    0.012,
  );
  const speakers = lines([
    ...boxEdges([-3.0, -2, 0.2], [-2.5, 0.7, 0.8]),
    ...boxEdges([2.5, -2, 0.2], [3.0, 0.7, 0.8]),
  ], 0.01);
  const beams: { o: V; t: V; warm: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2,
      x = Math.cos(ang) * 2.3,
      z = Math.sin(ang) * 1.6;
    const toStage = i % 3 !== 0,
      th = toStage ? r(0, Math.PI * 2) : r(Math.PI * 0.85, Math.PI * 2.15),
      rad = toStage ? r(0.2, 1.3) : r(3.2, 5.2);
    beams.push({
      o: [x, 3.3, z],
      t: toStage
        ? [Math.cos(th) * rad, -1.55, Math.sin(th) * rad * 0.7]
        : [Math.cos(th) * rad, -1.9 + ((rad - 2.6) / 2.8) * 2.2, Math.sin(th) * rad],
      warm: i % 2,
    });
  }
  const seat = () => {
    const k = Math.floor(rnd() * 10),
      rad = 3.1 + k * 0.33,
      th = r(Math.PI * 0.72, Math.PI * 2.28);
    return { p: jit([Math.cos(th) * rad, -2 + k * 0.3, Math.sin(th) * rad], 0.02) as V, warm: rnd() < 0.08 ? 1 : 0 };
  };
  return [
    [8, () => ({ p: stage() })],
    [5, () => ({ p: [r(-1.8, 1.8), -1.55, r(-1.1, 1.1)] as V })],
    [5, () => ({ p: truss() })],
    [4, () => ({ p: speakers() })],
    [36, seat],
    [
      17,
      () => {
        const b = pick(beams),
          t = Math.pow(rnd(), 0.8),
          c = lerp(b.o, b.t, t),
          s = t * 0.45,
          a = r(0, Math.PI * 2);
        return { p: [c[0] + Math.cos(a) * s * 0.7, c[1], c[2] + Math.sin(a) * s * 0.7], warm: b.warm };
      },
    ],
    [
      11,
      () => {
        const k = Math.floor(rnd() * 8),
          rad = 0.4 + k * 0.6 + gauss(0.02),
          th = r(0, Math.PI * 2);
        return { p: [Math.cos(th) * rad, -1.5 + gauss(0.01), Math.sin(th) * rad], anim: 1, warm: k % 3 === 0 ? 1 : 0 };
      },
    ],
    [5, () => ({ p: ring([0, -2.02, 0], r(0, 5.2), 0.01) })],
  ];
}

function lattice(n: number, a: Float32Array, b: Float32Array) {
  const nodes: V[] = [];
  const outer = 120;
  for (let i = 0; i < outer; i++) {
    const y = 1 - (i / (outer - 1)) * 2,
      s = Math.sqrt(1 - y * y),
      t = i * 2.399963;
    nodes.push(jit([Math.cos(t) * s * 3.7, y * 3.7, Math.sin(t) * s * 3.7], 0.18));
  }
  for (let i = 0; i < 36; i++) nodes.push(ellipsoid([0, 0, 0], [1.9, 1.9, 1.9]));
  const edges: [V, V][] = [];
  const seen = new Set<string>();
  nodes.forEach((p, i) => {
    nodes
      .map((q, j) => [Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), j] as const)
      .filter(([, j]) => j !== i)
      .sort((x, y) => x[0] - y[0])
      .slice(0, 3)
      .forEach(([, j]) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([p, nodes[j]]);
        }
      });
    if (i >= outer && i % 3 === 0) edges.push([p, [0, 0, 0]]);
  });
  const cum: number[] = [];
  let total = 0;
  for (const e of edges) cum.push((total += len(e)));
  for (let i = 0; i < n; i++) {
    const x = rnd();
    let A: V, B: V;
    if (x < 0.56) {
      const target = rnd() * total;
      const k = cum.findIndex((c) => c >= target);
      const e = edges[k < 0 ? edges.length - 1 : k];
      const off: V = [gauss(0.025), gauss(0.025), gauss(0.025)];
      A = jit(e[0], 0).map((v, j) => v + off[j]) as V;
      B = e[1].map((v, j) => v + off[j]) as V;
      if (rnd() < 0.5) [A, B] = [B, A];
    } else if (x < 0.78) {
      A = B = jit(pick(nodes), 0.07);
    } else if (x < 0.88) {
      A = B = ellipsoid([0, 0, 0], [0.75, 0.75, 0.75]);
    } else {
      const d = dir(),
        rad = r(4.4, 7.5);
      A = B = [d[0] * rad, d[1] * rad * 0.7, d[2] * rad];
    }
    a.set(A, i * 3);
    b.set(B, i * 3);
  }
}

export function buildForms(count: number): FormSet {
  const f3 = () => new Float32Array(count * 3),
    f4 = () => new Float32Array(count * 4);
  const set: FormSet = {
    count,
    edgeA: f3(),
    edgeB: f3(),
    robot: f3(),
    fin: f3(),
    oil: f3(),
    ent: f3(),
    rand: f4(),
    anim: f4(),
    warm: f4(),
  };
  lattice(count, set.edgeA, set.edgeB);
  fill(count, robotParts(), set.robot, set.anim, set.warm, 0);
  fill(count, finParts(), set.fin, set.anim, set.warm, 1);
  fill(count, oilParts(), set.oil, set.anim, set.warm, 2);
  fill(count, entParts(), set.ent, set.anim, set.warm, 3);
  for (let i = 0; i < count * 4; i++) set.rand[i] = rnd();
  return set;
}
