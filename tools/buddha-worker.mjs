// One tracing thread for tools/buddha-render.mjs: traces for the time it is given, then sends its counts back.
import { parentPort, workerData } from "node:worker_threads";
import { createTracer } from "./buddha-trace.mjs";

const t = createTracer(workerData.params);
const end = Date.now() + workerData.seconds * 1000;
while (Date.now() < end) t.run(workerData.params.mh ? 2000 : 20000);
parentPort.postMessage({ hist: t.hist, samples: t.samples }, [t.hist.buffer]);
