// Opening animation: the skater rides in, kickflips across the screen and rolls out.
// Uses the Skate UW assets: skater.glb (rigged), the Mixamo riding/pushing clip and the in-game board.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = new URL('../images/intro/', import.meta.url).href;

// ---- Retarget the Mixamo clip onto the skater: line up the two rest poses, then copy world-space rotation deltas.
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
const T = { settle: 1.14, pop: 1.38, land: 1.98, absorbed: 2.4, lift: 2.75, end: 3.45 };
const STANCE = 0.28; // a frame of the clip with both feet on the board
const POP_H = 0.84; // how high the board goes (m): enough to clear the cone
const CONE = { h: 0.56, r: 0.21, base: 0.48 }; // the "Portfolio" cone he jumps, centred under the top of the jump
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (u) => u * u * (3 - 2 * u);

let assets; // loaded once, reused by "Replay intro"
let rig; // the skater scene and its retarget, built once (the rest pose must be read before any animation)
function load() {
  const L = new GLTFLoader();
  assets ??= Promise.all(['skater', 'skate-anim', 'skateboard'].map((n) => L.loadAsync(DIR + n + '.glb')));
  return assets;
}
export const preload = load;

// el: the #intro overlay. opts.freeze: render one frame at that time and stop (for checking poses).
// opts.on(name): called at 'pop', 'land' and 'lift'. opts.skip(fn): receives a function that ends the animation now.
// Resolves when the animation has finished (or was skipped); rejects if it can't run.
export async function playIntro(el, opts = {}) {
  const [sk, an, bd] = await load();
  try { await Promise.race([document.fonts.load('800 128px "Bricolage Grotesque"'), new Promise((r) => setTimeout(r, 600))]); } catch (e) {} // for the cone's lettering
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

  // rider: travels along +X on screen; the models face +Z, so turn them a quarter.
  const rider = new THREE.Group(); rider.rotation.y = Math.PI / 2; scene.add(rider);
  const skater = sk.scene;
  rig ??= makeRetarget(skater, an.scene, an.animations[0]);
  const rt = rig;
  skater.userData.y0 ??= skater.position.y;
  rider.add(skater);
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
  const lowY = Math.min(...atRest.map((p) => p.y));
  const TAIL = new THREE.Vector3(0, lowY, Math.min(...atRest.filter((p) => p.y < lowY + 0.015).map((p) => p.z))); // rear wheels: the pop rocks back on these
  let span = null, restTop = 0; // the stretch of deck under the feet, and its height
  const deckTop = (M) => {
    let top = -Infinity;
    for (const p of pts) { _v.copy(p).applyMatrix4(M); if (_v.z > span[0] && _v.z < span[1] && _v.y > top) top = _v.y; }
    return top;
  };

  // the cone: orange, a white band that says PORTFOLIO, on a black square base
  const cone = new THREE.Group(); scene.add(cone);
  {
    const cc = document.createElement('canvas'); cc.width = 2048; cc.height = 512;
    const c = cc.getContext('2d');
    c.fillStyle = '#f2591b'; c.fillRect(0, 0, 2048, 512);
    // canvas y 0..512 runs tip..base; the word sits low, where the cone is widest, and fills the side facing the camera
    c.fillStyle = '#f4f0e8'; c.fillRect(0, 300, 2048, 136); c.fillRect(0, 150, 2048, 40);
    c.fillStyle = '#141312'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 112px "Bricolage Grotesque", "Arial Black", sans-serif';
    const sx = (2048 * 0.31) / c.measureText('PORTFOLIO').width; // ~±56° around the front
    c.save(); c.translate(1024, 372); c.scale(sx, 1); c.fillText('PORTFOLIO', 0, 0); c.restore();
    const tex = new THREE.CanvasTexture(cc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    // thetaStart -PI puts the middle of the texture (the word) on the side facing the camera
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, CONE.r, CONE.h, 64, 1, true, -Math.PI, Math.PI * 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    body.position.y = 0.03 + CONE.h / 2;
    const tip = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), new THREE.MeshStandardMaterial({ color: '#f2591b', roughness: 0.55 }));
    tip.rotation.x = -Math.PI / 2; tip.position.y = 0.03 + CONE.h;
    const base = new THREE.Mesh(new THREE.BoxGeometry(CONE.base, 0.03, CONE.base), new THREE.MeshStandardMaterial({ color: '#1d1b1a', roughness: 0.8 }));
    base.position.y = 0.015;
    cone.add(body, tip, base);
  }

  // soft blob shadow
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const g = sc.getContext('2d'), grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);
  const coneShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), shadow.material.clone());
  coneShadow.rotation.x = -Math.PI / 2; coneShadow.position.y = 0.001; scene.add(coneShadow);

  const B = (n) => skater.getObjectByName(n);
  const hips = B('Hips'), feet = [B('LeftFoot'), B('RightFoot')];
  const legs = ['Left', 'Right'].map((s) => [B(s + 'UpLeg'), B(s + 'Leg'), B(s + 'Foot')]);
  const arms = [B('LeftArm'), B('RightArm')], spine = B('Spine');

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  let halfW = 3;
  const gline = el.querySelector('.i-ground');
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
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
  const Z = new THREE.Vector3(0, 0, 1);

  function frame(t) {
    // where along the screen
    const mid = (T.pop + T.land) / 2, X0 = halfW + 1.1, v = Math.max(X0 / mid, 2.15); // fast enough to land clear of the cone on narrow screens
    const x = v * (t - mid);
    rider.position.set(x, 0, 0);
    // which frame of the riding clip
    const ct = t < T.settle ? 1.0 + 1.3 * t : STANCE + Math.max(0, t - T.land) * 0.2;
    rt.apply(ct);

    // leg bend 0..1: crouch, snap straight at the pop, tuck in the air, absorb the landing
    let bend = 0, u = -1;
    if (t >= T.settle && t < T.pop) {
      const c = (t - T.settle) / (T.pop - T.settle);
      bend = c < 0.72 ? 0.62 * ease(c / 0.72) : 0.62 + (0.04 - 0.62) * ease((c - 0.72) / 0.28);
    } else if (t >= T.pop && t < T.land) {
      u = (t - T.pop) / (T.land - T.pop);
      bend = 0.04 + 0.72 * Math.pow(Math.sin(Math.PI * u), 0.75);
    } else if (t >= T.land && t < T.absorbed) {
      const c = (t - T.land) / (T.absorbed - T.land);
      bend = 0.04 * (1 - c) + 0.5 * Math.sin(Math.PI * Math.pow(c, 0.6));
    }
    footMid(_f0);
    if (bend > 0.001) {
      const th = bend * 0.95; // hip flex (rad); knee = 2x, ankle = 1x keeps the feet flat
      _a.set(1, 0, 0).applyQuaternion(hips.getWorldQuaternion(_w)).normalize();
      for (const [up, leg, foot] of legs) {
        worldRotate(up, _a, -th); worldRotate(leg, _a, 2 * th); worldRotate(foot, _a, -th);
      }
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
    if (t >= T.settle && t < T.pop) {
      const c = (t - T.settle) / (T.pop - T.settle);
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

    // the cone drops onto the pavement while the skater is still off screen
    const dt = t - 0.05;
    let cy = 0, tilt = 0;
    if (dt < 0) cy = 4;
    else if (dt < 0.34) cy = 2.6 * (1 - (dt / 0.34) ** 2);
    else if (dt < 0.54) cy = 0.1 * Math.sin(Math.PI * (dt - 0.34) / 0.2);
    if (dt > 0.34 && dt < 1) tilt = 0.14 * Math.sin((dt - 0.34) * 22) * Math.exp(-(dt - 0.34) * 6);
    cone.position.y = cy; cone.rotation.z = tilt;
    coneShadow.material.opacity = 0.7 / (1 + cy * 2);

    shadow.position.x = x;
    const s = 1 / (1 + y * 1.6);
    shadow.scale.set(s, s, 1); shadow.material.opacity = 0.9 * s;
    renderer.render(scene, camera);
  }

  const done = () => {
    removeEventListener('resize', resize);
    renderer.setAnimationLoop(null);
    renderer.dispose(); canvas.remove();
    skater.position.y = skater.userData.y0;
    rider.remove(skater); // the skater scene is reused on replay
  };

  if (opts.freeze != null) { frame(opts.freeze); return { done }; }

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
      if (t >= T.pop) mark('pop');
      if (t >= T.land) mark('land');
      if (t >= T.lift) mark('lift');
      if (t >= T.end) finish();
    });
  });
}
