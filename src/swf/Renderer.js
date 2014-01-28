/*
 * Copyright 2013 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var rendererOptions = coreOptions.register(new OptionSet("Renderer Options"));
var traceRenderer = rendererOptions.register(new Option("tr", "traceRenderer", "number", 0, "trace renderer execution"));
var disableRendering = rendererOptions.register(new Option("drv", "disableRendering", "boolean", false, "disable rendering"));
var disableMouse = rendererOptions.register(new Option("dmv", "disableMouse", "boolean", false, "disable mouse handling"));
//var showRedrawRegions = rendererOptions.register(new Option("rr", "showRedrawRegions", "boolean", false, "show redraw regions"));
//var renderAsWireframe = rendererOptions.register(new Option("raw", "renderAsWireframe", "boolean", false, "render as wireframe"));
var turboMode = rendererOptions.register(new Option("", "turbo", "boolean", false, "turbo mode"));
var forceHidpi = rendererOptions.register(new Option("", "forceHidpi", "boolean", false, "force hidpi"));
var skipFrameDraw = rendererOptions.register(new Option("", "skipFrameDraw", "boolean", true, "skip frame when not on time"));
var hud = rendererOptions.register(new Option("", "hud", "boolean", false, "show hud mode"));
var dummyAnimation = rendererOptions.register(new Option("", "dummy", "boolean", false, "show test balls animation"));

var enableConstructChildren = rendererOptions.register(new Option("", "constructChildren", "boolean", true, "Construct Children"));
var enableEnterFrame = rendererOptions.register(new Option("", "enterFrame", "boolean", true, "Enter Frame"));
var enableAdvanceFrame = rendererOptions.register(new Option("", "advanceFrame", "boolean", true, "Advance Frame"));

var stageOptions = coreOptions.register(new OptionSet("Stage Renderer Options"));
var perspectiveCamera = stageOptions.register(new Option("", "pc", "boolean", false, "Use perspective camera."));

var perspectiveCameraFOV = stageOptions.register(new Option("", "pcFOV", "number", 60, "Perspective Camera FOV."));
var perspectiveCameraDistance = stageOptions.register(new Option("", "pcDistance", "number", 1, "Perspective Camera Distance."));
var perspectiveCameraAngle = stageOptions.register(new Option("", "pcAngle", "number", 0, "Perspective Camera Angle."));
var perspectiveCameraAngleRotate = stageOptions.register(new Option("", "pcRotate", "boolean", false, "Rotate Use perspective camera."));
var perspectiveCameraSpacing = stageOptions.register(new Option("", "pcSpacing", "number", 0.1, "Element Spacing."));
var perspectiveCameraSpacingInflate = stageOptions.register(new Option("", "pcInflate", "boolean", false, "Rotate Use perspective camera."));

var timeline;
var hudTimeline;

function timelineEnter(name) {
  timeline && timeline.enter(name);
  hudTimeline && hudTimeline.enter(name);
}

function timelineLeave(name) {
  timeline && timeline.leave(name);
  hudTimeline && hudTimeline.leave(name);
}

function timelineWrapBroadcastMessage(domain, message) {
  timelineEnter(message);
  domain.broadcastMessage(message);
  timelineLeave(message);
}

function initializeHUD(stage, parentCanvas) {
  var canvas = document.createElement('canvas');
  var canvasContainer = document.createElement('div');
  canvasContainer.appendChild(canvas);
  canvasContainer.style.position = "absolute";
  canvasContainer.style.top = "0px";
  canvasContainer.style.left = "0px";
  canvasContainer.style.width = "100%";
  canvasContainer.style.height = "150px";
  canvasContainer.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
  canvasContainer.style.pointerEvents = "none";
  parentCanvas.parentElement.appendChild(canvasContainer);
  hudTimeline = new Timeline(canvas);
  hudTimeline.setFrameRate(stage._frameRate);
  hudTimeline.refreshEvery(10);
}

var BlendModeNameMap = {
  "normal": 'normal',
  "multiply": 'multiply',
  "screen": 'screen',
  "lighten": 'lighten',
  "darken": 'darken',
  "difference": 'difference',
  "overlay": 'overlay',
  "hardlight": 'hard-light'
};

function getBlendModeName(blendMode) {
  // TODO:

  // These Flash blend modes have no canvas equivalent:
  // - blendModeClass.SUBTRACT
  // - blendModeClass.INVERT
  // - blendModeClass.SHADER
  // - blendModeClass.ADD

  // These blend modes are actually Porter-Duff compositing operators.
  // The backdrop is the nearest parent with blendMode set to LAYER.
  // When there is no LAYER parent, they are ignored (treated as NORMAL).
  // - blendModeClass.ALPHA (destination-in)
  // - blendModeClass.ERASE (destination-out)
  // - blendModeClass.LAYER [defines backdrop]

  return BlendModeNameMap[blendMode] || 'normal';
}

var head = document.head;
head.insertBefore(document.createElement('style'), head.firstChild);
var style = document.styleSheets[0];

// Used for creating gradients and patterns
var factoryCtx = !inWorker ?
                 document.createElement('canvas').getContext('2d') :
                 null;

function Renderer() {
  this._renderables = { };
}
Renderer.prototype.nextId = 0xffff;

Renderer.prototype.defineRenderable = function defineRenderable(id, type, symbol) {
  var renderable;
  switch (type) {
  case 'shape':
    renderable = new RenderableShape(symbol, this);
    break;
  case 'gradient':
    renderable = new RenderableGradient(symbol, this);
    break;
  case 'pattern':
    renderable = new RenderablePattern(symbol, this);
    break;
  case 'bitmap':
    renderable = new RenderableBitmap(symbol, this);
    break;
  case 'font':
    renderable = new RenderableFont(symbol, this);
    break;
  case 'text':
  case 'label':
    renderable = new RenderableText(symbol, this);
    break;
  }
  this._renderables[id] = renderable;
};
Renderer.prototype.getRenderable = function getRenderable(id) {
  return this._renderables[id];
};
Renderer.prototype.undefineRenderable = function undefineRenderable(id) {
  var renderable = this._renderables[id];
  delete this._renderables[id];
  return renderable;
};

function RenderableShape(symbol, renderer) {
  this.commands = symbol.commands;
  this.data = symbol.data;
  this.properties = { };

  var bbox = symbol.strokeBbox || symbol.bbox;

  this.rect = new Shumway.Geometry.Rectangle(bbox.xMin / 20,
                                             bbox.yMin / 20,
                                             (bbox.xMax - bbox.xMin) / 20,
                                             (bbox.yMax - bbox.yMin) / 20);

  var paths = symbol.paths;

  for (var i = 0; i < paths.length; i++) {
    paths[i] = finishShapePath(paths[i], renderer);
  }

  this.paths = paths;
}
RenderableShape.prototype.getBounds = function getBounds() {
  return this.rect;
};
RenderableShape.prototype.render = function render(ctx) {
  ctx.save();
  ctx.translate(-this.rect.x, -this.rect.y);

  var paths = this.paths;
  for (var i = 0; i < paths.length; i++) {
    var path = paths[i];

    if (!path.fillStyle) {
      continue;
    }

    ctx.beginPath();
    var commands = path.commands;
    var data = path.data;
    var morphData = path.morphData;
    var formOpen = false;
    var formOpenX = 0;
    var formOpenY = 0;
    if (!path.isMorph) {
      for (var j = 0, k = 0; j < commands.length; j++) {
        switch (commands[j]) {
          case SHAPE_MOVE_TO:
            formOpen = true;
            formOpenX = data[k++]/20;
            formOpenY = data[k++]/20;
            ctx.moveTo(formOpenX, formOpenY);
            break;
          case SHAPE_WIDE_MOVE_TO:
            ctx.moveTo(data[k++]/20, data[k++]/20);
            k += 2;
            break;
          case SHAPE_LINE_TO:
            ctx.lineTo(data[k++]/20, data[k++]/20);
            break;
          case SHAPE_WIDE_LINE_TO:
            ctx.lineTo(data[k++]/20, data[k++]/20);
            k += 2;
            break;
          case SHAPE_CURVE_TO:
            ctx.quadraticCurveTo(data[k++]/20, data[k++]/20,
                                 data[k++]/20, data[k++]/20);
            break;
          case SHAPE_CUBIC_CURVE_TO:
            ctx.bezierCurveTo(data[k++]/20, data[k++]/20,
                              data[k++]/20, data[k++]/20,
                              data[k++]/20, data[k++]/20);
            break;
          case SHAPE_CIRCLE:
            if (formOpen) {
              ctx.lineTo(formOpenX, formOpenY);
              formOpen = false;
            }
            ctx.moveTo((data[k] + data[k+2])/20, data[k+1]/20);
            ctx.arc(data[k++]/20, data[k++]/20, data[k++]/20, 0, Math.PI * 2,
                    false);
            break;
          case SHAPE_ELLIPSE:
            if (formOpen) {
              ctx.lineTo(formOpenX, formOpenY);
              formOpen = false;
            }
            var x = data[k++];
            var y = data[k++];
            var rX = data[k++];
            var rY = data[k++];
            var radius;
            if (rX !== rY) {
              ctx.save();
              var ellipseScale;
              if (rX > rY) {
                ellipseScale = rX / rY;
                radius = rY;
                x /= ellipseScale;
                ctx.scale(ellipseScale, 1);
              } else {
                ellipseScale = rY / rX;
                radius = rX;
                y /= ellipseScale;
                ctx.scale(1, ellipseScale);
              }
            }
            ctx.moveTo((x + radius)/20, y/20);
            ctx.arc(x/20, y/20, radius/20, 0, Math.PI * 2, false);
            if (rX !== rY) {
              ctx.restore();
            }
            break;
          default:
            // Sometimes, the very last command isn't properly set. Ignore it.
            if (commands[j] === 0 && j === commands.length -1) {
              break;
            }
            console.warn("Unknown drawing command encountered: " +
                         commands[j]);
        }
      }
    } else {
      for (var j = 0, k = 0; j < commands.length; j++) {
        switch (commands[j]) {
          case SHAPE_MOVE_TO:
            ctx.moveTo(morph(data[k]/20, morphData[k++]/20, ratio),
                       morph(data[k]/20, morphData[k++]/20, ratio));
            break;
          case SHAPE_LINE_TO:
            ctx.lineTo(morph(data[k]/20, morphData[k++]/20, ratio),
                       morph(data[k]/20, morphData[k++]/20, ratio));
            break;
          case SHAPE_CURVE_TO:
            ctx.quadraticCurveTo(morph(data[k]/20, morphData[k++]/20, ratio),
                                 morph(data[k]/20, morphData[k++]/20, ratio),
                                 morph(data[k]/20, morphData[k++]/20, ratio),
                                 morph(data[k]/20, morphData[k++]/20, ratio));
            break;
          default:
            console.warn("Drawing command not supported for morph " +
                         "shapes: " + commands[j]);
        }
      }
    }
    // TODO: enable in-path line-style changes
    if (formOpen) {
      ctx.lineTo(formOpenX, formOpenY);
    }
    //if (!clip) {
      var fillStyle = path.fillStyle;
      if (fillStyle) {
        ctx.fillStyle = fillStyle.style;
        ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled =
                                    fillStyle.smooth;
        var m = fillStyle.transform;
        ctx.save();
        if (m) {
          ctx.transform(m.a, m.b, m.c, m.d, m.e/20, m.f/20);
        }
        ctx.fill();
        ctx.restore();
      }
      var lineStyle = path.lineStyle;
      // TODO: All widths except for `undefined` and `NaN` draw something
      if (lineStyle) {
        ctx.strokeStyle = lineStyle.style;
        ctx.save();
        // Flash's lines are always at least 1px/20twips
        ctx.lineWidth = Math.max(lineStyle.width/20, 1);
        ctx.lineCap = lineStyle.lineCap;
        ctx.lineJoin = lineStyle.lineJoin;
        ctx.miterLimit = lineStyle.miterLimit;
        ctx.stroke();
        ctx.restore();
      }
    //} else {
    //  ctx.fill();
    //}
    ctx.closePath();
  }

  ctx.restore();
};

function RenderableGradient(symbol, renderer) {
  this.rect = new Shumway.Geometry.Rectangle;
  this.properties = { };

  var gradient;
  if (style.type === GRAPHICS_FILL_LINEAR_GRADIENT) {
    gradient = factoryCtx.createLinearGradient(-1, 0, 1, 0);
  } else {
    gradient = factoryCtx.createRadialGradient((symbol.focalPoint | 0) / 20,
                                               0, 0, 0, 0, 1);
  }

  var records = symbol.records;
  for (var i = 0; i < records.length; i++) {
    var record = records[j];
    var colorStr = rgbaObjToStr(record.color);
    gradient.addColorStop(record.ratio / 255, colorStr);
  }

  this.gradient = gradient;
}
RenderableGradient.prototype.getBounds = function getBounds() {
  return this.rect;
};
RenderableGradient.prototype.render = function render(ctx) {
  // TODO
};

function RenderableRadialGradient(focalPoint, colorStops) {
  this.rect = new Shumway.Geometry.Rectangle();
  this.properties = { };

  var gradient = factoryCtx.createRadialGradient(focalPoint, 0, 0, 0, 0, 1);
  for (var i = 0; i < colorStops.length; i++) {
    gradient.addColorStop(colorStops[i].ratio, colorStops[i].color);
  }
  this.gradient = gradient;
}
RenderableRadialGradient.prototype.getBounds = function getBounds() {
  return this.rect;
};
RenderableRadialGradient.prototype.render = function render(ctx) {
  // TODO
};

function RenderablePattern(symbol, renderer) {
  var bitmap = renderer.getRenderable(style.bitmapId);

  var rect = bitmap.rect;
  this.rect = new Shumway.Geometry.Rectangle(rect.x,
                                             rect.y,
                                             rect.width,
                                             rect.height);

  var repeat = (symbol.type === GRAPHICS_FILL_REPEATING_BITMAP) ||
               (symbol.type === GRAPHICS_FILL_NONSMOOTHED_REPEATING_BITMAP);

  this.pattern = factoryCtx.createPattern(bitmap.img,
                                          repeat ? 'repeat' : 'no-repeat');
}
RenderablePattern.prototype.getBounds = function getBounds() {
  return this.rect;
};
RenderablePattern.prototype.render = function render(ctx) {
  // TODO
};

function RenderableBitmap(symbol, renderer) {
  this.properties = { };
  this.rect = new Shumway.Geometry.Rectangle(symbol.width / 20,
                                             symbol.height / 20);

  var img = new Image();
  //var imgPromiseResolve;
  //var imgPromise = new Promise(function (resolve) {
  //  imgPromiseResolve = resolve;
  //});
  img.onload = function () {
    if (symbol.mask) {
      // Write the image into new canvas and apply the mask.
      var maskCanvas = document.createElement('canvas');
      maskCanvas.width = symbol.width;
      maskCanvas.height = symbol.height;
      var maskContext = maskCanvas.getContext('2d');
      maskContext.drawImage(img, 0, 0);
      var maskImageData = maskContext.getImageData(0, 0, symbol.width, symbol.height);
      var maskImageDataBytes = maskImageData.data;
      var symbolMaskBytes = symbol.mask;
      var length = maskImageData.width * maskImageData.height;
      for (var i = 0, j = 3; i < length; i++, j += 4) {
        maskImageDataBytes[j] = symbolMaskBytes[i];
      }
      maskContext.putImageData(maskImageData, 0, 0);
      // Use the result canvas as renderable image
      props.img = maskCanvas;
    }
    //imgPromiseResolve();
  };
  img.src = URL.createObjectURL(symbol.data);
  //promiseQueue.push(imgPromise);

  this.img = img;
}
RenderableBitmap.prototype.getBounds = function getBounds() {
  return this.rect;
};
RenderableBitmap.prototype.render = function render(ctx) {
  //  if (!this._bitmapData) {
  //    return;
  //  }
  //  var scaledImage;
  //  ctx.save();
  //  if (this._pixelSnapping === 'auto' || this._pixelSnapping === 'always') {
  //    var transform = this._getConcatenatedTransform(null, true);
  //    var EPSILON = 0.001;
  //    var aInt = Math.abs(Math.round(transform.a));
  //    var dInt = Math.abs(Math.round(transform.d));
  //    var snapPixels;
  //    if (aInt >= 1 && aInt <= MAX_SNAP_DRAW_SCALE_TO_CACHE &&
  //        dInt >= 1 && dInt <= MAX_SNAP_DRAW_SCALE_TO_CACHE &&
  //        Math.abs(Math.abs(transform.a) / aInt - 1) <= EPSILON &&
  //        Math.abs(Math.abs(transform.d) / dInt - 1) <= EPSILON &&
  //        Math.abs(transform.b) <= EPSILON && Math.abs(transform.c) <= EPSILON) {
  //      if (aInt === 1 && dInt === 1) {
  //        snapPixels = true;
  //      } else {
  //        var sizeKey = aInt + 'x' + dInt;
  //        if (this._snapImageCache.size !== sizeKey) {
  //          this._snapImageCache.size = sizeKey;
  //          this._snapImageCache.hits = 0;
  //          this._snapImageCache.image = null;
  //        }
  //        if (++this._snapImageCache.hits === CACHE_SNAP_DRAW_AFTER) {
  //          this._cacheSnapImage(sizeKey, aInt, dInt);
  //        }
  //        scaledImage = this._snapImageCache.image;
  //        snapPixels = !!scaledImage;
  //      }
  //    } else {
  //      snapPixels = false;
  //    }
  //    if (snapPixels) {
  //      ctx.setTransform(transform.a < 0 ? -1 : 1, 0,
  //                       0, transform.d < 0 ? -1 : 1,
  //                       (transform.tx/20)|0, (transform.ty/20)|0);
  //    }
  //    // TODO this._pixelSnapping === 'always'; does it even make sense in other cases?
  //  }
  //
  //  colorTransform.setAlpha(ctx, true);
  //  ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled =
  //                              this._smoothing;
  //  ctx.drawImage(scaledImage || this._bitmapData._getDrawable(), 0, 0);
  //  ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = false;
  //  ctx.restore();
  //  traceRenderer.value && frameWriter.writeLn("Bitmap.draw() snapping: " + this._pixelSnapping +
  //    ", dimensions: " + this._bitmapData._drawable.width + " x " + this._bitmapData._drawable.height);
  ctx.drawImage(this.img, 0, 0);
};

function RenderableFont(symbol, renderer) {
  var charset = fromCharCode.apply(null, symbol.codes);
  if (charset) {
    style.insertRule(
      '@font-face{' +
        'font-family:"' + symbol.uniqueName + '";' +
        'src:url(data:font/opentype;base64,' + btoa(symbol.data) + ')' +
        '}',
      style.cssRules.length
    );

    // HACK non-Gecko browsers need time to load fonts
    //if (!/Mozilla\/5.0.*?rv:(\d+).*? Gecko/.test(window.navigator.userAgent)) {
    //  var testDiv = document.createElement('div');
    //  testDiv.setAttribute('style', 'position: absolute; top: 0; right: 0;' +
    //                                'visibility: hidden; z-index: -500;' +
    //                                'font-family:"' + symbol.uniqueName + '";');
    //  testDiv.textContent = 'font test';
    //  document.body.appendChild(testDiv);

    //  var fontPromise = new Promise(function (resolve) {
    //    setTimeout(function () {
    //      resolve();
    //      document.body.removeChild(testDiv);
    //    }, 200);
    //  });
    //  promiseQueue.push(fontPromise);
    //}
  }
}
RenderableFont.prototype.getBounds = function getBounds() {
  // TODO
};
RenderableFont.prototype.render = function render(ctx) {
  // TODO
};

function RenderableText(symbol, renderer) {
  this.properties = { };
  this.rect = new Shumway.Geometry.Rectangle();

  if (symbol.data) {
    this.render = new Function('c', symbol.data);
  }
}
RenderableText.prototype.getBounds = function getBounds() {
  return this.rect;
};
RenderableText.prototype.render = function render(ctx) {
  //  this.ensureDimensions();
  //  var bounds = this._bbox;
  //  var width = bounds.xMax / 20;
  //  var height = bounds.yMax / 20;
  //  if (width <= 0 || height <= 0) {
  //    return;
  //  }
  //
  //  ctx.save();
  //  ctx.beginPath();
  //  ctx.rect(0, 0, width + 1, height + 1);
  //  ctx.clip();
  //  if (this._background) {
  //    ctx.fillStyle = this._backgroundColorStr;
  //    ctx.fill();
  //  }
  //  if (this._border) {
  //    ctx.strokeStyle = this._borderColorStr;
  //    ctx.lineCap = "square";
  //    ctx.lineWidth = 1;
  //    ctx.strokeRect(0.5, 0.5, width|0, height|0);
  //  }
  //  ctx.closePath();
  //
  //  if (this._lines.length === 0) {
  //    ctx.restore();
  //    return;
  //  }
  //
  //  ctx.translate(2, 2);
  //  ctx.save();
  //  var runs = this._content.textruns;
  //  var offsetY = this._lines[this._scrollV - 1].y;
  //  for (var i = 0; i < runs.length; i++) {
  //    var run = runs[i];
  //    if (run.type === 'f') {
  //      ctx.restore();
  //      ctx.font = run.format.str;
  //      // TODO: only apply color and alpha if it actually changed
  //      ctx.fillStyle = run.format.color;
  //      ctx.save();
  //    } else {
  //      assert(run.type === 't', 'Invalid run type: ' + run.type);
  //      if (run.y < offsetY) {
  //        continue;
  //      }
  //      ctx.fillText(run.text, run.x - this._drawingOffsetH, run.y - offsetY);
  //    }
  //  }
  //  ctx.restore();
  //  ctx.restore();
  //}
};

function initStyle(style, renderer) {
  if (style.type === undefined) {
    return;
  }

  if (style.type === GRAPHICS_FILL_SOLID) {
    // Solid fill styles are fully processed in shape.js's processStyle
    return;
  }

  var id = renderer.nextId++;

  switch (style.type) {
    case GRAPHICS_FILL_LINEAR_GRADIENT:
    case GRAPHICS_FILL_RADIAL_GRADIENT:
    case GRAPHICS_FILL_FOCAL_RADIAL_GRADIENT:
      renderer.defineRenderable(id, 'gradient', style);
      break;
    case GRAPHICS_FILL_REPEATING_BITMAP:
    case GRAPHICS_FILL_CLIPPED_BITMAP:
    case GRAPHICS_FILL_NONSMOOTHED_REPEATING_BITMAP:
    case GRAPHICS_FILL_NONSMOOTHED_CLIPPED_BITMAP:
      renderer.defineRenderable(id, 'pattern', style);
      break;
    default:
      fail('invalid fill style', 'shape');
  }

  style.style = renderer.getRenderable(id).gradient;
}

/**
 * For shapes parsed in a worker thread, we have to finish their
 * paths after receiving the data in the main thread.
 *
 * This entails creating proper instances for all the contained data types.
 */
function finishShapePath(path, renderer) {
  assert(!inWorker);

  if (path.fullyInitialized) {
    return path;
  }
  if (!(path instanceof ShapePath)) {
    var untypedPath = path;
    path = new ShapePath(path.fillStyle, path.lineStyle, 0, 0, path.isMorph);
    // See the comment in the ShapePath ctor for why we're recreating the
    // typed arrays here.
    path.commands = new Uint8Array(untypedPath.buffers[0]);
    path.data = new Int32Array(untypedPath.buffers[1]);
    if (untypedPath.isMorph) {
      path.morphData = new Int32Array(untypedPath.buffers[2]);
    }
    path.buffers = null;
  }
  path.fillStyle && initStyle(path.fillStyle, renderer);
  path.lineStyle && initStyle(path.lineStyle, renderer);
  path.fullyInitialized = true;
  return path;
}
