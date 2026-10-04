// Проверка на ядрото без браузър: node tests/core.test.js
global.window = global;
require('../js/util.js'); require('../js/core.js');
var assert = require('assert');
// Дубликат излиза от маршрута само след клик върху маркера му (t.skips). Проверките за
// махнат дубликат минават с всички намерени дубликати решени - както след кликовете.
function decided(tracks, tol) {
  var r0 = Core.analyze(tracks, tol);
  r0.pend.forEach(function (s) {
    var t = tracks.filter(function (x) { return x.id === s.trackId; })[0];
    t.skips = Core.mergeIv((t.skips || []).concat([{ a: s.a, b: s.b }]));
  });
  return Core.analyze(tracks, tol);
}
function line(lat0, lon0, lat1, lon1, n, jitter) {
  var p = [];
  for (var i = 0; i <= n; i++) {
    var f = i / n, j = jitter ? (Math.sin(i * 7.3) * jitter) : 0;
    p.push([lat0 + f * (lat1 - lat0) + j, lon0 + f * (lon1 - lon0), 500 + i]);
  }
  return p;
}
// Трак А: 0..0.05 по дължина (около 4 км) на изток.
var A = { id: 'A', pts: line(42.5, 24.70, 42.5, 24.75, 200) };
// Трак Б: върви 1 км успоредно на А на 10 м (дубликат), после се отделя на север.
var B = { id: 'B', pts: line(42.50009, 24.71, 42.50009, 24.73, 80).concat(line(42.50009, 24.7302, 42.53, 24.73, 120)) };
// Трак В: същото като Б, но на 35 м и в обратна посока.
var C = { id: 'C', pts: line(42.50031, 24.735, 42.50031, 24.745, 40) .reverse() };
var r = decided([A, B, C], 20, []);
function kinds(id) { return r.byTrack[id].filter(function (s) { return s.kind !== 'gap'; }).map(function (s) { return s.kind + ':' + Math.round(s.a) + '-' + Math.round(s.b) + (s.withId ? '@' + s.withId + '/' + s.dir : ''); }); }
console.log('A', kinds('A')); console.log('B', kinds('B')); console.log('C', kinds('C'));
// А се дели на две части там, където Б се отделя от него (точка на прекъсване).
assert.deepStrictEqual(r.byTrack.A.map(function (s) { return s.kind; }), ['part', 'part']);
var bEnd = Core.pointAt(B, r.byTrack.B[0].b);
assert.ok(r.junctions.some(function (j) { return U.hav(j.lat, j.lon, bEnd[0], bEnd[1]) < 30 && j.branches.length === 3; }), 'точка на прекъсване там, където Б се отделя от А');
assert.strictEqual(r.byTrack.B[0].kind, 'dup'); assert.strictEqual(r.byTrack.B[0].withId, 'A');
assert.strictEqual(r.byTrack.B[1].kind, 'part');
assert.ok(r.byTrack.C.every(function (s) { return s.kind === 'part'; }), 'при 20 м В е различен');
var r40 = decided([A, B, C], 40, []);
console.log('C@40', r40.byTrack.C.map(function (s) { return s.kind + '/' + s.dir; }));
assert.strictEqual(r40.byTrack.C[0].kind, 'dup'); assert.strictEqual(r40.byTrack.C[0].dir, 'обратна');
// Дубликатът не се връща: няма поле kept, не е част, а стар трети аргумент (overrides) не пречи.
var d = r.byTrack.B[0];
var r2 = decided([A, B, C], 20, [{ trackId: 'B', a: d.a, b: d.b }]);
assert.strictEqual(Core.analyze.length, 2, 'analyze няма параметър overrides');
assert.ok(r2.dups.every(function (s) { return !('kept' in s); }), 'дубликатът няма поле kept');
assert.ok(r2.parts.every(function (s) { return s.kind === 'part'; }), 'дубликат не влиза в частите');
assert.strictEqual(r2.byTrack.B[0].kind, 'dup');
assert.ok(Core.invalidShare({ trackId: 'B', a: d.a, b: d.b }, r2).bad, 'част върху дубликат е невалидна');
// Изрязване (от 1.3.2 - изтрит участък, t.dels).
A.dels = [{ a: 0, b: 1000 }];
var r3 = decided([A, B, C], 20, []);
console.log('A cut', kinds('A').length, r3.byTrack.A.map(function (s) { return s.kind + ':' + Math.round(s.a); }));
assert.strictEqual(r3.byTrack.A[0].kind, 'del'); assert.strictEqual(Math.round(r3.byTrack.A[1].a), 1000);
delete A.dels;
// Връщане по същия път в същия трак.
var out = line(42.6, 24.7, 42.6, 24.72, 80), back = line(42.60005, 24.72, 42.60005, 24.70, 80);
var S = { id: 'S', pts: out.concat(back) };
var r4 = decided([S], 20, []);
console.log('S', r4.byTrack.S.map(function (s) { return s.kind + ':' + Math.round(s.a) + '-' + Math.round(s.b) + (s.withId ? '@' + s.withId : ''); }));
assert.strictEqual(r4.byTrack.S[r4.byTrack.S.length - 1].kind, 'dup');
// Геометрия на маршрут и дупка.
var byId = { A: A, B: B, C: C };
var g = Core.routeGeometry({ items: [{ type: 'part', trackId: 'A', a: 1000, b: 2000 }, { type: 'part', trackId: 'B', a: 2000, b: 3000 }] }, byId, r3);
console.log('route len', Math.round(g.len), 'gaps', g.gaps.map(function (x) { return Math.round(x.d); }));
assert.strictEqual(g.gaps.length, 1, 'без обща отсечка дупката си остава');
assert.ok(!g.items.some(function (x) { return x.shared; }));

// Обща отсечка: X върви на изток; Z тръгва от края на X на юг; Y слиза от север до X,
// минава 800 м по X (дубликат) и се отделя на североизток.
var X = { id: 'X', pts: line(42.7, 24.70, 42.7, 24.72, 100) };
var Z = { id: 'Z', pts: line(42.7, 24.72, 42.69, 24.72, 60) };
var Y = { id: 'Y', pts: line(42.71, 24.71, 42.70009, 24.71, 60).concat(line(42.70009, 24.7101, 42.70009, 24.72, 60), line(42.7003, 24.7201, 42.71, 24.73, 60)) };
var rs = decided([X, Z, Y], 20);
var ys = rs.byTrack.Y.filter(function (s) { return s.kind !== 'gap'; });
console.log('Y', ys.map(function (s) { return s.kind + ':' + Math.round(s.a) + '-' + Math.round(s.b); }));
assert.deepStrictEqual(ys.map(function (s) { return s.kind; }), ['part', 'dup', 'part']);
var yDup = ys[1], y1 = ys[0], y2 = ys[2], zp = rs.byTrack.Z.filter(function (s) { return s.kind === 'part'; })[0];
var byS = { X: X, Y: Y, Z: Z };
function P(s, rev) { return { type: 'part', trackId: s.trackId, a: s.a, b: s.b, rev: !!rev }; }
function checkShared(name, items, trackId) {
  var route = { items: items };
  var gs = Core.routeGeometry(route, byS, rs);
  var sh = gs.items.filter(function (x) { return x.shared; });
  var parts = gs.items.filter(function (x) { return !x.shared; });
  var sum = parts.reduce(function (acc, x) { return acc + x.len; }, 0);
  console.log(name, 'len', Math.round(gs.len), 'parts', Math.round(sum), 'shared', sh.map(function (x) { return x.item.trackId + ' ' + Math.round(x.len); }), 'gaps', gs.gaps.length);
  assert.strictEqual(gs.gaps.length, 0, name + ': няма дупка');
  assert.strictEqual(sh.length, 1, name + ': една обща отсечка');
  assert.strictEqual(sh[0].item.trackId, trackId);
  assert.strictEqual(sh[0].idx, null, name + ': общата отсечка не е в route.items');
  assert.strictEqual(route.items.length, items.length, name + ': route.items не се пипа');
  assert.ok(Math.abs(sh[0].len - yDup.len) < 5, name + ': дължината на общата отсечка');
  assert.ok(Math.abs(gs.len - (sum + yDup.len)) < 60, name + ': дължината включва общата отсечка веднъж');
  // Непрекъснато: съседните точки са близо навсякъде.
  for (var i = 1; i < gs.pts.length; i++) assert.ok(U.hav(gs.pts[i - 1][0], gs.pts[i - 1][1], gs.pts[i][0], gs.pts[i][1]) <= 30, name + ': скок при точка ' + i);
  // Посоката: първата точка на общата отсечка е при края на предишната част.
  var prevPart = gs.items[gs.items.indexOf(sh[0]) - 1];
  var e = prevPart.pts[prevPart.pts.length - 1], f = sh[0].pts[0], l = sh[0].pts[sh[0].pts.length - 1];
  assert.ok(U.hav(e[0], e[1], f[0], f[1]) < U.hav(e[0], e[1], l[0], l[1]), name + ': посоката на общата отсечка');
}
// Точки на прекъсване: там, където Y се събира с X, и там, където се дели (край на X, начало на Z).
var J1 = Core.pointAt(Y, yDup.a), J2 = Core.pointAt(Y, yDup.b);
function jAt(res, q) { return res.junctions.filter(function (j) { return U.hav(j.lat, j.lon, q[0], q[1]) < 30; })[0]; }
var j1 = jAt(rs, J1), j2 = jAt(rs, J2);
console.log('junctions', rs.junctions.map(function (j) { return j.key + ' ' + j.branches.map(function (b) { return b.trackId + b.from; }).join(','); }));
assert.ok(j1 && j2, 'пръстен на двете места');
assert.deepStrictEqual(j1.branches.map(function (b) { return b.trackId + b.from; }).sort(), ['Xa', 'Xb', 'Yb'], 'при събирането: X на запад, X на изток, Y отгоре');
assert.deepStrictEqual(j2.branches.map(function (b) { return b.trackId + b.from; }).sort(), ['Ya', 'Za', 'Xb'].sort(), 'при деленето: X, Y нататък, Z');
assert.strictEqual(rs.byTrack.X.filter(function (s) { return s.kind === 'part'; }).length, 2, 'X е разделен при събирането');
// Кръстовище без обща отсечка: два трака само се пресичат.
var H = { id: 'H', pts: line(42.8, 24.70, 42.8, 24.72, 80) }, V = { id: 'V', pts: line(42.79, 24.71, 42.81, 24.71, 80) };
var rx = decided([H, V], 20);
console.log('cross', rx.junctions.map(function (j) { return j.key + ' ' + j.branches.length; }));
assert.strictEqual(rx.junctions.length, 1, 'едно кръстовище');
assert.ok(U.hav(rx.junctions[0].lat, rx.junctions[0].lon, 42.8, 24.71) < 5, 'кръстовището е в пресечната точка');
assert.strictEqual(rx.junctions[0].branches.length, 4, 'четири клона');
assert.strictEqual(rx.parts.length, 4, 'всеки трак се дели на две части');
assert.strictEqual(rx.dups.length, 0);
checkShared('един трак', [P(y1), P(y2)], 'Y');
checkShared('един трак, обратно', [P(y2, true), P(y1, true)], 'Y');
checkShared('два трака', [P(y1), P(zp)], 'Y');
checkShared('два трака, обратно', [P(zp, true), P(y1, true)], 'Y');
console.log('OK', U.num(1180), U.km(17040), U.pct(8.44));
// Смяна на посоката в точката на деленето: маршрутът Y1 -> Z минава през общата отсечка;
// изборът на Y нататък сменя геометрията след точката, а новият избор на Z връща старото.
var zAll = rs.parts.filter(function (s) { return s.trackId === 'Z'; })[0];
var route = { items: [P(y1), P(zAll)] };
function geoOf() { return Core.routeGeometry(route, byS, rs); }
function forkAt(geo, q) { return Core.routeForks(geo, rs.junctions, 20, byS).filter(function (f) { return U.hav(f.j.lat, f.j.lon, q[0], q[1]) < 30; })[0]; }
var g0 = geoOf(), f2 = forkAt(g0, J2), f1 = forkAt(g0, J1);
assert.ok(f1 && f2, 'маршрутът минава през двете точки');
assert.strictEqual(f2.j.branches[f2.chosen].trackId, 'Z', 'при деленето: продължава по Z');
assert.strictEqual(f1.j.branches[f1.chosen].trackId, 'X', 'при събирането: продължава по общата отсечка (X на изток)');
assert.strictEqual(f1.j.branches[f1.incoming].trackId, 'Y', 'при събирането: идва от Y');
var yBr = f2.j.branches.filter(function (b) { return b.trackId === 'Y'; })[0];
Core.switchFork(route, f2, yBr, byS, 20);
var g1 = geoOf(), end1 = g1.pts[g1.pts.length - 1];
console.log('switch -> Y', route.items.map(function (i) { return i.trackId + Math.round(i.a); }), Math.round(g1.len), 'forks', JSON.stringify(route.forks).length);
assert.deepStrictEqual(route.items.map(function (i) { return i.trackId; }), ['Y', 'Y']);
assert.ok(U.hav(end1[0], end1[1], Y.pts[Y.pts.length - 1][0], Y.pts[Y.pts.length - 1][1]) < 5, 'след смяната маршрутът свършва в края на Y');
assert.strictEqual(g1.gaps.length, 0);
assert.strictEqual(forkAt(g1, J2).j.branches[forkAt(g1, J2).chosen].trackId, 'Y', 'изборът при деленето вече е Y');
var zBr = f2.j.branches.filter(function (b) { return b.trackId === 'Z'; })[0];
Core.switchFork(route, forkAt(g1, J2), zBr, byS, 20);
assert.deepStrictEqual(route.items.map(function (i) { return i.trackId; }), ['Y', 'Z'], 'обратно на Z');
assert.strictEqual(route.forks.length, 1);
assert.strictEqual(route.forks[0].alts.length, 2, 'пазят се и двете продължения');
// Смяна при събирането: на запад по X.
var xw = f1.j.branches.filter(function (b) { return b.trackId === 'X' && b.from === 'b'; })[0];
Core.switchFork(route, forkAt(geoOf(), J1), xw, byS, 20);
var g2 = geoOf(), e2 = g2.pts[g2.pts.length - 1];
assert.deepStrictEqual(route.items.map(function (i) { return i.trackId + (i.rev ? '<' : '>'); }), ['Y>', 'X<']);
assert.ok(U.hav(e2[0], e2[1], X.pts[0][0], X.pts[0][1]) < 5 && g2.gaps.length === 0 && !g2.items.some(function (x) { return x.shared; }), 'на запад: без обща отсечка, до началото на X');
console.log('forks OK');

