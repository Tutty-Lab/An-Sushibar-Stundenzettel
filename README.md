# An Sushibar — Dienstplan & Stundenzettel

Kramerplatz 5, 06618 Naumburg, Sachsen-Anhalt. Source: Nailed-It-Studio, repository riêng.

- T2–CN 10:30–21:00 liên tục; lễ đóng. Cao điểm cả tuần 17:30–19:30.
- Duc Thuan Nguyen: Vollzeit 173 giờ, bồi/sushi.
- Nguyen Duc Khai / Luu Van Tam: Vollzeit 169 giờ/người, bếp.
- Vo Ngoc Duong: Teilzeit 105 giờ, bồi/sushi.
- Nguyen Vu Sa Lam / Nguyen Thi Hong Linh: minijob 43 giờ/người, T6–CN. Tạm cả hai bộ phận, chờ xác nhận.
- Bộ phận chọn bằng nút trong popup nhân viên; lịch hiển thị toàn bộ nhân viên. Độ phủ kiểm tra riêng Bếp/Bồi. Hai minijob ưu tiên luân phiên cuối tuần; nếu lễ đóng khiến thiếu sức chứa hợp đồng thì cho bù cuối tuần khác.
- Mức phủ tạm: 1 bếp + 1 bồi suốt giờ mở cửa, 3 người cao điểm cả tuần. Người linh hoạt chỉ giữ một vị trí tại một thời điểm; chưa có định mức chính thức từ khách.
- Ca dài giữ nghỉ lao động; “không pause” là không đóng nghỉ trưa.

Chạy `npm ci`, `npm run dev`. Kiểm tra `npm test`, `npm run build`.
Supabase tùy chọn: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY; store_id = ansushibar. Không cấu hình thì lưu cục bộ.

Bộ lập lịch riêng: `src/lib/restaurantScheduler.ts`; chính sách nhà hàng: `src/lib/restaurantPolicy.ts`. Không dùng bộ lập lịch tiệm nail. Ưu tiên độ phủ Bếp/Bồi, cao điểm rồi mới cân giờ các ngày cùng loại; không ép 3 người cả ngày đông. Lịch tháng liền kề đã lưu được dùng để chặn chuỗi quá 6 ngày. Lịch cũ cần tạo lại để áp dụng.
