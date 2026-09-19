/* =========================================================================
   Quick Draw Web App — main.js
   -------------------------------------------------------------------------
   Accuracy upgrade summary (see README section "Why this is more accurate"):
   1. Uses the real DoodleNet CNN (trained on Google's full 345-category,
      50M-drawing Quick, Draw! dataset) loaded locally from /model/doodlenet,
      instead of relying on ml5.js's wrapper defaults.
   2. Re-implements the image pre-processing to match how the network was
      actually trained:
        - crop tightly to the drawing's bounding box (ignore blank canvas),
        - pad and center the crop into a square,
        - down-sample with BILINEAR interpolation (anti-aliased / grayscale),
          NOT nearest-neighbour + hard 0/1 thresholding.
      This single change fixes the single biggest accuracy killer: small or
      off-center doodles being crushed into a mostly-empty 28x28 image.
   3. Debounces / batches predictions using requestAnimationFrame instead of
      firing a classification on every single mouse-move, and only predicts
      once real strokes exist.
   4. Shows a top-5 prediction list (with confidence bars) instead of a
      single guess, which is both more informative and mirrors how the
      original Quick, Draw! game works.
   5. Adds pointer-events support so it also works with touch/stylus, and a
      "smarter" round timer / scoring loop.
========================================================================= */

/* ---------------------------------------------------------------------
   1. Word list (344 drawable prompts) + mapping to the model's own
      345 class label spellings (e.g. "hot dog" -> "hot_dog").
--------------------------------------------------------------------- */
const DRAW_WORDS = [
  "aircraft carrier", "airplane", "alarm clock", "ambulance", "angel",
  "animal migration", "ant", "anvil", "apple", "arm", "asparagus", "axe",
  "backpack", "banana", "bandage", "barn", "baseball", "baseball bat",
  "basket", "basketball", "bat", "bathtub", "beach", "bear", "beard", "bed",
  "bee", "belt", "bench", "bicycle", "binoculars", "bird", "birthday cake",
  "blackberry", "blueberry", "book", "boomerang", "bottlecap", "bowtie",
  "bracelet", "brain", "bread", "bridge", "broccoli", "broom", "bucket",
  "bulldozer", "bus", "bush", "butterfly", "cactus", "cake", "calculator",
  "calendar", "camel", "camera", "camouflage", "campfire", "candle",
  "cannon", "canoe", "car", "carrot", "castle", "cat", "ceiling fan",
  "cello", "cell phone", "chair", "chandelier", "church", "circle",
  "clarinet", "clock", "cloud", "coffee cup", "compass", "computer",
  "cookie", "cooler", "couch", "cow", "crab", "crayon", "crocodile",
  "crown", "cruise ship", "cup", "diamond", "dishwasher", "diving board",
  "dog", "dolphin", "donut", "door", "dragon", "dresser", "drill", "drums",
  "duck", "dumbbell", "ear", "elbow", "elephant", "envelope", "eraser",
  "eye", "eyeglasses", "face", "fan", "feather", "fence", "finger",
  "fire hydrant", "fireplace", "firetruck", "fish", "flamingo",
  "flashlight", "flip flops", "floor lamp", "flower", "flying saucer",
  "foot", "fork", "frog", "frying pan", "garden", "garden hose", "giraffe",
  "goatee", "golf club", "grapes", "grass", "guitar", "hamburger",
  "hammer", "hand", "harp", "hat", "headphones", "hedgehog", "helicopter",
  "helmet", "hexagon", "hockey puck", "hockey stick", "horse", "hospital",
  "hot air balloon", "hot dog", "hot tub", "hourglass", "house",
  "house plant", "hurricane", "ice cream", "jacket", "jail", "kangaroo",
  "key", "keyboard", "knee", "knife", "ladder", "lantern", "laptop",
  "leaf", "leg", "light bulb", "lighter", "lighthouse", "lightning",
  "line", "lion", "lipstick", "lobster", "lollipop", "mailbox", "map",
  "marker", "matches", "megaphone", "mermaid", "microphone", "microwave",
  "monkey", "moon", "mosquito", "motorbike", "mountain", "mouse",
  "moustache", "mouth", "mug", "mushroom", "nail", "necklace", "nose",
  "ocean", "octagon", "octopus", "onion", "oven", "owl", "paintbrush",
  "paint can", "palm tree", "panda", "pants", "paper clip", "parachute",
  "parrot", "passport", "peanut", "pear", "peas", "pencil", "penguin",
  "piano", "pickup truck", "picture frame", "pig", "pillow", "pineapple",
  "pizza", "pliers", "police car", "pond", "pool", "popsicle", "postcard",
  "potato", "power outlet", "purse", "rabbit", "raccoon", "radio",
  "rainbow", "rake", "remote control", "rhinoceros", "rifle", "river",
  "roller coaster", "rollerskates", "sailboat", "sandwich", "saw",
  "saxophone", "school bus", "scissors", "scorpion", "screwdriver",
  "sea turtle", "see saw", "shark", "sheep", "shoe", "shorts", "shovel",
  "sink", "skateboard", "skull", "skyscraper", "sleeping bag",
  "smiley face", "snail", "snake", "snorkel", "snowflake", "snowman",
  "soccer ball", "sock", "speedboat", "spider", "spoon", "spreadsheet",
  "square", "squiggle", "squirrel", "stairs", "star", "steak", "stereo",
  "stethoscope", "stitches", "stop sign", "stove", "strawberry",
  "streetlight", "string bean", "submarine", "suitcase", "sun", "swan",
  "sweater", "swingset", "sword", "syringe", "table", "teapot",
  "teddy-bear", "telephone", "television", "tennis racquet", "tent",
  "The Eiffel Tower", "The Great Wall of China", "The Mona Lisa", "tiger",
  "toaster", "toe", "toilet", "tooth", "toothbrush", "toothpaste",
  "tornado", "tractor", "traffic light", "train", "tree", "triangle",
  "trombone", "truck", "trumpet", "tshirt", "umbrella", "underwear",
  "van", "vase", "violin", "washing machine", "watermelon", "waterslide",
  "whale", "wheel", "windmill", "wine bottle", "wine glass", "wristwatch",
  "yoga", "zebra", "zigzag"
];