// ---- Маркер за всеки дубликат, скрити дубликати, самозатварящи се дупки ----
function copyT(t) { return { id: t.id, pts: t.pts.map(function (p) { return p.slice(); }) }; }
function near(a, b, eps, msg) { assert.ok(Math.abs(a - b) <= eps, msg + ': ' + Math.round(a) + ' ~ ' + Math.round(b)); }
// Без клик дубликатът чака: приет участък с pend, нищо не е махнато, точките на прекъсване са същите.
var X2 = copyT(X), Y2 = copyT(Y), Z2 = copyT(Z), by2 = { X: X2, Y: Y2, Z: Z2 };
var rp = Core.analyze([X2, Z2, Y2], 20);
var yp = rp.byTrack.Y.filter(function (s) { return s.kind !== 'gap'; });
console.log('Y pend', yp.map(function (s) { return s.kind + (s.pend ? '*' : '') + ':' + Math.round(s.a) + '-' + Math.round(s.b); }));
assert.deepStrictEqual(yp.map(function (s) { return s.kind + (s.pend ? '*' : ''); }), ['part', 'part*', 'part'], 'непотвърденият дубликат е част с pend');
assert.strictEqual(rp.dups.length, 0, 'нищо не е махнато без клик');
assert.strictEqual(rp.pend.length, 1, 'един маркер');
assert.ok(rp.parts.every(function (s) { return !s.pend; }), 'parts не съдържа чакащите');
assert.strictEqual(rp.pend[0].withId, 'X');
near(rp.pend[0].a, yDup.a, 1, 'границите на чакащия дубликат'); near(rp.pend[0].b, yDup.b, 1, 'границите на чакащия дубликат');
assert.ok(!Core.invalidShare({ trackId: 'Y', a: rp.pend[0].a, b: rp.pend[0].b }, rp).bad, 'част върху чакащ дубликат е валидна');
assert.deepStrictEqual(jAt(rp, J1).branches.map(function (b) { return b.trackId + b.from; }).sort(), ['Xa', 'Xb', 'Yb'], 'пръстенът при събирането е същият');
assert.deepStrictEqual(jAt(rp, J2).branches.map(function (b) { return b.trackId + b.from; }).sort(), ['Xb', 'Ya', 'Za'], 'пръстенът при деленето е същият');
// Маршрут, който минава общата отсечка два пъти: по X и обратно по Y. Кликът маха точно дубликата.
var xs = rp.parts.filter(function (s) { return s.trackId === 'X'; });
var rt2 = { items: [P(xs[0]), P(xs[1]), P(rp.pend[0], true)] };
var gBefore = Core.routeGeometry(rt2, by2, rp);
near(gBefore.len, xs[0].len + xs[1].len + rp.pend[0].len, 30, 'преди клика дубликатът се брои');
Y2.skips = Core.mergeIv([{ a: rp.pend[0].a, b: rp.pend[0].b }]);
rt2.items = Core.trimItems(rt2.items, 'Y', rp.pend[0].a, rp.pend[0].b);
var ra = Core.analyze([X2, Z2, Y2], 20);
var gAfter = Core.routeGeometry(rt2, by2, ra);
console.log('клик върху маркера', Math.round(gBefore.len), '->', Math.round(gAfter.len), 'дубликат', Math.round(rp.pend[0].len));
assert.strictEqual(rt2.items.length, 2, 'частта върху дубликата излиза от маршрута');
// Пада с участъка и с краткия скок (под 30 м) от края на X до него.
var gbp = gBefore.items.filter(function (g) { return !g.auto; }); // между частите вече стои свръзката
var jx = gbp[1].pts[gbp[1].pts.length - 1], jy = gbp[2].pts[0];
near(gBefore.len - gAfter.len, rp.pend[0].len + U.hav(jx[0], jx[1], jy[0], jy[1]), 2, 'дължината пада точно с дължината на участъка');
assert.strictEqual(ra.pend.length, 0); assert.strictEqual(ra.dups.length, 1, 'махнатият е dup');
assert.deepStrictEqual(ra.byTrack.Y.filter(function (s) { return s.kind !== 'gap'; }).map(function (s) { return s.kind; }), ['part', 'dup', 'part']);
// Отрязване на по-дълга част: остават парчетата преди и след дубликата, в посоката на частта.
var cutItems = Core.trimItems([{ type: 'part', trackId: 'Y', a: 0, b: Y2.len, rev: true }], 'Y', rp.pend[0].a, rp.pend[0].b);
assert.deepStrictEqual(cutItems.map(function (i) { return Math.round(i.a) + '-' + Math.round(i.b) + (i.rev ? '<' : ''); }),
  [Math.round(rp.pend[0].b) + '-' + Math.round(Y2.len) + '<', '0-' + Math.round(rp.pend[0].a) + '<'], 'парчетата около дубликата');
// Три дубликата - три маркера, всеки се маха сам.
var base = { id: 'L', pts: line(43.0, 24.70, 43.0, 24.76, 300) };
var zz = [], lon = 24.705;
for (var q = 0; q < 3; q++) {
  zz = zz.concat(line(43.00009, lon, 43.00009, lon + 0.008, 40));          // ~650 м по L
  zz = zz.concat(line(43.0015, lon + 0.0085, 43.0015, lon + 0.012, 20));   // встрани, на 165 м
  lon += 0.0125;
}
var M = { id: 'M', pts: zz }, byM = { L: base, M: M };
var r3d = Core.analyze([base, M], 20);
console.log('три маркера', r3d.pend.map(function (s) { return Math.round(s.a) + '-' + Math.round(s.b); }));
assert.strictEqual(r3d.pend.length, 3, 'три маркера');
var mid = r3d.pend[1];
M.skips = [{ a: mid.a, b: mid.b }];
var r3e = Core.analyze([base, M], 20);
assert.strictEqual(r3e.pend.length, 2, 'остават два маркера'); assert.strictEqual(r3e.dups.length, 1, 'махнат е само един');
near(r3e.dups[0].a, mid.a, 1, 'махнат е точно натиснатият'); near(r3e.dups[0].b, mid.b, 1, 'махнат е точно натиснатият');
M.skips = [];
assert.strictEqual(Core.analyze([base, M], 20).pend.length, 3, '"Отмени" (без решението) връща маркера');
// Вдигнато отклонение: решените си остават решени, новите дубликати чакат маркер.
var A3 = copyT(A), B3 = copyT(B), C3 = copyT(C);
var r20 = Core.analyze([A3, B3, C3], 20);
assert.strictEqual(r20.pend.length, 1);
B3.skips = [{ a: r20.pend[0].a, b: r20.pend[0].b }];
var r40b = Core.analyze([A3, B3, C3], 40);
console.log('при 40 м', 'dups', r40b.dups.map(function (s) { return s.trackId; }), 'pend', r40b.pend.map(function (s) { return s.trackId; }));
assert.deepStrictEqual(r40b.dups.map(function (s) { return s.trackId; }), ['B'], 'Б остава махнат');
assert.deepStrictEqual(r40b.pend.map(function (s) { return s.trackId; }), ['C'], 'В чака свой маркер');
// Дупка между две части, по-къса от отклонението, се свързва сама; по-дългата си остава.
var P1 = { id: 'P1', pts: line(42.9, 24.70, 42.9, 24.71, 50) };
var P2 = { id: 'P2', pts: line(42.9, 24.71074, 42.91, 24.71074, 50) }; // ~60 м на изток, после на север
var byP = { P1: P1, P2: P2 };
var gapRoute = { items: [{ type: 'part', trackId: 'P1', a: 0, b: Core.prep(P1).len }, { type: 'part', trackId: 'P2', a: 0, b: Core.prep(P2).len }] };
var ga100 = Core.routeGeometry(gapRoute, byP, Core.analyze([P1, P2], 100));
var ga40 = Core.routeGeometry(gapRoute, byP, Core.analyze([P1, P2], 40));
console.log('дупка', ga100.autoGaps.map(function (x) { return x.kind + ' ' + Math.round(x.d) + ' @' + Math.round(x.d0); }), 'при 40 м', ga40.gaps.length);
assert.strictEqual(ga100.gaps.length, 0, 'при 100 м няма отворена дупка');
assert.strictEqual(ga100.autoGaps.length, 1, 'при 100 м дупката е затворена сама');
assert.ok(ga100.items.some(function (x) { return x.auto && x.idx === null; }), 'свързващият елемент не е в route.items');
assert.strictEqual(gapRoute.items.length, 2);
near(ga100.len, P1.len + P2.len + ga100.autoGaps[0].d, 1, 'затворената дупка влиза в дължината');
near(ga100.autoGaps[0].d0, P1.len, 1, 'мястото на дупката по маршрута');
assert.strictEqual(ga40.gaps.length, 1, 'при 40 м дупката е отворена (с двата бутона)'); assert.strictEqual(ga40.autoGaps.length, 0);
assert.strictEqual(Core.routeGeometry(gapRoute, byP, Core.analyze([P1, P2], 20)).gaps.length, 1, 'при 20 м също');
var e1 = P1.pts[P1.pts.length - 1], s2 = P2.pts[0];
gapRoute.openGaps = [[e1[0], e1[1], s2[0], s2[1]]];
var gOpen = Core.routeGeometry(gapRoute, byP, Core.analyze([P1, P2], 100));
assert.strictEqual(gOpen.gaps.length, 1, '"Отвори пак": дупката пак е отворена'); assert.strictEqual(gOpen.autoGaps.length, 0);
// Дупка от загубен сигнал вътре в трак: под отклонението частта е една и дупката е затворена.
var gp1 = line(42.95, 24.70, 42.95, 24.71, 50), gp2 = line(42.95, 24.71074, 42.95, 24.72, 50);
var T = { id: 'T', pts: gp1.concat(gp2), breaks: [gp1.length] }, byT = { T: T };
var rT20 = Core.analyze([T], 20), rT100 = Core.analyze([T], 100);
console.log('дупка в трака', 'при 20 м', rT20.gaps.length, rT20.parts.length, 'при 100 м', rT100.closedGaps.length, rT100.parts.length);
assert.strictEqual(rT20.gaps.length, 1); assert.strictEqual(rT20.parts.length, 2, 'при 20 м тракът е на две части');
assert.strictEqual(rT100.gaps.length, 0); assert.strictEqual(rT100.closedGaps.length, 1); assert.strictEqual(rT100.parts.length, 1, 'при 100 м частта е една');
var gT = Core.routeGeometry({ items: [{ type: 'part', trackId: 'T', a: 0, b: T.len }] }, byT, rT100);
assert.strictEqual(gT.autoGaps.length, 1); assert.strictEqual(gT.autoGaps[0].kind, 'track');
near(gT.len, T.len, 1, 'дупката в трака влиза в дължината');
near(gT.autoGaps[0].d0, T._cum[gp1.length - 1], 1, 'мястото ѝ по маршрута');
var gTr = Core.routeGeometry({ items: [{ type: 'part', trackId: 'T', a: 0, b: T.len, rev: true }] }, byT, rT100);
near(gTr.autoGaps[0].d0, T.len - T._cum[gp1.length], 1, 'в обратна посока');
T.openGaps = [rT100.closedGaps[0].a];
assert.strictEqual(Core.analyze([T], 100).gaps.length, 1, '"Отвори пак" в трака');
console.log('markers/gaps OK');

