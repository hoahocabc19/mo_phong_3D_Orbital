// sketch.js — Updated: Enhanced 3D Depth using lighting contrast and a reflective central nucleus.

const FONT_FALLBACK_NAME = 'Arial, sans-serif';
// Use the font URL you confirmed earlier
const fontUrl = 'https://assets.editor.p5js.org/6809a48b6c699fd6d22a7d6d/33437a01-2c49-41ed-a962-1488fedab0b7.ttf?v=1759252598080';

let fontLocal = null;

let ui = {};
let positions = null;
let sizes = null;
let sampleCount = 0;
let sampleTarget = 0;
let sampling = false;

let autoRotate = true;
let rotX = -0.35;
let rotY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let camZoom = 1.0;

let cnv;

// label textures
let lblXgfx, lblYgfx, lblZgfx;
// increased label texture size for larger, crisper labels
let lblTexW = 160, lblTexH = 64;

let lastLabelScreenPositions = null;

const a0 = 40;
// Độ phân giải hình cầu thấp để tăng hiệu suất
let sphereResolution = 6;

const CHUNK_SAMPLES = 3000;
const ATTEMPTS_PER_CHUNK = 200000;
const VIEW_MARGIN = 0.92;

const DEBUG_LABEL = false;

let progressDiv = null;
let statusDiv = null;

function preload() {
  try {
    // loadFont remains but we avoid logging on success to keep console clean
    fontLocal = loadFont(fontUrl,
      (f) => {
        fontLocal = f;
        // no console.log here (silenced as requested)
      },
      (err) => {
        console.warn('Could not load font from', fontUrl, err);
        fontLocal = null;
      }
    );
  } catch (e) {
    console.warn('loadFont threw', e);
    fontLocal = null;
  }
}

function setup() {
  progressDiv = select('#progress');
  statusDiv = select('#status');
  setProgress('Đang tải...');
  setStatus('setup: starting');

  cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  // make canvas cover full viewport
  try {
    cnv.position(0, 0);
    cnv.style('position', 'fixed');
    cnv.style('top', '0px');
    cnv.style('left', '0px');
    cnv.style('width', '100%');
    cnv.style('height', '100%');
    cnv.style('display', 'block');
    // keep it behind any UI by default; adjust z-index if needed
    cnv.style('z-index', '0');
  } catch (e) {
    // style/setPosition may fail silently in some embed environments
  }
  cnv.elt.setAttribute('aria-label', 'Orbital Canvas');

  if (fontLocal) {
    textFont(fontLocal);
    // don't display a "Ready" message in statusDiv; keep it hidden unless there is an issue
  } else {
    textFont(FONT_FALLBACK_NAME);
    // if font missing, show useful hint to user
    setStatus('assets font not loaded — using system fallback.\nIf you want the exact font, upload Arial.ttf to Assets.');
  }

  smooth();
  createLabelGraphics();

  if (typeof sphereDetail === 'function') {
    try { sphereDetail(sphereResolution); } catch (e) {}
  }

  setupUI();

  if (select('#nInput')) createOrbitalFromUI();

  setProgress('');
  // Hide status box by default (it will appear only for warnings/errors)
  if (statusDiv) statusDiv.style('display', 'none');
}

function setStatus(text, append = false) {
  if (!statusDiv) return;
  if (!text) {
    statusDiv.style('display', 'none');
    return;
  }
  if (append) statusDiv.html(statusDiv.html() + "\n" + text);
  else statusDiv.html(text);
  statusDiv.style('display', 'block');
}
function setProgress(text) {
  if (!progressDiv) return;
  if (text) {
    progressDiv.html(text);
    progressDiv.style('display', 'block');
  } else {
    progressDiv.style('display', 'none');
  }
}

function createLabelGraphics() {
  lblXgfx = createGraphics(lblTexW, lblTexH);
  lblYgfx = createGraphics(lblTexW, lblTexH);
  lblZgfx = createGraphics(lblTexW, lblTexH);

  [lblXgfx, lblYgfx, lblZgfx].forEach(g => {
    g.pixelDensity(1);
    g.clear();
    g.textFont(fontLocal || 'Arial');
    g.textAlign(CENTER, CENTER);
  });

  drawLabelToGraphics(lblXgfx, 'x');
  drawLabelToGraphics(lblYgfx, 'y');
  drawLabelToGraphics(lblZgfx, 'z');
}

