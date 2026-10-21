// Renders the procedural sound bank off the main thread (prompt 06), so the game never stutters while sounds are built.
import { render } from './dsp.js';
self.onmessage = ({ data: { jobs } }) => {
  for (const j of jobs) { const a = render(j.id, j.v, j.note); self.postMessage({ key: j.key, buf: a }, [a.buffer]); }
  self.postMessage({ done: true });
};
