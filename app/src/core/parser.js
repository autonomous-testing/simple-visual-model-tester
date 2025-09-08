export class Parser {
  parse(rawText, imgW, imgH) {
    let obj;
    try {
      obj = JSON.parse(rawText);
    } catch {
      return { ok:false, status:'invalid_json', value:null, error:'Invalid JSON' };
    }

    const image_size = obj.image_size;
    const primary = obj.primary;
    if (!image_size || !primary) {
      return { ok:false, status:'invalid_json', value:null, error:'Missing required keys' };
    }

    const width = this._toNum(image_size.width);
    const height = this._toNum(image_size.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return { ok:false, status:'invalid_json', value:null, error:'Invalid image_size' };
    }

    const normalized = {
      imageSize: { width, height },
      primary: this._normDet(primary, width, height),
      others: Array.isArray(obj.others) ? obj.others.map(d => this._normDet(d, width, height)).filter(Boolean) : [],
      notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    };

    if (!normalized.primary) {
      return { ok:false, status:'invalid_json', value:null, error:'Invalid primary' };
    }

    return { ok:true, status:'ok', value: normalized };
  }

  _toNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : NaN;
  }

  _normDet(d, w, h) {
    if (!d || (d.type !== 'point' && d.type !== 'bbox')) return null;
    if (d.type === 'point') {
      const x = this._clampNum(d.x, 0, w);
      const y = this._clampNum(d.y, 0, h);
      const conf = d.confidence != null ? Number(d.confidence) : null;
      return { type:'point', x, y, confidence: Number.isFinite(conf) ? conf : null };
    } else {
      const x = this._clampNum(d.x, 0, w);
      const y = this._clampNum(d.y, 0, h);
      const width = this._clampNum(d.width, 0, w);
      const height = this._clampNum(d.height, 0, h);
      const conf = d.confidence != null ? Number(d.confidence) : null;
      return { type:'bbox', x, y, width, height, confidence: Number.isFinite(conf) ? conf : null };
    }
  }

  _clampNum(x, min, max) {
    const n = Number(x);
    if (!Number.isFinite(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }
}

