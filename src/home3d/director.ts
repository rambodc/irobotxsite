// Drives the auto-tour: which forms are blended, morph progress and chapter timing.
export const DURATIONS = [6.5, 10.5, 7.5, 7.5, 7.5];
export const CHAPTERS = DURATIONS.length;
const T_IN = 1.9,
  T_OUT = 1.5;

export class Director {
  chapter = 0;
  t = 0;
  entry = 0;
  from = 0;
  to = 0;
  progress = 1;
  paused = false;
  onChapter?: (chapter: number) => void;
  // Interaction state shared with the scene.
  orbit = { az: 0, el: 0, dragging: false, releasedAt: -1e9 };
  pointer = { x: 0, y: 0, active: false, movedAt: -1e9 };
  kicks = 0;

  update(dt: number) {
    const d = DURATIONS[this.chapter];
    if (!this.paused) this.t += dt;
    // While paused, finish an in-progress reveal and rewind a dissolve so the form stays readable.
    else if (this.t < T_IN) this.t = Math.min(T_IN, this.t + dt);
    else if (this.chapter > 0 && this.t > d - T_OUT)
      this.t = Math.max(d - T_OUT, this.t - dt);
    if (this.t >= DURATIONS[this.chapter])
      this.go((this.chapter + 1) % CHAPTERS);
    else this.compute();
  }
  compute() {
    const c = this.chapter,
      t = this.t,
      d = DURATIONS[c];
    if (c === 0) {
      this.from = this.entry;
      this.to = 0;
      this.progress = this.entry === 0 ? 1 : Math.min(t / T_IN, 1);
    } else if (t < d - T_OUT) {
      this.from = this.entry;
      this.to = c;
      this.progress = this.entry === c ? 1 : Math.min(t / T_IN, 1);
    } else {
      this.from = c;
      this.to = 0;
      this.progress = (t - (d - T_OUT)) / T_OUT;
    }
  }
  dominant() {
    return this.progress < 0.5 ? this.from : this.to;
  }
  go(chapter: number) {
    const entry = this.dominant();
    this.chapter = chapter;
    this.t = 0;
    this.entry = entry;
    this.compute();
    this.onChapter?.(chapter);
  }
  get settled() {
    return this.from === this.to || this.progress >= 1;
  }
  get fraction() {
    return Math.min(this.t / DURATIONS[this.chapter], 1);
  }
}
