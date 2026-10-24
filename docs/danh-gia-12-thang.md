# Đánh giá tạo lịch An Sushibar — 12 tháng năm 2026

Ngày kiểm tra: 24/10/2026. Phạm vi: tháng 01–12/2026, tạo độc lập từng tháng với dữ liệu mặc định hiện tại. Không thay đổi thuật toán trong lần đánh giá này.

## Kết luận: chưa đạt để dùng lịch tự động mà không duyệt

- Xếp 8.304 / 8.424 giờ hợp đồng (98,58%); thiếu 120 giờ. Chỉ tháng 9 và 11 đạt đủ tổng giờ.
- 8 giờ không có bất kỳ nhân viên nào trong giờ mở cửa; 3 ngày thiếu người tại thời điểm mở cửa. Không thiếu người tại thời điểm đóng cửa.
- 224,5 giờ có dưới 2 người. Đây là mức phủ tạm cấu hình trong app, chưa phải định mức khách xác nhận.
- Cao điểm T6–T7 17:30–19:30: 194/196 giờ có ít nhất 3 người (98,98%). Tháng 7 thiếu 2 giờ.
- Theo vai trò đã gán: 367 giờ không có người có khả năng làm bếp; 511 giờ không có người có khả năng làm bồi/sushi.
- Kiểm tra từng tháng: không có lỗi vượt hợp đồng, vượt 8 giờ/ngày, ca chồng, nghỉ sai, ca ngày lễ, ngoài giờ mở cửa, minijob ngoài T6–CN, hai minijob cùng cuối tuần.
- Ghép lịch 12 tháng: Thuận có chuỗi 9 ngày làm liên tiếp, Khải 12, Tâm 11, Dương 10. Không đạt giới hạn 6 ngày mà app đang áp dụng. Lam/Linh tối đa 3 ngày.

## Chi tiết theo tháng

| Tháng | Ngày mở | Giờ xếp / 702 | Thiếu giờ | Trống tiệm (h) | Dưới 2 người (h) | Thiếu cao điểm (h) | Thiếu bếp (h) | Thiếu bồi (h) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-01 | 29 | 681.5 | 20.5 | 0.5 | 27.5 | 0 | 47 | 54 |
| 2026-02 | 28 | 693 | 9 | 0 | 18.5 | 0 | 35.5 | 40.5 |
| 2026-03 | 31 | 699 | 3 | 0 | 17 | 0 | 24 | 41.5 |
| 2026-04 | 28 | 681.5 | 20.5 | 2 | 24 | 0 | 27 | 43.5 |
| 2026-05 | 28 | 694 | 8 | 0 | 12.5 | 0 | 21.5 | 34 |
| 2026-06 | 30 | 699 | 3 | 0.5 | 15 | 0 | 26.5 | 35.5 |
| 2026-07 | 31 | 692.5 | 9.5 | 0 | 21.5 | 2 | 36 | 52 |
| 2026-08 | 31 | 698.5 | 3.5 | 0 | 18.5 | 0 | 29 | 49 |
| 2026-09 | 30 | 702 | 0 | 0 | 13.5 | 0 | 24 | 32.5 |
| 2026-10 | 29 | 693 | 9 | 0 | 17 | 0 | 31 | 38.5 |
| 2026-11 | 30 | 702 | 0 | 0 | 20.5 | 0 | 24.5 | 49.5 |
| 2026-12 | 29 | 668 | 34 | 5 | 19 | 0 | 41 | 40.5 |

Thiếu mở cửa: tháng 4, 6, 12 mỗi tháng 1 ngày. Tháng 12 thiếu nhiều giờ nhất: 34 giờ.

## Cách đọc kết quả

- Giờ thiếu bếp/bồi là thời lượng trên đồng hồ, không phải giờ công thiếu. Hai chỉ số có thể trùng nhau và trùng giờ trống tiệm; không cộng chúng lại.
- Minijob tạm được coi có thể làm cả hai bộ phận. Nếu thực tế chỉ làm một bộ phận, mức thiếu sẽ cao hơn. Một minijob không thể đồng thời thay hai người; số liệu riêng từng bộ phận là đánh giá lạc quan.
- Các mức phủ 2 người cả ngày / 3 người cao điểm là giả định cấu hình hiện tại; việc chưa có bếp hoặc chưa có bồi vẫn là vấn đề vận hành dù tổng người đủ.
- “0 lỗi validation từng tháng” không đồng nghĩa đủ người hoặc an toàn khi ghép tháng. Audit quét từng phút, trừ thời gian nghỉ, kiểm tra riêng độ phủ và chuỗi ngày qua tháng.
- Báo cáo này kiểm tra bộ lịch mặc định một lần/tháng; không phải mô phỏng nghỉ phép, nghỉ việc, sửa ca tay hay mọi cấu hình có thể nhập.
- Không thêm minijob, tăng hợp đồng hoặc đổi giờ mở cửa để làm đẹp kết quả.

## Nguyên nhân và ưu tiên sửa

1. Ưu tiên cao: truyền lịch cuối tháng trước vào điều kiện ngày nghỉ của tháng sau. Hàm `enforceRest` hiện chỉ nhận các ca của tháng đang tạo, nên giới hạn 6 ngày không có hiệu lực xuyên tháng.
2. Ưu tiên cao: đưa vai trò Bếp/Bồi vào tối ưu và kiểm tra độ phủ. Tab hiện chỉ lọc hiển thị; scheduler tối ưu tổng người, nên đủ người vẫn có thể thiếu cả nhóm nghề.
3. Ưu tiên cao: bảo đảm phủ mở cửa và toàn bộ giờ hoạt động trước khi tối ưu cao điểm. Đánh dấu lịch chưa đạt nếu còn khoảng trống.
4. Ưu tiên tiếp: phân bổ lại giờ sau khi loại ca vi phạm ngày nghỉ, tận dụng giờ còn thiếu. `enforceRest` loại ca sau bước tối ưu, có thể làm giảm giờ hợp đồng và độ phủ.
5. Xác nhận với khách số người tối thiểu mỗi bộ phận, vai trò hai minijob; sau đó chạy lại audit để đánh giá theo yêu cầu chính thức.

## Chạy lại và bằng chứng

```powershell
npx vite-node scripts/audit-12-months.mts 2026
```

Lệnh trả exit code 1 vì phát hiện chuỗi làm quá 6 ngày xuyên tháng; không phải lỗi chạy chương trình. Không sửa assertion hoặc bỏ qua phát hiện để báo pass.

- `audit-2026.json`: số liệu từng tháng, từng người, cảnh báo, kết quả qua tháng.
- `schedules-2026.json`: toàn bộ ca đã tạo, đủ để kiểm tra lại.
- `audit-2026.log`: đầu ra lần chạy.
- 65 unit test trước đây không đủ chứng minh lịch vận hành đạt: stress test cũ dùng mô hình 6 ngày mở cửa, không phải dữ liệu An Sushibar 7 ngày. Audit mới dùng đúng 6 nhân viên và quy tắc An Sushibar.