function drawLabelToGraphics(g, label) {
  g.clear();
  // increased font size for labels
  const fontSize = 30;
  g.textSize(fontSize);
  g.noStroke();
  g.fill(0, 140);
  g.text(label, g.width * 0.5 + 1.6, g.height * 0.5 + 1.6);
  g.fill(255);
  g.text(label, g.width * 0.5, g.height * 0.5);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (sampleCount > 0) fitViewToPoints();
}

function setupUI() {
  ui.nInput = select('#nInput');
  ui.lInput = select('#lInput');
  ui.mInput = select('#mInput');
  ui.electronSizeInput = select('#electronSizeInput');
  ui.numElectronsInput = select('#numElectronsInput');
  ui.createBtn = select('#createBtn');
  ui.toggleRotateBtn = select('#toggleRotateBtn');

  if (ui.createBtn) ui.createBtn.mousePressed(() => createOrbitalFromUI());
  if (ui.toggleRotateBtn) ui.toggleRotateBtn.mousePressed(() => {
    autoRotate = !autoRotate;
    ui.toggleRotateBtn.html(autoRotate ? 'Tắt xoay tự động' : 'Bật xoay tự động');
  });

  if (ui.nInput) ui.nInput.input(() => {
    let n = int(ui.nInput.value());
    if (n < 1) ui.nInput.value(1);
    if (int(ui.lInput.value()) > n - 1) ui.lInput.value(max(0, n - 1));
  });
  if (ui.lInput) ui.lInput.input(() => {
    let l = int(ui.lInput.value());
    if (l < 0) ui.lInput.value(0);
    let n = max(1, int(ui.nInput.value()));
    if (l > n - 1) ui.lInput.value(n - 1);
    let absM = abs(int(ui.mInput.value()));
    if (absM > int(ui.lInput.value())) ui.mInput.value(0);
  });
  if (ui.mInput) ui.mInput.input(() => {
    let m = int(ui.mInput.value());
    let l = max(0, int(ui.lInput.value()));
    if (abs(m) > l) ui.mInput.value(0);
  });
}

function draw() {
  background(0);
  
  // Ánh sáng môi trường giảm xuống 50 (trước là 70) để tăng tương phản
  ambientLight(50);
  // Ánh sáng định hướng mạnh mẽ
  directionalLight(220, 220, 240, -0.5, -0.6, -1); 
  pointLight(255, 255, 255, 0, -400, 600);
  pointLight(140, 140, 160, -400, -200, -300);

  push();
  scale(camZoom);
  // Tăng tốc độ quay tự động từ 0.0035 lên 0.0055 để bù đắp cho FPS thấp khi có nhiều electron
  if (autoRotate && !isDragging) rotY += 0.0055; 
  rotateY(rotY);
  rotateX(rotX);

  const axisLen = computeAxisLength90();
  drawAxes(axisLen);

  // --- 1. Hạt nhân (Nucleus) làm điểm neo chiều sâu ---
  push();
  noStroke();
  // Vật liệu: Cực kỳ sáng bóng, hơi vàng/trắng để tạo điểm nhấn
  ambientMaterial(255, 180, 180); 
  specularMaterial(255, 200, 100); 
  // Độ bóng cực cao, phản chiếu ánh sáng mạnh mẽ
  shininess(150); 
  // Vẽ hạt nhân
  sphere(a0 * 0.1); 
  pop();
  // --- End Nucleus ---

  if (sampleCount > 0) {
    
    if (typeof sphereDetail === 'function') {
      try { sphereDetail(sphereResolution); } catch (e) {} // sphereResolution = 6
    }

    // --- 2. Vật liệu Electron (Giảm ambient, giữ shininess cao) ---
    noStroke();
    // Electron màu trắng/xanh nhạt hơn, hơi tối hơn để điểm sáng 80 pop lên
    ambientMaterial(200, 200, 255); 
    specularMaterial(255);
    // Độ bóng cao cho electron (tạo cảm giác hình khối, sâu)
    shininess(80); 
    
    for (let i=0;i<sampleCount;i++){
      const idx = i*3;
      push();
      translate(positions[idx], positions[idx+1], positions[idx+2]);
      sphere(max(0.2, sizes[i]));
      pop();
    }
  }

  drawAxisLabelSprite(axisLen);
  pop();

  if (DEBUG_LABEL && lastLabelScreenPositions) {
    push(); resetMatrix(); noStroke(); fill(255,0,0);
    if (lastLabelScreenPositions.pX) ellipse(lastLabelScreenPositions.pX.x, lastLabelScreenPositions.pX.y,6,6);
    if (lastLabelScreenPositions.pY) ellipse(lastLabelScreenPositions.pY.x, lastLabelScreenPositions.pY.y,6,6);
    if (lastLabelScreenPositions.pZ) ellipse(lastLabelScreenPositions.pZ.x, lastLabelScreenPositions.pZ.y,6,6);
    if (lastLabelScreenPositions.origin) ellipse(lastLabelScreenPositions.origin.x, lastLabelScreenPositions.origin.y,4,4);
    pop();
  }

  if (sampling) {
    if (progressDiv) {
      progressDiv.show();
      progressDiv.html(`Lấy mẫu: ${sampleCount} / ${sampleTarget} (${nf((sampleCount/max(1,sampleTarget))*100,1,1)}%)`);
    }
  } else {
    if (progressDiv) progressDiv.hide();
  }
}