// ---- Свръзки между два трака: точката на прекъсване в обхвата на отклонението ----
// LA на изток; LB върви 1,6 км успоредно на 10 м (дубликат), после завива на север;
// LC започва на 25 м северно от края на LA (над отклонението, без обща отсечка).
var LA = { id: 'LA', pts: line(42.9, 24.70, 42.9, 24.75, 200) };
var LB = { id: 'LB', pts: line(42.90009, 24.71, 42.90009, 24.73, 80).concat(line(42.90009, 24.7302, 42.93, 24.73, 120)) };
var LC = { id: 'LC', pts: line(42.900225, 24.75, 42.92, 24.75, 80) };
var rl = decided([LA, LB, LC], 20), byL = { LA: LA, LB: LB, LC: LC };
function partsL(id) { return rl.byTrack[id].filter(function (s) { return s.kind === 'part'; }); }
function onTrack(t, p) { return Core.nearestOnTrack(t, p[0], p[1]).dist; }
var la = partsL('LA'), lb = partsL('LB'), lc = partsL('LC');
console.log('свръзки', la.map(function (s) { return Math.round(s.a) + '-' + Math.round(s.b); }), lb.map(function (s) { return Math.round(s.a) + '-' + Math.round(s.b); }));
assert.strictEqual(la.length, 2, 'LA се дели там, където LB се отделя');
assert.strictEqual(lb.length, 1);
// Началото на приетата част на LB (точката на прекъсване) е там, където двата трака вървят
// най-близо (успоредната отсечка на 10 м), а не на границата на отклонението (20 м).
var lbStart = Core.pointAt(LB, lb[0].a);
near(onTrack(LA, lbStart), 10, 0.5, 'точката на LB е на най-близкото място до LA');
var jl = rl.junctions.filter(function (j) { return U.hav(j.lat, j.lon, lbStart[0], lbStart[1]) < 30; })[0];
assert.ok(jl && jl.links && jl.links.length, 'точката носи свръзките си');
// Точката е върху всеки трак, а пръстенът е един - върху LA, който остава след махането.
jl.branches.forEach(function (b) { assert.ok(onTrack(byL[b.trackId], b.at) < 0.5, 'точката на ' + b.trackId + ' е върху него'); });
assert.deepStrictEqual(jl.branches.map(function (b) { return b.trackId; }).sort(), ['LA', 'LA', 'LB'], 'клоновете: LA в двете посоки и LB');
assert.ok(onTrack(LA, jl.ring) < 0.5, 'пръстенът е върху LA, не на ' + onTrack(LA, jl.ring).toFixed(1) + ' м от него');
(jl.links || []).forEach(function (l) {
  var p = jl.branches[l.a], q = jl.branches[l.b];
  assert.ok(l.d > 1 && l.d <= 20, 'свръзката е до отклонението: ' + l.d.toFixed(1));
  assert.ok(onTrack(byL[p.trackId], p.at) < 0.5 && onTrack(byL[q.trackId], q.at) < 0.5, 'краищата на свръзката са върху своя трак');
});
// Маршрут LA -> LB: скокът се затваря сам, между частите.
var gl = Core.routeGeometry({ items: [P(la[0]), P(lb[0])] }, byL, rl);
var lk = gl.items.filter(function (g) { return g.auto; });
console.log('LA -> LB', gl.items.map(function (g) { return g.item.type; }), 'свръзка', lk.map(function (g) { return g.len.toFixed(1); }), 'дупки', gl.gaps.length);
assert.strictEqual(gl.gaps.length, 0, 'под отклонението между два трака не е дупка');
assert.strictEqual(lk.length, 1, 'една свръзка');
assert.strictEqual(gl.items.indexOf(lk[0]), 1, 'свръзката е между двете части');
assert.strictEqual(lk[0].idx, null, 'свръзката не е в route.items');
assert.strictEqual(gl.autoGaps.length, 1); assert.strictEqual(gl.autoGaps[0].kind, 'route');
assert.ok(lk[0].len > 1 && lk[0].len <= 20, 'дължина на свръзката ' + lk[0].len.toFixed(1));
assert.ok(onTrack(LA, lk[0].pts[0]) < 0.5, 'свръзката тръгва от LA');
assert.ok(onTrack(LB, lk[0].pts[1]) < 0.5, 'свръзката стига точно до LB (разстояние 0)');
near(gl.len, la[0].len + lb[0].len + lk[0].len, 1, 'дължината на свръзката влиза в маршрута');
assert.ok(onTrack(LA, gl.pts[0]) < 0.5 && onTrack(LB, gl.pts[gl.pts.length - 1]) < 0.5, 'стартът е на LA, краят на LB');
for (var li = 1; li < gl.items.length; li++) {
  var pe = gl.items[li - 1].pts[gl.items[li - 1].pts.length - 1], ns = gl.items[li].pts[0];
  assert.ok(U.hav(pe[0], pe[1], ns[0], ns[1]) < 0.5, 'без скок между елемент ' + (li - 1) + ' и ' + li);
}
// Пръстенът по маршрута лежи върху продължаващия трак - и в двете посоки.
function forkOn(geo, t) {
  var f = Core.routeForks(geo, rl.junctions, 20, byL).filter(function (x) { return x.j === jl; })[0];
  assert.ok(f && f.at, 'маршрутът минава през точката');
  return onTrack(t, f.at);
}
assert.ok(forkOn(gl, LB) < 0.5, 'LA -> LB: точката е върху LB');
var gAA = Core.routeGeometry({ items: [P(la[0]), P(la[1])] }, byL, rl);
assert.ok(forkOn(gAA, LA) < 0.5, 'LA -> LA: точката е върху LA, не на ' + onTrack(LA, [jl.lat, jl.lon]).toFixed(1) + ' м от него');
var gBA = Core.routeGeometry({ items: [P(lb[0], true), P(la[1])] }, byL, rl);
assert.strictEqual(gBA.gaps.length, 0); assert.strictEqual(gBA.autoGaps.length, 1, 'LB -> LA: свръзка');
assert.ok(forkOn(gBA, LA) < 0.5, 'LB -> LA: точката е върху LA');
// Над отклонението между два трака дупката си остава дупка (тук 25 м при 20 м).
var gC = Core.routeGeometry({ items: [P(la[1]), P(lc[0])] }, byL, rl);
assert.strictEqual(gC.gaps.length, 1, 'дупка от 25 м между LA и LC остава дупка');
assert.strictEqual(gC.autoGaps.length, 0);
near(gC.gaps[0].d, 25, 1, 'дупката е 25 м');
var gC40 = Core.routeGeometry({ items: [P(la[1]), P(lc[0])] }, byL, Object.assign({}, rl, { tol: 40 }));
assert.ok(gC40.gaps.length === 0 && gC40.autoGaps.length === 1, 'при 40 м същата дупка се свързва');
// "Отвори пак": свръзката става дупка.
var e0 = lk[0].pts[0], s0 = lk[0].pts[1];
var gO = Core.routeGeometry({ items: [P(la[0]), P(lb[0])], openGaps: [[e0[0], e0[1], s0[0], s0[1]]] }, byL, rl);
assert.ok(gO.gaps.length === 1 && gO.autoGaps.length === 0 && !gO.items.some(function (g) { return g.auto; }), '"Отвори пак" връща дупката');
// Ръчна връзка (draw с link), останала в края: слага се между частите, стартът и краят са от трак.
var mid = [(e0[0] + s0[0]) / 2, (e0[1] + s0[1]) / 2];
var rtL = { items: [P(la[1]), P(lc[0]), { type: 'draw', link: true, pts: [{ lat: 42.9001, lon: 24.75 }] }] };
var gD = Core.routeGeometry(rtL, byL, rl);
var seq = gD.items.filter(function (g) { return !g.auto; }).map(function (g) { return g.item.type; });
console.log('ръчна връзка', seq, 'дупки', gD.gaps.length);
assert.deepStrictEqual(seq, ['part', 'draw', 'part'], 'ръчната връзка е между двете части');
assert.strictEqual(rtL.items[2].type, 'draw', 'route.items не се пипа');
assert.ok(onTrack(LA, gD.pts[0]) < 0.5 && onTrack(LC, gD.pts[gD.pts.length - 1]) < 0.5, 'стартът е на LA, краят на LC - не върху връзката');
// Същото с два трака и начертана точка между LA и LB (при махнато свързване).
var gD2 = Core.routeGeometry({ items: [P(la[0]), P(lb[0]), { type: 'draw', link: true, pts: [{ lat: mid[0], lon: mid[1] }] }], openGaps: [[e0[0], e0[1], s0[0], s0[1]]] }, byL, rl);
assert.ok(onTrack(LA, gD2.pts[0]) < 0.5 && onTrack(LB, gD2.pts[gD2.pts.length - 1]) < 0.5, 'LA -> LB с ръчна връзка: стартът и краят са от трак');
// Стар чертан участък в края (без link) си остава там - запазените маршрути не се променят.
var gOld = Core.routeGeometry({ items: [P(la[1]), P(lc[0]), { type: 'draw', pts: [{ lat: 42.95, lon: 24.75 }] }] }, byL, rl);
assert.strictEqual(gOld.items[gOld.items.length - 1].item.type, 'draw', 'стар чертан край остава');
console.log('свръзки OK');

