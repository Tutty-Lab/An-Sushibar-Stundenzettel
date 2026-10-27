// ============================================================================
// Welche Regeln HART sind und welche WEICH – eine Liste für Anzeige, Prüfung
// und Vorschläge.
//
// Luật cứng: der Planer bricht sie nie. Steht trotzdem etwas im Plan, das sie
// verletzt (Hand-Änderung, unmögliche Vorgabe), ist das ein Fehler.
// Luật mềm: der Planer versucht es; geht es nicht, bleibt der Plan brauchbar,
// die Abweichung wird gemeldet und „Tìm cách xếp khác" sucht eine Änderung.
// ============================================================================

export type RuleKind = "hard" | "soft";

export type RuleId =
  // hart
  | "open-hours"
  | "closing"
  | "shift-length"
  | "max-days"
  | "days-off"
  | "employment-period"
  | "contract-max"
  // weich
  | "contract-hours"
  | "peak-staff";

export type Rule = { id: RuleId; kind: RuleKind; title: string; detail: string };

// An Sushibar: nhà hàng một địa điểm, chủ chỉ tính khi có ca nhập tay.
export const RULES: readonly Rule[] = [
  { id: "open-hours", kind: "hard", title: "Chỉ trong giờ mở cửa", detail: "T2–CN 10:30–21:00 liên tục. Ngày lễ vẫn mở 10:30–21:00." },
  { id: "closing", kind: "hard", title: "Phủ bếp và bồi", detail: "Ưu tiên luôn có 1 bếp + 1 bồi 10:30–14:00 và 16:00–21:00; 14:00–16:00 được phép trống. Người linh hoạt chỉ đảm nhiệm một vị trí tại một thời điểm. Chủ không được cộng vào độ phủ, không tính giờ." },
  { id: "shift-length", kind: "hard", title: "Ca 3–8 giờ, nghỉ đúng luật", detail: "Mỗi ca ít nhất 3 giờ, tối đa 8 giờ công một ngày; giờ nghỉ theo luật lao động." },
  { id: "max-days", kind: "hard", title: "Tối đa 6 ngày liên tiếp", detail: "Nhân viên làm tối đa 6 ngày mỗi tuần (hoặc „Số ngày làm / tuần\" đã đặt), không quá 6 ngày liên tiếp." },
  { id: "days-off", kind: "hard", title: "Ngày nghỉ cố định", detail: "Không xếp ca vào ngày nghỉ cố định của người đó." },
  { id: "employment-period", kind: "hard", title: "Ngày vào làm / nghỉ việc", detail: "Không xếp ca trước ngày vào làm hoặc sau ngày nghỉ việc." },
  { id: "contract-max", kind: "hard", title: "Không quá giờ hợp đồng", detail: "Không xếp quá giờ tháng (hoặc giờ tuần với hợp đồng theo tuần)." },
  { id: "contract-hours", kind: "soft", title: "Đủ giờ định mức", detail: "Xếp đủ giờ hợp đồng; tháng không đủ ngày (nghỉ, giới hạn ngày) thì báo thiếu." },
  { id: "peak-staff", kind: "soft", title: "Số người giờ cao điểm", detail: "Cao điểm cả tuần 17:00–19:30: ưu tiên 3 người, thứ Sáu và thứ Bảy trước." },
];

export const ruleById = (id: RuleId): Rule =>
  RULES.find((r) => r.id === id) ?? { id, kind: "hard", title: id, detail: "" };

/** Besetzungsregeln (staffing.ts) nach Label: „Cao điểm …" weich, „Trong giờ mở cửa" hart. */
export function staffingRuleId(label: string): RuleId {
  return label.startsWith("Cao điểm") ? "peak-staff" : "closing";
}