function drawAxes(length) {
  strokeWeight(2);
  push(); stroke(200,80,80); line(-length,0,0,length,0,0); pop();
  push(); stroke(80,200,120); line(0,-length,0,0,length,0); pop();
  push(); stroke(100,140,240); line(0,0,-length,0,0,length); pop();
}

function drawAxisLabelSprite(axisLen) {
  const worldX = createVector(axisLen,0,0);
  const worldY = createVector(0,-axisLen,0);
  const worldZ = createVector(0,0,axisLen);

  lastLabelScreenPositions = {
    pX: worldToScreen(worldX.x, worldX.y, worldX.z),
    pY: worldToScreen(worldY.x, worldY.y, worldY.z),
    pZ: worldToScreen(worldZ.x, worldZ.y, worldZ.z),
    origin: worldToScreen(0,0,0) || {x: width*0.5, y: height*0.5}
  };

  // larger on-screen plane size to match increased font size
  const labelPixelWidth = 72;
  const labelPixelHeight = 40;
  const invScale = 1.0 / max(0.0001, camZoom);

  noLights();
  try { hint(DISABLE_DEPTH_TEST); } catch(e) {}

  // adjusted offsets a bit to look good with bigger label plane
  push(); translate(worldX.x, worldX.y, worldX.z); rotateX(-rotX); rotateY(-rotY); scale(invScale); translate(12,-10,0); noStroke(); texture(lblXgfx); plane(labelPixelWidth,labelPixelHeight); pop();
  push(); translate(worldY.x, worldY.y, worldY.z); rotateX(-rotX); rotateY(-rotY); scale(invScale); translate(-10,-14,0); noStroke(); texture(lblYgfx); plane(labelPixelWidth,labelPixelHeight); pop();
  push(); translate(worldZ.x, worldZ.y, worldZ.z); rotateX(-rotX); rotateY(-rotY); scale(invScale); translate(12,-10,0); noStroke(); texture(lblZgfx); plane(labelPixelWidth,labelPixelHeight); pop();

  // Dòng này đã được sửa lỗi: Bỏ dấu '}' thừa
  try { hint(ENABLE_DEPTH_TEST); } catch(e) {}
}

function worldToScreen(x,y,z) {
  try {
    const sx = screenX(x,y,z);
    const sy = screenY(x,y,z);
    const convX = sx + width*0.5;
    const convY = sy + height*0.5;
    if (!isFinite(convX) || !isFinite(convY)) return null;
    return { x: convX, y: convY };
  } catch (e) { return null; }
}

// ---------------- sampling / orbital functions ----------------

