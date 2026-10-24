import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFileName, sharePdf } from "../pdf";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeFileName", () => {
  it("entfernt vietnamesische Akzente", () => {
    expect(safeFileName("Nguyễn Văn Tuấn")).toBe("Nguyen_Van_Tuan");
    expect(safeFileName("Đức")).toBe("Duc");
  });

  it("entfernt deutsche Umlaute und ß-fremde Zeichen", () => {
    expect(safeFileName("Jörg Müller")).toBe("Jorg_Muller");
  });

  it("lässt unbedenkliche Zeichen stehen", () => {
    expect(safeFileName("Mai-2026_08")).toBe("Mai-2026_08");
  });

  it("hat immer einen brauchbaren Rückfallwert", () => {
    expect(safeFileName("   ")).toBe("Stundenzettel");
    expect(safeFileName("///")).toBe("Stundenzettel");
  });
});

describe("deliver", () => {
  it("tải file trực tiếp qua thẻ a với download attribute, MIME application/pdf (WebView không hiện ký tự lạ)", async () => {
    const { deliver } = await import("../pdf");
    const blob = new Blob(["%PDF-dummy"], { type: "application/pdf" });
    let createdUrl = "";
    let clickedDownload = "";
    let clickedRel = "";
    let blobType = "";

    const originalDocument = (globalThis as any).document;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    const mockAnchor = {
      href: "",
      download: "",
      rel: "",
      style: {} as any,
      click: () => {},
    };

    const mockBody = {
      appendChild: (node: any) => {
        clickedDownload = node.download;
        clickedRel = node.rel;
        return node;
      },
      removeChild: (node: any) => node,
      contains: () => true,
    };

    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === "a") return mockAnchor;
        return {};
      },
      body: mockBody,
    };

    URL.createObjectURL = (b: Blob) => {
      blobType = b.type;
      createdUrl = "blob:http://localhost/test-uuid";
      return createdUrl;
    };
    URL.revokeObjectURL = () => {};

    try {
      await deliver(blob, "Stundenzettel_Tuan.pdf");

      expect(blobType).toBe("application/pdf");
      expect(clickedDownload).toBe("Stundenzettel_Tuan.pdf");
      expect(clickedRel).toBe("noopener");
    } finally {
      (globalThis as any).document = originalDocument;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});

describe("sharePdf (trình duyệt nhúng Zalo/Messenger)", () => {
  const blob = new Blob(["%PDF-dummy"], { type: "application/pdf" });

  it("mở bảng Chia sẻ của hệ thống với file PDF đúng tên", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { canShare: () => true, share });

    await expect(sharePdf(blob, "Stundenzettel_tat_ca_2026-09.pdf")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    const shared = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0];
    expect(shared.name).toBe("Stundenzettel_tat_ca_2026-09.pdf");
    expect(shared.type).toBe("application/pdf");
  });

  it("người dùng tự đóng bảng Chia sẻ thì không coi là lỗi", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn(async () => { throw abort; }) });

    await expect(sharePdf(blob, "a.pdf")).resolves.toBe("cancelled");
  });

  it("báo không hỗ trợ khi WebView không chia sẻ được file (để hiện hướng dẫn mở trình duyệt)", async () => {
    vi.stubGlobal("navigator", { canShare: () => false, share: vi.fn() });
    await expect(sharePdf(blob, "a.pdf")).resolves.toBe("unsupported");

    vi.stubGlobal("navigator", {});
    await expect(sharePdf(blob, "a.pdf")).resolves.toBe("unsupported");
  });

  it("lỗi khác (ví dụ hết hạn thao tác người dùng) trả về failed", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    vi.stubGlobal("navigator", { canShare: () => true, share: vi.fn(async () => { throw denied; }) });

    await expect(sharePdf(blob, "a.pdf")).resolves.toBe("failed");
  });
});

describe("choose PDF save location", () => {
  it("writes the PDF to the selected file and closes it", async () => {
    const write = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const picker = vi.fn(async () => ({ createWritable: async () => ({ write, close }) }));
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    const { savePdfAtLocation } = await import("../pdf");
    const blob = new Blob(["%PDF"]);
    expect(await savePdfAtLocation(blob, "Nailedit_05_2025.pdf")).toBe("saved");
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "Nailedit_05_2025.pdf" }));
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalledOnce();
  });
  it("cancelling the chooser does not trigger a download", async () => {
    vi.stubGlobal("window", { showSaveFilePicker: async () => { throw Object.assign(new Error("cancelled"), { name: "AbortError" }); } });
    const { savePdfAtLocation } = await import("../pdf");
    expect(await savePdfAtLocation(new Blob(), "a.pdf")).toBe("cancelled");
  });
});

describe("PDF save fallback", () => {
  it("createWritable bị chặn -> tải xuống thường thay vì báo lỗi", async () => {
    const err = Object.assign(new Error("The request is not allowed by the user agent"), { name: "NotAllowedError" });
    const picker = vi.fn(async () => ({ createWritable: async () => { throw err; } }));
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    const { savePdfAtLocation } = await import("../pdf");
    expect(await savePdfAtLocation(new Blob(["%PDF"]), "a.pdf")).toBe("downloaded");
    vi.unstubAllGlobals();
  });
});


describe("PDF giờ tổng", () => {
  it("giữ trang thống kê, từng nhân viên; chỉ hiện Gesamtstunden", async () => {
    const { buildStundenzettelPdf } = await import("../pdf");
    const { initialScheduleFor, STORES } = await import("../stores");
    const schedule = initialScheduleFor(STORES[0]);
    const doc = await buildStundenzettelPdf(schedule, schedule.employees.slice(0, 1));
    expect(doc.getNumberOfPages()).toBe(2);
    const content = doc.internal.pages.flat().join("\n");
    expect(content).toContain("Gesamtstunden");
    expect(content).not.toContain("Nachtstunden");
    expect(content).not.toContain("Sonntagsstunden");
  });
});


it("PDF tất cả tuần giữ đủ ngày, mỗi tuần có thống kê và trang từng người", async () => {
  const { buildStundenzettelPdf } = await import("../pdf");
  const { initialScheduleFor, STORES } = await import("../stores");
  const { weeksOfMonth } = await import("../weeks");
  const schedule = { ...initialScheduleFor(STORES[0]), year: 2026, month: 3 };
  const weeks = weeksOfMonth(2026, 3);
  expect(weeks).toHaveLength(6);
  expect(weeks.flatMap((w) => w.dates)).toHaveLength(31);
  const doc = await buildStundenzettelPdf(schedule, schedule.employees.slice(0, 1), { weeks });
  expect(doc.getNumberOfPages()).toBe(12);
  const { timesheetFingerprint, mustReprintWeeks } = await import("../timesheetExport");
  const fingerprint = timesheetFingerprint(schedule, schedule.employees);
  const saved = { fingerprint };
  expect(mustReprintWeeks(undefined, fingerprint)).toBe(false);
  expect(mustReprintWeeks(saved, fingerprint)).toBe(false);
  expect(mustReprintWeeks(saved, timesheetFingerprint({ ...schedule, lockedAt: "now", timesheetExports: {} }, schedule.employees))).toBe(false);
  expect(mustReprintWeeks(saved, timesheetFingerprint({ ...schedule, shifts: [{ id: "changed" } as any] }, schedule.employees))).toBe(true);
  expect(mustReprintWeeks(saved, timesheetFingerprint(schedule, schedule.employees.map((e) => ({ ...e, name: "changed" }))))).toBe(true);
});
