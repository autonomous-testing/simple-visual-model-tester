import { blobToDataURL } from '../core/utils.js';

/**
 * ImageLoader
 * - Loads an image file, normalizes EXIF orientation using createImageBitmap({ imageOrientation:'from-image' }) when available.
 * - Provides getCurrent() to retrieve the currently loaded (blob, name).
 */
export class ImageLoader {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.current = null; // { bitmap, width, height, blob, name }
  }

  async loadFile(file) {
    const blob = file;
    const name = file.name;
    return await this._loadBlob(blob, name);
  }

  async loadBlob(blob, name='image') {
    return await this._loadBlob(blob, name);
  }

  async _loadBlob(blob, name) {
    let bitmap;
    // Try to respect EXIF rotation if supported
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Fallback: no EXIF handling
      bitmap = await createImageBitmap(blob);
    }
    const width = bitmap.width;
    const height = bitmap.height;

    // Fit canvas to preview area while keeping full resolution drawing using devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    // CSS size will be controlled by container; we set canvas pixel size to match display box later in renderer
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.aspectRatio = `${width} / ${height}`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(bitmap, 0, 0, width, height);

    this.current = { bitmap, width, height, blob, name };
    return this.current;
  }

  getCurrent() {
    return this.current;
  }
}