function createOrbitalFromUI() {
  if (!ui.nInput || !ui.lInput || !ui.mInput || !ui.numElectronsInput || !ui.electronSizeInput) {
    console.warn('UI inputs missing');
    return;
  }

  const n = max(1, int(ui.nInput.value()));
  const l = max(0, int(ui.lInput.value()));
  const m = int(ui.mInput.value());
  const electronSize = max(0.1, float(ui.electronSizeInput.value()));
  let numElectrons = int(ui.numElectronsInput.value());
  numElectrons = constrain(numElectrons, 1, 2000000);

  if (l >= n) return;
  if (abs(m) > l) return;

  positions = new Float32Array(numElectrons * 3);
  sizes = new Float32Array(numElectrons);
  sampleCount = 0;
  sampleTarget = numElectrons;
  sampling = true;

  const estAxis = estimateAxisLenFromQuantum(n, l);
  fitViewToAxisLen(estAxis);

  setTimeout(() => {
    sampleOrbitalChunked(n, l, m, numElectrons, electronSize, () => {
      sampling = false;
      fitViewToPoints();
    });
  }, 10);
}

function sampleOrbitalChunked(n, l, m, numSamples, electronSize, onDone) {
  const k = 2 * l + 1;
  const thetaScale = (n * a0) / 2.0;
  const maxAngular = estimateMaxAngular(l, m, 500) * 1.2;
  const radialScale = radialLScale(l);

  function chunk() {
    const stopIndex = Math.min(numSamples, sampleCount + CHUNK_SAMPLES);
    let attemptsThisChunk = 0;
    while (sampleCount < stopIndex && attemptsThisChunk < ATTEMPTS_PER_CHUNK) {
      attemptsThisChunk++;
      let sumExp = 0;
      for (let i=0;i<k;i++){
        let u = random();
        if (u <= 1e-12) u = 1e-12;
        sumExp += -Math.log(u);
      }
      let r = thetaScale * sumExp * radialScale;
      let accepted = false;
      let thetaS = 0, phiS = 0;
      for (let aTry = 0; aTry < 20; aTry++) {
        const cosT = random(-1,1);
        thetaS = acos(cosT);
        phiS = random(0, TWO_PI);
        const ang = angularProb(thetaS, phiS, l, m);
        if (random() < ang / maxAngular) { accepted = true; break; }
      }
      if (!accepted) continue;

      const x = r * sin(thetaS) * cos(phiS);
      const y = r * sin(thetaS) * sin(phiS);
      const z = r * cos(thetaS);
      const idx = sampleCount * 3;
      positions[idx] = x;
      positions[idx+1] = y;
      positions[idx+2] = z;
      sizes[sampleCount] = electronSize;
      sampleCount++;
    }

    if (sampleCount < numSamples) {
      if (attemptsThisChunk >= ATTEMPTS_PER_CHUNK) setTimeout(chunk, 10);
      else setTimeout(chunk, 0);
    } else {
      if (sampleCount < numSamples) {
        const rMax = Math.max(1, n * n * a0 * 1.8);
        for (let i = sampleCount; i < numSamples; i++) {
          let rr = rMax * pow(random(), 1.0 / 3.0) * radialScale;
          const theta2 = acos(random(-1,1));
          const phi2 = random(0, TWO_PI);
          const idx = i*3;
          positions[idx] = rr * sin(theta2) * cos(phi2);
          positions[idx+1] = rr * sin(theta2) * sin(phi2);
          positions[idx+2] = rr * cos(theta2);
          sizes[i] = electronSize;
        }
        sampleCount = numSamples;
      }
      onDone && onDone();
    }
  }
  chunk();
}

function estimateMaxAngular(l, m, trialCount = 400) {
  let maxVal = 1e-20;
  for (let i=0;i<trialCount;i++){
    const cosT = random(-1,1);
    const theta = acos(cosT);
    const phi = random(0, TWO_PI);
    const v = angularProb(theta, phi, l, m);
    if (v > maxVal) maxVal = v;
  }
  return maxVal;
}

function angularProb(theta, phi, l, m) {
  const x = cos(theta);
  const mm = abs(m);
  const Plm = associatedLegendre(l, mm, x);
  let ang = Plm;
  if (m > 0) ang *= cos(m * phi);
  else if (m < 0) ang *= sin(mm * phi);
  return ang * ang + 1e-30;
}