// ---- Общ участък на два трака, които вървят по един и същи път (GPS шум) ----
// QA на изток 4 км; QB идва от юг, върви 2 км успоредно на ~8 м с ±4 м шум и на двата,
// после се отделя на север. Пръстените са два (по един на всеки край) и при 20, и при 12 м.
var seed = 7;
function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
var QM = 6371008.8 * Math.PI / 180, qkx = Math.cos(43 * Math.PI / 180) * QM;
function qp(x, y) { return [43 + y / QM, 24 + x / qkx, 500]; }
function coTracks(bump) {
  var a = { id: 'QA', pts: [] }, b = { id: 'QB', pts: [] }, x, y;
  for (x = 0; x <= 4000; x += 10) a.pts.push(qp(x, (rnd() - 0.5) * 8));
  for (y = -800; y < 8; y += 10) b.pts.push(qp(1000, y));
  for (x = 1000; x <= 3000; x += 10) b.pts.push(qp(x, 8 + (rnd() - 0.5) * 8 + (bump ? bump(x) : 0)));
  for (y = 18; y <= 800; y += 10) b.pts.push(qp(3000, y));
  return [a, b];
}
function coCheck(name, tr, tol, stretches) {
  var res = decided(tr, tol), by = { QA: tr[0], QB: tr[1] };
  var dB = res.byTrack.QB.filter(function (s) { return s.kind === 'dup'; });
  console.log(name, tol, 'QB', res.byTrack.QB.filter(function (s) { return s.kind !== 'gap'; }).map(function (s) { return s.kind + ':' + Math.round(s.a) + '-' + Math.round(s.b); }), 'пръстени', res.junctions.length);
  assert.strictEqual(dB.length, stretches, name + ' @' + tol + ': общи участъци');
  assert.strictEqual(res.junctions.length, 2 * stretches, name + ' @' + tol + ': по един пръстен на всеки край, без паразитни');
  res.junctions.forEach(function (j) {
    assert.deepStrictEqual(j.branches.map(function (b) { return b.trackId; }).sort(), ['QA', 'QA', 'QB'], name + ': клонове');
    j.branches.forEach(function (b) { assert.ok(onTrack(by[b.trackId], b.at) < 0.5, name + ': точката на ' + b.trackId + ' е върху него'); });
    var pb = j.branches.filter(function (b) { return b.trackId === 'QB'; })[0];
    assert.ok(onTrack(tr[0], pb.at) <= 10, name + ' @' + tol + ': точката на QB е там, където траковете съвпадат: ' + onTrack(tr[0], pb.at).toFixed(1) + ' м от QA');
    assert.ok(onTrack(tr[0], j.ring) < 0.5, name + ': пръстенът е върху QA (остава след махането)');
  });
  // След махането QA е цял: частите му се допират, маршрутът по него е без дупка.
  var qa = res.byTrack.QA.filter(function (s) { return s.kind === 'part'; });
  assert.strictEqual(qa.length, 1 + 2 * stretches, name + ': QA се дели във всяка точка');
  var g = Core.routeGeometry({ items: qa.map(function (s) { return P(s); }) }, by, res);
  assert.strictEqual(g.gaps.length + g.autoGaps.length, 0, name + ': по QA няма дупка');
  // QA -> QB нататък: свръзката е само разстоянието между двете точки на края.
  var qb = res.byTrack.QB.filter(function (s) { return s.kind === 'part'; });
  var gq = Core.routeGeometry({ items: [P(qa[qa.length - 2]), P(qb[qb.length - 1])] }, by, res);
  assert.strictEqual(gq.gaps.length, 0, name + ': QA -> QB без дупка');
  gq.items.filter(function (x) { return x.auto; }).forEach(function (x) { assert.ok(x.len <= 10, name + ': свръзка ' + x.len.toFixed(1) + ' м'); });
  return res;
}
coCheck('съвпадащи', coTracks(), 20, 1);
coCheck('съвпадащи', coTracks(), 12, 1);
// Отклонение до 100 м вътре в участъка (QB се отдалечава на 30 м за ~80 м) не вади нова точка.
function bumpOf(x0, len, h) { return function (x) { return x > x0 && x < x0 + len ? h : 0; }; }
coCheck('отклонение 80 м', coTracks(bumpOf(1900, 80, 30)), 20, 1);
coCheck('отклонение 80 м', coTracks(bumpOf(1900, 80, 30)), 12, 1);
// Над 100 м (тук ~300 м на 40 м встрани) траковете се разделят: два общи участъка, четири пръстена.
coCheck('отклонение 300 м', coTracks(bumpOf(1800, 300, 40)), 20, 2);
coCheck('отклонение 300 м', coTracks(bumpOf(1800, 300, 40)), 12, 2);
console.log('общ участък OK');
// Място по линията напред от d0: първият отрязък до lim м, при кръг - през края към началото.
(function () {
  var sq = line(42.52, 24.70, 42.52, 24.71, 10).concat(line(42.52, 24.71, 42.53, 24.71, 10).slice(1), line(42.53, 24.71, 42.53, 24.70, 10).slice(1), line(42.53, 24.70, 42.52, 24.70, 10).slice(1));
  var t = { id: 'K', pts: sq }; Core.prep(t);
  var a = Core.nearestOn(t.pts, t._cum, 42.52, 24.7041);
  var f = Core.alongOn(t.pts, t._cum, a.d, 42.52, 24.7012, 20, 1, true);
  assert.ok(f && f.d < a.d && f.dist < 1, 'кръг: напред минава през края и намира точката зад d0');
  assert.strictEqual(Core.alongOn(t.pts, t._cum, a.d, 42.52, 24.7012, 20, 1, false), null, 'отворена линия: напред няма такова място');
  var b = Core.alongOn(t.pts, t._cum, a.d, 42.52, 24.7012, 20, -1, false);
  assert.ok(b && b.d < a.d && Math.abs(a.d - b.d - 238) < 5, 'назад: 238 м по линията');
  var j = Core.alongOn(t.pts, t._cum, a.d, 42.52001, 24.70405, 20, 1, true);
  assert.ok(j && Math.abs(j.d - a.d) < 0.01, 'малко назад по кръга (под lim): остава на d0, без обиколка');
  console.log('alongOn: OK');
})();
// Дупки в изминатото: поредни измерени положения на над 40 м по следата; вмъкнатите (празна точност) са между тях.
(function () {
  var m = function (lat, lon, acc) { return [lat, lon, 500, 0, acc === undefined ? 5 : acc]; };
  var pts = [m(42.5, 24.7), m(42.5, 24.70012), m(42.5, 24.70024), // по ~10 м - измерено
    m(42.5, 24.7012, null), m(42.5, 24.7024, null), m(42.5, 24.7036), // вмъкнати по маршрута, ~280 м
    m(42.5, 24.70372), m(42.5007, 24.70372)]; // 10 м, после скок ~78 м по права
  assert.deepStrictEqual(Core.walkGaps(pts), [[2, 5], [6, 7]], 'дупка по маршрута и права линия при скок');
  assert.deepStrictEqual(Core.walkGaps(pts.slice(0, 3)), [], 'без дупка');
  assert.deepStrictEqual(Core.walkGaps(pts.map(function (p) { return p.slice(0, 4); })), [], 'трак без точност (внесен .gpx) - без дупки');
  console.log('walkGaps: OK');
})();
// Изглаждане на записа от следене: праг 5 м, вмъкнатите точки и краищата остават, без нови дупки.
(function () {
  var m = function (lat, lon, acc, t) { return [lat, lon, 500, t || 0, acc === undefined ? 5 : acc]; };
  var k = 1 / 111320; // ~1 м по ширина
  // Права на изток по 2 м, с трептене до 2 м встрани: 301 точки, ~600 м.
  var pts = [], i, dx = 2 / (111320 * Math.cos(42.5 * Math.PI / 180));
  for (i = 0; i <= 300; i++) pts.push(m(42.5 + Math.sin(i * 1.7) * 2 * k, 24.7 + i * dx, 5, 1000 * i));
  assert.strictEqual(Core.SMOOTH_M, 5);
  assert.deepStrictEqual(Core.smoothWalk(pts, {}), pts, 'без отметки - същата следа');
  assert.notStrictEqual(Core.smoothWalk(pts, {}), pts, 'нов масив - суровата следа не се пипа');
  var side = Core.smoothWalk(pts, { side: true });
  assert.ok(side.length < pts.length / 5, 'изглаждане: маха трептенето до 5 м (' + side.length + ' от ' + pts.length + ')');
  assert.strictEqual(side[0], pts[0]); assert.strictEqual(side[side.length - 1], pts[pts.length - 1]);
  assert.ok(side.every(function (p) { return pts.indexOf(p) >= 0; }), 'оставените точки са същите (височина, час, точност)');
  assert.deepStrictEqual(Core.walkGaps(side), [], 'изглаждане: между оставените измерени точки няма над 40 м - без лъжлива дупка');
  for (i = 1; i < side.length; i++) assert.ok(side[i][3] > side[i - 1][3], 'часовете остават поред');
  // Точка на 12 м встрани остава.
  var bump = pts.map(function (p) { return p.slice(); }); bump[150][0] += 12 * k;
  assert.ok(Core.smoothWalk(bump, { side: true }).some(function (p) { return p[0] === bump[150][0]; }), 'отклонение над 5 м остава');
  var dense = Core.smoothWalk(pts, { dense: true });
  for (i = 1; i < dense.length - 1; i++) assert.ok(U.hav(dense[i - 1][0], dense[i - 1][1], dense[i][0], dense[i][1]) >= 5, 'гъсти точки: поредни оставени са поне на 5 м');
  assert.ok(dense.length < pts.length * 0.75 && dense.length > pts.length / 4, 'гъсти точки: маха съседни под 5 м (' + dense.length + ')');
  var both = Core.smoothWalk(pts, { side: true, dense: true });
  assert.ok(both.length < dense.length && both.length >= 2 && !Core.walkGaps(both).length, "двете: " + both.length);
  // Вмъкнатите при дупка (празна точност) и двете измерени около тях не се махат; дупката остава същата.
  var gap = [m(42.5, 24.7), m(42.5, 24.70002), m(42.5, 24.70004), m(42.5, 24.70006),
    m(42.5, 24.7012, null), m(42.5, 24.7024, null), m(42.5, 24.7036), m(42.5, 24.70362), m(42.5, 24.70364), m(42.5, 24.70366)];
  var g2 = Core.smoothWalk(gap, { side: true, dense: true });
  [3, 4, 5, 6].forEach(function (j) { assert.ok(g2.indexOf(gap[j]) >= 0, 'точка ' + j + ' около дупката остава'); });
  assert.strictEqual(Core.walkGaps(g2).length, 1, 'дупката си е една');
  assert.ok(g2.length < gap.length, 'гъстите по ~1,6 м извън дупката се махат');
  // Трак без поле за точност - точките се броят за измерени: изглажда се, без отрязъци над 40 м.
  var plain = pts.map(function (p) { return p.slice(0, 4); }), ps = Core.smoothWalk(plain, { side: true });
  assert.ok(ps.length < plain.length / 5);
  for (i = 1; i < ps.length; i++) assert.ok(U.hav(ps[i - 1][0], ps[i - 1][1], ps[i][0], ps[i][1]) <= 40, 'без отрязък над 40 м');
  // Следене по маршрут: между всеки две измерени има вмъкнати точки на маршрута (празна точност) - и те се изглаждат.
  var onr = [];
  for (i = 0; i <= 100; i++) {
    onr.push(m(42.5 + (i % 2 ? 2 : -2) * k, 24.7 + i * 4 * dx, 5, 1000 * i));
    if (i < 100) onr.push(m(42.5, 24.7 + (i * 4 + 3) * dx, null, 1000 * i + 500));
  }
  var os = Core.smoothWalk(onr, { side: true });
  assert.ok(os.length < onr.length / 4, 'по маршрут: ' + os.length + ' от ' + onr.length);
  assert.deepStrictEqual(Core.walkGaps(os), [], 'по маршрут: без лъжливи дупки');
  // Изгладен маршрут (route.smooth от "Запази"): частите от тракове се изглаждат в самата геометрия - краищата и чертаните точки остават.
  var tz = { id: 'Z', pts: plain.map(function (p) { return [p[0], p[1], 500]; }) }; Core.prep(tz);
  var rz = { items: [{ type: 'part', trackId: 'Z', a: 0, b: tz.len }, { type: 'draw', pts: [{ lat: 42.5, lon: 24.75 }, { lat: 42.5005, lon: 24.7502 }] }] };
  var gz0 = Core.routeGeometry(rz, { Z: tz }, null), gz1 = Core.routeGeometry(Object.assign({}, rz, { smooth: { side: true } }), { Z: tz }, null);
  assert.ok(gz1.pts.length < gz0.pts.length / 3, 'изгладен маршрут: ' + gz1.pts.length + ' от ' + gz0.pts.length + ' точки');
  assert.deepStrictEqual(gz1.pts[0], gz0.pts[0]); assert.deepStrictEqual(gz1.pts[gz1.pts.length - 1], gz0.pts[gz0.pts.length - 1]);
  assert.strictEqual(gz1.items[1].pts.length, 2, 'чертаните точки не се пипат');
  assert.ok(gz1.len <= gz0.len && gz1.len > gz0.len * 0.9, 'дължина ' + gz0.len.toFixed(0) + ' → ' + gz1.len.toFixed(0));
  assert.strictEqual(Core.routeGeometry(rz, { Z: tz }, null).pts.length, gz0.pts.length, 'без smooth - както е');
  // Права през 20 м: при маршрут границата от 40 м не важи - изглаждането маха междинните.
  var tl = { id: 'L', pts: [] }; for (i = 0; i <= 200; i++) tl.pts.push([42.5, 24.7 + i * 0.00025, 500]); Core.prep(tl);
  var gl = Core.routeGeometry({ items: [{ type: 'part', trackId: 'L', a: 0, b: tl.len }], smooth: { side: true } }, { L: tl }, null);
  assert.ok(gl.pts.length < 10, 'права през 20 м: ' + gl.pts.length + ' от 201');
  console.log('smoothWalk: OK (' + pts.length + ' → изглаждане ' + side.length + ', гъсти ' + dense.length + ', двете ' + both.length + ')');
})();

// 1.3.0: излишни пръстени, изтриване на разклонение и на участък.
(function () {
  var MPDL = 6371008.8 * Math.PI / 180, KX = Math.cos(42.5 * Math.PI / 180) * MPDL;
  function lonAt(d) { return 24.70 + d / KX; }
  function latAt(m) { return 42.5 + m / MPDL; }
  // X на изток (~4.9 км); Y слиза от север и свършва на 18 м над X при км 1,0; W идва от юг и свършва
  // върху X при км 1,025 (25 м по X от Y - двата пръстена са различни, но близо); V пресича X при км 2,5.
  function mk() {
    return [
      { id: 'X', pts: line(42.5, 24.70, 42.5, 24.76, 300) },
      { id: 'Y', pts: line(latAt(300), lonAt(1000), latAt(18), lonAt(1000), 30) },
      { id: 'W', pts: line(latAt(-300), lonAt(1025), 42.5, lonAt(1025), 30) },
      { id: 'V', pts: line(latAt(400), lonAt(2500), latAt(-400), lonAt(2500), 60) }
    ];
  }
  function ascent(g) { var up = 0; for (var i = 1; i < g.pts.length; i++) { var d = g.pts[i][2] - g.pts[i - 1][2]; if (d > 0) up += d; } return up; }
  function byIdOf(ts) { var o = {}; ts.forEach(function (t) { o[t.id] = t; }); return o; }
  function partsOf(r, id) { return r.byTrack[id].filter(function (s) { return s.kind === 'part'; }).map(function (s) { return [Math.round(s.a), Math.round(s.b)]; }); }
  var ts = mk(), tb = byIdOf(ts), r = Core.analyze(ts, 20);
  console.log('1.3.0 пръстени', r.junctions.map(function (j) { return j.branches.map(function (b) { return b.trackId; }).join('') + (j.cross ? ' (пресичане)' : ''); }));
  assert.strictEqual(r.junctions.length, 3, 'три пръстена: Y, W и пресичането с V');
  var red = Core.redundantJunctions(r.junctions, tb, 20);
  console.log('1.3.0 излишни', red.map(function (x) { return x.why + ' ' + x.trackId + ' @' + Math.round(x.d) + (x.dist != null ? ' / ' + Math.round(x.dist) + ' м' : ''); }));
  assert.strictEqual(red.length, 2, 'излишни: пресичането (без избор) и вторият от двата близки');
  var cross = red.filter(function (x) { return x.why === 'cross'; })[0], near = red.filter(function (x) { return x.why === 'near'; })[0];
  assert.ok(cross && cross.j.cross && Math.abs(cross.d - 2500) < 25, 'без избор: V × X при км 2,5');
  assert.ok(near && near.trackId === 'X' && near.dist < Core.NEAR_J && Math.abs(near.dist - 25) < 6 && near.j.branches.some(function (b) { return b.trackId === 'W'; }), 'близо: вторият пръстен (W) на ~25 м по X');
  assert.ok(!red.some(function (x) { return x.j.branches.some(function (b) { return b.trackId === 'Y'; }) && x.why === 'near'; }), 'първият от двата близки остава');
  // Само предложение: analyze не маха нищо само.
  assert.strictEqual(Core.analyze(mk(), 20).junctions.length, 3);
  assert.deepStrictEqual(partsOf(r, 'X').length, 3, 'X: три участъка (реже се при 1000 и при 2500) ' + JSON.stringify(partsOf(r, 'X')));

  // Маршрут направо по X през пресичането: две съседни части се сливат в една, дължината и изкачването са същите.
  var xs = r.byTrack.X.filter(function (s) { return s.kind === 'part'; });
  var route = { items: [{ type: 'part', trackId: 'X', a: xs[1].a, b: xs[1].b, rev: false }, { type: 'part', trackId: 'X', a: xs[2].a, b: xs[2].b, rev: false }], forks: [] };
  var g0 = Core.routeGeometry(route, tb, r), fk = Core.routeForks(g0, r.junctions, 20, tb).filter(function (f) { return f.j === cross.j; })[0];
  assert.ok(fk && fk.head === 0, 'маршрутът минава през пресичането');
  var drop = [Core.junctionPlace(cross.j)];
  Core.dropJunction(route, fk, cross.j, 20);
  var r1 = Core.analyze(ts, 20, { drop: drop });
  assert.strictEqual(r1.junctions.length, 2, 'изтритият пръстен го няма');
  assert.ok(!r1.junctions.some(function (j) { return U.hav(j.lat, j.lon, cross.j.lat, cross.j.lon) < 30; }), 'и при ново пресмятане не се връща');
  assert.deepStrictEqual(partsOf(r1, 'X'), [[0, Math.round(xs[0].b)], [Math.round(xs[1].a), Math.round(xs[2].b)]], 'X: участъците от двете страни се сливат в един');
  assert.strictEqual(partsOf(r1, 'V').length, 1, 'V се чете цял');
  assert.strictEqual(route.items.length, 1, 'двете части на маршрута стават една');
  var g1 = Core.routeGeometry(route, tb, r1);
  assert.ok(Math.abs(g1.len - g0.len) < 1e-6, 'дължината не се мести: ' + g0.len + ' → ' + g1.len);
  assert.ok(Math.abs(ascent(g1) - ascent(g0)) < 1e-6, 'изкачването не се мести: ' + ascent(g0) + ' → ' + ascent(g1));
  var sumX = function (rr) { return rr.byTrack.X.filter(function (s) { return s.kind === 'part'; }).reduce(function (s, x) { return s + x.len; }, 0); };
  assert.ok(Math.abs(sumX(r1) - sumX(r)) < 1e-6, 'сборът на участъците на X е същият');

  // Маршрутът сменя клона при пресичането (X → V на юг): след изтриването продължава направо по X.
  var vs = r.byTrack.V.filter(function (s) { return s.kind === 'part'; });
  var r2 = { items: [{ type: 'part', trackId: 'X', a: xs[1].a, b: xs[1].b, rev: false }, { type: 'part', trackId: 'V', a: vs[1].a, b: vs[1].b, rev: false }], forks: [{ at: [cross.j.lat, cross.j.lon], alts: [] }] };
  var gs = Core.routeGeometry(r2, tb, r), fs = Core.routeForks(gs, r.junctions, 20, tb).filter(function (f) { return f.j === cross.j; })[0];
  assert.ok(fs && fs.chosen >= 0 && r.junctions[r.junctions.indexOf(cross.j)].branches[fs.chosen].trackId === 'V', 'маршрутът е избрал V');
  Core.dropJunction(r2, fs, cross.j, 20);
  assert.deepStrictEqual(r2.items.map(function (it) { return [it.trackId, Math.round(it.a), Math.round(it.b)]; }), [['X', Math.round(xs[1].a), Math.round(xs[2].b)]], 'смяната на клона отпада: направо по X до края');
  assert.strictEqual(r2.forks.length, 0, 'паметта за избора в точката отпада');

  // Изтрит участък (t.dels): не е част, не се чертае като изрязан, частта върху него е невалидна.
  var td = mk(); td[0].dels = [{ a: 3000, b: 3500 }];
  var rd = Core.analyze(td, 20);
  assert.ok(rd.byTrack.X.some(function (s) { return s.kind === 'del' && s.a === 3000 && s.b === 3500; }), 'изтритият участък е отбелязан');
  assert.ok(!rd.byTrack.X.some(function (s) { return s.kind === 'cut'; }), 'не е изрязване');
  assert.ok(!rd.parts.some(function (s) { return s.trackId === 'X' && Core.overlap(s.a, s.b, 3000, 3500) > 0; }), 'никоя част не минава през него');
  assert.ok(Core.invalidShare({ trackId: 'X', a: 2600, b: 4000 }, rd).bad, 'част през изтрития участък е невалидна');
  var tr = Core.trimItems([{ type: 'part', trackId: 'X', a: 2500, b: 4900 }], 'X', 3000, 3500);
  assert.deepStrictEqual(tr.map(function (it) { return [it.a, it.b]; }), [[2500, 3000], [3500, 4900]], 'маршрутът губи изтритата отсечка - две части');
  console.log('1.3.0 разклонения: OK');
})();

