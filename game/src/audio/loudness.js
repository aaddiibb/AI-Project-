// Loudness measurement (ITU-R BS.1770-4 / EBU R128), PURE. Used by the offline renderer (tools/audio_render.html) and the
// audio tests to check the mix targets in AUDIO_PLAN.md: integrated loudness (gated), short-term maximum, sample peak.
// The K-weighting coefficients are the standard's 48 kHz values, so the input must be 48 kHz.

function kWeight(x) {
  const y = new Float64Array(x.length);
  const st = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585],
    [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]];
  let src = x;
  for (const [b0, b1, b2, a1, a2] of st) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < src.length; i++) { const v = b0 * src[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = src[i]; y2 = y1; y1 = v; y[i] = v; }
    src = y.slice();
  }
  return src;
}

/**
 * @param channels array of Float32Array (48 kHz), one per channel (L, R)
 * @returns { integrated, shortTermMax, samplePeakDb } in LUFS / dBFS (integrated = -Infinity for silence)
 */
export function loudness(channels, sr = 48000) {
  const kw = channels.map(kWeight), n = channels[0].length;
  const blockMs = (len, hop) => {
    const L = Math.round(len * sr), H = Math.round(hop * sr), out = [];
    for (let s = 0; s + L <= n; s += H) { let z = 0; for (const c of kw) { let e = 0; for (let i = s; i < s + L; i++) e += c[i] * c[i]; z += e / L; } out.push(z); }
    return out;
  };
  const lk = (z) => -0.691 + 10 * Math.log10(z);
  const blocks = blockMs(0.4, 0.1);
  const abs = blocks.filter((z) => lk(z) > -70);
  let integrated = -Infinity;
  if (abs.length) {
    const rel = lk(abs.reduce((s, z) => s + z, 0) / abs.length) - 10;
    const g = abs.filter((z) => lk(z) > rel);
    if (g.length) integrated = lk(g.reduce((s, z) => s + z, 0) / g.length);
  }
  const st = blockMs(3, 0.1);
  const shortTermMax = st.length ? Math.max(...st.map(lk)) : -Infinity;
  let peak = 0; for (const c of channels) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));
  return { integrated, shortTermMax, samplePeakDb: 20 * Math.log10(peak || 1e-12) };
}

/** 16-bit PCM WAV bytes from float channels */
export function wav(channels, sr = 48000) {
  const n = channels[0].length, ch = channels.length, buf = new ArrayBuffer(44 + n * ch * 2), d = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); d.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true);
  d.setUint16(22, ch, true); d.setUint32(24, sr, true); d.setUint32(28, sr * ch * 2, true); d.setUint16(32, ch * 2, true); d.setUint16(34, 16, true);
  w(36, 'data'); d.setUint32(40, n * ch * 2, true);
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, channels[c][i])); d.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Uint8Array(buf);
}
