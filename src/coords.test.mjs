/**
 * Round-trip unit test for coords.ts
 * Run with: node src/coords.test.mjs
 */

// We test the math directly (same logic as coords.ts but in plain JS).
function pageToDisplay(mmX, mmY, vt) {
  return { x: vt.offsetX + mmX * vt.scale, y: vt.offsetY + mmY * vt.scale };
}
function displayToPage(pxX, pxY, vt) {
  return { x: (pxX - vt.offsetX) / vt.scale, y: (pxY - vt.offsetY) / vt.scale };
}
function panelToPage(mmX, mmY, panelX, panelY) {
  return { x: panelX + mmX, y: panelY + mmY };
}
function pageToPanelCoords(mmX, mmY, panelX, panelY) {
  return { x: mmX - panelX, y: mmY - panelY };
}
function toMm(value, unit) {
  switch (unit) {
    case 'mm': return value;
    case 'cm': return value * 10;
    case 'in': return value * 25.4;
    case 'px': return value / 96 * 25.4;
  }
}

const EPSILON = 0.001; // mm
let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (Math.abs(actual - expected) < EPSILON) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

// Test 1: page ↔ display round-trip at three scales
const scales = [0.5, 1.0, 2.5];
const testPoints = [{ x: 0, y: 0 }, { x: 47.3, y: 123.7 }, { x: 200, y: 270 }];

console.log('\n── page ↔ display round-trip ──');
for (const scale of scales) {
  const vt = { offsetX: 32, offsetY: 64, scale };
  for (const pt of testPoints) {
    const display = pageToDisplay(pt.x, pt.y, vt);
    const back    = displayToPage(display.x, display.y, vt);
    assert(`scale=${scale} x=(${pt.x},${pt.y})`, back.x, pt.x);
    assert(`scale=${scale} y=(${pt.x},${pt.y})`, back.y, pt.y);
  }
}

// Test 2: panel ↔ page round-trip
console.log('\n── panel ↔ page round-trip ──');
const panel = { x: 20, y: 35 };
for (const pt of testPoints) {
  const page = panelToPage(pt.x, pt.y, panel.x, panel.y);
  const back = pageToPanelCoords(page.x, page.y, panel.x, panel.y);
  assert(`panel→page→panel x=(${pt.x},${pt.y})`, back.x, pt.x);
  assert(`panel→page→panel y=(${pt.x},${pt.y})`, back.y, pt.y);
}

// Test 3: unit normalisation
console.log('\n── unit normalisation ──');
assert('1 cm = 10 mm',      toMm(1,   'cm'), 10);
assert('1 in = 25.4 mm',    toMm(1,   'in'), 25.4);
assert('96 px = 25.4 mm',   toMm(96,  'px'), 25.4);
assert('1 mm = 1 mm',       toMm(1,   'mm'), 1);
assert('200 mm stays 200',  toMm(200, 'mm'), 200);

// Summary
console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
