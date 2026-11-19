// Opening animation: the skater runs in with a spray can and his board under his arm, sprays the name on the wall,
// tosses the can over his shoulder onto the pavement (it says PORTFOLIO), sprints off left, then rides back in and kickflips over it.
// Uses the Skate UW assets: skater.glb (rigged), the Mixamo riding and running clips, and the in-game board.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = new URL('../images/intro/', import.meta.url).href;

// ---- Retarget a Mixamo clip onto the skater: line up the two rest poses, then copy world-space rotation deltas.
const CHILD = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' };
for (const s of ['Left', 'Right']) {
  Object.assign(CHILD, {
    [s + 'Shoulder']: s + 'Arm', [s + 'Arm']: s + 'ForeArm', [s + 'ForeArm']: s + 'Hand',
    [s + 'UpLeg']: s + 'Leg', [s + 'Leg']: s + 'Foot', [s + 'Foot']: s + 'ToeBase',
  });
}
const norm = (n) => n.replace(/^mixamorig\d*:?/, '');
function makeRetarget(target, source, clip) {
  const sb = {}, tb = [];
  source.traverse((o) => { const n = norm(o.name); if (n !== o.name && !sb[n]) sb[n] = o; });
  target.traverse((o) => { if (o.isBone && sb[o.name]) tb.push(o); }); // parents come first
  source.updateMatrixWorld(true); target.updateMatrixWorld(true);
  const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const dir = (get, n) => (CHILD[n] && get(CHILD[n]) ? wp(get(CHILD[n])).sub(wp(get(n))).normalize() : null);
  const rows = tb.map((b) => {
    const s = sb[b.name];
    const ds = dir((n) => sb[n], b.name), dt = dir((n) => target.getObjectByName(n), b.name);
    const C = new THREE.Quaternion();
    if (ds && dt) C.setFromUnitVectors(dt, ds);
    return { b, s, pre: C.multiply(wq(b)), s0inv: wq(s).invert(), w: new THREE.Quaternion() };
  });
  const byName = Object.fromEntries(rows.map((r) => [r.b.name, r]));
  const hipsT = target.getObjectByName('Hips'), hipsS = sb.Hips;
  const restS = wp(hipsS), restT = hipsT.position.clone(), k = wp(hipsT).y / restS.y;
  const parentInv = hipsT.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const mixer = new THREE.AnimationMixer(source);
  mixer.clipAction(clip).play();
  const q = new THREE.Quaternion(), p = new THREE.Vector3();
  return {
    duration: clip.duration,
    apply(t) {
      mixer.setTime(((t % clip.duration) + clip.duration) % clip.duration);
      source.updateMatrixWorld(true);
      for (const r of rows) {
        r.s.getWorldQuaternion(q).multiply(r.s0inv);
        r.w.copy(q).multiply(r.pre);
        const pr = byName[r.b.parent.name];
        r.b.quaternion.copy(pr ? q.copy(pr.w).invert() : parentInv).multiply(r.w);
      }
      hipsS.getWorldPosition(p);
      hipsT.position.set(restT.x + (p.x - restS.x) * k, restT.y + (p.y - restS.y) * k, restT.z); // on the spot
    },
  };
}

// ---- Timeline (seconds)
// Prologue: run in, spray, toss the can, run off. Then the kickflip, on its own clock K = t - P.out.
const P = { run: 1.4, face: 1.65, spray0: 1.92, spray1: 3.52, release: 3.74, landed: 4.17, turn: 4.27, out: 5.72 }; // face..spray0: raises the can
const T = { settle: 1.14, pop: 1.38, land: 1.98, absorbed: 2.4, lift: 2.75, end: 3.45 };
// When things happen on the page's clock (index.html adds classes at these times)
export const MARKS = { sprayed: P.spray1, pop: P.out + T.pop, land: P.out + T.land, lift: P.out + T.lift, end: P.out + T.end };
const STANCE = 0.28; // a frame of the riding clip with both feet on the board
const POP_H = 0.55; // how high the board goes (m)
const ZP = 0.9; // the line he rides along, and where the can comes to rest (m in front of the wall)
const ZS = 0.45; // where he stands to spray
const CAN = { h: 0.28, r: 0.05 }; // the can's body (a big can, so PORTFOLIO reads on the ground, but still one hand fits round); the dome and nozzle add ~5 cm
const PAINT = '#ff6b1a';
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

let assets; // loaded once, reused by "Replay intro"
let rig; // the skater scene, its clips and poses, built once (the rest pose must be read before any animation)
let canGrip, boardGrip; // the hands' fingers wrapped round the can and round the board's edge, solved once
function load() {
  const L = new GLTFLoader();
  assets ??= Promise.all(['skater', 'skate-anim', 'skateboard', 'run-anim'].map((n) => L.loadAsync(DIR + n + '.glb')));
  return assets;
}
export const preload = load;

// The spray can from the turnaround sheet: orange dome, silver rings, black body with an orange band that says PORTFOLIO.
// Local y is the can's axis (nozzle on top), the nozzle and the label face local +z.
function makeCan() {
  const can = new THREE.Group();
  const cc = document.createElement('canvas'); cc.width = 1024; cc.height = 1024;
  const c = cc.getContext('2d');
  c.fillStyle = '#141312'; c.fillRect(0, 0, 1024, 1024);
  c.fillStyle = '#f2591b'; c.fillRect(0, 110, 1024, 804); // the band, most of the body's length
  c.fillStyle = '#141312'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '800 190px "Bricolage Grotesque", "Arial Black", sans-serif';
  const sx = 740 / c.measureText('PORTFOLIO').width;
  c.save(); c.translate(512, 512); c.rotate(-Math.PI / 2); c.scale(sx, 1); c.fillText('PORTFOLIO', 0, 8); c.restore();
  const tex = new THREE.CanvasTexture(cc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const metal = new THREE.MeshStandardMaterial({ color: '#c9ccd3', metalness: 0.8, roughness: 0.3 });
  const orange = new THREE.MeshStandardMaterial({ color: '#f2591b', roughness: 0.35 });
  const { h, r } = CAN;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true, -Math.PI, Math.PI * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
  const ring = (y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.018, 48), metal); m.position.y = y; return m; };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.96, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), orange);
  dome.scale.y = 0.75; dome.position.y = h / 2 + 0.006;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.024, 16), metal); nozzle.position.y = h / 2 + r * 0.72 + 0.008;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.005, 12), new THREE.MeshBasicMaterial({ color: '#000' })); hole.position.set(0, nozzle.position.y + 0.002, 0.0142);
  can.add(body, ring(h / 2), ring(-h / 2 + 0.006), dome, nozzle, hole);
  can.userData.nozzle = new THREE.Vector3(0, nozzle.position.y + 0.002, 0.016);
  can.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return can;
}

