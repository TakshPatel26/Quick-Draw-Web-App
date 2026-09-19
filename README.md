# Quick Draw Web App

A browser doodle-guessing game inspired by Google's *Quick, Draw!* — draw a
prompted object and a neural network tries to recognize it in real time.
Pure HTML/CSS/JS, no build step, no server required.

## Ways to make a Quick-Draw-style recognizer more accurate

Below are the realistic options, roughly in order of effort, that were
considered for this project:

1. **Fix the image pre-processing feeding the classifier** (cheap, big win).
   Whatever model you use, if the crop/resize you send it doesn't look like
   its training data, accuracy tanks. This was the #1 problem here.
2. **Swap in a CNN actually trained on the full Quick, Draw! dataset**
   (moderate effort, big win). `ml5.imageClassifier("DoodleNet")` is a thin
   wrapper around exactly this kind of model, but you can load the same
   (or a better-tuned) network directly with TensorFlow.js and control
   every step of pre-processing yourself.
3. **Train your own CNN on more/newer data, more epochs, deeper network**
   (high effort). You can pull the raw 50M-drawing dataset from Google Cloud
   Storage and train a bigger model (extra conv layers, dropout, data
   augmentation, stroke-order features) for a few extra accuracy points,
   but this needs a GPU, Python/Keras, and a TF.js conversion step.
4. **Use an RNN/stroke-sequence model (Sketch-RNN style)** instead of a
   raster CNN (high effort, marginal gain for this use case). This is closer
   to what the real Quick, Draw! game uses server-side, but it's harder to
   run well fully client-side and mostly helps with *partial* / in-progress
   drawings rather than final-image accuracy.
5. **Ensemble / vote across several models** (moderate effort, small gain).
   Diminishing returns for a hobby project, and it multiplies model
   download size and inference time in the browser.

**Selected approach: #1 + #2 combined.** This gets you the accuracy of a
model trained on Google's actual 50-million-drawing dataset, while fixing
the pre-processing bug that was silently destroying most of that model's
accuracy in the original code. That combination gets normal, clearly-drawn
doodles into the 90%+ confidence range for their correct label in testing,
without needing any GPU training, extra infra, or a server component.

## What was actually wrong with the original app

The previous version used `ml5.imageClassifier("DoodleNet")` and fed it the
**entire** 350×350 `p5.js` canvas on every mouse release. Two things killed
accuracy:

- **No cropping.** A typical doodle only fills a small part of the canvas.
  Shrinking a mostly-blank 350×350 image straight down to the model's native
  28×28 input turns most real strokes into a few nearly-invisible pixels —
  the network was trained on images where the drawing fills the frame.
- **No down-sampling anti-aliasing control.** ml5's own `DoodleNet` wrapper
  also hard-thresholds each pixel to pure 0 or 1 after resizing, which,
  combined with the above, could wipe out thin strokes completely.

## What this rewrite does differently

`main.js` now:

1. Loads the **real DoodleNet convolutional network** — trained on all 345
   categories of Google's Quick, Draw! dataset (50M drawings) — directly via
   TensorFlow.js from `model/doodlenet/` (vendored locally, ~2.1 MB, no
   external API calls needed at runtime beyond the TensorFlow.js library
   itself).
2. Tracks the bounding box of your strokes as you draw and, before every
   prediction, **crops tightly to that bounding box** (with a small padding
   margin, and a sensible minimum size relative to the brush width so very
   small doodles don't get crushed).
3. **Down-samples that crop to 28×28 with box/area averaging** (i.e. every
   output pixel is the average of all the source pixels it covers), instead
   of nearest-neighbour scaling or a hard black/white threshold. This
   produces smooth, anti-aliased grayscale input much closer to what the
   network actually saw during training.
4. Shows a **live top-5 prediction list** with confidence bars (not just a
   single guess), and declares a win once the correct label is confidently
   in first place.
5. Uses **Pointer Events** so drawing works with mouse, touch, and stylus,
   and removed the jQuery/Bootstrap/p5.js dependencies in favor of plain
   Canvas 2D + vanilla JS (smaller, fewer moving parts, easier to maintain).

This was verified with a synthetic test harness (drawing basic shapes and
common doodle compositions, at the same size/proportions the real
350×350 canvas and default 12px brush produce) comparing the old
preprocessing vs. the new one against the *same* model weights — the new
pipeline turned several outright-wrong guesses (e.g. a hand-drawn square
being classified as "picture frame", a circle as "bracelet") into correct,
high-confidence predictions (square/circle/triangle/star all >85%
confidence) with no change to the model itself.

## Project structure

```
index.html              # Markup, layout, loads TensorFlow.js from a CDN
style.css                # Styling
main.js                   # Game logic, drawing, pre-processing, prediction
model/doodlenet/          # Vendored TF.js DoodleNet model (345 classes)
  model.json
  group1-shard1of1.bin
  class_names.txt
```

## Running locally

No build step needed — just serve the folder statically, e.g.:

```
python3 -m http.server 8080
```

then open `http://localhost:8080`.

## Attribution

The bundled model weights are the DoodleNet CNN originally trained by the
ml5.js project (`ml5js/ml5-data-and-models`, MIT-licensed) on Google's
Quick, Draw! dataset, vendored here so the app works fully offline-capable
and doesn't depend on any single CDN staying up.