function associatedLegendre(l, m, x) {
  if (m > l) return 0;
  let pmm = 1.0;
  if (m > 0) {
    let somx2 = sqrt(max(0, 1 - x * x));
    let fact = 1.0;
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2.0;
    }
  }
  if (l === m) return pmm;
  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;
  let plmPrev = pmm;
  let plm = pmmp1;
  for (let ll = m + 2; ll <= l; ll++) {
    let plnew = ((2 * ll - 1) * x * plm - (ll + m - 1) * plmPrev) / (ll - m);
    plmPrev = plm;
    plm = plnew;
  }
  return plm;
}

function computeAxisLength90() {
  if (!positions || sampleCount === 0) return 180;
  const n = sampleCount;
  const sampleCountMax = min(n, 50000);
  const step = Math.max(1, Math.floor(n / sampleCountMax));
  const arr = [];
  for (let i = 0; i < n; i += step) {
    const idx = i * 3;
    const r = sqrt(positions[idx] * positions[idx] + positions[idx+1] * positions[idx+1] + positions[idx+2] * positions[idx+2]);
    arr.push(r);
  }
  arr.sort((a,b)=>a-b);
  const idx = Math.max(0, Math.floor(0.9 * arr.length) - 1);
  let r90 = arr[idx] || 0;
  return max(r90 * 1.12, 120);
}


function fitViewToAxisLen(axisLen) {
  if (!axisLen || axisLen <= 0) return;
  const halfScreen = Math.min(windowWidth, windowHeight) * 0.5;
  const targetZoom = (halfScreen * VIEW_MARGIN) / axisLen;
  camZoom = constrain(targetZoom, 0.05, 12.0);
}

function fitViewToPoints() {
  const axisLen = computeAxisLength90();
  if (axisLen > 0) fitViewToAxisLen(axisLen);
}

function radialLScale(l) {
  if (!l || l <= 0) return 1.0;
  const factorPerL = 0.06;
  return Math.max(0.6, 1.0 - factorPerL * l);
}

// Estimate axis length from quantum numbers (heuristic)
function estimateAxisLenFromQuantum(n, l) {
  const k = 2 * l + 1;
  const thetaScale = (n * a0) / 2.0;
  const radialScale = radialLScale(l);
  const factorCover = 3.0;
  const estR = thetaScale * k * factorCover * radialScale;
  return max(estR * 1.12, 120);
}

/* Interaction handlers */

// Helper: check if a DOM event target is the canvas (or inside it)
function _eventIsOnCanvas(event) {
  if (!cnv || !cnv.elt || !event) return false;
  let el = event.target || null;
  // If there's no target, fall back to coordinate hit-test
  if (!el) return false;
  // If the element clicked is the canvas or a child of the canvas element, treat as canvas click
  if (el === cnv.elt) return true;
  if (cnv.elt.contains && cnv.elt.contains(el)) return true;
  return false;
}

// Updated: prevent starting manual rotation when clicking on UI elements.
// We only start dragging when the left mouse button is pressed and the click target is the canvas element.
function mousePressed(event) {
  // accept both p5's global mouseButton and the DOM event's button for robustness
  const isLeft = (typeof event === 'object' && event !== null && 'button' in event) ? (event.button === 0) : (mouseButton === LEFT);
  if (!isLeft) return;

  // If the click wasn't on the canvas (i.e., on some UI DOM element), don't start dragging.
  if (!_eventIsOnCanvas(event)) {
    return;
  }

  // ensure coordinates are inside canvas area
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    isDragging = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
}
function mouseReleased() { isDragging = false; }
function mouseDragged(event) {
  // Only drag-rotate if we started dragging on the canvas (isDragging true).
  if (isDragging) {
    const dx = mouseX - lastMouseX;
    const dy = mouseY - lastMouseY;
    rotY += dx * 0.01;
    rotX += dy * 0.01;
    rotX = constrain(rotX, -PI/2.0, PI/2.0); // Limit vertical rotation
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
  return false;
}
function mouseWheel(event) {
  camZoom *= event.delta > 0 ? 0.95 : 1.05;
  camZoom = constrain(camZoom, 0.05, 12.0);
  return false;
}
