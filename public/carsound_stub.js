// Stub for car sound effects (engine, starter, horn, door, indicators).
// Implement full WebAudio synthesis when sound support is added (see docs/DRIVE_SPEC.md).

export function createCarSound(getCtx) {
  return {
    set({ rpm, throttle, running } = {}) {},
    crank(on) {},
    stall() {},
    horn(on) {},
    tick() {},
    door(open) {},
    gearGrind() {},
    stop() {},
  };
}
