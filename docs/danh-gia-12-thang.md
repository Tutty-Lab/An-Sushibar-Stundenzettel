# Đánh giá lịch An Sushibar — 12 tháng 2026

Sau sửa bù giờ: cả 12 tháng đạt 702/702 giờ; cả năm 8.424/8.424 giờ. Test 702,3 giờ xếp đúng 702 giờ, không vượt hợp đồng. 77 test qua, build thành công.

Bù giờ sau sửa ngày nghỉ bằng kéo dài ca hợp lệ hoặc thêm ngày còn trống. Giữ 8 giờ/ngày, tối đa 6 ngày liên tiếp trong tháng, giới hạn hợp đồng tuần và ngày nghỉ. Minijob vẫn T6–CN; được bù cuối tuần khác nếu lễ làm thiếu sức chứa 43 giờ (5 ngày × 8 giờ chỉ chứa 40 giờ).

Đủ giờ hợp đồng chưa đồng nghĩa đủ người. Chuỗi ngày xuyên tháng còn vượt 6 ngày, chưa sửa trong lần này.

| Tháng | Giờ xếp | Trống tiệm (h) | Dưới 2 người (h) | Thiếu cao điểm (h) | Thiếu bếp (h) | Thiếu bồi (h) |
|---|---:|---:|---:|---:|---:|---:|
| 2026-01 | 702 | 0 | 20.5 | 0 | 44 | 55 |
| 2026-02 | 702 | 0 | 18.5 | 0 | 35 | 39 |
| 2026-03 | 702 | 0 | 16 | 0 | 24 | 40.5 |
| 2026-04 | 702 | 0 | 27 | 0 | 34.5 | 36 |
| 2026-05 | 702 | 0 | 12.5 | 0 | 19 | 33 |
| 2026-06 | 702 | 0 | 14.5 | 0.5 | 26.5 | 33.5 |
| 2026-07 | 702 | 0 | 19.5 | 0 | 34.5 | 55 |
| 2026-08 | 702 | 0 | 18.5 | 0 | 29 | 49 |
| 2026-09 | 702 | 0 | 13.5 | 0 | 24 | 32.5 |
| 2026-10 | 702 | 0 | 13 | 0 | 28.5 | 31.5 |
| 2026-11 | 702 | 0 | 20.5 | 0 | 24.5 | 49.5 |
| 2026-12 | 702 | 0 | 19 | 0 | 36.5 | 43 |

Chuỗi ngày lớn nhất khi ghép tháng: Duc Thuan Nguyen: 9, Nguyen Duc Khai: 12, Luu Van Tam: 11, Vo Ngoc Duong: 10, Nguyen Vu Sa Lam: 3, Nguyen Thi Hong Linh: 3.

Bếp/bồi theo vai trò hiện tại; minijob tạm cả hai. Các chỉ số thiếu là thời lượng trên đồng hồ, có thể trùng nhau; không cộng lại. Ẩn hai dòng debug không bỏ quy tắc kiểm tra.

Chạy lại: `npx vite-node scripts/audit-12-months.mts 2026`. Exit code 1 khi còn lỗi cứng hoặc chuỗi xuyên tháng quá 6 ngày. Bằng chứng: audit-2026.json, schedules-2026.json, audit-2026.log, test-latest.log.