// 1.3.1: изтриване на разклонение маха и съседа до NEAR_J по трака; един клик върху дубликат маха всички освен един.
(function () {
  var MPDL = 6371008.8 * Math.PI / 180, KX = Math.cos(42.5 * Math.PI / 180) * MPDL;
  function lonAt(d) { return 24.70 + d / KX; }
  function latAt(m) { return 42.5 + m / MPDL; }
  function byIdOf(ts) { var o = {}; ts.forEach(function (t) { o[t.id] = t; }); return o; }
  function partsOf(r, id) { return r.byTrack[id].filter(function (s) { return s.kind === 'part'; }); }
  // (а) X на изток; Y свършва на 18 м над X при км 1,0, W - върху X при км 1,025: два пръстена на 25 м по X.
  var ts = [
    { id: 'X', pts: line(42.5, 24.70, 42.5, 24.76, 300) },
    { id: 'Y', pts: line(latAt(300), lonAt(1000), latAt(18), lonAt(1000), 30) },
    { id: 'W', pts: line(latAt(-300), lonAt(1025), 42.5, lonAt(1025), 30) }
  ], tb = byIdOf(ts), r = Core.analyze(ts, 20);
  assert.strictEqual(r.junctions.length, 2, '(а) два пръстена');
  assert.strictEqual(partsOf(r, 'X').length, 2, '(а) X е разрязан на две (двата пръстена делят един разрез)');
  var jy = r.junctions.filter(function (j) { return j.branches.some(function (b) { return b.trackId === 'Y'; }); })[0];
  var only = Core.analyze(ts, 20, { drop: [Core.junctionPlace(jy)] });
  assert.strictEqual(partsOf(only, 'X').length, 2, '(а) само кликнатият пръстен: съседът оставя X разрязан на две');
  var js = Core.nearJunctions(jy, r.junctions, tb, 20);
  assert.strictEqual(js.length, 2, '(а) с пръстена на Y пада и този на W (25 м по X)');
  assert.ok(js[0] === jy, '(а) кликнатият е първи');
  var route = { items: [], forks: [] };
  js.forEach(function (j) { Core.dropJunction(route, null, j, 20); });
  var r1 = Core.analyze(ts, 20, { drop: js.map(Core.junctionPlace) });
  assert.strictEqual(r1.junctions.length, 0, '(а) пръстени не остават');
  assert.deepStrictEqual(partsOf(r1, 'X').map(function (s) { return [Math.round(s.a), Math.round(s.b)]; }), [[0, Math.round(partsOf(r, 'X')[1].b)]], '(а) X е един участък');
  // Далечен пръстен (над NEAR_J) не пада: W при км 1,1.
  var far = [ts[0], ts[1], { id: 'W', pts: line(latAt(-300), lonAt(1100), 42.5, lonAt(1100), 30) }], rf = Core.analyze(far, 20);
  var jf = rf.junctions.filter(function (j) { return j.branches.some(function (b) { return b.trackId === 'Y'; }); })[0];
  assert.strictEqual(Core.nearJunctions(jf, rf.junctions, byIdOf(far), 20).length, 1, '(а) пръстен на 100 м по трака не пада');

  // (б) Три трака един върху друг в общ участък (км 0,5 - 2,5 по P): Q на 5 м над P, R на 5 м под P, с отклонения в краищата.
  function seq() { var out = []; for (var i = 0; i < arguments.length; i++) out = out.concat(i ? arguments[i].slice(1) : arguments[i]); return out; }
  // При R на 12 м над P (на 7 м от Q) R лежи върху Q, който сам чака - остава пак P.
  [-5, 12].forEach(function (off) {
    var P = { id: 'P', pts: line(42.5, lonAt(0), 42.5, lonAt(3000), 150) };
    var Q = { id: 'Q', pts: seq(line(latAt(400), lonAt(500), latAt(5), lonAt(500), 20), line(latAt(5), lonAt(500), latAt(5), lonAt(2500), 100), line(latAt(5), lonAt(2500), latAt(400), lonAt(2500), 20)) };
    var R = { id: 'R', pts: seq(line(latAt(off < 0 ? -400 : 400), lonAt(500), latAt(off), lonAt(500), 20), line(latAt(off), lonAt(500), latAt(off), lonAt(2500), 100), line(latAt(off), lonAt(2500), latAt(off < 0 ? -400 : 400), lonAt(2500), 20)) };
    var tt = [P, Q, R], rd = Core.analyze(tt, 20);
    console.log('1.3.1 чакащи', rd.pend.map(function (s) { return s.trackId + '@' + s.withId + ' ' + Math.round(s.a) + '-' + Math.round(s.b); }));
    assert.ok(rd.pend.some(function (s) { return s.trackId === 'Q'; }) && rd.pend.some(function (s) { return s.trackId === 'R'; }), '(б, ' + off + ' м) Q и R чакат като дубликати');
    var top = rd.pend.filter(function (s) { return s.trackId === 'R'; })[0];
    var cl = Core.dupCluster(rd.pend, top, ['P', 'Q', 'R']);
    assert.strictEqual(cl.keep, 'P', '(б, ' + off + ' м) остава P: ' + cl.keep);
    assert.deepStrictEqual(cl.trackIds.slice().sort(), ['Q', 'R'], '(б, ' + off + ' м) падат Q и R');
    cl.secs.forEach(function (d) { var t = byIdOf(tt)[d.trackId]; t.skips = Core.mergeIv((t.skips || []).concat([{ a: d.a, b: d.b }])); });
    var rd1 = Core.analyze(tt, 20);
    assert.strictEqual(rd1.pend.length, 0, '(б, ' + off + ' м) след едно решение не остава чакащ дубликат');
    function covers(id, x) { var t = byIdOf(tt)[id]; return partsOf(rd1, id).some(function (s) { var m = Core.nearestOnTrack(t, 42.5, lonAt(x)); return m.dist < 10 && m.d > s.a && m.d < s.b; }); }
    [1000, 1500, 2000].forEach(function (x) {
      var on = tt.filter(function (t) { return covers(t.id, x); }).map(function (t) { return t.id; });
      assert.deepStrictEqual(on, ['P'], '(б, ' + off + ' м) при км ' + x / 1000 + ' остава един трак: ' + on);
    });
  });
  console.log('1.3.1 съседни пръстени и куп дубликати: OK');
})();

// 1.3.2: изрязването маха завинаги - няма t.cuts и раздел "cut"; старите изрезки минават в t.dels.
(function () {
  var X = { id: 'X', pts: line(42.5, 24.70, 42.5, 24.76, 300) };
  X.cuts = [{ a: 1000, b: 1500 }];
  var ra = Core.analyze([X], 20);
  assert.ok(!ra.byTrack.X.some(function (s) { return s.kind === 'cut'; }), 'анализът не познава t.cuts');
  assert.ok(ra.parts.some(function (s) { return Core.overlap(s.a, s.b, 1000, 1500) > 0; }), 't.cuts вече не маха нищо само по себе си');
  X.dels = [{ a: 1400, b: 2000 }];
  var routes = [
    { id: 'r1', items: [{ type: 'part', trackId: 'X', a: 0, b: 3000 }] },
    { id: 'r2', items: [{ type: 'part', trackId: 'X', a: 3000, b: 4000 }, { type: 'link', pts: [[42.5, 24.7], [42.5, 24.71]] }] }
  ];
  Core.cutsToDels([X], routes);
  assert.ok(!('cuts' in X), 'полето cuts пада');
  assert.deepStrictEqual(X.dels, [{ a: 1000, b: 2000 }], 'изрезката се слива с изтритото');
  assert.deepStrictEqual(routes[0].items.map(function (it) { return [it.a, it.b]; }), [[0, 1000], [1500, 3000]], 'маршрутът губи изрязаната отсечка');
  assert.strictEqual(routes[1].items.length, 2, 'маршрут без застъпване не се пипа');
  var rb = Core.analyze([X], 20);
  assert.ok(rb.byTrack.X.some(function (s) { return s.kind === 'del' && s.a === 1000 && s.b === 2000; }), 'старото изрязано е изтрит участък');
  assert.ok(!rb.parts.some(function (s) { return Core.overlap(s.a, s.b, 1000, 2000) > 0; }), 'никоя част не минава през него');
  var inv = Core.invalidShare({ trackId: 'X', a: 900, b: 1200 }, rb);
  assert.ok(inv.bad, 'част през изтритото е невалидна');
  var Y = { id: 'Y', pts: X.pts, cuts: [], dels: [] };
  Core.cutsToDels([Y], routes);
  assert.ok(!('cuts' in Y) && Y.dels.length === 0, 'празно cuts не прави нищо');
  console.log('1.3.2 изрязването маха завинаги (t.cuts -> t.dels): OK');
})();

