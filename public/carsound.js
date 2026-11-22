export function createCarSound(getCtx) {
  let ctx, master, engine, starter, hornNodes, ticking = false;
  const nodes = [];
  const ramp = (param, value, time = .04) => { if (param && ctx) param.setTargetAtTime(value, ctx.currentTime, time); };
  function ensure() {
    if (ctx) return true;
    try { ctx = typeof getCtx === "function" ? getCtx() : null; } catch (_) { ctx = null; }
    if (!ctx || !ctx.createGain) return false;
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination); nodes.push(master); return true;
  }
  function oscillator(type, frequency, gain, destination) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = frequency; g.gain.value = gain; o.connect(g).connect(destination); o.start(); nodes.push(o, g); return { o, g }; }
  function makeNoise(duration = 1) { const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), data = b.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; return b; }
  function makeEngine() {
    if (engine || !ensure()) return;
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 500; filter.Q.value = .7; const gain = ctx.createGain(); gain.gain.value = 0; filter.connect(gain).connect(master);
    const a = oscillator("sawtooth", 28, .12, filter), b = oscillator("square", 14, .055, filter);
    const src = ctx.createBufferSource(); src.buffer = makeNoise(2); src.loop = true; const intake = ctx.createBiquadFilter(); intake.type = "bandpass"; intake.frequency.value = 700; intake.Q.value = .7; const ng = ctx.createGain(); ng.gain.value = .018; src.connect(intake).connect(ng).connect(filter); src.start(); nodes.push(filter, gain, src, intake, ng);
    engine = { filter, gain, a, b, intake, ng };
  }
  function burst(freq, length, volume, type = "bandpass") { if (!ensure()) return; const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), now = ctx.currentTime; src.buffer = makeNoise(Math.max(.1, length)); filter.type = type; filter.frequency.value = freq; gain.gain.setValueAtTime(0.0001, now); gain.gain.setTargetAtTime(volume, now, .005); gain.gain.setTargetAtTime(.0001, now + length * .35, Math.max(.01, length * .14)); src.connect(filter).connect(gain).connect(master); src.start(now); src.stop(now + length); }
  function set({ rpm = 0, throttle = 0, running = false } = {}) { if (!running) { if (engine) ramp(engine.gain.gain, 0); return; } makeEngine(); if (!engine) return; const f = Math.max(14, Number(rpm) / 30 || 14), t = Math.max(0, Math.min(1, Number(throttle) || 0)); ramp(engine.a.o.frequency, f); ramp(engine.b.o.frequency, f * .5); ramp(engine.filter.frequency, 350 + t * 2200 + Math.min(1000, rpm) * .35); ramp(engine.gain.gain, .055 + t * .12 + Math.min(8000, rpm) / 8000 * .055); ramp(engine.intake.frequency, 450 + t * 1800); ramp(engine.ng.gain, .008 + t * .025); ramp(master.gain, .32); }
  function crank(on) { if (!on) { if (starter) { starter.stop(); starter = null; } return; } if (starter || !ensure()) return; const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(master); const a = oscillator("square", 13, .07, gain), b = oscillator("sawtooth", 15, .035, gain); ramp(gain.gain, .13); starter = { stop() { ramp(gain.gain, 0, .025); setTimeout(() => { try { a.o.stop(); b.o.stop(); } catch (_) {} }, 100); } }; }
  function stall() { if (engine) ramp(engine.gain.gain, 0, .025); burst(90, .16, .14, "lowpass"); }
  function horn(on) { if (!on) { if (hornNodes) { hornNodes.forEach(({ o, g }) => { ramp(g.gain, 0, .02); setTimeout(() => { try { o.stop(); } catch (_) {} }, 90); }); hornNodes = null; } return; } if (hornNodes || !ensure()) return; const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(master); hornNodes = [oscillator("square", 420, .055, gain), oscillator("square", 503, .045, gain)]; ramp(gain.gain, .22); }
  function tick() { if (!ensure()) return; ticking = !ticking; burst(ticking ? 1900 : 1250, .045, .16); }
  function door(open) { burst(open ? 115 : 75, open ? .1 : .14, open ? .10 : .15, "lowpass"); }
  function gearGrind() { burst(2500, .13, .2); }
  function stop() {
    if (!master) return;
    if (starter) { starter.stop(); starter = null; }
    horn(false);
    const oldNodes = nodes.splice(0), oldMaster = master;
    ramp(oldMaster.gain, 0, .02);
    setTimeout(() => oldNodes.forEach((node) => { try { node.disconnect(); } catch (_) {} }), 100);
    ctx = master = engine = null;
  }
  return { set, crank, stall, horn, tick, door, gearGrind, stop };
}