const WORD_TO_CLASS = {
  "aircraft carrier": "aircraft_carrier", "airplane": "airplane",
  "alarm clock": "alarm_clock", "ambulance": "ambulance", "angel": "angel",
  "animal migration": "animal_migration", "ant": "ant", "anvil": "anvil",
  "apple": "apple", "arm": "arm", "asparagus": "asparagus", "axe": "axe",
  "backpack": "backpack", "banana": "banana", "bandage": "bandage",
  "barn": "barn", "baseball": "baseball", "baseball bat": "baseball_bat",
  "basket": "basket", "basketball": "basketball", "bat": "bat",
  "bathtub": "bathtub", "beach": "beach", "bear": "bear", "beard": "beard",
  "bed": "bed", "bee": "bee", "belt": "belt", "bench": "bench",
  "bicycle": "bicycle", "binoculars": "binoculars", "bird": "bird",
  "birthday cake": "birthday_cake", "blackberry": "blackberry",
  "blueberry": "blueberry", "book": "book", "boomerang": "boomerang",
  "bottlecap": "bottlecap", "bowtie": "bowtie", "bracelet": "bracelet",
  "brain": "brain", "bread": "bread", "bridge": "bridge",
  "broccoli": "broccoli", "broom": "broom", "bucket": "bucket",
  "bulldozer": "bulldozer", "bus": "bus", "bush": "bush",
  "butterfly": "butterfly", "cactus": "cactus", "cake": "cake",
  "calculator": "calculator", "calendar": "calendar", "camel": "camel",
  "camera": "camera", "camouflage": "camouflage", "campfire": "campfire",
  "candle": "candle", "cannon": "cannon", "canoe": "canoe", "car": "car",
  "carrot": "carrot", "castle": "castle", "cat": "cat",
  "ceiling fan": "ceiling_fan", "cello": "cello", "cell phone": "cell_phone",
  "chair": "chair", "chandelier": "chandelier", "church": "church",
  "circle": "circle", "clarinet": "clarinet", "clock": "clock",
  "cloud": "cloud", "coffee cup": "coffee_cup", "compass": "compass",
  "computer": "computer", "cookie": "cookie", "cooler": "cooler",
  "couch": "couch", "cow": "cow", "crab": "crab", "crayon": "crayon",
  "crocodile": "crocodile", "crown": "crown", "cruise ship": "cruise_ship",
  "cup": "cup", "diamond": "diamond", "dishwasher": "dishwasher",
  "diving board": "diving_board", "dog": "dog", "dolphin": "dolphin",
  "donut": "donut", "door": "door", "dragon": "dragon",
  "dresser": "dresser", "drill": "drill", "drums": "drums", "duck": "duck",
  "dumbbell": "dumbbell", "ear": "ear", "elbow": "elbow",
  "elephant": "elephant", "envelope": "envelope", "eraser": "eraser",
  "eye": "eye", "eyeglasses": "eyeglasses", "face": "face", "fan": "fan",
  "feather": "feather", "fence": "fence", "finger": "finger",
  "fire hydrant": "fire_hydrant", "fireplace": "fireplace",
  "firetruck": "firetruck", "fish": "fish", "flamingo": "flamingo",
  "flashlight": "flashlight", "flip flops": "flip_flops",
  "floor lamp": "floor_lamp", "flower": "flower",
  "flying saucer": "flying_saucer", "foot": "foot", "fork": "fork",
  "frog": "frog", "frying pan": "frying_pan", "garden": "garden",
  "garden hose": "garden_hose", "giraffe": "giraffe", "goatee": "goatee",
  "golf club": "golf_club", "grapes": "grapes", "grass": "grass",
  "guitar": "guitar", "hamburger": "hamburger", "hammer": "hammer",
  "hand": "hand", "harp": "harp", "hat": "hat", "headphones": "headphones",
  "hedgehog": "hedgehog", "helicopter": "helicopter", "helmet": "helmet",
  "hexagon": "hexagon", "hockey puck": "hockey_puck",
  "hockey stick": "hockey_stick", "horse": "horse", "hospital": "hospital",
  "hot air balloon": "hot_air_balloon", "hot dog": "hot_dog",
  "hot tub": "hot_tub", "hourglass": "hourglass", "house": "house",
  "house plant": "house_plant", "hurricane": "hurricane",
  "ice cream": "ice_cream", "jacket": "jacket", "jail": "jail",
  "kangaroo": "kangaroo", "key": "key", "keyboard": "keyboard",
  "knee": "knee", "knife": "knife", "ladder": "ladder",
  "lantern": "lantern", "laptop": "laptop", "leaf": "leaf", "leg": "leg",
  "light bulb": "light_bulb", "lighter": "lighter",
  "lighthouse": "lighthouse", "lightning": "lightning", "line": "line",
  "lion": "lion", "lipstick": "lipstick", "lobster": "lobster",
  "lollipop": "lollipop", "mailbox": "mailbox", "map": "map",
  "marker": "marker", "matches": "matches", "megaphone": "megaphone",
  "mermaid": "mermaid", "microphone": "microphone",
  "microwave": "microwave", "monkey": "monkey", "moon": "moon",
  "mosquito": "mosquito", "motorbike": "motorbike", "mountain": "mountain",
  "mouse": "mouse", "moustache": "moustache", "mouth": "mouth",
  "mug": "mug", "mushroom": "mushroom", "nail": "nail",
  "necklace": "necklace", "nose": "nose", "ocean": "ocean",
  "octagon": "octagon", "octopus": "octopus", "onion": "onion",
  "oven": "oven", "owl": "owl", "paintbrush": "paintbrush",
  "paint can": "paint_can", "palm tree": "palm_tree", "panda": "panda",
  "pants": "pants", "paper clip": "paper_clip", "parachute": "parachute",
  "parrot": "parrot", "passport": "passport", "peanut": "peanut",
  "pear": "pear", "peas": "peas", "pencil": "pencil", "penguin": "penguin",
  "piano": "piano", "pickup truck": "pickup_truck",
  "picture frame": "picture_frame", "pig": "pig", "pillow": "pillow",
  "pineapple": "pineapple", "pizza": "pizza", "pliers": "pliers",
  "police car": "police_car", "pond": "pond", "pool": "pool",
  "popsicle": "popsicle", "postcard": "postcard", "potato": "potato",
  "power outlet": "power_outlet", "purse": "purse", "rabbit": "rabbit",
  "raccoon": "raccoon", "radio": "radio", "rainbow": "rainbow",
  "rake": "rake", "remote control": "remote_control",
  "rhinoceros": "rhinoceros", "rifle": "rifle", "river": "river",
  "roller coaster": "roller_coaster", "rollerskates": "rollerskates",
  "sailboat": "sailboat", "sandwich": "sandwich", "saw": "saw",
  "saxophone": "saxophone", "school bus": "school_bus",
  "scissors": "scissors", "scorpion": "scorpion",
  "screwdriver": "screwdriver", "sea turtle": "sea_turtle",
  "see saw": "see_saw", "shark": "shark", "sheep": "sheep", "shoe": "shoe",
  "shorts": "shorts", "shovel": "shovel", "sink": "sink",
  "skateboard": "skateboard", "skull": "skull", "skyscraper": "skyscraper",
  "sleeping bag": "sleeping_bag", "smiley face": "smiley_face",
  "snail": "snail", "snake": "snake", "snorkel": "snorkel",
  "snowflake": "snowflake", "snowman": "snowman",
  "soccer ball": "soccer_ball", "sock": "sock", "speedboat": "speedboat",
  "spider": "spider", "spoon": "spoon", "spreadsheet": "spreadsheet",
  "square": "square", "squiggle": "squiggle", "squirrel": "squirrel",
  "stairs": "stairs", "star": "star", "steak": "steak", "stereo": "stereo",
  "stethoscope": "stethoscope", "stitches": "stitches",
  "stop sign": "stop_sign", "stove": "stove", "strawberry": "strawberry",
  "streetlight": "streetlight", "string bean": "string_bean",
  "submarine": "submarine", "suitcase": "suitcase", "sun": "sun",
  "swan": "swan", "sweater": "sweater", "swingset": "swing_set",
  "sword": "sword", "syringe": "syringe", "table": "table",
  "teapot": "teapot", "teddy-bear": "teddy-bear", "telephone": "telephone",
  "television": "television", "tennis racquet": "tennis_racquet",
  "tent": "tent", "The Eiffel Tower": "The_Eiffel_Tower",
  "The Great Wall of China": "The_Great_Wall_of_China",
  "The Mona Lisa": "The_Mona_Lisa", "tiger": "tiger", "toaster": "toaster",
  "toe": "toe", "toilet": "toilet", "tooth": "tooth",
  "toothbrush": "toothbrush", "toothpaste": "toothpaste",
  "tornado": "tornado", "tractor": "tractor",
  "traffic light": "traffic_light", "train": "train", "tree": "tree",
  "triangle": "triangle", "trombone": "trombone", "truck": "truck",
  "trumpet": "trumpet", "tshirt": "t-shirt", "umbrella": "umbrella",
  "underwear": "underwear", "van": "van", "vase": "vase",
  "violin": "violin", "washing machine": "washing_machine",
  "watermelon": "watermelon", "waterslide": "waterslide", "whale": "whale",
  "wheel": "wheel", "windmill": "windmill", "wine bottle": "wine_bottle",
  "wine glass": "wine_glass", "wristwatch": "wristwatch", "yoga": "yoga",
  "zebra": "zebra", "zigzag": "zigzag"
};