// 1.4: числото в маркера, "Изчисти преди сглобяване" (всички групи наведнъж) и свързване на всички дупки.
(function () {
  var MPDL = 6371008.8 * Math.PI / 180, KX = Math.cos(42.5 * Math.PI / 180) * MPDL;
  function lonAt(d) { return 24.70 + d / KX; }
  function latAt(m) { return 42.5 + m / MPDL; }
  function byIdOf(ts) { var o = {}; ts.forEach(function (t) { o[t.id] = t; }); return o; }
  function seq() { var out = []; for (var i = 0; i < arguments.length; i++) out = out.concat(i ? arguments[i].slice(1) : arguments[i]); return out; }
  // Три трака един върху друг (км 0,5 - 2,5 по P) и отделно S, който лежи на 8 м над P при км 4 - 5.
  function set() {
    var P = { id: 'P', pts: line(42.5, lonAt(0), 42.5, lonAt(6000), 300) };
    var Q = { id: 'Q', pts: seq(line(latAt(400), lonAt(500), latAt(5), lonAt(500), 20), line(latAt(5), lonAt(500), latAt(5), lonAt(2500), 100), line(latAt(5), lonAt(2500), latAt(400), lonAt(2500), 20)) };
    var R = { id: 'R', pts: seq(line(latAt(-400), lonAt(500), latAt(-5), lonAt(500), 20), line(latAt(-5), lonAt(500), latAt(-5), lonAt(2500), 100), line(latAt(-5), lonAt(2500), latAt(-400), lonAt(2500), 20)) };
    var S = { id: 'S', pts: seq(line(latAt(400), lonAt(4000), latAt(8), lonAt(4000), 20), line(latAt(8), lonAt(4000), latAt(8), lonAt(5000), 50), line(latAt(8), lonAt(5000), latAt(400), lonAt(5000), 20)) };
    return [P, Q, R, S];
  }
  var order = ['P', 'Q', 'R', 'S'];
  var tt = set(), rd = Core.analyze(tt, 20);
  var n = Core.dupCounts(rd.pend, order);
  console.log('1.4 числа', rd.pend.map(function (s) { return s.trackId + '=' + n[s.key]; }));
  rd.pend.forEach(function (s) {
    assert.strictEqual(n[s.key], Core.dupCluster(rd.pend, s, order).secs.length + 1, 'числото е колкото маха кликът плюс копието, което остава');
    assert.strictEqual(n[s.key], s.trackId === 'S' ? 2 : 3, s.trackId + ': ' + (s.trackId === 'S' ? 'два' : 'три') + ' трака един върху друг -> ' + n[s.key]);
  });
  assert.deepStrictEqual(Core.dupCounts([], order), {}, 'без чакащи - без числа');

  // Групите на "Изчисти": две (трите трака и S), всеки чакащ е в точно една.
  var gs = Core.dupGroups(rd.pend, order);
  assert.strictEqual(gs.length, 2, 'две групи: ' + gs.length);
  var all = [];
  gs.forEach(function (cl) { all = all.concat(cl.secs); });
  assert.strictEqual(all.length, rd.pend.length, 'всеки чакащ пада точно веднъж');
  assert.ok(rd.pend.every(function (s) { return all.indexOf(s) >= 0; }), 'нищо чакащо не остава извън групите');
  assert.deepStrictEqual(gs.map(function (cl) { return cl.keep; }), ['P', 'P'], 'от всяка група остава P');

  // Наведнъж = като кликове един след друг: същите skips и нито един чакащ.
  var tb = byIdOf(tt);
  gs.forEach(function (cl) { cl.secs.forEach(function (d) { var t = tb[d.trackId]; t.skips = Core.mergeIv((t.skips || []).concat([{ a: d.a, b: d.b }])); }); });
  var rb = Core.analyze(tt, 20);
  assert.strictEqual(rb.pend.length, 0, 'след изчистването не остава маркер');
  var t2 = set(), tb2 = byIdOf(t2), r2 = Core.analyze(t2, 20), guard = 0;
  while (r2.pend.length && guard++ < 10) {
    Core.dupCluster(r2.pend, r2.pend[0], order).secs.forEach(function (d) { var t = tb2[d.trackId]; t.skips = Core.mergeIv((t.skips || []).concat([{ a: d.a, b: d.b }])); });
    r2 = Core.analyze(t2, 20);
  }
  order.forEach(function (id) { assert.deepStrictEqual(tb[id].skips || [], tb2[id].skips || [], id + ': наведнъж маха същото като кликовете поред'); });
  // Не се отваря дупка: при км 1,5 и 4,5 остава точно един трак (P).
  [1500, 4500].forEach(function (x) {
    var on = tt.filter(function (t) {
      var m = Core.nearestOnTrack(t, 42.5, lonAt(x));
      return m.dist < 12 && rb.byTrack[t.id].some(function (s) { return s.kind === 'part' && m.d > s.a && m.d < s.b; });
    }).map(function (t) { return t.id; });
    assert.deepStrictEqual(on, ['P'], 'при км ' + x / 1000 + ' остава един трак: ' + on);
  });

  // Свързване на всички дупки: три части с два скока - и двете стават "свързано направо", на местата си.
  var X = { id: 'X', pts: line(42.5, lonAt(0), 42.5, lonAt(1000), 50) };
  var Y = { id: 'Y', pts: line(latAt(300), lonAt(1000), latAt(300), lonAt(2000), 50) };
  var Z = { id: 'Z', pts: line(latAt(600), lonAt(2000), latAt(600), lonAt(3000), 50) };
  var ts = [X, Y, Z], ra = Core.analyze(ts, 20), tbz = byIdOf(ts);
  var route = { items: [{ type: 'part', trackId: 'X', a: 0, b: 1000 }, { type: 'part', trackId: 'Y', a: 0, b: 1000 }, { type: 'part', trackId: 'Z', a: 0, b: 1000 }] };
  var g0 = Core.routeGeometry(route, tbz, ra);
  assert.strictEqual(g0.gaps.length, 2, 'две дупки преди: ' + g0.gaps.length);
  assert.strictEqual(Core.bridgeGaps(route.items, g0.gaps), 2, 'свързани са две');
  assert.deepStrictEqual(route.items.map(function (it) { return it.type === 'part' ? it.trackId : (it.bridge && it.link && !it.pts.length ? 'bridge' : '?'); }), ['X', 'bridge', 'Y', 'bridge', 'Z'], 'връзките са между съседните части');
  var g1 = Core.routeGeometry(route, tbz, ra);
  assert.strictEqual(g1.gaps.length, 0, 'няма дупки след това');
  assert.ok(Math.abs(g1.len - g0.len) < 1, 'дължината не се мени - скокът и досега се броеше направо: ' + Math.round(g0.len) + ' / ' + Math.round(g1.len));
  assert.strictEqual(Core.bridgeGaps(route.items, g1.gaps), 0, 'второ натискане не прави нищо');
  // Праг GAP_BRIDGE_MAX_M (500 м): дупка до него се свързва, по-дългата остава отворена за чертане.
  assert.strictEqual(Core.GAP_BRIDGE_MAX_M, 500, 'прагът е 500 м');
  assert.ok(Core.canBridge({ d: 500 }) && Core.canBridge({ d: 340 }) && !Core.canBridge({ d: 500.5 }) && !Core.canBridge(null), 'canBridge: до 500 м включително');
  var W = { id: 'W', pts: line(latAt(1400), lonAt(3000), latAt(1400), lonAt(4000), 50) };
  var ts2 = [X, Y, Z, W], tbw = byIdOf(ts2), rw = Core.analyze(ts2, 20);
  var route2 = { items: [{ type: 'part', trackId: 'X', a: 0, b: 1000 }, { type: 'part', trackId: 'Y', a: 0, b: 1000 }, { type: 'part', trackId: 'Z', a: 0, b: 1000 }, { type: 'part', trackId: 'W', a: 0, b: 1000 }] };
  var gw = Core.routeGeometry(route2, tbw, rw);
  assert.deepStrictEqual(gw.gaps.map(function (g) { return g.d > 500; }), [false, false, true], 'две къси дупки и една над 500 м: ' + gw.gaps.map(function (g) { return Math.round(g.d); }));
  assert.strictEqual(Core.bridgeGaps(route2.items, gw.gaps), 2, 'свързани са само двете къси');
  var gw1 = Core.routeGeometry(route2, tbw, rw);
  assert.ok(gw1.gaps.length === 1 && gw1.gaps[0].d > 500, 'дупката над 500 м остава отворена: ' + gw1.gaps.map(function (g) { return Math.round(g.d); }));
  assert.deepStrictEqual(route2.items.map(function (it) { return it.type === 'part' ? it.trackId : 'bridge'; }), ['X', 'bridge', 'Y', 'bridge', 'Z', 'W'], 'между Z и W връзка няма');
  console.log('1.4 число в маркера, изчистване наведнъж, свързване на дупките до 500 м: OK');
})();

// 1.4.1: тракът се връща по същия път (близалка) - общата отсечка дава пръстен в двата си края,
// и преди махането на дубликата, и след него. Синтетичен трак: в хранилището няма истински записи.
(function () {
  var lat0 = 42.7, lon0 = 24.6, ky = 111320, kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  function at(e, n) { return [lat0 + n / ky, lon0 + e / kx]; }
  // Отсечка от (e0,n0) до (e1,n1) в метри, точка на всеки ~10 м; без първата точка, за да се лепят.
  function leg(e0, n0, e1, n1) {
    var len = Math.hypot(e1 - e0, n1 - n0), k = Math.max(1, Math.round(len / 10)), p = [];
    for (var i = 1; i <= k; i++) { var q = at(e0 + (e1 - e0) * i / k, n0 + (n1 - n0) * i / k); p.push([q[0], q[1], 600]); }
    return p;
  }
  var start = at(0, 0), pts = [[start[0], start[1], 600]]
    .concat(leg(0, 0, 700, 0))          // 700 м на изток
    .concat(leg(700, 0, 850, 0))        // общата отсечка, 150 м
    .concat(leg(850, 0, 1150, 300))     // примката: далеч от линията
    .concat(leg(1150, 300, 1150, -300))
    .concat(leg(1150, -300, 850, 4))    // обратно в края на общата отсечка (на 4 м встрани)
    .concat(leg(850, 4, 700, 4))        // обратното минаване по същата линия
    .concat(leg(700, 4, 700, -600));    // и далеч на юг
  var L = { id: 'L', pts: pts }, e1 = at(700, 0), e2 = at(850, 0);
  function ends(res, when) {
    var near1 = res.junctions.filter(function (j) { return U.hav(j.lat, j.lon, e1[0], e1[1]) < 40; });
    var near2 = res.junctions.filter(function (j) { return U.hav(j.lat, j.lon, e2[0], e2[1]) < 40; });
    console.log('близалка ' + when, res.junctions.map(function (j) { return Math.round(U.hav(j.lat, j.lon, e1[0], e1[1])) + 'м/' + j.branches.length; }));
    assert.strictEqual(res.junctions.length, 2, when + ': общата отсечка дава точно 2 пръстена, има ' + res.junctions.length);
    assert.ok(near1.length === 1 && near1[0].branches.length >= 2, when + ': пръстен в началото на общата отсечка');
    assert.ok(near2.length === 1 && near2[0].branches.length >= 2, when + ': пръстен в края на общата отсечка');
  }
  var r0 = Core.analyze([L], 20);
  assert.strictEqual(r0.pend.length, 1, 'обратното минаване е чакащ дубликат');
  ends(r0, 'преди махането');
  // Клик върху маркера: t.skips от чакащия дубликат.
  L.skips = Core.mergeIv([{ a: r0.pend[0].a, b: r0.pend[0].b }]);
  var r1 = Core.analyze([L], 20);
  assert.strictEqual(r1.pend.length, 0, 'дубликатът е махнат');
  ends(r1, 'след махането');
  assert.strictEqual(Core.redundantJunctions(r1.junctions, { L: L }, 20).length, 0, 'нито един от двата пръстена не се предлага за махане');
  console.log('1.4.1 пръстен в двата края на общата отсечка при връщане по същия път: OK');

  // 1.4.2: на завоя (далечния край) примката е два клона - излизащата и връщащата се отсечка.
  var far = r1.junctions.filter(function (j) { return U.hav(j.lat, j.lon, e2[0], e2[1]) < 40; })[0];
  var nearJ = r1.junctions.filter(function (j) { return U.hav(j.lat, j.lon, e1[0], e1[1]) < 40; })[0];
  var loops = far.branches.filter(function (br) { return br.loop; });
  assert.strictEqual(far.branches.length, 3, 'далечното разклонение има 3 клона: ' + far.branches.map(function (br) { return Math.round(br.a) + '..' + Math.round(br.b) + '@' + br.from; }));
  assert.ok(loops.length === 2 && loops[0].key === loops[1].key && loops[0].from !== loops[1].from, 'примката е предложена в двете посоки');
  assert.strictEqual(nearJ.branches.length, 3, 'близкото разклонение остава с 3 клона');
  var tbL = { L: L }, parts = r1.byTrack.L.filter(function (s) { return s.kind === 'part'; });
  function lolRoute() { return { forks: [], items: parts.map(function (s) { return { type: 'part', trackId: 'L', a: s.a, b: s.b }; }) }; }
  var route = lolRoute(), geo = Core.routeGeometry(route, tbL, r1), fks = Core.routeForks(geo, r1.junctions, 20, tbL);
  var ff = fks.filter(function (f) { return f.j === far; })[0], fn = fks.filter(function (f) { return f.j === nearJ; })[0];
  assert.ok(ff && ff.chosen >= 0 && ff.incoming >= 0, 'далечният край: маршрутът е разпознат (chosen ' + (ff && ff.chosen) + ', incoming ' + (ff && ff.incoming) + ')');
  assert.ok(far.branches[ff.chosen].loop && far.branches[ff.chosen].from === 'a' && !far.branches[ff.incoming].loop, 'идва по общата отсечка, продължава по излизащата отсечка на примката');
  assert.ok(fn && fn.chosen >= 0 && fn.incoming >= 0, 'близкият край продължава да се разпознава');
  // Истинската алтернатива е само примката в обратна посока; изборът ѝ не изхвърля частта след примката.
  var alts = far.branches.filter(function (br, bi) { return bi !== ff.chosen && bi !== ff.incoming; });
  assert.ok(alts.length === 1 && alts[0].loop && alts[0].from === 'b', 'алтернатива: обиколката в обратна посока');
  Core.switchFork(route, ff, alts[0], tbL, 20);
  assert.deepStrictEqual(route.items.map(function (it) { return Math.round(it.a) + '..' + Math.round(it.b) + (it.rev ? 'r' : ''); }),
    parts.map(function (s, i) { return Math.round(s.a) + '..' + Math.round(s.b) + (i === 2 ? 'r' : ''); }), 'примката е обърната, частта след нея остава');
  var f2 = Core.routeForks(Core.routeGeometry(route, tbL, r1), [far], 20, tbL)[0];
  assert.ok(f2.chosen >= 0 && far.branches[f2.chosen].from === 'b' && f2.incoming === ff.incoming, 'след избора маршрутът е на връщащата се отсечка');
  console.log('1.4.2 примката на далечния край - два клона, разпознат маршрут, избор в правилната посока: OK');
})();

