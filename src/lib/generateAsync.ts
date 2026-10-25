import type { GenerateInput } from "./scheduler";
import type { Shift } from "../types";

/** Keep the interface responsive while the planner searches for a schedule. */
export function generateScheduleAsync(input: GenerateInput): Promise<Shift[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./scheduler.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ shifts?: Shift[]; error?: string }>) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.shifts ?? []);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Không thể tạo lịch. Vui lòng thử lại."));
    };
    const { rules: _rules, ...payload } = input;
    try { worker.postMessage(payload); }
    catch (error) { worker.terminate(); reject(error); }
  });
}
