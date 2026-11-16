'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../theme/verdant');
const context = vm.createContext({});
for (const file of ['core/corners.js', 'ui/viewport.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const records = [];
const graphics = {
  FillPolygon(color, mode, points) { records.push(['fill', color, mode, Array.from(points)]); },
  DrawPolygon(color, width, points) { records.push(['stroke', color, width, Array.from(points)]); },
};

context.ssFillContinuousRect(graphics, 10, 20, 160, 72, 24, 24, 0x80ffffff);
const [kind, color, , points] = records[0];
assert.equal(kind, 'fill');
assert.equal(color, 0x80ffffff);
assert.equal(records.length, 1, 'translucent controls must fill once');
assert.deepEqual(points.slice(0, 2), [146, 20]);
for (let i = 0; i < points.length; i += 2) {
  assert.ok(points[i] >= 10 && points[i] <= 170 && points[i + 1] >= 20 && points[i + 1] <= 92);
}
// Near a join, the vertical departure is cubic in the horizontal travel.
// A circular arc would start quadratically and have nonzero curvature at the join.
for (const u of [.02, .04, .1, .4]) {
  const v = context.ssCornerDepth(u);
  assert.ok(Math.abs(u ** 3 + (1 - v) ** 3 - 1) < 1e-9);
  if (u <= .04) assert.ok(v / u ** 2 < .02);
}

const translated = context.ssTranslatedGraphics(graphics, 10, 20);
context.ssStrokeContinuousRect(translated, 10, 20, 160, 72, 24, 24, 1.5, 0xff000000);
const [stroke, , width, translatedPoints] = records[1];
assert.equal(stroke, 'stroke');
assert.equal(width, 1.5);
assert.deepEqual(translatedPoints, points.map((p, i) => p - (i % 2 ? 20 : 10)));
console.log('PASS continuous corners, single alpha fill, translated outline');