// 1.4.2: клон, по-къс от сондата (80 м): маршрутът и клонът се сондират на едно и също разстояние.
(function () {
  var lat0 = 42.7, lon0 = 24.6, ky = 111320, kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  function at(e, n) { return [lat0 + n / ky, lon0 + e / kx]; }
  function leg(e0, n0, e1, n1) {
    var len = Math.hypot(e1 - e0, n1 - n0), k = Math.max(1, Math.round(len / 10)), p = [];
    for (var i = 1; i <= k; i++) { var q = at(e0 + (e1 - e0) * i / k, n0 + (n1 - n0) * i / k); p.push([q[0], q[1], 600]); }
    return p;
  }
  // Същата близалка, но общата отсечка е 60 м.
  var start = at(0, 0), pts = [[start[0], start[1], 600]].concat(leg(0, 0, 700, 0), leg(700, 0, 760, 0), leg(760, 0, 1060, 300),
    leg(1060, 300, 1060, -300), leg(1060, -300, 760, 4), leg(760, 4, 700, 4), leg(700, 4, 700, -600));
  var L = { id: 'L', pts: pts }, tb = { L: L };
  var r0 = Core.analyze([L], 20);
  L.skips = Core.mergeIv(r0.pend.map(function (s) { return { a: s.a, b: s.b }; }));
  var r1 = Core.analyze([L], 20);
  var parts = r1.byTrack.L.filter(function (s) { return s.kind === 'part'; }), shared = parts[1];
  assert.ok(parts.length === 4 && shared.len < Core.PROBE, 'общата отсечка е по-къса от сондата: ' + Math.round(shared.len) + ' м');
  var route = { items: parts.map(function (s) { return { type: 'part', trackId: 'L', a: s.a, b: s.b }; }) };
  var fks = Core.routeForks(Core.routeGeometry(route, tb, r1), r1.junctions, 20, tb);
  assert.strictEqual(fks.length, 2, 'маршрутът минава през двата края');
  fks.forEach(function (f) {
    assert.ok(f.k <= shared.len / 2 + 0.01 && f.k >= 15, 'сондата е до половината на най-късия клон: ' + Math.round(f.k) + ' м');
    assert.ok(f.chosen >= 0 && f.incoming >= 0, 'клонът е разпознат (chosen ' + f.chosen + ', incoming ' + f.incoming + ')');
    var onShared = [f.chosen, f.incoming].filter(function (i) { return f.j.branches[i].key === shared.key; });
    assert.strictEqual(onShared.length, 1, 'късата обща отсечка е единият от двата клона на маршрута');
  });
  console.log('1.4.2 клон, по-къс от сондата: OK');
})();

// 1.4.3: тракът пресича себе си (X) между два различни приети участъка - разклонение с пръстен,
// а другата отсечка се предлага в двете посоки. Плиткото пресичане и пресичането вътре в един
// участък не са кръстовища.
(function () {
  var lat0 = 42.6, lon0 = 24.5, ky = 111320, kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  function at(e, n) { return [lat0 + n / ky, lon0 + e / kx]; }
  function leg(e0, n0, e1, n1) {
    var len = Math.hypot(e1 - e0, n1 - n0), k = Math.max(1, Math.round(len / 10)), p = [];
    for (var i = 1; i <= k; i++) { var q = at(e0 + (e1 - e0) * i / k, n0 + (n1 - n0) * i / k); p.push([q[0], q[1], 600]); }
    return p;
  }
  function jump(e, n) { var q = at(e, n); return [[q[0], q[1], 600]]; }
  // 800 м на изток, 600 м на север, загубен сигнал (скок от 395 м - дупка, нов участък), после
  // 1000 м на юг през първата отсечка: кръстовище под 90° в (405, 0).
  var start = at(0, 0), X = at(405, 0);
  var xPts = [[start[0], start[1], 600]].concat(leg(0, 0, 800, 0), leg(800, 0, 800, 600), jump(405, 600), leg(405, 600, 405, -400));
  var T = { id: 'X', pts: xPts }, tb = { X: T };
  var r = Core.analyze([T], 20);
  var near = r.junctions.filter(function (j) { return U.hav(j.lat, j.lon, X[0], X[1]) < 30; });
  console.log('X', r.byTrack.X.map(function (s) { return s.kind + ':' + Math.round(s.a) + '-' + Math.round(s.b); }), r.junctions.map(function (j) { return j.branches.length + (j.self ? 's' : '') + (j.cross ? 'c' : ''); }));
  assert.strictEqual(r.junctions.length, 1, 'X: точно един пръстен - на кръстовището');
  assert.ok(near.length === 1 && near[0].self && !near[0].cross, 'X: кръстовището е разклонение на трака със себе си, не „без избор“');
  var xj = near[0];
  assert.strictEqual(xj.branches.length, 4, 'X: 4 клона - двете отсечки в двете посоки');
  assert.ok(xj.branches.every(function (br) { return br.trackId === 'X' && !br.loop; }), 'X: всички клонове са по трака, без примка');
  assert.strictEqual(Core.redundantJunctions(r.junctions, tb, 20).length, 0, 'X: пръстенът не се предлага за махане');
  var parts = r.byTrack.X.filter(function (s) { return s.kind === 'part'; });
  var want = [[0, 405], [405, 1400], [1795, 2395], [2395, 2795]]; // по равнината; хаверсинусът дава до 0,2% по-малко
  assert.ok(parts.length === 4 && parts.every(function (s, i) { return Math.abs(s.a - want[i][0]) < 8 && Math.abs(s.b - want[i][1]) < 8; }),
    'X: двата участъка се режат в кръстовището: ' + parts.map(function (s) { return Math.round(s.a) + '..' + Math.round(s.b); }));
  function ab(s) { return Math.round(s.a) + '..' + Math.round(s.b); }
  // Маршрутът идва от запад и продължава на изток; другата отсечка се предлага в двете посоки.
  var route = { forks: [], items: [parts[0], parts[1]].map(function (s) { return { type: 'part', trackId: 'X', a: s.a, b: s.b }; }) };
  var f = Core.routeForks(Core.routeGeometry(route, tb, r), [xj], 20, tb)[0];
  assert.ok(f && f.chosen >= 0 && f.incoming >= 0, 'X: маршрутът е разпознат в кръстовището (chosen ' + (f && f.chosen) + ', incoming ' + (f && f.incoming) + ')');
  assert.ok(xj.branches[f.incoming].key === parts[0].key && xj.branches[f.chosen].key === parts[1].key, 'X: идва по първата отсечка, продължава по нея');
  var alts = xj.branches.filter(function (br, bi) { return bi !== f.chosen && bi !== f.incoming; });
  assert.deepStrictEqual(alts.map(function (br) { return br.key + '@' + br.from; }).sort(), [parts[2].key + '@b', parts[3].key + '@a'].sort(), 'X: алтернативите са другата отсечка - на север (срещу записа) и на юг (по записа)');
  // Изборът на юг продължава маршрута натам; досегашното продължение се пази и се връща.
  Core.switchFork(route, f, alts.filter(function (br) { return br.from === 'a'; })[0], tb, 20);
  assert.deepStrictEqual(route.items.map(function (it) { return ab(it) + (it.rev ? 'r' : ''); }), [ab(parts[0]), ab(parts[3])], 'X: маршрутът завива на юг');
  var f2 = Core.routeForks(Core.routeGeometry(route, tb, r), [xj], 20, tb)[0];
  assert.ok(f2.chosen >= 0 && xj.branches[f2.chosen].key === parts[3].key && f2.incoming === f.incoming, 'X: след избора маршрутът е на южната отсечка');
  Core.switchFork(route, f2, alts.filter(function (br) { return br.from === 'b'; })[0], tb, 20);
  assert.deepStrictEqual(route.items.map(function (it) { return ab(it) + (it.rev ? 'r' : ''); }), [ab(parts[0]), ab(parts[2]) + 'r'], 'X: маршрутът завива на север, срещу посоката на записа');
  var f3 = Core.routeForks(Core.routeGeometry(route, tb, r), [xj], 20, tb)[0];
  Core.switchFork(route, f3, xj.branches[f.chosen], tb, 20);
  assert.deepStrictEqual(route.items.map(ab), [ab(parts[0]), ab(parts[1])], 'X: изборът на старата посока връща пазеното продължение');
  console.log('1.4.3 тракът пресича себе си между два участъка - разклонение, двете посоки на другата отсечка: OK');

  // Същото кръстовище без загубения сигнал: един участък - пресичането вътре в него не е разклонение.
  var one = { id: 'O', pts: [[start[0], start[1], 600]].concat(leg(0, 0, 800, 0), leg(800, 0, 800, 600), leg(800, 600, 405, 600), leg(405, 600, 405, -400)) };
  var ro = Core.analyze([one], 20);
  assert.strictEqual(ro.byTrack.O.filter(function (s) { return s.kind === 'part'; }).length, 1, 'един участък');
  assert.strictEqual(ro.junctions.length, 0, 'пресичане вътре в един участък не дава пръстен');
  // Пресичане между два участъка под ъгъл deg (градуси) в (405, 0).
  function slant(deg) {
    var dy = 400 * Math.tan(deg * Math.PI / 180) / 2;
    return { id: 'S', pts: [[start[0], start[1], 600]].concat(leg(0, 0, 800, 0), leg(800, 0, 800, 600), jump(205, 600), leg(205, 600, 205, dy), leg(205, dy, 605, -dy)) };
  }
  [20, 25].forEach(function (deg) {
    var rs = Core.analyze([slant(deg)], deg === 20 ? 10 : 20);
    assert.strictEqual(rs.byTrack.S.filter(function (s) { return s.kind === 'part'; }).length, 2, deg + '°: два участъка, нищо не ги реже');
    assert.strictEqual(rs.junctions.length, 0, deg + '°: плиткото пресичане (под ' + Core.SELF_ANGLE + '°) не дава пръстен');
  });
  [35, 60].forEach(function (deg) {
    var rt = Core.analyze([slant(deg)], 20);
    assert.ok(rt.junctions.length === 1 && rt.junctions[0].self && rt.junctions[0].branches.length === 4, deg + '°: пресичане между два участъка е разклонение с 4 клона');
  });
  console.log('1.4.3 праг на ъгъла и граница „различни участъци“: OK');
})();

// 1.5: самозатваряне на малките дупки (праг в „Настройки“) и застъпване без маркер.
(function () {
  var lat0 = 42.7, lon0 = 24.6, ky = 6371008.8 * Math.PI / 180, kx = Math.cos(lat0 * Math.PI / 180) * ky;
  function at(e, n) { return [lat0 + n / ky, lon0 + e / kx, 500]; }
  function leg(e0, n0, e1, n1, step) {
    step = step || 5;
    var L = Math.hypot(e1 - e0, n1 - n0), k = Math.max(1, Math.round(L / step)), o = [];
    for (var i = 1; i <= k; i++) o.push(at(e0 + (e1 - e0) * i / k, n0 + (n1 - n0) * i / k));
    return o;
  }
  // Прагът: 100 м по подразбиране, 0 = никога, таван 500 м.
  assert.strictEqual(Core.AUTO_GAP_DEF, 100, 'прагът по подразбиране е 100 м');
  assert.strictEqual(Core.AUTO_GAP_MAX, 500, 'таванът е 500 м');
  assert.deepStrictEqual([Core.autoGapMax(900), Core.autoGapMax(-5), Core.autoGapMax('x'), Core.autoGapMax('70')], [500, 0, 100, 70], 'прагът се стяга в 0..500');

  // Трак 2 км на изток; маршрутът е целият. „Изтрий участъка“ маха 60 м и 300 м от него.
  var P = { id: 'P', pts: [at(0, 0)].concat(leg(0, 0, 2000, 0)) }, tb = { P: P };
  function cutRoute(max, open) {
    P.dels = [{ a: 500, b: 560 }, { a: 1200, b: 1500 }];
    var route = { items: [{ type: 'part', trackId: 'P', a: 0, b: Core.prep(P).len }], openGaps: open || [] };
    P.dels.forEach(function (d) { route.items = Core.trimItems(route.items, 'P', d.a, d.b); });
    var r = Core.analyze([P], 20), g = Core.routeGeometry(route, tb, r);
    var n = Core.closeSmallGaps(route, g.gaps, max);
    return { n: n, before: g, after: Core.routeGeometry(route, tb, r), route: route };
  }
  var c100 = cutRoute(100);
  assert.deepStrictEqual(c100.before.gaps.map(function (g) { return Math.round(g.d); }), [60, 300], 'две дупки след изтриването: 60 и 300 м');
  assert.strictEqual(c100.n, 1, 'при праг 100 м се затваря само дупката от 60 м');
  assert.deepStrictEqual(c100.after.gaps.map(function (g) { return Math.round(g.d); }), [300], 'дупката от 300 м остава с пръстена');
  var auto = c100.route.items.filter(function (it) { return it.autoClose; });
  assert.ok(auto.length === 1 && auto[0].type === 'draw' && auto[0].link && !auto[0].pts.length, 'затворената сама дупка е празна връзка в маршрута');
  var parts = function (g) { return g.items.filter(function (x) { return x.item.type === 'part' && x.pts.length; }).length; };
  assert.strictEqual(parts(c100.after), parts(c100.before), 'връзката не е част');
  var li = c100.route.items.indexOf(auto[0]);
  assert.ok(c100.route.items[li - 1].type === 'part' && c100.route.items[li + 1].type === 'part', 'връзката стои между двете части - .gpx минава направо от края на едната до началото на другата');
  assert.strictEqual(cutRoute(0).n, 0, 'праг 0: нищо не се затваря');
  assert.strictEqual(cutRoute(500).n, 2, 'праг 500: и двете');
  var g0 = c100.before.gaps[0];
  assert.strictEqual(cutRoute(100, [[g0.from[0], g0.from[1], g0.to[0], g0.to[1]]]).n, 0, 'отворената пак дупка не се затваря сама');
  // Сегашното самозатваряне до отклонението си остава: при отклонение 40 м дупка от 35 м е autoGap, без да пипа route.items.
  P.dels = [{ a: 500, b: 535 }];
  var rt = { items: Core.trimItems([{ type: 'part', trackId: 'P', a: 0, b: P.len }], 'P', 500, 535) };
  var g15 = Core.routeGeometry(rt, tb, Core.analyze([P], 40));
  assert.ok(g15.gaps.length === 0 && g15.autoGaps.length === 1, 'дупка под отклонението се затваря сама както досега');
  delete P.dels;
  console.log('1.5 самозатваряне на малките дупки до прага: OK');

  // Застъпване без маркер: analyze не слага маркер, а линия под участъка има.
  function marks(r, id) { return r.pend.filter(function (s) { return s.trackId === id; }).length; }
  function lo(ts) { return Core.leftoverOverlaps(ts, 20); }
  // а) Късо съвпадение: Q върви 60 м на 8 м от P (под minDup = 100 м).
  var Q = { id: 'Q', pts: [at(500, -400)].concat(leg(500, -400, 500, -8), leg(500, -8, 560, -8), leg(560, -8, 560, -400)) };
  var ra = Core.analyze([P, Q], 20);
  assert.ok(marks(ra, 'Q') + marks(ra, 'P') === 0, 'а) късото съвпадение няма маркер');
  var ua = Core.underTracks(Q, 392, 452, [P, Q], 20);
  assert.ok(ua.length === 1 && ua[0].trackId === 'P' && Math.abs(ua[0].a - 500) < 6 && Math.abs(ua[0].b - 560) < 6, 'а) под участъка лежи P, км 0,50-0,56: ' + JSON.stringify(ua.map(function (u) { return [u.trackId, Math.round(u.a), Math.round(u.b)]; })));
  var la = lo([P, Q]);
  assert.ok(la.length === 1 && la[0].trackId === 'Q' && la[0].withId === 'P', 'а) проверката за дубликати го намира');
  // б) Разминаване над отклонението: Z се люшка между 10 м и 27 м от P - нито едно близко парче не стига 100 м.
  var zz = [at(0, 10)];
  for (var e = 0; e < 1000; e += 200) zz = zz.concat(leg(e, 10, e + 60, 10), leg(e + 60, 10, e + 65, 27), leg(e + 65, 27, e + 195, 27), leg(e + 195, 27, e + 200, 10));
  var Z = { id: 'Z', pts: zz }, rb = Core.analyze([P, Z], 20);
  assert.ok(marks(rb, 'Z') + marks(rb, 'P') === 0, 'б) разминаването над отклонението - без маркер');
  var ub = Core.underTracks(Z, 0, Core.prep(Z).len, [P, Z], 20);
  assert.ok(ub.length === 1 && ub[0].trackId === 'P' && ub[0].len > 900, 'б) под участъка лежи P, ~1 км');
  assert.ok(lo([P, Z]).some(function (x) { return x.trackId === 'Z' && x.withId === 'P' && x.len > 900; }), 'б) проверката за дубликати го намира');
  // в) Къс завой на косата: H отива 120 м и се връща на 8 м - под lag (300 м) тракът не се сравнява със себе си.
  var H = { id: 'H', pts: [at(0, 1000)].concat(leg(0, 1000, 120, 1000), leg(120, 1000, 120, 1008), leg(120, 1008, 0, 1008)) };
  var rc = Core.analyze([H], 20);
  assert.strictEqual(marks(rc, 'H'), 0, 'в) късият завой на косата няма маркер');
  var uc = Core.underTracks(H, 0, 100, [H], 20);
  assert.ok(uc.length === 1 && uc[0].self && uc[0].a > 128, 'в) под отиването лежи връщането на същия трак');
  assert.ok(lo([H]).some(function (x) { return x.trackId === 'H' && x.withId === 'H'; }), 'в) проверката за дубликати го намира');
  // г) Маркирано застъпване: маркерът е на B, а под обикновения участък на P лежи B. Махнатото (skips) не се брои.
  var B = { id: 'B', pts: [at(200, 9)].concat(leg(200, 9, 1400, 9)) };
  var rd = Core.analyze([P, B], 20);
  assert.ok(marks(rd, 'B') === 1 && marks(rd, 'P') === 0, 'г) маркерът е само на B');
  assert.ok(Core.underTracks(P, 400, 1000, [P, B], 20)[0].trackId === 'B', 'г) под обикновения участък на P лежи B');
  B.skips = [{ a: 0, b: Core.prep(B).len }];
  assert.strictEqual(Core.underTracks(P, 400, 1000, [P, B], 20).length, 0, 'г) след махането на B отдолу няма нищо');
  assert.strictEqual(lo([P, B]).length, 0, 'г) проверката за дубликати: няма останали');
  // Пресичане под прав ъгъл не е застъпване.
  var X = { id: 'X', pts: [at(700, -500)].concat(leg(700, -500, 700, 500)) };
  assert.strictEqual(Core.underTracks(X, 0, Core.prep(X).len, [P, X], 20).length, 0, 'пресичането не е „под него“');
  assert.strictEqual(lo([P, X]).length, 0, 'пресичането не е останал дубликат');
  console.log('1.5 застъпване без маркер (под прага, над отклонението, къс завой) и проверката за дубликати: OK');
})();

