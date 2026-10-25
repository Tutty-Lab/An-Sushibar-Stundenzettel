import { generateSchedule, type GenerateInput } from "./scheduler";

import { storeById } from "./stores";

self.onmessage = (event: MessageEvent<GenerateInput>) => {
  try {
    self.postMessage({ shifts: generateSchedule({ ...event.data, rules: storeById(event.data.storeTag ?? "").staffingRules }) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