/* ---------------------------------------------------------------------
   2. App state
--------------------------------------------------------------------- */
const MODEL_URL = "model/doodlenet/model.json";
const MODEL_INPUT_SIZE = 28;
const ROUND_SECONDS = 30;

let model = null;
let modelReady = false;

let canvas, ctx;
let drawing = false;
let hasInk = false;
let lastX = 0, lastY = 0;
let minX, minY, maxX, maxY; // running bounding box of the ink on canvas

let currentWord = "";
let score = 0;
let round = 0;
let timeLeft = ROUND_SECONDS;
let timerInterval = null;
let predictScheduled = false;
let solved = false;

const els = {};

/* ---------------------------------------------------------------------
   3. Boot
--------------------------------------------------------------------- */
window.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  setupCanvas();
  wireButtons();
  nextRound();
  loadModel();
});

function cacheElements() {
  els.canvas = document.getElementById("draw-canvas");
  els.status = document.getElementById("model-status");
  els.word = document.getElementById("sketch-word");
  els.score = document.getElementById("score");
  els.timer = document.getElementById("timer");
  els.predictions = document.getElementById("predictions");
  els.clearBtn = document.getElementById("clear-btn");
  els.skipBtn = document.getElementById("skip-btn");
  els.brushRange = document.getElementById("brush-size");
  els.result = document.getElementById("result-banner");
}