// 1.6: чиста колекция - цялата споделена отсечка с маркера, застъпванията без маркер и малките дупки в колекцията,
// трите условия за готова колекция. Синтетичната колекция tests/fixtures/chista-kolekcia.json (виж tests/browser.cjs, 1.6).
(function () {
  var fs = require('fs'), path = require('path');
  function load() { return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'chista-kolekcia.json'), 'utf8')).tracks; }
  function byId(ts, id) { return ts.filter(function (t) { return t.id === id; })[0]; }
  function iv(x) { return Math.round(x.a) + '-' + Math.round(x.b); }
  // Разклоненията - метри по „Синтетичен А“.
  function jA(ts, r) { var A = byId(ts, 'syn-a'); return r.junctions.map(function (j) { return Math.round(Core.nearestOnTrack(A, j.lat, j.lon).d); }).sort(function (p, q) { return p - q; }); }
  var ts = load(), r0 = Core.analyze(ts, 20);
  assert.strictEqual(r0.pend.length, 1, 'фикстурата: един маркиран дубликат');
  var sec = r0.pend[0];
  assert.ok(sec.trackId === 'syn-b' && sec.a > 340 && sec.b < 1030, 'маркерът покрива само частта на 8 м: ' + iv(sec));
  assert.strictEqual(Core.trackHoles(ts, 20, 100).length, 1, 'фикстурата: една малка дупка (изтритият участък на А между двете пресичания)');

  // 1.5: маркерът маха само своята част - краищата на 22 м остават и „връщат“ трака в участъка.
  var t15 = load();
  byId(t15, 'syn-b').skips = [{ a: sec.a, b: sec.b }];
  var lo15 = Core.leftoverOverlaps(t15, 20).filter(function (x) { return x.a < 1200; });
  assert.strictEqual(lo15.length, 2, 'само с маркера остават двата края на споделената отсечка: ' + lo15.map(iv));
  assert.ok(jA(t15, Core.analyze(t15, 20)).some(function (d) { return d > 840 && d < 1560; }), 'и разклоненията стоят вътре в отсечката');

  // 1.6: Core.dupStretch до jt (30 м) от А, успоредно - от 1.7 само за застъпванията без маркер (reach = jt).
  var t16 = load(), B = byId(t16, 'syn-b'), cl = Core.dupCluster(r0.pend, sec, ['syn-a', 'syn-b']);
  var st = Core.dupStretch(B, sec, t16, 20, cl.keep, Core.joinTol(20));
  assert.ok(cl.keep === 'syn-a' && st.a < 300 && st.a > 270 && st.b > 1070 && st.b < 1100, 'споделената отсечка е по-широка от маркера: ' + iv(st) + ' срещу ' + iv(sec));
  B.skips = [st];
  var r16 = Core.analyze(t16, 20);
  assert.ok(!Core.leftoverOverlaps(t16, 20).some(function (x) { return x.a < 1200; }), 'след нея в участъка не остава застъпване');
  // Махнатото извън намерения дубликат също не е част: участъците на Б не влизат в отсечката.
  assert.ok(r16.byTrack['syn-b'].every(function (s) { return s.kind !== 'part' || s.b <= st.a + 1 || s.a >= st.b - 1; }), 'участъците на Б не влизат в махнатото');
  var dB = r16.byTrack['syn-b'].filter(function (s) { return s.kind === 'dup'; });
  assert.ok(dB.length === 1 && Math.abs(dB[0].a - st.a) < 1 && Math.abs(dB[0].b - st.b) < 1, 'един махнат участък - дубликатът и краищата му: ' + dB.map(iv));
  var j16 = jA(t16, r16);
  assert.ok(!j16.some(function (d) { return d > 840 && d < 1560; }), 'вътре в отсечката няма разклонение: ' + j16);
  assert.ok(j16.filter(function (d) { return Math.abs(d - 805) < 40; }).length === 1 && j16.filter(function (d) { return Math.abs(d - 1595) < 40; }).length === 1, 'по една точка на разклоняване в двата края: ' + j16);
  // Махнатият дубликат не е дупка - отдолу стои А.
  assert.deepStrictEqual(Core.trackHoles(t16, 20, 1000).map(function (h) { return h.trackId; }), ['syn-a'], 'отворът в Б е покрит от А - дупка е само изтритото на А');
  console.log('1.6 цялата споделена отсечка с маркера, една точка на разклоняване в края: OK');

  // Малките дупки в колекцията: пресичанията не покриват дупката, прагът важи, затворената е t.joins.
  var th = load(), h = Core.trackHoles(th, 20, 100);
  assert.ok(h.length === 1 && h[0].trackId === 'syn-a' && Math.abs(h[0].d - 60) < 3, 'дупката е 60 м: ' + JSON.stringify(h.map(function (x) { return [x.trackId, iv(x), Math.round(x.d)]; })));
  assert.ok(Core.underTracks(byId(th, 'syn-a'), h[0].a, h[0].b, th, 20).length, 'без условието за успоредност двете пресичания (на 60 м) „покриват“ дупката');
  assert.strictEqual(Core.trackHoles(th, 20, 50).length, 0, 'над прага (50 м) не е малка дупка');
  assert.strictEqual(Core.closeHoles(th, 20, 0).length, 0, 'праг 0: нищо не се затваря');
  var ch = Core.closeHoles(th, 20, 100);
  assert.ok(ch.length === 1 && byId(th, 'syn-a').joins.length === 1, 'затворена дупка: t.joins');
  assert.strictEqual(Core.trackHoles(th, 20, 100).length, 0, 'затворената не е отворена');
  assert.strictEqual(Core.liveJoins(byId(th, 'syn-a')).length, 1, 'чертае се');
  var aDels = byId(th, 'syn-a').dels; byId(th, 'syn-a').dels = [];
  assert.strictEqual(Core.liveJoins(byId(th, 'syn-a')).length, 0, 'без отвора (след „Отмени“) затворената не се чертае');
  byId(th, 'syn-a').dels = aDels;
  console.log('1.6 малките дупки в колекцията: OK');

  // Трите условия: пробата не пипа траковете; чистенето в реда на CX ги изпълнява.
  var tc = load(), ck = Core.collectionCheck(tc, 20);
  // 1.7: маркерът крие само покритото до прага (8 м) - двата края на 22 м остават като застъпвания без маркер.
  assert.ok(ck.marked === 1 && ck.after && ck.overlaps.length === 3 && ck.holes.length === 1 && !ck.ok, 'преди: 1 маркиран, след него 3 застъпвания без маркер (късото и двата края на 22 м), 1 дупка: ' + JSON.stringify([ck.marked, ck.overlaps.length, ck.holes.length]));
  assert.ok(ck.overlaps.every(function (o) { return o.trackId === 'syn-b' && o.withId === 'syn-a' && o.len < 100; }), 'застъпванията без маркер са къси (под 100 м): ' + ck.overlaps.map(iv));
  assert.ok(tc.every(function (t) { return !(t.skips || []).length && !(t.joins || []).length; }), 'пробата не пипа траковете');
  var skipped = [], res = Core.cleanCollection(tc, 20, { onSkip: function (id, a, b) { skipped.push(id + ':' + Math.round(a) + '-' + Math.round(b)); } });
  assert.ok(res.dups === 1 && res.overlaps === 3 && res.joined === 1 && skipped.length === 4, 'изчистени: дубликат, застъпвания, дупка: ' + JSON.stringify(res));
  assert.strictEqual(Core.analyze(tc, 20).pend.length, 0, 'условие 1: няма дублирани тракове');
  assert.deepStrictEqual(Core.leftoverOverlaps(tc, 20), [], 'условие 2: няма покрити един върху друг тракове, които не се отчитат');
  assert.deepStrictEqual(Core.trackHoles(tc, 20, 100), [], 'условие 3: няма незатворени дупки');
  assert.ok(Core.collectionCheck(tc, 20).ok, 'колекцията е консистентна');
  console.log('1.6 трите условия за готова колекция върху фикстурата: OK');

  // Същият трак, минал втори път (обратно): маркерът е на второто минаване, краищата на 22 м отиват с него.
  var lat0 = 42.64, lon0 = 24.83, ky = 6371008.8 * Math.PI / 180, kx = Math.cos(lat0 * Math.PI / 180) * ky;
  function poly(v) {
    var o = [[lat0 + v[0][1] / ky, lon0 + v[0][0] / kx, 500]];
    for (var i = 1; i < v.length; i++) { var a = v[i - 1], b = v[i], k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
      for (var j = 1; j <= k; j++) o.push([lat0 + (a[1] + (b[1] - a[1]) * j / k) / ky, lon0 + (a[0] + (b[0] - a[0]) * j / k) / kx, 500]); }
    return o;
  }
  var H = { id: 'H', pts: poly([[0, 0], [1500, 0], [1500, 70], [1250, 70], [1240, 22], [1180, 22], [1170, 8], [400, 8], [390, 22], [330, 22], [320, 70], [0, 70]]) };
  var rh = Core.analyze([H], 20);
  assert.ok(rh.pend.length === 1 && rh.pend[0].withId === 'H', 'маркер на второто минаване на същия трак');
  var sh = Core.dupStretch(H, rh.pend[0], [H], 20, 'H', Core.joinTol(20));
  assert.ok(sh.b - sh.a > rh.pend[0].len + 80, 'отсечката взема и краищата: ' + iv(sh) + ' срещу ' + iv(rh.pend[0]));
  Core.cleanCollection([H], 20, {});
  assert.ok(Core.collectionCheck([H], 20).ok && Core.analyze([H], 20).byTrack.H.some(function (s) { return s.kind === 'part' && s.a < 100; }), 'след чистенето първото минаване остава, колекцията е консистентна');
  console.log('1.6 същият трак, минал втори път: OK');
})();
