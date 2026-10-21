/**
 * Calls `tick` `fps` times a second from a Web Worker timer: unlike requestAnimationFrame and page timers, it keeps
 * running when the tab is in the background, so the organizer's camera (and a reporter's recording) don't freeze
 * when they switch tabs. Returns the stop function.
 */
export function startTicker(fps: number, tick: () => void): () => void {
  const interval = Math.round(1000 / fps);
  try {
    const source = "let t=null;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}";
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = () => tick();
    worker.postMessage(interval);
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const timer = setInterval(tick, interval);
    return () => clearInterval(timer);
  }
}
