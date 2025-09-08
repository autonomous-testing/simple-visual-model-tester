import { clamp } from '../core/utils.js';

/**
 * OverlayRenderer
 * - Draws points/bboxes and labels in devicePixelRatio-aware coordinates
 * - Maintains current image metadata to compute display scales
 */
export class OverlayRenderer {
  constructor(canvas, legendEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.legendEl = legendEl;
    this.image = null; // { bitmap, width, height, name }
    this.observer = new ResizeObserver(() => this.redraw());
    this.observer.observe(this.canvas.parentElement);
    window.addEventListener('resize', () => this.redraw());
  }

  clear() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.legendEl.innerHTML = '';
  }

  setImage(bitmap, width, height, name) {
    this.image = { bitmap, width, height, name };
    this.redraw();
  }

  drawDetections(items) {
    // items: [{ color, model, det }]
    this._detections = items.filter(i => i.det);
    this.redraw();
  }

  redraw() {
    if (!this.image) return;
    const parent = this.canvas.parentElement;
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;

    // If the preview pane is hidden (display:none), it will report 0x0.
    // Avoid shrinking the canvas to 1px; defer until visible again.
    if (cssW === 0 || cssH === 0) return;

    const imgW = this.image.width;
    const imgH = this.image.height;

    const scale = Math.min(cssW / imgW, cssH / imgH);
    const dispW = Math.max(1, Math.floor(imgW * scale));
    const dispH = Math.max(1, Math.floor(imgH * scale));

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = dispW * dpr;
    this.canvas.height = dispH * dpr;
    this.canvas.style.width = dispW + 'px';
    this.canvas.style.height = dispH + 'px';

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, dispW, dispH);

    // Draw image
    ctx.drawImage(this.image.bitmap, 0, 0, dispW, dispH);

    // Overlay
    if (this._detections && this._detections.length) {
      for (const item of this._detections) {
        this._drawDetection(ctx, item, dispW / imgW, dispH / imgH);
      }
    }

    // Legend
    this._renderLegend();
  }

  _renderLegend() {
    const items = this._detections || [];
    if (!items.length) { this.legendEl.innerHTML=''; return; }
    this.legendEl.innerHTML = items.map(i => (
      `<span class="item"><span class="swatch" style="background:${i.color}"></span>${i.model}</span>`
    )).join(' ');
  }

  _drawDetection(ctx, item, scaleX, scaleY) {
    const { det, color, model } = item;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.font = '12px ui-monospace, monospace';

    if (det.type === 'point') {
      const x = det.x * scaleX;
      const y = det.y * scaleY;
      // crosshair
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
      ctx.stroke();
      this._label(ctx, x + 8, y - 8, model, color);
    } else if (det.type === 'bbox') {
      const x = det.x * scaleX;
      const y = det.y * scaleY;
      const w = det.width * scaleX;
      const h = det.height * scaleY;
      ctx.strokeRect(x, y, w, h);
      this._label(ctx, x, Math.max(0, y - 6), model, color);
    }

    ctx.restore();
  }

  _label(ctx, x, y, text, textColor) {
    const pad = 3;
    const metrics = ctx.measureText(text);
    const w = metrics.width + pad*2;
    const h = 14 + pad*2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, y - h, w, h);
    ctx.fillStyle = textColor || '#fff';
    ctx.fillText(text, x + pad, y - pad);
    ctx.restore();
  }
}
