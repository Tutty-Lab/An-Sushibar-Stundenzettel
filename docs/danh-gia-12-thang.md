# Đánh giá lịch An Sushibar — 12 tháng 2026

Sau sửa bù giờ: cả 12 tháng đạt 702/702 giờ; cả năm 8.424/8.424 giờ. Test 702,3 giờ xếp đúng 702 giờ, không vượt hợp đồng. 77 test qua, build thành công.

Bù giờ sau sửa ngày nghỉ bằng kéo dài ca hợp lệ hoặc thêm ngày còn trống. Giữ 8 giờ/ngày, tối đa 6 ngày liên tiếp trong tháng, giới hạn hợp đồng tuần và ngày nghỉ. Minijob vẫn T6–CN; được bù cuối tuần khác nếu lễ làm thiếu sức chứa 43 giờ (5 ngày × 8 giờ chỉ chứa 40 giờ).

Đủ giờ hợp đồng chưa đồng nghĩa đủ người. Chuỗi ngày xuyên tháng còn vượt 6 ngày, chưa sửa trong lần này.

| Tháng | Giờ xếp | Trống tiệm (h) | Dưới 2 người (h) | Thiếu cao điểm (h) | Thiếu bếp (h) | Thiếu bồi (h) |
|---|---:|---:|---:|---:|---:|---:|
| 2026-01 | 702 | 0 | 16.5 | 0 | 36 | 56 |
| 2026-02 | 702 | 0 | 18 | 0 | 36 | 38.5 |
| 2026-03 | 702 | 0 | 15.5 | 0 | 29 | 37 |
| 2026-04 | 702 | 0 | 18 | 0 | 28.5 | 32.5 |
| 2026-05 | 702 | 0 | 11 | 0 | 17.5 | 30 |
| 2026-06 | 702 | 0 | 13.5 | 0.5 | 22.5 | 31 |
| 2026-07 | 702 | 0 | 20.5 | 0 | 39 | 48.5 |
| 2026-08 | 702 | 0 | 17.5 | 0 | 33 | 44 |
| 2026-09 | 702 | 0 | 12 | 0 | 24 | 32.5 |
| 2026-10 | 702 | 0 | 12.5 | 0 | 31 | 39.5 |
| 2026-11 | 702 | 0 | 18 | 0 | 26.5 | 49 |
| 2026-12 | 702 | 0 | 12.5 | 0 | 33.5 | 45.5 |

Chuỗi ngày lớn nhất khi ghép tháng: Duc Thuan Nguyen: 9, Nguyen Duc Khai: 12, Luu Van Tam: 11, Vo Ngoc Duong: 10, Nguyen Vu Sa Lam: 3, Nguyen Thi Hong Linh: 3.

Bếp/bồi theo vai trò hiện tại; minijob tạm cả hai. Các chỉ số thiếu là thời lượng trên đồng hồ, có thể trùng nhau; không cộng lại. Ẩn hai dòng debug không bỏ quy tắc kiểm tra.

Chạy lại: `npx vite-node scripts/audit-12-months.mts 2026`. Exit code 1 khi còn lỗi cứng hoặc chuỗi xuyên tháng quá 6 ngày. Bằng chứng: audit-2026.json, schedules-2026.json, audit-2026.log, test-latest.log.

Cân giờ toàn tháng: các thứ Sáu 02, 09, 16, 23, 30/10 đều 26,5 giờ; ngày thường 23–23,5 giờ. Giữ tổng giờ từng người. Chuyển giờ giữa tuần cho hợp đồng tháng; hợp đồng tuần chỉ đổi trong cùng tuần. Dòng mục tiêu ngày dùng cùng cách tính toàn tháng với scheduler. Debug mở/đóng và các khung giờ đã trả về đúng 10:30–21:00, thêm bộ phận Bếp/Bồi.
