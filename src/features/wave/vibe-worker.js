/**
 * vibe-worker.js — рендерер фоновой «волны» на WebGL в Web Worker.
 *
 * Воркер получает OffscreenCanvas через transferControlToOffscreen() и рисует
 * полноэкранный фрагментный шейдер: domain warping + fbm noise + мягкая
 * радиальная маска + палитра pink -> magenta -> yellow -> orange.
 *
 * Поддерживает два протокола сообщений:
 *   1) собственный:  { type: 'init' | 'resize' | 'settings' | 'enable' | 'disable' }
 *   2) внутренний протокол Яндекс.Музыки:
 *      { source: 'vibe', type: 'vibe-animation-worker-apply-settings' | '-enable' | '-disable',
 *        payload: { backgroundColor: [r,g,b], hue, collectionHue, useDefaultHue, speed, ... } }
 *
 * Второй протокол нужен, чтобы этот воркер можно было подставить вместо
 * оригинального в приложении (см. custom-themes.ts в моде).
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;
uniform float uTime;
uniform float uHue;          // 0..1 сдвиг оттенка
uniform vec3  uBg;           // цвет фона (0..1)
uniform float uIntensity;    // общая непрозрачность/насыщенность
uniform float uSoftness;     // мягкость края
uniform float uScale;        // масштаб блоба
uniform float uRays;         // длина лучей по краю блоба
uniform float uNeon;         // яркость неоновых линий
uniform float uBend;         // 0 = лучи, 1 = кольца
uniform float uEnergy;       // 0..1 средний уровень трека
uniform float uBeat;         // 0..1 бас, быстрая огибающая (удар)
uniform float uScream;       // 0..1 верхняя середина, быстрая огибающая (скрим/припев)
uniform float uFxFire;       // 0..1 слой огня для жёстких жанров (языки+угли)

/* --- simplex noise 2D (Ashima Arts / Stefan Gustavson, MIT) --- */
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x  = 2.0 * fract(p * C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

/* Число октав подобрано под слабые машины: на 2 ядрах без GPU
   пять октав давали 15 вычислений шума на пиксель и 100% загрузки.
   Трёх хватает, чтобы блоб оставался мягким и плавным. */
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += a * snoise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

vec3 hue2rgb(float h) {
  vec3 p = abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}

void main() {
  float t = uTime;
  // Плавное плавание: весь домен медленно дрейфует, петли не прибиты
  // к центру (иначе получается танцующий крест из спиц).
  vec2 drift = vec2(sin(t * 0.11) + sin(t * 0.043 + 1.7),
                    cos(t * 0.13) + cos(t * 0.051 + 0.6)) * 0.035;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) - drift;
  // Широкую карточку заливаем шире: пятно эллипсом, бока не пустые.
  uv.x *= 0.85;
  // Течение поля — константа: это эмбиент, музыка его не гонит.
  // За музыку отвечают только лучи (длина и яркость shafts + силуэт).
  float et = 1.0;
  // Цикл форм ~24с: шар → звезда с лучами → петля → капля → снова шар.
  float morph = 0.5 + 0.5 * sin(t * 0.2618 + 1.0);
  // Фаза звезды: силуэт выпускает лучи, shafts ярче.
  float star = smoothstep(0.45, 0.85, morph);
  // Контуры плазменного разряда проявляются периодически (~30с цикл):
  // медленно проступают и медленно тают, без резкого pop-а.
  float loopGate = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(t * 0.21 + 2.0));
  // Дыхание тела: медленное расширение-сжатие + капля от бита.
  // v3: бит качает в 2 раза сильнее — шар живёт от кика.
  float breath = 1.0 + 0.05 * sin(t * 0.9) + uBeat * 0.045;
  float eCl = clamp(uEnergy, 0.0, 1.0);
  // Яркость подложки: на светлой теме белый не читается и всё тонет в молоке,
  // поэтому баланс белого/цвета и сила glow едут от неё (считаем один раз).
  float bgL = clamp(dot(uBg, vec3(0.3333)), 0.0, 1.0);

  /* Низкочастотное поле: частота держится небольшой, иначе вместо
     плавного блоба получается мелкий шум по всей площади. */
  float sizeK = mix(1.45, 0.65, clamp((uScale - 0.4) / 1.8, 0.0, 1.0));
  vec2 p = uv * sizeK * uScale;

  float n1 = fbm(p * 0.50 + vec2(0.0, t * 0.032 * et));
  float n2 = fbm(p * 0.68 + vec2(3.7, 1.9) - t * 0.026 * et);
  float n3 = fbm(p * 0.92 + vec2(n1 * 0.9, n2 * 0.9) + vec2(1.3, 5.1) + t * 0.020 * et);

  // Мрамор: вторая волна деформации, чтобы цвета делились пятнами,
  // а не лежали ровными кольцами (как на скринах Яндекса).
  float marble = fbm(p * 1.35 + vec2(n2 * 1.2, n1 * 1.2) + vec2(-t * 0.021 * et, t * 0.017 * et));

  /* Лучи (силуэт): прямые радиальные выросты. Шум берём по кругу
     (cos/sin угла), а не по самому углу — иначе на разрезе atan
     (отрицательная полуось X) левая и правая половины не схлопываются
     и виден горизонтальный шов. Лёгкое покачивание + медленный поворот,
     чтобы не стояли колом, но оставались прямыми. */
  float angEdge = atan(uv.y, uv.x) + n1 * 0.22 + t * 0.015;
  vec2 circ = vec2(cos(angEdge), sin(angEdge));
  float rayA = snoise(circ * 2.2 + vec2(0.0, t * 0.10 * et) + vec2(uBeat * 0.15, 0.0));
  float rayB = snoise(circ * 4.5 + vec2(4.0, 1.0) + vec2(t * 0.06 * et, -t * 0.09 * et));
  float rays = max(0.0, rayA * 0.62 + rayB * 0.38);
  rays *= rays;

  /* Форма: почти круглая, шум деформирует границу, лучи её вытягивают.
     Край мягкий: широкая полоса сглаживания вместо жёсткого среза.
     В фазе звезды силуэт выпускает лучи, в фазе шара почти гладкий. */
  float r = (length(uv * vec2(1.0, 1.14)) + n3 * 0.13 + marble * 0.03) / breath;
  // v3.1: пятно меньше (0.66→0.55) — было заливкой на всю карточку,
  // лучи живут вокруг него, а не тонут внутри.
  float edge = 0.55 * mix(0.82, 1.20, uSoftness)
    + rays * uRays * (0.35 + 0.65 * star) * (1.0 + uBeat * 0.55 + uScream * 0.3 + eCl * 0.35);
  // ОГОНЬ (рок/метал): языки пламени вверх + рваный край. Только когда
  // uFxFire > 0, для остальных жанров этот слой спит и ничего не стоит.
  float upness = clamp(uv.y / max(length(uv), 1e-4), 0.0, 1.0);
  float flick = 0.6 + 0.4 * snoise(vec2(t * 2.5, length(uv) * 7.0 - t * 3.5));
  edge += uFxFire * upness * upness * (0.06 + 0.16 * flick) * (0.6 + 0.6 * eCl);

  float mask = 1.0 - smoothstep(edge * 0.30, edge * 0.95, r);
  mask = pow(clamp(mask, 0.0, 1.0), 1.1);
  // Растушёвка к краям канваса: пятно обязано сойти в ноль ДО границы
  // карточки, иначе overflow:hidden режет его по прямой и этот срез
  // ползает вверх-вниз вместе с дыханием. feather в долях мин. стороны.
  vec2 frag01 = gl_FragCoord.xy / uRes;
  vec2 db = min(frag01, 1.0 - frag01) * uRes / min(uRes.x, uRes.y);
  float border = smoothstep(0.0, 0.16, min(db.x, db.y));
  mask *= border;

  /* Жидкое ядро по рецепту domain warping: n1/n2 — это уже два fbm
     со сдвигом, n3/marble — fbm от варпнутых координат. Переиспользуем
     их как q/r/f вместо новых дорогих вызовов — тот же переток формы,
     ноль лишних шумов на пиксель. */
  vec2 q = vec2(n1, n2);
  float f = n3;
  float f2 = marble;

  /* Палитра как у Яндекса: тема + белые hotspots по интенсивности поля.
     Разброс оттенков от самого поля — пятна рядом, а не монохром. */
  vec3 base = hue2rgb(fract(0.895 + uHue + f * 0.12));
  vec3 deep = hue2rgb(fract(0.955 + uHue + f * 0.10));
  // Третий цвет: акцент между базой и белым — пятна из трёх оттенков,
  // а не двух (просьба «3 цвета, а не два»).
  vec3 accent = hue2rgb(fract(0.925 + uHue + f2 * 0.10));

  // v3.1: душим кислоту — палитра hue2rgb идёт в полной насыщенности,
  // а жёлто-зелёный на светлом фоне бьёт по глазам. 18% к нейтрали:
  // характер остаётся, неон уходит.
  vec3 lumW = vec3(0.2126, 0.7152, 0.0722);
  base = mix(vec3(dot(base, lumW)), base, 0.82);
  deep = mix(vec3(dot(deep, lumW)), deep, 0.82);
  accent = mix(vec3(dot(accent, lumW)), accent, 0.82);

  vec3 col = mix(deep * 0.6, base, smoothstep(-0.55, 0.65, f));
  col = mix(col, accent, smoothstep(0.05, 0.55, f2) * 0.55);
  // v3.1: порог белого поднят (0.45→0.55) — на скримах белый кипел на пол-экрана.
  col = mix(col, vec3(1.03, 0.99, 0.94), smoothstep(0.55, 0.92, f2));
  // Внутренний просвечивающий слой — глубина объёма, не плоская картинка.
  col += base * (1.0 - smoothstep(0.0, 0.5, abs(f))) * 0.08;
  // Радиальный glow: центр ярче, мягкое затухание к краям.
  // На светлом фоне glow слабее — иначе всё тонет в молоке.
  float g = exp(-dot(uv, uv) * 3.0);
  col += mix(vec3(1.0), base, 0.35) * g * (0.38 - 0.18 * bgL);

  /* Петли — изолинии варпнутого поля: тонкие белые нити + слабое гало.
     Нити дрейфуют вместе с полем, проявляются периодически (loopGate).
     Чистый эмбиент: яркость статична, музыка петель не касается. */
  float band = abs(fract(f * 2.5 + t * 0.05) - 0.5);
  // v3: нити читаются как во v2 — ярче, без эффекта «стекла».
  // v3.1: компрессия неона на пиках — в спокойствии ярко, на крике не пересвечивает.
  float neonC = uNeon / (1.0 + (uBeat + uScream) * 0.9);
  float ribbon = (1.0 - smoothstep(0.0, 0.10, band)) * 0.6 * loopGate;
  float haloL = (1.0 - smoothstep(0.0, 0.28, band)) * 0.28 * loopGate;
  // v3.1: петли строго внутри пятна — внутренняя маска режет их раньше края,
  // снаружи остаются одни лучи. Иначе нити тянутся через весь экран.
  float inner = 1.0 - smoothstep(edge * 0.30, edge * 0.80, r);
  col += vec3(1.0) * (ribbon + haloL) * neonC * mask * inner;

  /* Световые shafts-лучи как у лампы — прямые, мягкие, с цветной тенью.
     Вылезают из-под пятна и уходят за край. Длина и яркость едут от музыки
     (uBeat/uScream/uEnergy), направления медленно дрейфуют. В покое —
     короткие и тусклые, на качке — длинные и яркие. */
  float beamSum = 0.0;
  // Удар и скрим: лучи вытягиваются в длину и выпрямляются (wobble гаснет,
  // ширина тает) — вспышка-звезда на кике, затем возврат к мягкости.
  // 9 shafts равномерно по кругу: ЧЁТНЫЕ качает бас (кик), НЕЧЁТНЫЕ —
  // скрим и громкий припев. Поэтому хип-хоп пульсирует, а метал вспыхивает
  // на криках — разными лучами, а не всеми хором.
  float drive = clamp(uBeat + uScream, 0.0, 1.0);
  float reach = edge * (1.9 + (uBeat + uScream) * 0.85 + eCl * 0.6);
  float straight = 1.0 - drive * 0.55;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    // Драйвер луча: чётный — бас, нечётный — скрим.
    float drv = (mod(fi, 2.0) < 1.0) ? uBeat : uScream;
    float dir = (fi / 9.0) * 6.2831853
      + t * 0.03 * (mod(fi, 2.0) * 2.0 - 1.0)
      + snoise(vec2(fi * 7.31, t * 0.05 + fi)) * 0.35 * straight;
    float da = atan(uv.y, uv.x) - dir;
    da = atan(sin(da), cos(da));
    // v3.1: лучи уже (0.28→0.20) — семь раздельных клинков вместо каши.
    float w = (0.20 + 0.04 * sin(t * 0.18 + fi * 2.1)) * (1.0 - drive * 0.30);
    float shaft = exp(-da * da / (w * w));
    // Свой луч ярче на своём драйвере: скрим подсвечивает нечётные.
    shaft *= 1.0 + drv * 1.1;
    float rad = length(uv);
    // Лучи вылезают ИЗ-ПОД капли: в центре fall=0 (точки старта не видно),
    // полная яркость у края пятна, затухание к концу reach.
    float inner = smoothstep(edge * 0.25, edge * 0.95, rad);
    float outer = 1.0 - smoothstep(edge * 0.9, reach, rad);
    float fall = inner * outer;
    beamSum += shaft * fall;
  }
  beamSum *= 0.28 + 0.30 * star + eCl * 0.45 + uBeat * 0.55;
  // Баланс белого/цвета едет от яркости подложки (bgL посчитан выше):
  // на светлой сильнее цветная тень, на тёмной — белая сердцевина.
  col += base * beamSum * (0.05 + 0.13 * bgL);
  col += vec3(1.0, 0.97, 0.92) * beamSum * beamSum * (0.09 - 0.05 * bgL);

  // Круги на воде ВНУТРИ капли: два кольца расходятся от центра к краю,
  // яркость — от бита. Маска пятна (mask) режет их строго по краю —
  // на лучи не попадают вообще. Пульс внутри, а не рябь поверх.
  float ringA = 0.0;
  for (int j = 0; j < 2; j++) {
    float fj = float(j);
    float ph = fract(t * 0.45 + fj * 0.5);
    float rr = edge * (0.05 + ph * 0.85);
    float dr = (length(uv) - rr) * 9.0;
    ringA += exp(-dr * dr) * (1.0 - ph) * (0.2 + uBeat * 0.8 + uScream * 0.35);
  }
  // Кольца сильнее тонированы базой — на жёлтом белый слепит.
  col += mix(vec3(1.0), base, 0.7) * ringA * 0.12 * mask;

  /* Угли костра (только рок/метал): десяток искр взлетает вверх,
     мерцает и гаснет. Дешёвый хэш вместо текстур, слой спит при uFxFire=0. */
  if (uFxFire > 0.01) {
    float ember = 0.0;
    for (int i = 0; i < 10; i++) {
      float fi = float(i);
      float h1 = fract(sin(fi * 12.9898) * 43758.5453);
      float h2 = fract(sin(fi * 78.233 + 17.0) * 12543.1234);
      float prog = fract(t * (0.15 + h1 * 0.25) + h2);
      vec2 ep = vec2((h1 - 0.5) * edge * 1.2 + sin(t * 1.5 + fi * 1.9) * 0.05 * (0.3 + prog),
                     edge * 0.4 - prog * edge * 1.8);
      float d = length(uv - ep);
      float tw = 0.5 + 0.5 * sin(t * 5.0 + fi * 2.3);
      ember += smoothstep(0.035, 0.0, d) * (1.0 - prog) * tw;
    }
    // Скрим раздувает угли: на крике костёр вспыхивает, а не тлеет ровно.
    col += mix(vec3(1.0, 0.55, 0.20), vec3(1.0, 0.85, 0.50), f2) * ember * 0.5 * uFxFire * (0.6 + uScream * 0.8);
  }

  // Мягкий потолок пересвета: выше 1.0 сжимаем к единице, середину не трогаем.
  col = col / (1.0 + max(col - 1.0, 0.0));

  col = mix(col, uBg, 0.04);

  // Лучи светят и за краем пятна: тянем за ними альфу.
  float glowA = clamp(beamSum * 0.22, 0.0, 0.5);
  float a = clamp((mask + glowA) * uIntensity * 0.96, 0.0, 1.0);

  /* premultiplied alpha — фон подмешивает сам браузер */
  gl_FragColor = vec4(col * a, a);
}
`;

let gl = null;
let program = null;
const loc = {};
let canvas = null;
let rafId = 0;
let running = false;
let lost = false;

/** Ревизия шейдера: уходит в консоль при старте воркера, чтобы на проде
    было видно, какая версия реально крутится (а не закэшированная). */
const VIBE_SHADER_REV = 27;

let time = 0;
let lastTs = 0;

const state = {
  width: 1,
  height: 1,
  dpr: 1,
  hueOffset: 0,
  speed: 1,
  scale: 1,
  intensity: 1,
  softness: 0.45,
  rays: 0.3,
  neon: 0.85,
  bend: 1.0,     // 0 = лучи от центра, 1 = кольца вокруг центра
  energy: 0,     // 0..1 средний уровень трека
  beat: 0,       // 0..1 бас быстрой огибающей
  scream: 0,     // 0..1 верхняя середина быстрой огибающей
  fxFire: 0,     // 0..1 слой огня для жёстких жанров
  backgroundColor: [1, 1, 1],
  targetFps: 30,
};

let fpsAcc = 0;
let fpsFrames = 0;

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function hexToRgb(hex) {
  let h = String(hex || "#ffffff").replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function init(msg) {
  canvas = msg.canvas;
  state.width = Math.max(1, msg.width | 0);
  state.height = Math.max(1, msg.height | 0);
  state.dpr = msg.dpr || 1;
  state.backgroundColor = hexToRgb(msg.backgroundColor);

  gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true, depth: false }) ||
       canvas.getContext("webgl",  { alpha: true, antialias: true, premultipliedAlpha: true, depth: false });

  if (!gl) {
    self.postMessage({ type: "error", error: "WebGL недоступен" });
    return;
  }

  canvas.addEventListener?.("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    stop();
  });
  canvas.addEventListener?.("webglcontextrestored", () => {
    lost = false;
    try { buildProgram(); start(); } catch (err) { self.postMessage({ type: "error", error: String(err) }); }
  });

  buildProgram();
  applySize();
  start();
  self.postMessage({ type: "rev", rev: VIBE_SHADER_REV });
}

function buildProgram() {
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("program link failed: " + gl.getProgramInfoLog(program));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram — метод WebGL, не React-хук
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  loc.uRes = gl.getUniformLocation(program, "uRes");
  loc.uTime = gl.getUniformLocation(program, "uTime");
  loc.uHue = gl.getUniformLocation(program, "uHue");
  loc.uBg = gl.getUniformLocation(program, "uBg");
  loc.uIntensity = gl.getUniformLocation(program, "uIntensity");
  loc.uSoftness = gl.getUniformLocation(program, "uSoftness");
  loc.uScale = gl.getUniformLocation(program, "uScale");
  loc.uRays = gl.getUniformLocation(program, "uRays");
  loc.uNeon = gl.getUniformLocation(program, "uNeon");
  loc.uBend = gl.getUniformLocation(program, "uBend");
  loc.uEnergy = gl.getUniformLocation(program, "uEnergy");
  loc.uBeat = gl.getUniformLocation(program, "uBeat");
  loc.uScream = gl.getUniformLocation(program, "uScream");
  loc.uFxFire = gl.getUniformLocation(program, "uFxFire");

  gl.viewport(0, 0, state.width * state.dpr, state.height * state.dpr);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

function applySize() {
  const w = Math.max(1, Math.floor(state.width * state.dpr));
  const h = Math.max(1, Math.floor(state.height * state.dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
}

function draw(ts) {
  rafId = requestAnimationFrame(draw);
  if (lost) return;

  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
  lastTs = ts;
  time += dt * state.speed;

  if (dt > 0) {
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      const fps = Math.round(fpsFrames / fpsAcc);
      self.postMessage({ type: "fps", fps });

      // Автоподстройка: не держим частоту выше нужной, чтобы не жечь
      // процессор впустую. Анимация медленная, 30 кадров достаточно.
      if (fps < state.targetFps * 0.8) state.frameSkip = 1;
      else if (fps > state.targetFps * 1.25) state.frameSkip = 0;

      fpsAcc = 0;
      fpsFrames = 0;
    }
  }

  // Пропуск кадров: рисуем не каждый раз, а раз в frameSkip
  if (state.frameSkip) {
    state.frameSkipCount = (state.frameSkipCount || 0) + 1;
    if (state.frameSkipCount < state.frameSkip) return;
    state.frameSkipCount = 0;
  }

  gl.uniform2f(loc.uRes, canvas.width, canvas.height);
  gl.uniform1f(loc.uTime, time);
  gl.uniform1f(loc.uHue, state.hueOffset);
  gl.uniform3fv(loc.uBg, state.backgroundColor);
  gl.uniform1f(loc.uIntensity, state.intensity);
  gl.uniform1f(loc.uSoftness, state.softness);
  gl.uniform1f(loc.uScale, state.scale);
  gl.uniform1f(loc.uRays, state.rays);
  gl.uniform1f(loc.uNeon, state.neon);
  gl.uniform1f(loc.uBend, state.bend);
  gl.uniform1f(loc.uEnergy, state.energy);
  gl.uniform1f(loc.uBeat, state.beat);
  gl.uniform1f(loc.uScream, state.scream);
  gl.uniform1f(loc.uFxFire, state.fxFire);

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function start() {
  if (running || lost) return;
  running = true;
  lastTs = 0;
  rafId = requestAnimationFrame(draw);
}

function stop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  lastTs = 0;
}

function setSettings(p = {}) {
  if (p.backgroundColor !== undefined) {
    state.backgroundColor = Array.isArray(p.backgroundColor) && p.backgroundColor.length === 3
      ? p.backgroundColor.map((v) => (v > 1 ? v / 255 : v))
      : hexToRgb(p.backgroundColor);
  }
  /* Оттенок: принимаем и hueOffset (наш ключ из set()), и hue/collectionHue
   (протокол Яндекс.Музыки). В оригинале читались только вторые два, из-за
   чего палитра не поворачивалась к обложке. */
  const hue = p.hueOffset ?? p.hue ?? p.collectionHue;
  if (hue !== undefined && hue !== null) {
    state.hueOffset = typeof hue === "number" ? (hue > 1 ? hue / 360 : hue) : state.hueOffset;
  }
  if (p.speed !== undefined) state.speed = Number(p.speed) || 0;
  if (p.scale !== undefined) state.scale = Number(p.scale) || 1;
  if (p.intensity !== undefined) state.intensity = Number(p.intensity);
  if (p.softness !== undefined) state.softness = Number(p.softness);
  if (p.rays !== undefined) state.rays = Number(p.rays);
  if (p.neon !== undefined) state.neon = Number(p.neon);
  if (p.bend !== undefined) state.bend = Number(p.bend);
  if (p.energy !== undefined) state.energy = Number(p.energy);
  if (p.beat !== undefined) state.beat = Number(p.beat);
  if (p.scream !== undefined) state.scream = Number(p.scream);
  if (p.fxFire !== undefined) state.fxFire = Number(p.fxFire);
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  const type = msg.type || "";

  // --- внутренний протокол Яндекс.Музыки ---
  if (msg.source === "vibe") {
    if (type === "vibe-animation-worker-disable") return stop();
    if (type === "vibe-animation-worker-enable") return start();
    if (type === "vibe-animation-worker-apply-settings") return setSettings(msg.payload || {});
  }

  // --- собственный протокол ---
  try {
    switch (type) {
      case "init":
        init(msg);
        break;
      case "resize":
        state.width = Math.max(1, msg.width | 0);
        state.height = Math.max(1, msg.height | 0);
        state.dpr = msg.dpr || state.dpr;
        if (gl) applySize();
        break;
      case "settings":
        setSettings(msg.payload || {});
        break;
      case "enable":
        start();
        break;
      case "disable":
        stop();
        break;
      case "dispose":
        stop();
        gl = null;
        canvas = null;
        break;
      default:
        break;
    }
  } catch (err) {
    self.postMessage({ type: "error", error: String(err && err.message ? err.message : err) });
  }
};