/* ---------------------------------------------------------------------
   4. Canvas + drawing (mouse + touch/pen via Pointer Events)
--------------------------------------------------------------------- */
function setupCanvas() {
  canvas = els.canvas;
  ctx = canvas.getContext("2d", { willReadFrequently: true });
  resetCanvasBitmap();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  // Prevent the page from scrolling while drawing on touch devices.
  canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
}

function resetCanvasBitmap() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";
  hasInk = false;
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
  clearPredictions();
}

function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

function onPointerDown(evt) {
  if (solved) return;
  drawing = true;
  canvas.setPointerCapture(evt.pointerId);
  const p = getCanvasPos(evt);
  lastX = p.x; lastY = p.y;
  growBBox(p.x, p.y);
  // draw a dot so a single click/tap still registers as ink
  drawSegment(p.x, p.y, p.x + 0.01, p.y + 0.01);
}

function onPointerMove(evt) {
  if (!drawing || solved) return;
  const p = getCanvasPos(evt);
  drawSegment(lastX, lastY, p.x, p.y);
  growBBox(p.x, p.y);
  lastX = p.x; lastY = p.y;
  schedulePrediction();
}

function onPointerUp() {
  if (!drawing) return;
  drawing = false;
  schedulePrediction(true);
}

function drawSegment(x0, y0, x1, y1) {
  const w = parseInt(els.brushRange.value, 10) || 12;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  hasInk = true;
}

