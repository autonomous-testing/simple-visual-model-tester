export const Metrics = {
  pointDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  },
  bboxIoU(a, b) {
    const interW = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const interH = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const interArea = interW * interH;
    const union = a.width * a.height + b.width * b.height - interArea;
    return union > 0 ? interArea / union : 0;
  },
  bboxCenterDistance(a, b) {
    const ac = { x: a.x + a.width/2, y: a.y + a.height/2 };
    const bc = { x: b.x + b.width/2, y: b.y + b.height/2 };
    return this.pointDistance(ac, bc);
  }
};

