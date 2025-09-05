export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const short = (s, n=32) => (s && s.length > n) ? (s.slice(0, n) + '…') : (s || '');

export function onKey(code, fn) {
  window.addEventListener('keydown', (e) => {
    if (e.code === code && !e.repeat) {
      // Ignore shortcuts while typing in inputs/textareas/contenteditable
      const el = document.activeElement;
      const isEditable = !!(el && (
        (el.tagName === 'INPUT') ||
        (el.tagName === 'TEXTAREA') ||
        (el.tagName === 'SELECT') ||
        // HTMLElement check guards against non-Element activeElement in edge cases
        ((el instanceof HTMLElement) && el.isContentEditable)
      ));
      if (isEditable) return;

      fn();
      e.preventDefault();
    }
  });
}

export function csvRow(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function blobToDataURL(blob) {
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export async function sha256(blob) {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function uuid() {
  try {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {}
  try {
    const arr = new Uint8Array(16);
    (crypto && crypto.getRandomValues) ? crypto.getRandomValues(arr) : arr.fill(Math.random()*255);
    // RFC4122 version 4 pseudo-UUID
    arr[6] = (arr[6] & 0x0f) | 0x40;
    arr[8] = (arr[8] & 0x3f) | 0x80;
    const hex = Array.from(arr, b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10,16).join('')}`;
  } catch {
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  }
}
export function ulid() {
  // Simple ULID-like using time + random; NOT spec-perfect, but sortable
  const t = Date.now().toString(36).padStart(8, '0');
  const r = Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b => b.toString(36).slice(-1)).join('');
  return (t + r).slice(0, 18);
}

export function truncate(s, max=2000) {
  s = String(s || '');
  return s.length > max ? (s.slice(0, max) + '…') : s;
}
