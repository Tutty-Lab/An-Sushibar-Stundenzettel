# Đánh giá lịch An Sushibar — 12 tháng 2026

Bộ lập lịch riêng `restaurantScheduler.ts`, chính sách `restaurantPolicy.ts`; không dùng engine tiệm nail. Đã bỏ ưu tiên 3 người cả ngày T6/T7, bỏ giả định 2 người bất kỳ phủ đủ bộ phận, bỏ khung ưu tiên minijob 2 giờ tự sinh, bỏ đường nhu cầu giờ cao điểm của tiệm nail. Ngày thường không tự tăng nhu cầu tối; T6/T7 cao điểm 17:30–19:30.

Định mức vận hành tạm: 1 bếp + 1 bồi liên tục 10:30–21:00, 3 người trong cao điểm T6/T7. Đây là giả định chờ khách xác nhận. Nhân viên BOTH chỉ đảm nhiệm một vị trí tại một thời điểm. Chọn độ phủ trước cân giờ các ngày cùng loại; không còn ép tổng giờ mọi thứ Sáu bằng nhau khi làm hỏng độ phủ.

Cả 12 tháng đạt 702/702 giờ, cả năm 8.424 giờ. 81 test qua; build thành công. Test hợp đồng 702,3 giờ giữ đúng 18 phút chưa xếp, không làm biến mất phần lẻ. Giữ giới hạn giờ/ngày, nghỉ giữa ca, hợp đồng, ngày khả dụng. Lịch tháng liền kề đã lưu được xét để bảo vệ ngày nghỉ; ghép cả năm tối đa 6 ngày liên tiếp. Không sửa lịch tháng cũ đã lưu.

**Chưa đạt độ phủ vận hành.** Thiếu Bếp/Bồi giảm, nhưng thiếu cao điểm tăng. Tháng 6 còn 5 giờ trống tiệm, 2 ngày thiếu người lúc đóng cửa. Không được coi tổng giờ đủ hoặc test qua là lịch sẵn sàng sử dụng. Chưa chứng minh các khoảng thiếu là bất khả thi; thuật toán tìm kiếm cục bộ vẫn có thể bị kẹt.

| Chỉ số cả năm (giờ đồng hồ) | Trước | Sau |
|---|---:|---:|
| Trống tiệm | 0 | 5 |
| Dưới 2 người | 185.5 | 163 |
| Thiếu 3 người cao điểm | 0.5 | 49 |
| Thiếu bếp | 356.5 | 122.5 |
| Thiếu bồi | 484 | 93.5 |

So sánh trước/sau có thêm ràng buộc nghỉ xuyên tháng và thay đổi đường nhu cầu; không phải chỉ thay trọng số trên cùng tập ràng buộc. Các thời lượng có thể trùng nhau, không cộng thành tổng giờ thiếu.

| Tháng | Giờ xếp | Trống tiệm | Dưới 2 người | Thiếu cao điểm | Thiếu bếp | Thiếu bồi |
|---|---:|---:|---:|---:|---:|---:|
| 2026-01 | 702 | 0 | 12.5 | 4 | 18 | 3.5 |
| 2026-02 | 702 | 0 | 8.5 | 4 | 10 | 4 |
| 2026-03 | 702 | 0 | 12.5 | 4 | 10 | 6 |
| 2026-04 | 702 | 0 | 14 | 2.5 | 20.5 | 4.5 |
| 2026-05 | 702 | 0 | 11 | 3.5 | 10 | 4.5 |
| 2026-06 | 702 | 5 | 30 | 4 | 29 | 9.5 |
| 2026-07 | 702 | 0 | 12.5 | 5 | 2.5 | 7 |
| 2026-08 | 702 | 0 | 21.5 | 7 | 2.5 | 25 |
| 2026-09 | 702 | 0 | 12 | 4 | 0 | 9.5 |
| 2026-10 | 702 | 0 | 10.5 | 4.5 | 0 | 13.5 |
| 2026-11 | 702 | 0 | 10 | 4 | 10 | 2.5 |
| 2026-12 | 702 | 0 | 8 | 2.5 | 10 | 4 |

Chuỗi ngày làm lớn nhất: Duc Thuan Nguyen: 6, Nguyen Duc Khai: 6, Luu Van Tam: 6, Vo Ngoc Duong: 6, Nguyen Vu Sa Lam: 3, Nguyen Thi Hong Linh: 3.

Minijob T6–CN, ưu tiên luân phiên cuối tuần. Khi lễ làm không đủ sức chứa 43 giờ, cho bù cuối tuần khác; đây là ưu tiên mềm. Lịch cũ cần tạo lại để áp dụng engine mới. Dữ liệu lịch liền kề phải có trong kho lưu để kiểm tra xuyên tháng.

Chạy lại: `npx vite-node scripts/audit-12-months.mts 2026`. Audit exit 1 khi lỗi thời gian/hợp đồng/ngày nghỉ hoặc chuỗi xuyên tháng quá 6; exit 0 không bảo đảm đủ người. Đọc các trường emptyHours, belowTwoHours, peakMissingHours, kitchenMissingHours, serviceMissingHours. Bằng chứng: audit-2026.json, schedules-2026.json, audit-2026.log, test-latest.log; baseline audit-before-restaurant.json.