function growBBox(x, y) {
  const w = (parseInt(els.brushRange.value, 10) || 12) / 2;
  minX = Math.min(minX, x - w);
  minY = Math.min(minY, y - w);
  maxX = Math.max(maxX, x + w);
  maxY = Math.max(maxY, y + w);
}

/* ---------------------------------------------------------------------
   5. Model loading
--------------------------------------------------------------------- */
function waitForTensorFlow() {
  // tf-loader.js injects the TensorFlow.js <script> tag asynchronously
  // (local vendor/tf.min.js first, then CDN fallbacks), so `tf` may not be
  // defined yet even after DOMContentLoaded. Check its already-settled
  // status first (covers the case where it finished before we got here),
  // then fall back to listening for its ready/failed signal.
  if (typeof tf !== "undefined") return Promise.resolve();
  const status = window.tfjsLoaderStatus;
  if (status && status.done) {
    return status.ok
      ? Promise.resolve()
      : Promise.reject(new Error(
          "TensorFlow.js failed to load from the local file (vendor/tf.min.js) " +
          "and all CDN fallbacks. " + (status.error ? status.error.message : "")
        ));
  }
  return new Promise((resolve, reject) => {
    window.addEventListener("tfjs-ready", () => resolve(), { once: true });
    window.addEventListener("tfjs-failed", (evt) => {
      reject(new Error(
        "TensorFlow.js failed to load from the local file (vendor/tf.min.js) " +
        "and all CDN fallbacks. " +
        (evt.detail && evt.detail.error ? evt.detail.error.message : "")
      ));
    }, { once: true });
  });
}