// A posable hand, built like the hand turnaround (Hand/Hand Turnaround.html): a palm, four three-bone fingers and a
// three-bone thumb, as smooth capsules. The skater's own hands are one rigid piece (no finger bones), so these replace them
// while he holds the can and the board. Local frame: wrist at the origin, +y along the fingers, +z out of the palm,
// thumb toward +x on a right hand (side 1) and -x on a left hand (side -1).
function makeHand(side, color) {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62 });
  const ball = (r, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); g.add(m); return m; };
  ball(1, 0.043, 0.053, 0.0175, 0, 0.048, 0); // palm
  ball(1, 0.026, 0.03, 0.02, 0, 0.008, 0); // heel of the hand, blending into the wrist
  ball(1, 0.017, 0.03, 0.013, 0.026 * side, 0.03, 0.006); // thumb pad
  const chain = (pos, dir, L, r) => {
    const root = new THREE.Group(); root.position.copy(pos);
    if (dir) root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(root);
    const joints = []; let par = root, y = 0;
    L.forEach((len, i) => {
      const j = new THREE.Group(); j.position.y = y; par.add(j); joints.push(j);
      const rr = r * (1 - i * 0.1);
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(rr, len, 4, 10), mat); c.position.y = len / 2; j.add(c);
      par = j; y = len;
    });
    return joints;
  };
  const F = [{ x: 0.031, L: [0.043, 0.027, 0.021], r: 0.0093 }, { x: 0.011, L: [0.048, 0.03, 0.022], r: 0.0096 }, { x: -0.01, L: [0.045, 0.028, 0.021], r: 0.0091 }, { x: -0.029, L: [0.035, 0.021, 0.018], r: 0.0082 }];
  const fingers = F.map((d) => chain(new THREE.Vector3(d.x * side, 0.093 - Math.abs(d.x) * 0.22, 0.002), null, d.L, d.r));
  const thumb = chain(new THREE.Vector3(0.034 * side, 0.024, 0.01), new THREE.Vector3(0.75 * side, 0.6, 0.35), [0.034, 0.029, 0.025], 0.0115);
  g.userData = { fingers, thumb, side };
  return g;
}
// Fingers and thumb wrapped round a cylinder lying across the palm (axis along the hand's x, centre at (y, z) = c in the
// hand's frame, radius rho measured to the finger centrelines): each digit's three joint angles are searched so its
// centreline hugs the surface without sinking in. Done once on a hand at rest. Returns a pose for poseHand.
// sd(y, z): signed distance from the surface being held, in the hand's (y, z) plane; rf: finger radius (kept just off it)
function wrapPose(h, sd, rf) {
  const { fingers, thumb } = h.userData, v = new THREE.Vector3();
  h.updateMatrixWorld(true);
  const fit = (j, L) => {
    let best = 1e9, bv = [0, 0, 0];
    const score = () => {
      j[0].updateMatrixWorld(true); let e = 0;
      for (let k = 0; k < 3; k++) for (const u of [0.35, 0.7, 1]) {
        v.set(0, L[k] * u, 0); j[k].localToWorld(v);
        const d = sd(v.y, v.z) - rf;
        e += d < 0 ? d * d * 60 : d * d; // hug the surface, never inside it
      }
      return e;
    };
    for (let a = -0.2; a <= 1.6; a += 0.06) for (let b = 0; b <= 1.7; b += 0.06) for (let d = 0; d <= 1.4; d += 0.1) {
      j[0].rotation.x = a; j[1].rotation.x = b; j[2].rotation.x = d;
      const e = score(); if (e < best) { best = e; bv = [a, b, d]; }
    }
    j[0].rotation.x = bv[0]; j[1].rotation.x = bv[1]; j[2].rotation.x = bv[2];
    return bv;
  };
  const LF = [[0.043, 0.027, 0.021], [0.048, 0.03, 0.022], [0.045, 0.028, 0.021], [0.035, 0.021, 0.018]];
  return { f: fingers.map((j, i) => fit(j, LF[i])), t: fit(thumb, [0.034, 0.029, 0.025]), spread: 0.02 };
}
// curl: four fingers [knuckle, middle, tip] (+ spread), thumb [base, middle, tip]; positive bends toward the palm
function poseHand(h, p) {
  const { fingers, thumb, side } = h.userData;
  fingers.forEach((j, i) => { const c = p.f[i] ?? p.f[0]; j[0].rotation.set(c[0], 0, (p.spread ?? 0.05) * (1.5 - i) * side); j[1].rotation.x = c[1]; j[2].rotation.x = c[2]; });
  thumb[0].rotation.x = p.t[0]; thumb[1].rotation.x = p.t[1]; thumb[2].rotation.x = p.t[2];
}
const GRIP = {
  can: { f: [[0.55, 0.62, 0.42], [0.58, 0.64, 0.44], [0.6, 0.66, 0.44], [0.64, 0.68, 0.46]], t: [0.75, 0.35, 0.25], spread: 0.02 }, // wrapped round the can
  board: { f: [[0.15, 1.5, 1.25]], t: [0.25, 0.15, 0.1], spread: 0.03 }, // palm on the deck, fingers curled under the bottom edge
  relaxed: { f: [[0.45, 0.7, 0.45], [0.5, 0.75, 0.5], [0.55, 0.8, 0.5], [0.6, 0.85, 0.5]], t: [0.35, 0.3, 0.2] },
};

