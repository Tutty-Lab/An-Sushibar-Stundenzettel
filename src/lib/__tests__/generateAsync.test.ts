import { afterEach, describe, expect, it, vi } from "vitest";
import { generateScheduleAsync } from "../generateAsync";
import { ANSUSHIBAR_STAFFING_RULES } from "../staffing";
import type { GenerateInput } from "../scheduler";
class FakeWorker {
  static current: FakeWorker;
  onmessage?: (event: {data: unknown}) => void;
  onerror?: (event: {message: string}) => void;
  terminate = vi.fn();
  postMessage = vi.fn((_input: unknown) => {});
  constructor() { FakeWorker.current = this; }
}
afterEach(() => vi.unstubAllGlobals());
describe("background schedule generation", () => {
  it("waits for worker result and releases worker", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const input = {year:2026,month:10} as GenerateInput;
    const result = generateScheduleAsync(input);
    expect(FakeWorker.current.postMessage).toHaveBeenCalledWith(input);
    FakeWorker.current.onmessage?.({data:{shifts:[]}});
    await expect(result).resolves.toEqual([]);
    expect(FakeWorker.current.terminate).toHaveBeenCalledOnce();
  });
  it("sends only cloneable data; worker loads store rules locally", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const result = generateScheduleAsync({year:2026,month:10,storeTag:"ansushibar",rules:ANSUSHIBAR_STAFFING_RULES} as GenerateInput);
    const payload = FakeWorker.current.postMessage.mock.calls[0][0];
    expect(payload).not.toHaveProperty("rules");
    expect(() => structuredClone(payload)).not.toThrow();
    FakeWorker.current.onmessage?.({data:{shifts:[]}});
    await result;
  });
  it.each(["planner", "worker"])("reports %s errors and releases worker", async kind => {
    vi.stubGlobal("Worker", FakeWorker);
    const result = generateScheduleAsync({} as GenerateInput);
    const rejection = expect(result).rejects.toThrow("failed");
    if(kind === "planner") FakeWorker.current.onmessage?.({data:{error:"failed"}});
    else FakeWorker.current.onerror?.({message:"failed"});
    await rejection;
    expect(FakeWorker.current.terminate).toHaveBeenCalledOnce();
  });
});