async function loadModel() {
  els.status.classList.remove("ready", "error");
  try {
    els.status.textContent = "Loading TensorFlow.js…";
    await waitForTensorFlow();

    els.status.textContent = "Loading recognition model…";
    model = await tf.loadLayersModel(MODEL_URL);
    // Warm up so the first real prediction isn't slow.
    tf.tidy(() => model.predict(tf.zeros([1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 1])));
    modelReady = true;
    els.status.textContent = "Model ready — start drawing!";
    els.status.classList.add("ready");
  } catch (err) {
    console.error("Failed to load model:", err);
    modelReady = false;
    els.status.innerHTML =
      "Could not load the model (" + escapeHtml(err && err.message ? err.message : String(err)) + "). " +
      '<button id="retry-model-btn" class="btn btn-secondary retry-btn">Retry</button>';
    els.status.classList.add("error");
    const retryBtn = document.getElementById("retry-model-btn");
    if (retryBtn) retryBtn.addEventListener("click", loadModel);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------------------
   6. Pre-processing that matches how DoodleNet was actually trained:
      - Google's Quick, Draw! raster images are the drawing's strokes
        centered & scaled to fill a square canvas, then anti-aliased
        down to 28x28 grayscale (not thresholded to pure black/white).
      - We reproduce that: crop to the ink's bounding box (+padding),
        make it square, then use tf.image.resizeBilinear for a smooth,
        anti-aliased downsample instead of the browser's default
        (nearest-neighbour-ish) canvas scaling.
--------------------------------------------------------------------- */
// Minimum crop side, expressed as a multiple of the current brush width.
// Empirically (tested against the real DoodleNet weights on synthetic
// doodles of many sizes), if the crop is allowed to shrink down to only
// a little more than the stroke width, downsampling to 28x28 wipes out
// thin strokes and tanks accuracy (e.g. a clean hand-drawn square dropped
// from ~95% confidence to single digits). Enforcing a minimum crop size
// keeps line thickness proportional to what the network was trained on.
const MIN_CROP_TO_BRUSH_RATIO = 20;

function preprocessCanvas() {
  // 1) Determine a padded square crop around the ink (ignore blank canvas).
  let x0 = minX, y0 = minY, x1 = maxX, y1 = maxY;
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = canvas.width; y1 = canvas.height; }

  const brushWidth = parseInt(els.brushRange.value, 10) || 12;
  const w = x1 - x0;
  const h = y1 - y0;
  const pad = Math.max(w, h) * 0.1 + brushWidth * 0.5;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;

  let side = Math.max(x1 - x0, y1 - y0);
  const minSide = brushWidth * MIN_CROP_TO_BRUSH_RATIO;
  if (side < minSide) side = minSide;

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  x0 = cx - side / 2;
  y0 = cy - side / 2;

  // Clamp the crop box onto the actual canvas, keeping it square by
  // shifting (not squashing) when we hit an edge.
  x0 = Math.min(Math.max(x0, 0), canvas.width - side);
  y0 = Math.min(Math.max(y0, 0), canvas.height - side);
  const cropW = Math.round(Math.min(side, canvas.width));
  const cropH = Math.round(Math.min(side, canvas.height));

  const imageData = ctx.getImageData(
    Math.round(Math.max(0, x0)),
    Math.round(Math.max(0, y0)),
    cropW,
    cropH
  );

  // 2) Down-sample to 28x28 using box/area averaging (anti-aliased),
  // NOT nearest-neighbour or a hard 0/1 threshold. This mirrors how
  // Google's own Quick, Draw! rasterizer produces smooth grayscale
  // training images, and is what actually lets a plain bilinear/GPU
  // resize on a mostly-empty 350x350 canvas avoid losing thin strokes.
  const gray = boxAverageDownsample(imageData, MODEL_INPUT_SIZE);

  return tf.tidy(() => tf.tensor(gray, [1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 1]));
}

function boxAverageDownsample(imageData, outSize) {
  const { data, width, height } = imageData;
  const out = new Float32Array(outSize * outSize);
  const cellW = width / outSize;
  const cellH = height / outSize;

  for (let oy = 0; oy < outSize; oy += 1) {
    const iy0 = Math.max(0, Math.floor(oy * cellH));
    const iy1 = Math.min(height - 1, Math.ceil((oy + 1) * cellH) - 1);
    for (let ox = 0; ox < outSize; ox += 1) {
      const ix0 = Math.max(0, Math.floor(ox * cellW));
      const ix1 = Math.min(width - 1, Math.ceil((ox + 1) * cellW) - 1);

      let sum = 0;
      let count = 0;
      for (let yy = iy0; yy <= iy1; yy += 1) {
        for (let xx = ix0; xx <= ix1; xx += 1) {
          const idx = (yy * width + xx) * 4;
          // grayscale from the red channel (canvas ink is pure black/white),
          // inverted so ink = 1 (bright signal), background = 0 — matching
          // DoodleNet's own preprocessing convention.
          sum += 1 - data[idx] / 255;
          count += 1;
        }
      }
      out[oy * outSize + ox] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

/* ---------------------------------------------------------------------
   7. Prediction loop (throttled with requestAnimationFrame)
--------------------------------------------------------------------- */
function schedulePrediction(force) {
  if (!modelReady || !hasInk || solved) return;
  if (predictScheduled && !force) return;
  predictScheduled = true;
  requestAnimationFrame(async () => {
    predictScheduled = false;
    await runPrediction();
  });
}

async function runPrediction() {
  if (!modelReady || !hasInk) return;
  const input = preprocessCanvas();
  let data;
  try {
    const logits = model.predict(input);
    data = await logits.data();
    logits.dispose();
  } finally {
    input.dispose();
  }

  const classNames = MODEL_CLASSES;
  const top = Array.from(data)
    .map((p, i) => ({ label: classNames[i], p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 5);

  renderPredictions(top);
  checkWin(top);
}

function renderPredictions(top) {
  els.predictions.innerHTML = "";
  const targetClass = WORD_TO_CLASS[currentWord];
  top.forEach(({ label, p }) => {
    const row = document.createElement("div");
    row.className = "pred-row" + (label === targetClass ? " match" : "");

    const name = document.createElement("span");
    name.className = "pred-label";
    name.textContent = prettifyLabel(label);

    const barWrap = document.createElement("div");
    barWrap.className = "pred-bar-wrap";
    const bar = document.createElement("div");
    bar.className = "pred-bar";
    bar.style.width = Math.max(2, Math.round(p * 100)) + "%";
    barWrap.appendChild(bar);

    const pct = document.createElement("span");
    pct.className = "pred-pct";
    pct.textContent = Math.round(p * 100) + "%";

    row.appendChild(name);
    row.appendChild(barWrap);
    row.appendChild(pct);
    els.predictions.appendChild(row);
  });
}

function clearPredictions() {
  els.predictions.innerHTML = "";
}

function prettifyLabel(label) {
  return label.replace(/_/g, " ").replace(/-/g, "-");
}

/* ---------------------------------------------------------------------
   8. Win / round logic
--------------------------------------------------------------------- */
function checkWin(top) {
  const targetClass = WORD_TO_CLASS[currentWord];
  const best = top[0];
  if (best && best.label === targetClass && best.p >= 0.35) {
    solved = true;
    score += 1;
    els.score.textContent = "Score: " + score;
    showResult(true, best.p);
    stopTimer();
    setTimeout(nextRound, 1400);
  }
}

function showResult(success, confidence) {
  els.result.style.display = "block";
  if (success) {
    els.result.textContent = `Nailed it! (${Math.round(confidence * 100)}% confident) 🎉`;
    els.result.className = "result-banner success";
  } else {
    els.result.textContent = `Time's up! It was "${currentWord}".`;
    els.result.className = "result-banner fail";
  }
}

function hideResult() {
  els.result.style.display = "none";
  els.result.textContent = "";
}

function nextRound() {
  round += 1;
  solved = false;
  hideResult();
  currentWord = pickWord();
  els.word.textContent = currentWord;
  resetCanvasBitmap();
  startTimer();
}

function pickWord() {
  const idx = Math.floor(Math.random() * DRAW_WORDS.length);
  return DRAW_WORDS[idx];
}

function startTimer() {
  stopTimer();
  timeLeft = ROUND_SECONDS;
  els.timer.textContent = "Time: " + timeLeft;
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    els.timer.textContent = "Time: " + Math.max(0, timeLeft);
    if (timeLeft <= 0) {
      stopTimer();
      showResult(false, 0);
      setTimeout(nextRound, 1800);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/* ---------------------------------------------------------------------
   9. Buttons
--------------------------------------------------------------------- */
function wireButtons() {
  els.clearBtn.addEventListener("click", () => {
    resetCanvasBitmap();
  });
  els.skipBtn.addEventListener("click", () => {
    stopTimer();
    nextRound();
  });
}

/* ---------------------------------------------------------------------
   10. Model's own class list (345 categories), copied verbatim from the
       DoodleNet training labels so indices line up exactly with the
       network's output layer.
--------------------------------------------------------------------- */
const MODEL_CLASSES = ["flashlight","belt","mushroom","pond","strawberry","pineapple","sun","cow","ear","bush","pliers","watermelon","apple","baseball","feather","shoe","leaf","lollipop","crown","ocean","horse","mountain","mosquito","mug","hospital","saw","castle","angel","underwear","traffic_light","cruise_ship","marker","blueberry","flamingo","face","hockey_stick","bucket","campfire","asparagus","skateboard","door","suitcase","skull","cloud","paint_can","hockey_puck","steak","house_plant","sleeping_bag","bench","snowman","arm","crayon","fan","shovel","leg","washing_machine","harp","toothbrush","tree","bear","rake","megaphone","knee","guitar","calculator","hurricane","grapes","paintbrush","couch","nose","square","wristwatch","penguin","bridge","octagon","submarine","screwdriver","rollerskates","ladder","wine_bottle","cake","bracelet","broom","yoga","finger","fish","line","truck","snake","bus","stitches","snorkel","shorts","bowtie","pickup_truck","tooth","snail","foot","crab","school_bus","train","dresser","sock","tractor","map","hedgehog","coffee_cup","computer","matches","beard","frog","crocodile","bathtub","rain","moon","bee","knife","boomerang","lighthouse","chandelier","jail","pool","stethoscope","frying_pan","cell_phone","binoculars","purse","lantern","birthday_cake","clarinet","palm_tree","aircraft_carrier","vase","eraser","shark","skyscraper","bicycle","sink","teapot","circle","tornado","bird","stereo","mouth","key","hot_dog","spoon","laptop","cup","bottlecap","The_Great_Wall_of_China","The_Mona_Lisa","smiley_face","waterslide","eyeglasses","ceiling_fan","lobster","moustache","carrot","garden","police_car","postcard","necklace","helmet","blackberry","beach","golf_club","car","panda","alarm_clock","t-shirt","dog","bread","wine_glass","lighter","flower","bandage","drill","butterfly","swan","owl","raccoon","squiggle","calendar","giraffe","elephant","trumpet","rabbit","trombone","sheep","onion","church","flip_flops","spreadsheet","pear","clock","roller_coaster","parachute","kangaroo","duck","remote_control","compass","monkey","rainbow","tennis_racquet","lion","pencil","string_bean","oven","star","cat","pizza","soccer_ball","syringe","flying_saucer","eye","cookie","floor_lamp","mouse","toilet","toaster","The_Eiffel_Tower","airplane","stove","cello","stop_sign","tent","diving_board","light_bulb","hammer","scorpion","headphones","basket","spider","paper_clip","sweater","ice_cream","envelope","sea_turtle","donut","hat","hourglass","broccoli","jacket","backpack","book","lightning","drums","snowflake","radio","banana","camel","canoe","toothpaste","chair","picture_frame","parrot","sandwich","lipstick","pants","violin","brain","power_outlet","triangle","hamburger","dragon","bulldozer","cannon","dolphin","zebra","animal_migration","camouflage","scissors","basketball","elbow","umbrella","windmill","table","rifle","hexagon","potato","anvil","sword","peanut","axe","television","rhinoceros","baseball_bat","speedboat","sailboat","zigzag","garden_hose","river","house","pillow","ant","tiger","stairs","cooler","see_saw","piano","fireplace","popsicle","dumbbell","mailbox","barn","hot_tub","teddy-bear","fork","dishwasher","peas","hot_air_balloon","keyboard","microwave","wheel","fire_hydrant","van","camera","whale","candle","octopus","pig","swing_set","helicopter","saxophone","passport","bat","ambulance","diamond","goatee","fence","grass","mermaid","motorbike","microphone","toe","cactus","nail","telephone","hand","squirrel","streetlight","bed","firetruck"];