// el: the #intro overlay.
// opts.paint: { at(g) -> {x, y} px in el where the paint lands at progress g (0..1), set(g): show the name painted up to g }.
// opts.freeze: render one frame at that time and stop (for checking poses).
// opts.on(name): called at 'sprayed', 'pop', 'land' and 'lift'. opts.skip(fn): receives a function that ends the animation now.
// Resolves when the animation has finished (or was skipped); rejects if it can't run.
export async function playIntro(el, opts = {}) {
  const [sk, an, bd, rn] = await load();
  try { await Promise.race([document.fonts.load('800 128px "Bricolage Grotesque"'), new Promise((r) => setTimeout(r, 600))]); } catch (e) {} // for the can's lettering
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'i-canvas';
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#6b5a4c', 1.5));
  const key = new THREE.DirectionalLight('#fff4e6', 2.3); key.position.set(-3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight('#ff7a3d', 3); rim.position.set(3, 2.5, -5); scene.add(rim);

  // rider: the models face +Z; rotation.y points them where they're going.
  const rider = new THREE.Group(); scene.add(rider);
  const skater = sk.scene;
  const B = (n) => skater.getObjectByName(n);
  const hips = B('Hips'), feet = [B('LeftFoot'), B('RightFoot')];
  const legs = ['Left', 'Right'].map((s) => [B(s + 'UpLeg'), B(s + 'Leg'), B(s + 'Foot')]);
  const arms = [B('LeftArm'), B('RightArm')], spine = B('Spine');
  const R = { arm: B('RightArm'), fore: B('RightForeArm'), hand: B('RightHand'), tip: B('RightHandMiddle1') };
  const Lf = { arm: B('LeftArm'), fore: B('LeftForeArm'), hand: B('LeftHand'), tip: B('LeftHandMiddle1') };
  const bones = []; skater.traverse((o) => { if (o.isBone) bones.push(o); });
  const snap = () => ({ q: bones.map((b) => b.quaternion.clone()), h: hips.position.clone() });
  const restore = (S) => { bones.forEach((b, i) => b.quaternion.copy(S.q[i])); hips.position.copy(S.h); };
  const blend = (S, w) => { bones.forEach((b, i) => b.quaternion.slerp(S.q[i], w)); hips.position.lerp(S.h, w); };

  // point a bone so its child joint lies along a world direction
  const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
  function aim(bone, child, dirW) {
    if (!child) return; // the hands are the ends of the chain (no finger bones): they just follow the forearm
    bone.getWorldPosition(_p1); child.getWorldPosition(_p2);
    _q1.setFromUnitVectors(_p2.sub(_p1).normalize(), dirW);
    bone.parent.getWorldQuaternion(_q2); bone.getWorldQuaternion(_q3);
    bone.quaternion.copy(_q2.invert().multiply(_q3.premultiply(_q1)));
    bone.updateMatrixWorld(true);
  }

  if (!rig) {
    // read the rest pose first, then build the clips and the held poses from it
    const REST = snap();
    const ride = makeRetarget(skater, an.scene, an.animations[0]);
    restore(REST);
    const run = makeRetarget(skater, rn.scene, rn.animations[0]);
    restore(REST);
    skater.updateMatrixWorld(true);
    const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize(); // skater space: +z forward, +x his left
    // board carried at his left side: arm hanging straight down, a little away from the body, hand gripping the board's edge
    aim(Lf.arm, Lf.fore, v(0.42, -1, 0)); aim(Lf.fore, Lf.hand, v(0.28, -1, 0.03)); // just out from his side: the board sits between the arm and his hip
    // the rig has no finger bones, so the whole hand hooks: the wrist bends ~95° so the palm cups the board's bottom edge
    // and the fingers wrap round onto its inner face
    {
      const pq = Lf.hand.parent.getWorldQuaternion(new THREE.Quaternion()), wq = pq.clone().multiply(Lf.hand.quaternion);
      wq.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.65)); // about his forward axis, fingers toward his body
      Lf.hand.quaternion.copy(pq.invert().multiply(wq)); Lf.hand.updateMatrixWorld(true);
    }
    aim(R.arm, R.fore, v(-0.2, -1, 0.05)); aim(R.fore, R.hand, v(-0.1, -0.8, 0.4)); aim(R.hand, R.tip, v(-0.1, -0.8, 0.4));
    const STAND = snap();
    const CARRY = [Lf.arm, Lf.fore, Lf.hand].map((b) => b.quaternion.clone());
    restore(REST);
    skater.userData.y0 = skater.position.y;
    rig = { REST, STAND, CARRY, ride, run };
  }
  const { STAND, CARRY, ride: rt, run: rr } = rig;
  rider.add(skater);

  // the ride board, flipped by the kickflip
  const boardPitch = new THREE.Group(), boardRoll = new THREE.Group();
  const PIVOT = 0.07; // flips spin around the middle of the deck
  const board = bd.scene.clone();
  boardRoll.position.y = PIVOT; board.position.y = -PIVOT;
  boardRoll.add(board); boardPitch.add(boardRoll); rider.add(boardPitch);
  // sample the board's vertices (in boardRoll space) so the feet can stay clear of it while it flips
  rider.updateMatrixWorld(true);
  const pts = [], _m = new THREE.Matrix4(), rollInv = boardRoll.matrixWorld.clone().invert();
  board.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 400));
    _m.multiplyMatrices(rollInv, o.matrixWorld);
    for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(_m));
  });
  const atRest = pts.map((p) => p.clone().applyMatrix4(boardRoll.matrix)); // in rider space
  // the deck at its middle (between the trucks): top face, underside and half-width, measured with rays
  const DECK = (() => {
    const rc = new THREE.Raycaster(), hit = (o, d) => { rc.set(o, d); return rc.intersectObject(board, true)[0]?.point; };
    const top = hit(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0))?.y ?? PIVOT + 0.007;
    const bottom = hit(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0))?.y ?? PIVOT - 0.007;
    const w = hit(new THREE.Vector3(1, (top + bottom) / 2, 0), new THREE.Vector3(-1, 0, 0))?.x ?? 0.1;
    return { top, bottom, w };
  })();
  const lowY = Math.min(...atRest.map((p) => p.y));
  const TAIL = new THREE.Vector3(0, lowY, Math.min(...atRest.filter((p) => p.y < lowY + 0.015).map((p) => p.z))); // rear wheels: the pop rocks back on these
  let span = null, restTop = 0; // the stretch of deck under the feet, and its height
  const deckTop = (M) => {
    let top = -Infinity;
    for (const p of pts) { _v.copy(p).applyMatrix4(M); if (_v.z > span[0] && _v.z < span[1] && _v.y > top) top = _v.y; }
    return top;
  };

  // the same board, carried under his left arm before the ride
  const carry = bd.scene.clone(); scene.add(carry);
  const can = makeCan(); scene.add(can);

  // posable hands in his skin tone (averaged from the texture under his own hand's vertices)
  function skinTone() {
    try {
      let mesh = null; skater.traverse((o) => { if (o.isSkinnedMesh && !mesh && o.material.map) mesh = o; });
      const geo = mesh.geometry, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, uv = geo.attributes.uv, bi = mesh.skeleton.bones.indexOf(R.hand);
      const img = mesh.material.map.image, c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 256, 256);
      const px = x.getImageData(0, 0, 256, 256).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < si.count; i++) {
        if (si.getX(i) !== bi || sw.getX(i) < 0.9) continue;
        const o = (Math.min(255, Math.floor(uv.getY(i) * 256)) * 256 + Math.min(255, Math.floor(uv.getX(i) * 256))) * 4;
        r += px[o]; g += px[o + 1]; b += px[o + 2]; n++;
      }
      if (n < 5) throw 0;
      return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
    } catch (e) { return new THREE.Color('#d7a58a'); }
  }
  const tone = skinTone();
  const handR = makeHand(1, tone), handL = makeHand(-1, tone);
  // the can lies across the right palm: centre CAN_AT in the hand's frame (along the fingers, out of the palm, along the thumb)
  const CAN_AT = [0.055, 0.0175 + CAN.r + 0.002, -0.045];
  canGrip ??= wrapPose(handR, (y, z) => Math.hypot(y - CAN_AT[0], z - CAN_AT[1]) - CAN.r, 0.0105);
  // the board's edge in the left hand: the deck lies on the palm from the wrist up to EDGE_AT along the fingers,
  // PALM thick, and the fingers wrap round its edge (the deck is DECK.top - DECK.bottom thick)
  const PALM = 0.0185, EDGE_AT = 0.084, TH = DECK.top - DECK.bottom;
  boardGrip ??= wrapPose(handL, (y, z) => { // signed distance to the deck slab: y <= EDGE_AT, PALM <= z <= PALM + TH
    const dy = y - EDGE_AT, dz = Math.abs(z - (PALM + TH / 2)) - TH / 2;
    return dy > 0 ? (dz > 0 ? Math.hypot(dy, dz) : dy) : (dz > 0 ? dz : Math.max(dy, dz));
  }, 0.0098);
  scene.add(handR, handL);
  const showOwnHands = (on) => { const s = on ? 1 : 0.001; R.hand.scale.setScalar(s); Lf.hand.scale.setScalar(s); handR.visible = handL.visible = !on; };

  // spray mist: soft orange puffs flying from the nozzle to the wall
  const pc = document.createElement('canvas'); pc.width = pc.height = 64;
  { const x = pc.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
  const puffTex = new THREE.CanvasTexture(pc);
  const MIST = 70, mist = [];
  for (let i = 0; i < MIST; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: PAINT, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; scene.add(s); mist.push(s);
  }

  // soft blob shadows
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const g2 = sc.getContext('2d'), grd = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g2.fillStyle = grd; g2.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);
  const canShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.26), shadow.material.clone());
  canShadow.rotation.x = -Math.PI / 2; canShadow.position.y = 0.001; scene.add(canShadow);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  let halfW = 3, W = 1, H = 1;
  const gline = el.querySelector('.i-ground');
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    W = w; H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const D = w < h ? 8.8 : 6.6; // phones: pull back so the skater isn't huge
    camera.position.set(0, 1.25, D); camera.lookAt(0, 0.95, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    halfW = Math.tan((15 * Math.PI) / 180) * D * camera.aspect;
    const p = new THREE.Vector3(0, 0, 0).project(camera);
    if (gline) gline.style.top = ((1 - p.y) / 2) * h + 'px';
  }
  resize();
  addEventListener('resize', resize);

  // where the paint lands at progress g, as a point on the wall (z = 0)
  const _ray = new THREE.Vector3();
  function wallPoint(g, out) {
    const p = opts.paint?.at(g) ?? { x: W * (0.3 + 0.4 * g), y: H * 0.38 };
    _ray.set((p.x / W) * 2 - 1, 1 - (p.y / H) * 2, 0.5).unproject(camera).sub(camera.position);
    const k = -camera.position.z / _ray.z;
    return out.copy(camera.position).addScaledVector(_ray, k);
  }

  // rotate a bone by a world-space axis/angle
  const _pq = new THREE.Quaternion(), _r = new THREE.Quaternion(), _w = new THREE.Quaternion();
  function worldRotate(bone, axis, angle) {
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_pq);
    _w.copy(_pq).multiply(bone.quaternion);
    _r.setFromAxisAngle(axis, angle);
    bone.quaternion.copy(_pq.invert()).multiply(_r.multiply(_w));
  }
  const _a = new THREE.Vector3(), _f0 = new THREE.Vector3(), _f1 = new THREE.Vector3(), _v = new THREE.Vector3();
  const footMid = (out) => {
    skater.updateMatrixWorld(true);
    out.set(0, 0, 0);
    for (const f of feet) out.add(f.getWorldPosition(_v));
    return skater.worldToLocal(out.multiplyScalar(0.5));
  };
  // bend the legs (hip flex th rad; knee 2x, ankle 1x keeps the feet flat). which: [left, right] amounts
  function bendLegs(th, which = [1, 1]) {
    _a.set(1, 0, 0).applyQuaternion(hips.getWorldQuaternion(_w)).normalize();
    legs.forEach(([up, leg, foot], i) => { const a = th * which[i]; if (a) { worldRotate(up, _a, -a); worldRotate(leg, _a, 2 * a); worldRotate(foot, _a, -a); } });
  }
  const Z = new THREE.Vector3(0, 0, 1);

  // ---- the prologue
  const wa = new THREE.Vector3(), wb = new THREE.Vector3(), wt = new THREE.Vector3(), wt2 = new THREE.Vector3();
  const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3(), _mb = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  const STRIDE = 3.75; // metres the run clip covers per cycle (its root motion), so the feet keep pace with the ground
  // run in: a steady ~3 m/s, braking to a stop over the last 0.6 s. Distance covered by time t (of total S metres)
  function runIn(t, S) {
    const Tb = 0.6, V = S / (P.run - Tb / 2);
    if (t <= P.run - Tb) return V * t;
    const u = Math.min(t, P.run) - (P.run - Tb);
    return V * (P.run - Tb) + V * (u - (u * u) / (2 * Tb));
  }
  // run out: speeding up from a standstill to 4 m/s
  const runOut = (D) => { const a = 7, vmax = 4, ta = vmax / a; return D < ta ? 0.5 * a * D * D : 0.5 * a * ta * ta + vmax * (D - ta); };
  const sprayG = (t) => clamp01((t - P.spray0) / (P.spray1 - P.spray0));
  const standX = (q) => lerp(wa.x * 0.45, wb.x * 0.45, q); // he side-steps along under the name while he sprays
  const runInFrom = () => new THREE.Vector3(standX(0), 0, ZS + 3.4); // from just in front of the camera, straight away from it to the wall
  // the arm follows the paint with the zig-zag smoothed out (the mist still zig-zags), so it sweeps instead of jittering
  function aimPoint(g, out) {
    out.set(0, 0, 0);
    for (let i = -3; i <= 3; i++) out.add(wallPoint(clamp01(g + i * 0.03), wt2));
    return out.multiplyScalar(1 / 7);
  }
  // he walks sideways while he sprays: hips glide smoothly, each foot stays planted until it steps
  const sprayQ = (t) => { const u = clamp01((t - P.spray0) / (P.spray1 - P.spray0)); return u * u * u * (u * (6 * u - 15) + 10); }; // smootherstep
  function footProgress(q, lead, K) {
    const k = Math.min(K - 1, Math.floor(q * K)), f = q * K - k; // which step, and how far through it
    const sw = lead ? clamp01(f / 0.55) : clamp01((f - 0.45) / 0.55); // the lead foot steps first, the other follows
    return { p: (k + ease(sw)) / K, lift: Math.sin(Math.PI * sw) };
  }
  const _hipJ = new THREE.Vector3(), _knee = new THREE.Vector3(), _ft = new THREE.Vector3(), _perp = new THREE.Vector3(), _fq = new THREE.Quaternion();
  // two-bone leg IK: put the ankle at `target`, knee bending toward `hint`, foot kept at its world orientation `fq`
  function legTo([up, leg, foot], target, hint, fq) {
    up.getWorldPosition(_hipJ); leg.getWorldPosition(_knee); foot.getWorldPosition(_ft);
    const a = _hipJ.distanceTo(_knee), b = _knee.distanceTo(_ft);
    const along = _v.copy(target).sub(_hipJ); const d = Math.min(along.length(), a + b - 1e-3); along.normalize();
    const cosA = clamp01((a * a + d * d - b * b) / (2 * a * d)), sinA = Math.sqrt(1 - cosA * cosA);
    _perp.copy(hint).addScaledVector(along, -hint.dot(along)).normalize();
    _knee.copy(_hipJ).addScaledVector(along, a * cosA).addScaledVector(_perp, a * sinA);
    aim(up, leg, _ft.copy(_knee).sub(_hipJ).normalize());
    aim(leg, foot, _ft.copy(target).sub(_knee).normalize());
    foot.parent.getWorldQuaternion(_q2); foot.quaternion.copy(_q2.invert().multiply(fq)); foot.updateMatrixWorld(true);
  }
  // the can's resting place and pose: lying on its side, top to the right, label to the camera
  const canRestQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)));
  const canRestP = new THREE.Vector3(0.03, CAN.r + 0.004, ZP);
  const release = { p: new THREE.Vector3(), q: new THREE.Quaternion(), ok: false };
  const sprayV = new THREE.Vector3();

  // two-bone arm IK: left wrist to `target`, elbow bending toward `hint`
  const _wv = new THREE.Vector3(), _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3();
  const _wt = new THREE.Vector3(), _sh = new THREE.Vector3(), _el = new THREE.Vector3(), _wr = new THREE.Vector3(), _al = new THREE.Vector3(), _pp = new THREE.Vector3();
  const armLen = () => Lf.arm.getWorldPosition(_sh).distanceTo(Lf.fore.getWorldPosition(_el)) + _el.distanceTo(Lf.hand.getWorldPosition(_wr));
  function armTo(target, hint) {
    Lf.arm.getWorldPosition(_sh); Lf.fore.getWorldPosition(_el); Lf.hand.getWorldPosition(_wr);
    const a = _sh.distanceTo(_el), b = _el.distanceTo(_wr);
    _al.copy(target).sub(_sh); const d = Math.min(_al.length(), a + b - 1e-3); _al.normalize();
    const cosA = clamp01((a * a + d * d - b * b) / (2 * a * d)), sinA = Math.sqrt(1 - cosA * cosA);
    _pp.copy(hint).addScaledVector(_al, -hint.dot(_al)).normalize();
    _el.copy(_sh).addScaledVector(_al, a * cosA).addScaledVector(_pp, a * sinA);
    aim(Lf.arm, Lf.fore, _wr.copy(_el).sub(_sh).normalize());
    aim(Lf.fore, Lf.hand, _wr.copy(target).sub(_el).normalize());
  }
  // board under the left arm and can in the right hand follow the hands
  function holdProps(canMode, sprayDir) {
    skater.updateMatrixWorld(true);
    // board: tucked between his left arm and his hip, lengthwise, nose dipped a little. The arm comes down outside it and
    // the hand curls under its lower edge at the middle; grip tape faces out (under the arm), wheels toward his leg,
    // and the top edge leans in against his side (like carrying a board at your side while you walk)
    // The board rides on his pelvis (so it stays against his waist even while his torso swings in the run),
    // and the arm reaches to it: two-bone IK puts the wrist at the board's bottom edge, the hand hooked under it.
    legs[0][0].getWorldPosition(_p1); legs[1][0].getWorldPosition(_e); _s.copy(_p1).sub(_e).normalize(); // his left, hip to hip
    _f0.set(0, 0, 1).transformDirection(skater.matrixWorld); _f0.addScaledVector(_s, -_f0.dot(_s)).normalize(); // his forward
    _e.copy(_f0).addScaledVector(UP, -0.31).normalize(); // board length: forward, nose down ~17°
    _u.copy(_s).addScaledVector(UP, 0.28); // deck faces out, top edge leaning in against his side
    _u.addScaledVector(_e, -_u.dot(_e)).normalize();
    _e.addScaledVector(_u, -_e.dot(_u)).normalize();
    _mb.makeBasis(_v.crossVectors(_u, _e), _u, _e);
    carry.quaternion.setFromRotationMatrix(_mb);
    // against his left hip (the model's origin is under the wheels: the wheels touch his side, the deck is PIVOT further out)
    carry.position.copy(_p1).addScaledVector(_u, 0.088).addScaledVector(UP, 0.03).addScaledVector(_f0, -0.04);
    carry.visible = true;
    // left hand: palm flat on the grip tape near the bottom edge, fingers curling under the edge onto the inner face.
    // Its frame: fingers down the deck (-w), palm facing the deck (-u), thumb pointing along the board toward the nose
    const w = _wv.crossVectors(_e, _u); // up across the deck
    _wt.copy(carry.position).addScaledVector(_u, DECK.top + PALM).addScaledVector(w, -DECK.w + EDGE_AT); // wrist: palm on the grip tape, knuckles at the bottom edge
    armTo(_wt, _d.copy(_f0).multiplyScalar(-0.8).addScaledVector(_s, 0.6)); // elbow back and out
    Lf.hand.updateMatrixWorld(true); Lf.hand.getWorldPosition(_p2);
    _mb.makeBasis(_hx.copy(_e).negate(), _hy.copy(w).negate(), _hz.copy(_u).negate());
    handL.quaternion.setFromRotationMatrix(_mb); handL.position.copy(_p2);
    poseHand(handL, boardGrip);
    // right hand: built around the forearm (fingers continue it, thumb up, palm facing in toward his midline)
    R.fore.getWorldPosition(_p1); R.hand.getWorldPosition(_p2);
    _hy.copy(_p2).sub(_p1).normalize();
    if (canMode === 'hand') { _hy.y *= 0.3; _hy.normalize(); } // the wrist bends to keep the can close to upright
    _hx.copy(UP).addScaledVector(_hy, -UP.dot(_hy));
    if (_hx.lengthSq() < 0.09) _hx.set(0, 0, 1).transformDirection(skater.matrixWorld).addScaledVector(_hy, -_hy.dot(_hx)); // arm hanging straight down: thumb forward
    _hx.normalize(); _hz.crossVectors(_hx, _hy);
    _mb.makeBasis(_hx, _hy, _hz);
    handR.quaternion.setFromRotationMatrix(_mb); handR.position.copy(_p2);
    if (canMode !== 'hand') { poseHand(handR, GRIP.relaxed); return; }
    // the can sits in the hand: against the palm, its axis along the thumb, so the fingers wrap round it and the nozzle
    // (on top) points the way the hand points
    poseHand(handR, canGrip);
    _mb.makeBasis(_v.crossVectors(_hx, _hy), _hx, _hy);
    can.quaternion.setFromRotationMatrix(_mb);
    can.position.copy(_p2).addScaledVector(_hy, CAN_AT[0]).addScaledVector(_hz, CAN_AT[1]).addScaledVector(_hx, CAN_AT[2]); // gripped just below the shoulder of the can
  }
  // right arm pointing the can at the wall point wt (upper arm a touch low, so the elbow bends), body turning toward far letters.
  // raise 0..1 blends up from the arm hanging at his side. Returns the horizontal spray direction.
  const iArm = bones.indexOf(R.arm), iFore = bones.indexOf(R.fore), iHand = bones.indexOf(R.hand);
  function sprayArm(wt, x, raise) {
    R.arm.getWorldPosition(_p1);
    _d.copy(wt).sub(_p1).normalize();
    worldRotate(spine, UP, raise * clamp01(Math.abs(wt.x - x) - 0.3) * 0.5 * Math.sign(x - wt.x)); // twist toward far letters
    skater.updateMatrixWorld(true);
    R.arm.getWorldPosition(_p1); _d.copy(wt).sub(_p1).normalize();
    aim(R.arm, R.fore, _v.copy(_d).addScaledVector(UP, -0.12).normalize());
    R.fore.getWorldPosition(_p1); aim(R.fore, R.hand, _v.copy(wt).sub(_p1).normalize());
    if (raise < 1) {
      R.arm.quaternion.slerp(STAND.q[iArm], 1 - raise); R.fore.quaternion.slerp(STAND.q[iFore], 1 - raise); R.hand.quaternion.slerp(STAND.q[iHand], 1 - raise);
      skater.updateMatrixWorld(true);
    }
    R.fore.getWorldPosition(_p1);
    return sprayV.copy(wt).sub(_p1).setY(0).normalize().lerp(_s.set(0, 0, 1).transformDirection(skater.matrixWorld), 1 - raise).normalize();
  }
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  const arc = (a, b, u) => { _qa.setFromUnitVectors(a, b); _qb.identity().slerp(_qa, u); return a.clone().applyQuaternion(_qb); }; // direction a turning toward b
  const nozzleWorld = (out) => out.copy(can.userData.nozzle).applyQuaternion(can.quaternion).add(can.position);

  function prologue(t) {
    rider.visible = true; boardPitch.visible = false; carry.visible = true;
    showOwnHands(false); // the posable hands hold the can and the board
    skater.position.y = skater.userData.y0;
    wallPoint(0, wa); wallPoint(1, wb);
    const xa = standX(0), xb = standX(1);
    let mode = 'hand', sprayDir = null;
    mist.forEach((s) => { s.visible = false; });

    if (t < P.face) {
      // run straight away from the camera to the wall, slowing as he gets there, then settle into a stance
      const A = runInFrom(), Bp = _v.set(xa, 0, ZS), S = A.distanceTo(Bp);
      const s = runIn(t, S);
      rider.position.copy(A).lerp(Bp, s / S);
      rider.rotation.y = Math.PI; // back to the camera the whole way
      rr.apply((s / STRIDE) * rr.duration); // strides keep pace with the ground, so they slow down with him
      Lf.arm.quaternion.copy(CARRY[0]); Lf.fore.quaternion.copy(CARRY[1]); Lf.hand.quaternion.copy(CARRY[2]);
      const w = ease(clamp01((t - (P.run - 0.35)) / (P.face - P.run + 0.35)));
      if (w > 0) blend(STAND, w);
    } else if (t < P.spray1 + 0.02) {
      // spray: side-step along under the name, right arm sweeping after the paint
      const g = sprayG(t), q = sprayQ(t);
      restore(STAND);
      rider.rotation.y = Math.PI;
      const x = standX(q);
      rider.position.set(x, 0, ZS);
      footMid(_f0); bendLegs(0.1 * ease(clamp01((t - P.face) / 0.25))); footMid(_f1); _f1.sub(_f0); hips.position.sub(_f1); // settles into soft knees
      skater.updateMatrixWorld(true);
      // feet: start from where standing puts them, then each stays planted on the ground until its step
      const L = xb - xa, K = Math.max(2, Math.round(Math.abs(L) / 0.36));
      const goals = legs.map(([, , foot], i) => {
        const fp = footProgress(q, (i === 1) === (L >= 0), K); // the foot on the side he's heading leads
        const p = foot.getWorldPosition(new THREE.Vector3());
        p.x += (fp.p - q) * L; p.y += 0.075 * fp.lift;
        return { p, q: foot.getWorldQuaternion(new THREE.Quaternion()), lift: fp.lift };
      });
      hips.position.y -= 0.018 * Math.max(goals[0].lift, goals[1].lift); // dips a touch as each foot steps
      skater.updateMatrixWorld(true);
      legs.forEach((lg, i) => legTo(lg, goals[i].p, _s.set(0, 0, -1), goals[i].q)); // knees bend toward the wall
      skater.updateMatrixWorld(true);
      aimPoint(g, wt);
      sprayDir = sprayArm(wt, x, ease(clamp01((t - P.face) / (P.spray0 - P.face)))); // raises the can, then sweeps after the paint
      holdProps('hand', sprayDir);
      // mist: each puff leaves the nozzle at its own time and flies to where the paint was landing then
      nozzleWorld(_e);
      const LIFE = 0.24;
      for (let i = 0; i < MIST; i++) {
        const age = (((t - P.spray0) + (i / MIST) * LIFE) % LIFE), te = t - age;
        if (te < P.spray0 || te > P.spray1) continue;
        const k = age / LIFE, sp = mist[i];
        wallPoint(sprayG(te), wt2);
        sp.position.copy(_e).lerp(wt2, Math.min(1, k * 1.15));
        const j = 0.05 + 0.18 * k;
        sp.position.x += (hash(i) - 0.5) * j; sp.position.y += (hash(i + 7) - 0.5) * j; sp.position.z += (hash(i + 3) * 0.5) * j;
        const sz = 0.05 + 0.3 * k;
        sp.scale.set(sz, sz, 1);
        sp.material.opacity = 0.55 * (1 - k) * Math.min(1, k * 6);
        sp.visible = true;
      }
      opts.paint?.set(g);
    } else if (t < P.turn) {
      // toss the can back over his right shoulder, then turn to go
      restore(STAND);
      rider.rotation.y = Math.PI;
      rider.position.set(xb, 0, ZS);
      footMid(_f0); bendLegs(0.1); footMid(_f1); _f1.sub(_f0); hips.position.sub(_f1);
      skater.updateMatrixWorld(true);
      const w = clamp01((t - P.spray1) / (P.release - P.spray1)); // wind up and over
      const after = clamp01((t - P.release) / 0.35);
      // start from exactly the pose he finished spraying in, and ease out of it
      const S0 = snap();
      aimPoint(1, wt); const endDir = sprayArm(wt, xb, 1).clone();
      const SP = snap(); restore(S0); skater.updateMatrixWorld(true);
      R.arm.getWorldPosition(_p1);
      const toWall = _d.copy(wt).sub(_p1).normalize();
      const sk = (x, y, z) => new THREE.Vector3(x, y, z).normalize().transformDirection(skater.matrixWorld); // skater space -> world
      const back = sk(0.25, 0.85, -0.55), side = sk(-1, -0.1, -0.1), down = sk(-0.2, -1, 0.05); // up and behind; out to his right; hanging
      // swing along arcs (not straight lines, which would whip through the shoulder): wall -> up and back, then out to the side and down
      const dir = after > 0 ? (after < 0.5 ? arc(back, side, ease(after * 2)) : arc(side, down, ease(after * 2 - 1))) : arc(toWall.clone(), back, ease(w));
      aim(R.arm, R.fore, dir); R.fore.getWorldPosition(_p1); aim(R.fore, R.hand, _v.copy(dir).addScaledVector(UP, 0.3 * (1 - after)).normalize()); aim(R.hand, R.tip, _v);
      worldRotate(spine, Z, -0.12 * Math.sin(Math.PI * w));
      const keep = 1 - ease(clamp01(w / 0.45));
      if (keep > 0) blend(SP, keep);
      // settle back to the plain standing pose (arm and knees) before he turns and runs
      const settle = ease(clamp01((t - (P.turn - 0.3)) / 0.3));
      if (settle > 0) blend(STAND, settle);
      sprayDir = sprayV.copy(endDir).lerp(_s.set(0, 0, 1).transformDirection(skater.matrixWorld), ease(w)).normalize();
      if (t >= P.release) mode = 'flying';
      opts.paint?.set(1);
      if (t > P.turn - 0.25) { const tw = ease((t - (P.turn - 0.25)) / 0.25); rider.rotation.y = lerp(Math.PI, Math.PI * 1.5, tw); }
    } else {
      // sprint off to the left, picking up speed from a standstill
      const D = (t - P.turn), x = xb - runOut(D);
      rider.position.set(x, 0, ZS);
      rider.rotation.y = Math.PI * 1.5;
      rr.apply((Math.abs(x - xb) / STRIDE) * rr.duration + 0.2);
      Lf.arm.quaternion.copy(CARRY[0]); Lf.fore.quaternion.copy(CARRY[1]); Lf.hand.quaternion.copy(CARRY[2]);
      const w = clamp01(D / 0.4); if (w < 1) blend(STAND, 1 - ease(w));
      mode = 'flying';
    }
    holdProps(mode, sprayDir);
    if (mode === 'hand') canShadow.visible = false;
    else placeCan(t);
    shadow.position.set(rider.position.x, 0.002, rider.position.z); shadow.scale.set(0.8, 1.2, 1); shadow.material.opacity = 0.75;
  }

  // the can after it leaves his hand: an arc onto the pavement, a bounce, then it rocks to a stop label-out
  function placeCan(t) {
    const fl = P.landed - P.release;
    const u = clamp01((t - P.release) / fl);
    if (u < 1) {
      can.position.lerpVectors(release.p, canRestP, u);
      can.position.y = lerp(release.p.y, canRestP.y, u) + 0.9 * 4 * u * (1 - u) * (1 - u * 0.3);
      can.quaternion.slerpQuaternions(release.q, canRestQ, ease(u));
      can.quaternion.multiply(_q1.setFromAxisAngle(_v.set(1, 0, 0), (1 - u) * (1 - u) * Math.PI * 3)); // tumbling end over end
    } else {
      const s = t - P.landed;
      can.position.copy(canRestP);
      can.position.y += 0.07 * Math.max(0, Math.sin(Math.min(Math.PI, s * 14))) * Math.exp(-s * 3);
      can.quaternion.copy(canRestQ).multiply(_q1.setFromAxisAngle(_v.set(0, 1, 0), 0.5 * Math.sin(s * 11) * Math.exp(-s * 5))); // rocks on its round side
    }
    canShadow.visible = true; canShadow.position.set(can.position.x, 0.001, can.position.z);
    canShadow.material.opacity = 0.7 / (1 + (can.position.y - canRestP.y) * 4);
  }

  // ---- the kickflip (its own clock k)
  function kickflip(k) {
    boardPitch.visible = true; carry.visible = false;
    showOwnHands(true);
    mist.forEach((s) => { s.visible = false; });
    rider.rotation.y = Math.PI / 2;
    const mid = (T.pop + T.land) / 2, X0 = halfW + 1.1, v = Math.max(X0 / mid, 2.15); // fast enough to land clear of the can on narrow screens
    const x = v * (k - mid);
    rider.position.set(x, 0, ZP);
    const ct = k < T.settle ? 1.0 + 1.3 * k : STANCE + Math.max(0, k - T.land) * 0.2;
    rt.apply(ct);

    // leg bend 0..1: crouch, snap straight at the pop, tuck in the air, absorb the landing
    let bend = 0, u = -1;
    if (k >= T.settle && k < T.pop) {
      const c = (k - T.settle) / (T.pop - T.settle);
      bend = c < 0.72 ? 0.62 * ease(c / 0.72) : 0.62 + (0.04 - 0.62) * ease((c - 0.72) / 0.28);
    } else if (k >= T.pop && k < T.land) {
      u = (k - T.pop) / (T.land - T.pop);
      bend = 0.04 + 0.72 * Math.pow(Math.sin(Math.PI * u), 0.75);
    } else if (k >= T.land && k < T.absorbed) {
      const c = (k - T.land) / (T.absorbed - T.land);
      bend = 0.04 * (1 - c) + 0.5 * Math.sin(Math.PI * Math.pow(c, 0.6));
    }
    footMid(_f0);
    if (bend > 0.001) {
      bendLegs(bend * 0.95);
      worldRotate(spine, _a, bend * 0.28); // lean into it
    }
    const air = u >= 0 ? Math.sin(Math.PI * u) : 0;
    if (air > 0) for (const arm of arms) { // arms out for balance
      arm.getWorldPosition(_v); const side = Math.sign(_v.x - x) || 1;
      worldRotate(arm, Z, side * 0.75 * air);
    }
    footMid(_f1);
    // keep the feet where they were: the hips move instead
    _f1.sub(_f0);
    hips.position.sub(_f1);
    const lift = _f1.y; // how far the feet came up toward the hips

    const y = u >= 0 ? POP_H * 4 * u * (1 - u) : 0; // the board's arc
    rider.position.y = y;

    // board: rocks back on the rear wheels for the pop, one full flip, level for the catch
    let pitch = 0, roll = 0, f = 0;
    if (k >= T.settle && k < T.pop) {
      const c = (k - T.settle) / (T.pop - T.settle);
      pitch = c > 0.72 ? -0.3 * ease((c - 0.72) / 0.28) : 0;
    } else if (u >= 0) {
      pitch = -0.3 * (1 - ease(clamp01(u / 0.5)));
      f = ease(clamp01((u - 0.06) / 0.72)); // flip done at u = 0.78: the catch
      roll = f * Math.PI * 2;
    }
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    boardPitch.rotation.x = pitch;
    boardPitch.position.set(0, TAIL.y - (TAIL.y * cp - TAIL.z * sp), TAIL.z - (TAIL.y * sp + TAIL.z * cp));
    boardRoll.rotation.z = roll;
    boardPitch.updateMatrix(); boardRoll.updateMatrix();

    // feet: tucked up off the board while it spins, never lower than the top of the spinning board under them,
    // then back down onto the grip tape for the catch
    if (!span) {
      skater.updateMatrixWorld(true);
      const zs = feet.map((ft) => rider.worldToLocal(ft.getWorldPosition(_v)).z);
      span = [Math.min(...zs) - 0.1, Math.max(...zs) + 0.1];
      restTop = deckTop(_m.makeTranslation(0, PIVOT, 0)); // board flat, not flipping
    }
    const clear = deckTop(_m.multiplyMatrices(boardPitch.matrix, boardRoll.matrix)) - restTop + 0.035 * Math.sin(Math.PI * f);
    const tuck = u >= 0 ? 0.6 * lift * (1 - ease(clamp01((u - 0.5) / 0.28))) : 0;
    skater.position.y = skater.userData.y0 + Math.max(0, clear, tuck);

    shadow.position.set(x, 0.002, ZP); shadow.rotation.z = 0;
    const s = 1 / (1 + y * 1.6);
    shadow.scale.set(s, s, 1); shadow.material.opacity = 0.9 * s;
  }

  function frame(t) {
    if (t >= P.release && !release.ok) { // where the can left his hand: pose the throw at that moment once
      prologue(P.release - 1e-4);
      release.p.copy(can.position); release.q.copy(can.quaternion); release.ok = true;
    }
    if (t < P.out) prologue(t);
    else {
      kickflip(t - P.out);
      opts.paint?.set(1);
      placeCan(Math.max(t, P.landed + 3));
    }
    renderer.render(scene, camera);
  }

  const done = () => {
    removeEventListener('resize', resize);
    renderer.setAnimationLoop(null);
    renderer.dispose(); canvas.remove();
    skater.position.y = skater.userData.y0;
    R.hand.scale.setScalar(1); Lf.hand.scale.setScalar(1);
    rider.remove(skater); // the skater scene is reused on replay
  };

  if (opts.freeze != null) {
    const t = opts.freeze;
    if (t >= P.spray1) opts.paint?.set(1);
    frame(t);
    // for checking motion: el.__track(t) poses frame t and reports where the feet, hips and spray hand are
    el.__track = (tt) => { frame(tt); const w = (b) => b.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(4)); return { lf: w(feet[0]), rf: w(feet[1]), hip: w(hips), hand: w(R.hand), can: can.position.toArray().map((n) => +n.toFixed(4)) }; };
    // look at frame t from another camera (offset from the right hand, or from `at`), for inspecting grips
    el.__look = (tt, off, which = 'R', fov = 12) => {
      frame(tt); const h = which === 'R' ? handR : handL, c = h.getWorldPosition(new THREE.Vector3());
      const cam = new THREE.PerspectiveCamera(fov, W / H, 0.01, 50); cam.position.copy(c).add(new THREE.Vector3(...off)); cam.lookAt(c);
      renderer.render(scene, cam); return true;
    };
    // where the posable hands are on screen (px), for close-ups
    el.__hands = (tt) => { frame(tt); const s = (o) => { const p = o.getWorldPosition(new THREE.Vector3()).project(camera); return [Math.round((p.x + 1) / 2 * W), Math.round((1 - p.y) / 2 * H)]; }; return { R: s(handR), L: s(handL) }; };
    // the board carry, in his own frame (x = his left, y = up, z = forward)
    el.__carry = (tt) => { frame(tt); skater.updateMatrixWorld(true); const l = (p) => skater.worldToLocal(p.clone()).toArray().map((n) => +n.toFixed(3)); const b = (o) => l(o.getWorldPosition(new THREE.Vector3()));
      // gap: how far the board's wheel-side (its origin plane) sits out from his left hip joint, along the deck's normal
      const n = new THREE.Vector3(0, 1, 0).applyQuaternion(carry.quaternion), hj = legs[0][0].getWorldPosition(new THREE.Vector3());
      return { shoulder: b(Lf.arm), elbow: b(Lf.fore), wrist: b(Lf.hand), hipJ: b(legs[0][0]), board: l(carry.position), gap: +carry.position.clone().sub(hj).dot(n).toFixed(3), height: +(carry.position.y - hj.y).toFixed(3),
        miss: +Lf.hand.getWorldPosition(new THREE.Vector3()).distanceTo(_wt).toFixed(3), reach: +(Lf.arm.getWorldPosition(new THREE.Vector3()).distanceTo(_wt) / armLen()).toFixed(2) }; };
    return { done };
  }

  return new Promise((resolve) => {
    let t0 = null, over = false;
    const fired = {};
    const mark = (k) => { if (!fired[k]) { fired[k] = true; opts.on?.(k); } };
    const finish = () => { if (over) return; over = true; done(); resolve(); };
    opts.skip?.(finish);
    renderer.setAnimationLoop((now) => {
      t0 ??= now;
      const t = (now - t0) / 1000;
      frame(t);
      for (const k of ['sprayed', 'pop', 'land', 'lift']) if (t >= MARKS[k]) mark(k);
      if (t >= MARKS.end) finish();
    });
  });
}
