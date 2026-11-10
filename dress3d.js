// הדמיית תלת-ממד של שמלת הפרחים: בובת תצוגה, חולצה לבנה עם שרוולי פעמון, מחוך, שרוכים, חצאית עם קפלים ומלמלה.
// סקריפט רגיל (לא module) כדי שיעבוד גם כשפותחים את האתר ישירות מתיקייה (file://).
// three.js נטען מה-CDN רק כשפותחים את ההדמיה. הדפס הבד מגיע מ-mida/dress1/fabric.js (data URI).
(function () {
  'use strict';

  let THREE, OrbitControls, RoomEnvironment;
  async function loadLibs() {
    if (THREE) return;
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
  }

  const TAU = Math.PI * 2;
  const TILE = 0.08;                       // physical width (m) of one repeat of the print
  const TILE_V = 0.165;                    // ... and its height (the tile is cut 1 wide : 2 tall from the photo)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const wrapAngle = (t) => t - TAU * Math.round(t / TAU);

  // cosine interpolation in a [[y, value], ...] table (ascending y)
  function interp(table, y) {
    if (y <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (y <= table[i][0]) {
        const [y0, v0] = table[i - 1], [y1, v1] = table[i];
        const t = (y - y0) / (y1 - y0);
        return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * t)) / 2;
      }
    }
    return table[table.length - 1][1];
  }

  // ---------- dress form (metres; y up, front = +z). half-width a(y), half-depth b(y) ----------
  const FORM_A = [[0.88, 0.150], [1.02, 0.128], [1.10, 0.137], [1.20, 0.157], [1.30, 0.160], [1.38, 0.168], [1.42, 0.160], [1.455, 0.122], [1.475, 0.060]];
  const FORM_B = [[0.88, 0.118], [1.02, 0.098], [1.10, 0.106], [1.20, 0.124], [1.30, 0.110], [1.38, 0.092], [1.42, 0.082], [1.455, 0.070], [1.475, 0.050]];

  function bodyAt(theta, y, off = 0) {
    const a = interp(FORM_A, y);
    const c = Math.cos(theta), s = Math.sin(theta);
    const bust = 0.017 * Math.exp(-(((y - 1.205) / 0.06) ** 2)) * Math.max(0, c) ** 3;
    const b = interp(FORM_B, y) + bust;
    let nx = s / a, nz = c / b;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const lift = off * 0.6 * smooth(1.415, 1.47, y);          // the shoulder slope faces upwards: lift the cloth too
    return { x: a * s + off * nx, z: b * c + off * nz, y: y + lift, nx, nz, a, b };
  }
  const thetaForX = (x, a) => Math.asin(clamp(x / a, -1, 1));

  // ---------- skirt ----------
  const SK_A = [[0.30, 0.300], [0.55, 0.252], [0.80, 0.203], [0.93, 0.168], [1.02, 0.134]];
  const SK_B = [[0.30, 0.268], [0.55, 0.224], [0.80, 0.176], [0.93, 0.144], [1.02, 0.104]];
  const RU_A = [[0.10, 0.402], [0.20, 0.352], [0.315, 0.306]];
  const RU_B = [[0.10, 0.372], [0.20, 0.322], [0.315, 0.274]];

  // deterministic pseudo-random phases so the folds look natural but never change between loads
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = Array.from({ length: 12 }, () => rnd() * TAU);

  function skirtFold(theta, y) {
    return 0.55 * Math.sin(9 * theta + P[0] + 0.7 * y) + 0.30 * Math.sin(17 * theta + P[1] - 1.1 * y) + 0.15 * Math.sin(29 * theta + P[2]);
  }
  function skirtAt(theta, y) {
    const amp = 0.004 + 0.021 * smooth(1.0, 0.35, y);
    const gathers = 0.0024 * Math.sin(64 * theta + P[3]) * smooth(0.88, 1.0, y);   // fine gathers at the waist
    const f = skirtFold(theta, y);
    const d = amp * f + gathers;
    const a = interp(SK_A, y) + d, b = interp(SK_B, y) + d;
    return { x: a * Math.sin(theta), z: b * Math.cos(theta), shade: 0.84 + 0.16 * (0.5 + 0.5 * f) };
  }
  function ruffleFold(theta, y) {
    return 0.6 * Math.sin(23 * theta + P[4] + 1.6 * y) + 0.4 * Math.sin(37 * theta + P[5] - 2.0 * y);
  }
  function ruffleAt(theta, y) {
    const amp = 0.006 + 0.026 * smooth(0.315, 0.10, y);
    const f = ruffleFold(theta, y);
    const d = amp * f;
    const a = interp(RU_A, y) + d, b = interp(RU_B, y) + d;
    return { x: a * Math.sin(theta), z: b * Math.cos(theta), shade: 0.80 + 0.20 * (0.5 + 0.5 * f), r: (a + b) / 2 };
  }
  const ruffleHemY = (theta) => 0.10 + 0.012 * ruffleFold(theta, 0.10);

  // ---------- bodice / blouse outlines ----------
  const NECK_X = 0.094;
  function bodiceTop(th) {                 // square neckline at the front, higher at the sides and back
    const t = Math.abs(wrapAngle(th));
    const tn = thetaForX(NECK_X, interp(FORM_A, 1.22));
    const back = 1.31 + 0.012 * smooth(1.9, Math.PI, t);
    return 1.215 + (back - 1.215) * smooth(tn - 0.004, tn + 0.03, t);
  }
  function blouseTop(th) {                 // wide neckline with elastic: low and straight at the front, over the shoulders
    const c = Math.cos(th), s = Math.abs(Math.sin(th));
    const fb = c >= 0 ? 1.350 : 1.392;
    return fb + (1.458 - fb) * smooth(0.42, 0.88, s);
  }

  // ---------- corset (separate piece) ----------
  const COR_OFF = 0.0145;                  // sits clear of the dress underneath, so it reads as its own layer
  const CGAP = 0.011;                      // half-width of the front opening that the cord crosses
  const corTop = (th) => 1.193 - 0.026 * smooth(0.6, 2.5, Math.abs(wrapAngle(th)));
  const corBot = (th) => { const t = Math.abs(wrapAngle(th)); return 1.034 - 0.011 * Math.exp(-((t / 0.28) ** 2)) + 0.012 * smooth(0.6, 2.5, t); };
  const corGapTh = () => thetaForX(CGAP, interp(FORM_A, 1.12));
  // fake contact shadow on the dress right around the corset's edges and inside the front opening
  function corsetShadow(th, y) {
    const top = corTop(th), bot = corBot(th), w = Math.abs(wrapAngle(th));
    let s = 1;
    if (y > top) s *= 1 - 0.24 * (1 - smooth(top, top + 0.014, y));
    if (y < bot) s *= 1 - 0.3 * smooth(bot - 0.022, bot, y);      // darkest right under the edge
    if (y >= bot && y <= top && w < corGapTh() + 0.02) s *= 0.78;   // inside the opening, under the lacing
    return s;
  }

  // ---------- geometry helpers ----------
  // fn(u, v) -> { p:[x,y,z], uv:[u,v], shade } ; u around/across, v bottom -> top
  function gridGeometry(nu, nv, fn, closed) {
    const n = (nu + 1) * (nv + 1);
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let k = 0;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const r = fn(i / nu, j / nv);
        pos[k * 3] = r.p[0]; pos[k * 3 + 1] = r.p[1]; pos[k * 3 + 2] = r.p[2];
        uv[k * 2] = r.uv[0]; uv[k * 2 + 1] = r.uv[1];
        const s = r.shade ?? 1; col[k * 3] = s; col[k * 3 + 1] = s; col[k * 3 + 2] = s;
        k++;
      }
    }
    const idx = [];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (closed) {                                   // average normals across the seam
      const nrm = g.attributes.normal;
      for (let j = 0; j <= nv; j++) {
        const a = j * (nu + 1), b = a + nu;
        const v = new THREE.Vector3(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
        nrm.setXYZ(a, v.x, v.y, v.z); nrm.setXYZ(b, v.x, v.y, v.z);
      }
    }
    return g;
  }

  function tube(points, radius, material, closed = false, segs = 64) {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, 8, closed), material);
    m.castShadow = true;
    return m;
  }

  function weaveNormalMap() {                       // fine plain-weave bump, converted to a normal map
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    const h = (x, y) => 0.5 + 0.25 * Math.sin((x / S) * TAU * 16) * Math.sin((y / S) * TAU * 16 + Math.PI / 2) + 0.12 * Math.sin((x + y) / S * TAU * 32);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
        const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
        const i = (y * S + x) * 4;
        img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // a sleeve segment around an axis A -> B. rx/rz(t, phi) give the cross-section, tEnd(phi) lets the hem slant.
  function sleevePiece(A, B, nu, nv, rFn, tEnd = () => 1) {
    const d = B.clone().sub(A).normalize();
    const u1 = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 0, 1)).normalize();   // across, in the x-y plane
    const u2 = new THREE.Vector3().crossVectors(u1, d).normalize();                           // roughly front (z)
    const AB = B.clone().sub(A);
    return gridGeometry(nu, nv, (u, v) => {
      const phi = u * TAU;
      const t = (1 - v) * tEnd(phi);                 // v = 0 at the hem, 1 at the top (keeps outward winding)
      const c = A.clone().addScaledVector(AB, t);
      const r = rFn(t, phi);
      const p = c.addScaledVector(u1, Math.cos(phi) * r.r1).addScaledVector(u2, Math.sin(phi) * r.r2);
      return { p: [p.x, p.y, p.z], uv: [u * 2, v], shade: r.shade ?? 1 };
    }, true);
  }

  // ---------- camera views ----------
  const VIEWS = {
    front: { pos: [0, 1.0, 3.35], target: [0, 0.80, 0] },
    side: { pos: [3.2, 1.0, 0.9], target: [0, 0.80, 0] },
    back: { pos: [0, 1.0, -3.35], target: [0, 0.80, 0] },
    lace: { pos: [0.18, 1.2, 0.8], target: [0, 1.15, 0] },
    sleeve: { pos: [1.35, 1.08, 1.05], target: [0.24, 0.98, 0] },
    hem: { pos: [0.95, 0.42, 1.35], target: [0, 0.24, 0] },
  };

  async function mount(container, opts = {}) {
    await loadLibs();
    const reduce = !!opts.reduceMotion;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
    camera.position.set(...VIEWS.front.pos);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...VIEWS.front.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.55;
    controls.maxDistance = 4.4;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.autoRotate = !reduce;
    controls.autoRotateSpeed = 1.1;

    let needsRender = true, raf = 0, tween = null, alive = true;
    controls.addEventListener('start', () => { controls.autoRotate = false; tween = null; });
    controls.addEventListener('change', () => { needsRender = true; });

    // lights: soft key from front-right, warm fill, rim and a back fill so the colours read from every side
    scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb9a283, 0.55));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.55);
    key.position.set(1.6, 3.0, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.3, bottom: -1.3, near: 0.5, far: 8 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.target.position.set(0, 0.8, 0);
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xffe7cf, 0.85);
    rim.position.set(-2.2, 2.2, -2.4);
    scene.add(rim);
    const backFill = new THREE.DirectionalLight(0xfff4e6, 0.75);
    backFill.position.set(1.4, 1.6, -2.8);
    scene.add(backFill);

    // materials
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const pipingMats = [], extraTex = [];
    const print = new THREE.TextureLoader().load(window.KEDAM_FABRIC || opts.fabric || 'mida/dress1/fabric.jpg', () => {
      pipingMats.forEach((e) => { if (!e.mat.map) attachPipingMap(e); });
      needsRender = true;
    });
    print.wrapS = print.wrapT = THREE.RepeatWrapping;
    print.colorSpace = THREE.SRGBColorSpace;
    print.anisotropy = maxAniso;
    const weave = weaveNormalMap();
    weave.repeat.set(9, 9);
    weave.anisotropy = maxAniso;

    const fabric = new THREE.MeshPhysicalMaterial({
      map: print, vertexColors: true, roughness: 0.84, sheen: 0.55, sheenRoughness: 0.75,
      sheenColor: new THREE.Color('#fff0e6'), normalMap: weave, normalScale: new THREE.Vector2(0.28, 0.28),
      side: THREE.DoubleSide, envMapIntensity: 0.55,
    });
    const white = new THREE.MeshPhysicalMaterial({
      color: '#f5f1e9', vertexColors: true, roughness: 0.78, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'),
      normalMap: weave, normalScale: new THREE.Vector2(0.2, 0.2), side: THREE.DoubleSide, envMapIntensity: 0.5,
    });
    // trims are tubes without vertex colours, so they get their own (non-vertex-coloured) white
    const whiteTrim = new THREE.MeshPhysicalMaterial({ color: '#f2eee6', roughness: 0.8, sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'), envMapIntensity: 0.5 });
    const cord = new THREE.MeshStandardMaterial({ color: '#f7f3ec', roughness: 0.62, envMapIntensity: 0.5 });
    const metal = new THREE.MeshStandardMaterial({ color: '#c9c4bb', metalness: 0.9, roughness: 0.32 });
    const linen = new THREE.MeshStandardMaterial({ color: '#e6dccb', roughness: 0.95, normalMap: weave, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.45 });
    const wood = new THREE.MeshStandardMaterial({ color: '#6e4b31', roughness: 0.5, envMapIntensity: 0.6 });

    // binding / piping in the same print: a tube's U runs along its length, so repeat the print by length
    function attachPipingMap({ mat, len }) {
      const t = print.clone();                        // only once the image exists (clone() flags an upload)
      t.repeat.set(len / TILE, 0.025);
      extraTex.push(t);
      mat.map = t;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    }
    const piping = (len) => {
      const mat = new THREE.MeshPhysicalMaterial({ color: '#a8857a', roughness: 0.84, sheen: 0.5, sheenRoughness: 0.75, sheenColor: new THREE.Color('#fff0e6'), envMapIntensity: 0.55 });
      const entry = { mat, len };
      pipingMats.push(entry);
      if (print.image) attachPipingMap(entry);
      return mat;
    };

    const dress = new THREE.Group();
    scene.add(dress);
    const add = (geo, mat, shadows = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadows; m.receiveShadow = shadows; dress.add(m); return m; };

    // ----- dress form + stand -----
    add(gridGeometry(96, 60, (u, v) => {
      const th = Math.PI + u * TAU, y = 0.88 + v * (1.475 - 0.88);
      const p = bodyAt(th, y);
      return { p: [p.x, y, p.z], uv: [u * 6, v * 4] };
    }, true), linen);
    const neck = add(new THREE.CylinderGeometry(0.047, 0.052, 0.11, 40), linen); neck.position.y = 1.515;
    const cap = add(new THREE.CylinderGeometry(0.058, 0.058, 0.018, 48), wood); cap.position.y = 1.579;
    const knob = add(new THREE.SphereGeometry(0.016, 24, 16), wood); knob.position.y = 1.598;
    const pole = add(new THREE.CylinderGeometry(0.011, 0.011, 0.9, 20), wood); pole.position.y = 0.47;
    const base = add(new THREE.CylinderGeometry(0.15, 0.17, 0.03, 64), wood); base.position.y = 0.015;

    // ----- white blouse: covers the chest and shoulders, gathered neckline with elastic -----
    add(gridGeometry(300, 44, (u, v) => {
      const th = Math.PI + u * TAU, top = blouseTop(th), bt = bodiceTop(th);
      const y = 1.195 + v * (top - 1.195);
      const g = 0.5 + 0.32 * Math.sin(th * 140 + 0.8 * Math.sin(y * 60)) + 0.18 * Math.sin(th * 233 + 1.3 + y * 25);
      const out = smooth(bt - 0.002, bt + 0.016, y);              // tucked under the bodice, gathers show above it
      const frill = 0.004 * smooth(top - 0.03, top, y) ** 2;
      const p = bodyAt(th, y, 0.003 + out * (0.003 + 0.0018 * g) + frill);
      return { p: [p.x, p.y, p.z], uv: [u * 6, v], shade: 0.9 + 0.1 * g };
    }, true), white);
    const necklinePts = [];
    for (let i = 0; i < 300; i++) {
      const th = (i / 300) * TAU, top = blouseTop(th);
      const p = bodyAt(th, top, 0.0075);
      necklinePts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    dress.add(tube(necklinePts, 0.0032, whiteTrim, true, 600));   // the elastic casing

    // ----- bell sleeves: fitted to the elbow, then a wide bell that hangs longer at the back -----
    for (const sg of [-1, 1]) {
      const S = new THREE.Vector3(sg * 0.140, 1.432, -0.004);       // shoulder (inside the form, so the head grows out of it)
      const E = new THREE.Vector3(sg * 0.222, 1.105, 0.018);        // elbow
      const H = new THREE.Vector3(sg * 0.335, 0.80, 0.03);          // hem centre: hangs a little away from the body
      add(sleevePiece(S, E, 64, 40, (t, phi) => {
        const head = smooth(0, 0.2, t);
        const wr = 0.0028 * Math.sin(9 * phi + t * 6 + P[6]) * smooth(0.15, 0.7, t);
        return { r1: 0.02 + 0.036 * head - 0.010 * t + wr, r2: 0.02 + 0.034 * head - 0.008 * t + wr, shade: 0.93 + 0.07 * Math.sin(9 * phi + t * 6 + P[6]) };
      }), white);
      add(sleevePiece(E, H, 140, 56, (t, phi) => {
        const f = 0.6 * Math.sin(7 * phi + P[7] + t * 1.2) + 0.4 * Math.sin(11 * phi + P[8] - t * 0.8);
        const amp = 0.016 * Math.pow(Math.min(t, 1.2), 1.4);
        return { r1: 0.046 + 0.046 * Math.pow(t, 1.25) + amp * f, r2: 0.046 + 0.104 * Math.pow(t, 1.15) + amp * f, shade: 0.86 + 0.14 * (0.5 + 0.5 * f) };
      }, (phi) => 1 + 0.17 * -Math.sin(phi)), white);              // longer at the back
      // gathered seam where the bell is sewn on, just under the elbow
      const d = H.clone().sub(E).normalize();
      const u1 = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 0, 1)).normalize();
      const u2 = new THREE.Vector3().crossVectors(u1, d).normalize();
      const ring = [];
      for (let i = 0; i < 40; i++) {
        const phi = (i / 40) * TAU, c = E.clone().addScaledVector(d, 0.012);
        ring.push(c.addScaledVector(u1, Math.cos(phi) * 0.0505).addScaledVector(u2, Math.sin(phi) * 0.0515));
      }
      dress.add(tube(ring, 0.0035, whiteTrim, true, 80));
    }

    // ----- bodice -----
    const bodiceOff = (y) => 0.006 + 0.0026 * (1 - smooth(1.034, 1.044, y));    // waistband ridge
    // UVs use a fixed reference radius per piece: the print never shears and never jitters with the folds
    add(gridGeometry(300, 56, (u, v) => {
      const th = Math.PI + u * TAU, top = bodiceTop(th), y = 0.995 + v * (top - 0.995);
      const p = bodyAt(th, y, bodiceOff(y));
      const seamShade = 0.92 + 0.08 * smooth(0.0, 0.006, Math.abs(y - 1.039));
      return { p: [p.x, y, p.z], uv: [(u * TAU * 0.142) / TILE, y / TILE_V], shade: seamShade * corsetShadow(th, y) };
    }, true), fabric);
    const edgePts = [], waistPts = [];
    for (let i = 0; i < 240; i++) {
      const th = (i / 240) * TAU, y = bodiceTop(th);
      const p = bodyAt(th, y, 0.0075);
      edgePts.push(new THREE.Vector3(p.x, y, p.z));
      const w = bodyAt(th, 1.039, 0.0095);
      waistPts.push(new THREE.Vector3(w.x, 1.039, w.z));
    }
    dress.add(tube(edgePts, 0.0026, piping(0.95), true, 480));
    dress.add(tube(waistPts, 0.0015, piping(0.85), true, 360));

    // ----- straps over the blouse -----
    const STRAP_W = 0.032;
    for (const sg of [-1, 1]) {
      add(gridGeometry(6, 70, (u, v) => {
        const x = sg * (NECK_X - 0.004 + u * STRAP_W);
        let yTop = 1.30;                               // highest y where the form is still wider than |x|
        for (let y = 1.30; y < 1.475; y += 0.0005) { if (interp(FORM_A, y) > Math.abs(x) + 0.0015) yTop = y; }
        let y, th;
        if (v < 0.5) {                                 // front: neckline corner up to the shoulder
          const t = 1 - (1 - v / 0.5) ** 2;
          y = 1.205 + (yTop - 1.205) * t;
          th = thetaForX(x, interp(FORM_A, y));
        } else {                                       // back: shoulder down to the back edge
          const t = ((v - 0.5) / 0.5) ** 2;
          y = yTop + (1.305 - yTop) * t;
          th = sg * Math.PI - thetaForX(x, interp(FORM_A, y));
        }
        const p = bodyAt(th, y, 0.013);
        return { p: [p.x, p.y, p.z], uv: [x / TILE, v * 0.75 / TILE_V], shade: 0.96 };
      }, false), fabric);
    }

    // ----- corset: a separate, stiffer piece over the dress, from under the bust to the waist, open at the front -----
    const cTh0 = corGapTh();
    add(gridGeometry(260, 40, (u, v) => {
      const th = cTh0 + u * (TAU - 2 * cTh0);         // runs from the left front edge, round the back, to the right one
      const bot = corBot(th), top = corTop(th), y = bot + v * (top - bot);
      const w = wrapAngle(th);
      let seam = 0;                                    // boning / panel seams
      for (const s of [0.62, 1.35, 2.3]) seam += Math.exp(-(((Math.abs(w) - s) / 0.022) ** 2));
      const edge = Math.min(y - bot, top - y, Math.abs(Math.abs(w) - cTh0) * 0.15);
      const p = bodyAt(th, y, COR_OFF);
      return { p: [p.x, y, p.z], uv: [(th * 0.15) / TILE + 0.5, y / TILE_V + 0.31], shade: (1 - 0.14 * seam) * (0.88 + 0.12 * smooth(0, 0.007, edge)) };
    }, false), fabric);
    // bound edges all round the corset
    const cEdge = (fn, n) => { const pts = []; for (let i = 0; i <= n; i++) pts.push(fn(i / n)); return pts; };
    const onCorset = (th, y) => { const p = bodyAt(th, y, COR_OFF + 0.0012); return new THREE.Vector3(p.x, y, p.z); };
    dress.add(tube(cEdge((t) => { const th = cTh0 + t * (TAU - 2 * cTh0); return onCorset(th, corTop(th)); }, 200), 0.0022, piping(0.9), false, 400));
    dress.add(tube(cEdge((t) => { const th = cTh0 + t * (TAU - 2 * cTh0); return onCorset(th, corBot(th)); }, 200), 0.0022, piping(0.85), false, 400));
    for (const th of [cTh0, TAU - cTh0]) {
      dress.add(tube(cEdge((t) => { const y = corBot(th) + t * (corTop(th) - corBot(th)); return onCorset(th, y); }, 20), 0.0022, piping(0.18), false, 40));
    }

    // ----- lace-up on the corset: eyelets, criss-cross cord, bow and long ties -----
    const surf = (x, y, off) => {                     // point on the corset / bodice / skirt front, plus its normal
      if (y >= 1.0) {
        const p = bodyAt(thetaForX(x, interp(FORM_A, y)), y, off);
        return { v: new THREE.Vector3(p.x, y, p.z), n: new THREE.Vector3(p.nx, 0, p.nz) };
      }
      const th = thetaForX(x, interp(SK_A, y));
      const s = skirtAt(th, y);
      const n = new THREE.Vector3(Math.sin(th), 0.15, Math.cos(th)).normalize();
      return { v: new THREE.Vector3(s.x, y, s.z).addScaledVector(n, off), n };
    };
    const EY = [1.172, 1.142, 1.112, 1.082], EX = CGAP + 0.0065;
    const eyelets = [];
    const ringGeo = new THREE.TorusGeometry(0.0047, 0.0016, 10, 28);
    for (const y of EY) {
      for (const sg of [-1, 1]) {
        const s = surf(sg * EX, y, COR_OFF + 0.0008);
        const r = new THREE.Mesh(ringGeo, metal);
        r.position.copy(s.v);
        r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n);
        r.castShadow = true;
        dress.add(r);
        eyelets.push(s);
      }
    }
    const Ey = (row, side) => eyelets[row * 2 + (side < 0 ? 0 : 1)];
    const bulge = (p, q, amt) => p.v.clone().add(q.v).multiplyScalar(0.5).addScaledVector(p.n, amt);
    for (let r = 0; r < EY.length - 1; r++) {
      for (const sg of [-1, 1]) {
        const p = Ey(r, sg), q = Ey(r + 1, -sg);
        dress.add(tube([p.v, bulge(p, q, 0.004), q.v], 0.0021, cord, false, 24));
      }
    }
    const K = surf(0, 1.058, COR_OFF + 0.004).v;      // the knot of the bow, low on the corset
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 20, 14), cord); knot.position.copy(K); knot.castShadow = true; dress.add(knot);
    for (const sg of [-1, 1]) {
      const last = Ey(EY.length - 1, sg);
      dress.add(tube([last.v, bulge(last, { v: K, n: last.n }, 0.003), K], 0.0021, cord, false, 20));
      const o = (dx, dy, dz) => K.clone().add(new THREE.Vector3(sg * dx, dy, dz));
      dress.add(tube([K, o(0.016, 0.010, 0.004), o(0.038, 0.014, 0.007), o(0.052, 0.003, 0.007), o(0.044, -0.010, 0.006), o(0.020, -0.007, 0.004), K], 0.0024, cord, false, 60));
      const tie = [K];
      const endY = sg < 0 ? 0.80 : 0.75;
      for (let y = 1.04; y >= endY; y -= 0.025) {
        const x = sg * (0.006 + 0.012 * smooth(1.06, 0.95, y)) + 0.004 * Math.sin(y * 31 + sg);
        // over the corset, then over its bottom edge onto the skirt
        tie.push(surf(x, y, y >= 1.022 ? COR_OFF + 0.003 : y >= 1.0 ? 0.0118 : 0.0075).v);
      }
      dress.add(tube(tie, 0.0022, cord, false, 120));
      const end = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 12, 10), cord); end.position.copy(tie[tie.length - 1]); dress.add(end);
    }

    // ----- skirt: gathered at the waist, folds deepen towards the hem -----
    add(gridGeometry(360, 110, (u, v) => {
      const th = Math.PI + u * TAU, y = 0.30 + v * (1.022 - 0.30);
      const s = skirtAt(th, y);
      const inner = 0.82 + 0.18 * smooth(0.32, 0.9, y);
      return { p: [s.x, y, s.z], uv: [(u * TAU * 0.235) / TILE, y / TILE_V], shade: s.shade * inner * corsetShadow(th, y) };
    }, true), fabric);

    // ----- ruffle tier at the hem -----
    add(gridGeometry(480, 40, (u, v) => {
      const th = Math.PI + u * TAU, yh = ruffleHemY(th), y = yh + v * (0.318 - yh);
      const s = ruffleAt(th, y);
      return { p: [s.x, y, s.z], uv: [(u * TAU * 0.345) / TILE + 0.37, y / TILE_V], shade: s.shade * (0.9 + 0.1 * v) };
    }, true), fabric);
    const ruffleSeam = [], hemPts = [];
    for (let i = 0; i < 480; i++) {
      const th = (i / 480) * TAU;
      const r = ruffleAt(th, 0.312), h = ruffleAt(th, ruffleHemY(th));
      const k = 1 + 0.0035 / r.r;
      ruffleSeam.push(new THREE.Vector3(r.x * k, 0.312, r.z * k));
      hemPts.push(new THREE.Vector3(h.x, ruffleHemY(th), h.z));
    }
    dress.add(tube(ruffleSeam, 0.0028, piping(1.95), true, 600));
    dress.add(tube(hemPts, 0.0022, piping(2.4), true, 900));

    // ground: only the soft shadow is visible
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.ShadowMaterial({ opacity: 0.17 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ----- loop, resize, camera moves -----
    function resize() {
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w / h < 0.75 ? 38 : 30;          // narrow screens: wider lens so the whole dress fits
      camera.updateProjectionMatrix();
      needsRender = true;
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    function focus(name) {
      const v = VIEWS[name];
      if (!v) return;
      controls.autoRotate = false;
      const p1 = new THREE.Vector3(...v.pos), t1 = new THREE.Vector3(...v.target);
      if (reduce) { camera.position.copy(p1); controls.target.copy(t1); needsRender = true; return; }
      tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, start: performance.now(), dur: 1100 };
    }

    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (tween) {
        const k = clamp((now - tween.start) / tween.dur, 0, 1);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camera.position.lerpVectors(tween.p0, tween.p1, e);
        controls.target.lerpVectors(tween.t0, tween.t1, e);
        if (k >= 1) tween = null;
        needsRender = true;
      }
      controls.update();
      if (needsRender || controls.autoRotate) {
        renderer.render(scene, camera);
        needsRender = false;
      }
    }
    raf = requestAnimationFrame(frame);

    function destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => m.dispose());
      });
      [print, weave, envTex, ...extraTex].forEach((t) => t.dispose());
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }

    return { focus, destroy };
  }

  window.KedamDress3D = { mount };
})();
