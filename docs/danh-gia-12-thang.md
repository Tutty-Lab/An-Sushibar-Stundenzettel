# Đánh giá lịch An Sushibar — 12 tháng 2026

Cao điểm **mỗi ngày mở cửa 17:30–19:30**, mục tiêu 3 người. T6/T7 vẫn là ngày đông hơn theo hệ số ngày; không giới hạn cao điểm vào hai ngày này. Lễ đóng cửa. Bếp và bồi mỗi bộ phận ít nhất 1 người suốt 10:30–21:00. Nhân viên linh hoạt chỉ giữ một vị trí tại một thời điểm.

Bộ lập lịch riêng restaurantScheduler.ts, chính sách restaurantPolicy.ts. Không dùng ưu tiên 3 người cả ngày hay lịch hẹn tiệm nail. Giữ đủ giờ hợp đồng, ngày khả dụng, giới hạn ngày làm và giờ nghỉ. Kho lịch tháng liền kề được xét để tránh làm quá 6 ngày liên tiếp.

Debug hiển thị ngày, giờ bắt đầu/kết thúc khoảng thiếu và số người còn lại ngay dưới từng ô. Ví dụ `0 / 01/10 / 16:30–17:00 / còn 0 người` nghĩa là thiếu trong nửa giờ đó, không phải cả ngày trống. Tính theo ranh giới ca và giờ nghỉ chính xác; khoảng liền nhau cùng số người được gộp. Ngày mở cửa chưa có ca báo trống cả giờ mở cửa; ngày đóng hiện dấu gạch. Báo cáo nhân sự cũng liệt kê từng khoảng thiếu.

Cả 12 tháng xếp đủ 702 giờ/tháng, cả năm 8.424 giờ. Hợp đồng 702,3 giờ vẫn giữ 18 phút chưa xếp. Chuỗi ngày xuyên tháng tối đa 6 ngày. **Còn thiếu độ phủ**, không coi đủ giờ hoặc kiểm thử qua là lịch đã đạt vận hành. Chưa chứng minh các khoảng thiếu là bất khả thi.

| Tháng | Giờ xếp | Trống tiệm (h) | Dưới 2 người (h) | Thiếu cao điểm (h) | Thiếu bếp (h) | Thiếu bồi (h) |
|---|---:|---:|---:|---:|---:|---:|
| 2026-01 | 702 | 0 | 10.5 | 14 | 5 | 10 |
| 2026-02 | 702 | 0 | 14 | 13 | 7.5 | 12 |
| 2026-03 | 702 | 0 | 31 | 24.5 | 20.5 | 15.5 |
| 2026-04 | 702 | 0 | 9.5 | 15 | 11.5 | 5 |
| 2026-05 | 702 | 0 | 11 | 15.5 | 15.5 | 7 |
| 2026-06 | 702 | 13 | 43 | 19.5 | 36.5 | 24.5 |
| 2026-07 | 702 | 0 | 25 | 25.5 | 7 | 24 |
| 2026-08 | 702 | 0 | 24.5 | 27.5 | 6.5 | 21 |
| 2026-09 | 702 | 0 | 17.5 | 22 | 13.5 | 7.5 |
| 2026-10 | 702 | 0 | 13.5 | 17.5 | 10.5 | 5.5 |
| 2026-11 | 702 | 0 | 14.5 | 22 | 1.5 | 21.5 |
| 2026-12 | 702 | 0 | 11.5 | 15 | 1.5 | 15.5 |

Các thời lượng thiếu có thể trùng nhau, không cộng thành tổng giờ thiếu. Không so trực tiếp số thiếu cao điểm với báo cáo cũ chỉ xét T6/T7.

Chuỗi ngày lớn nhất: Duc Thuan Nguyen: 6, Nguyen Duc Khai: 6, Luu Van Tam: 6, Vo Ngoc Duong: 6, Nguyen Vu Sa Lam: 3, Nguyen Thi Hong Linh: 3.

Chạy lại: `npx vite-node scripts/audit-12-months.mts 2026`. Exit 0 chỉ xác nhận các kiểm tra giờ/ngày nghỉ/hợp đồng, không bảo đảm đủ người. Xem các trường độ phủ trong audit-2026.json và lịch chi tiết schedules-2026.json. Lịch cũ cần tạo lại để áp dụng cách xếp mới; debug áp dụng ngay cho lịch đang lưu.
