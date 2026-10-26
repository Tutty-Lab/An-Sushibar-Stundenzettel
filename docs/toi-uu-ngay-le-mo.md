# Bản tối ưu cả tháng mới

`monthOptimizer.ts` tối ưu đồng thời ngày làm/nghỉ, thời điểm bắt đầu, độ dài ca và nghỉ giải lao. `scheduler.ts` dùng bộ tối ưu này khi cấu hình được hỗ trợ, giữ bộ xếp cũ cho ca cố định và các cấu hình ngoài phạm vi hỗ trợ.

Kiểm tra riêng tháng 10/2026 với dữ liệu mẫu: thiếu bộ phận 36,5 giờ; thiếu sau 19:30 bằng 0; thiếu cao điểm 39,5 giờ-người; 17 khoảng thiếu đúng 30 phút; đủ 656 giờ theo hợp đồng. Thời gian chạy khoảng 4,7 giây trong lượt kiểm tra riêng. Build đạt.

Các số liệu bên dưới ghi lại phiên bản trước khi tích hợp bộ tối ưu cả tháng.

---

# Tối ưu độ phủ An Sushibar — ngày lễ mở cửa

Dữ liệu mẫu: 6 nhân viên, 656 giờ/tháng. Chủ không tham gia giờ công hoặc độ phủ.

## Tháng 10/2026

| Chỉ số | Trước lượt tối ưu này | Sau |
|---|---:|---:|
| Giờ đã xếp | 656 | 656 |
| Thiếu bếp/bồi (giờ) | 39 | 38 |
| Thiếu sau 19:30 (giờ) | 0 | 0 |
| Thiếu bếp 10:30–13:00 (giờ) | 18,5 | 18 |
| Khoảng thiếu đúng 30 phút | 26 | 24 |
| Thiếu người cao điểm (giờ-người) | 40,5 | 46,5 |

Đánh đổi thực tế: giảm 1 giờ thiếu bộ phận, tăng 6 giờ-người thiếu cao điểm. Chưa phải lịch tối ưu toàn cục; không khẳng định đã xử lý hết thiếu người.

## Cách xếp

Sau cân giờ, thuật toán thử đổi ngày nghỉ cùng giờ của đồng nghiệp và trao đổi giờ giữa hai nhân viên trên hai ngày. Bước đánh giá cuối ưu tiên thiếu bếp/bồi, rồi thiếu cuối ngày, rồi người thứ ba cao điểm. Các bước trước giữ cân bằng ngày và ưu tiên ngày đông khách. Không áp lịch mẫu cố định hoặc đưa bộ giải offline vào ứng dụng.

Đổi ngày làm phải kiểm tra khả năng làm việc, ngày bị chặn, số ngày tối đa mỗi tuần và chuỗi tối đa 6 ngày liên tiếp. Giữ nguyên tổng giờ mỗi người; không sửa ca cố định, không chuyển giờ hợp đồng tuần sang tuần khác. Các ca vẫn tuân thủ giờ mở cửa, giới hạn giờ/ngày và nghỉ giải lao.

## Giới hạn

Tháng 10 có 31 ngày, mỗi bộ phận cần 325,5 giờ để phủ một người liên tục. Bồi có 318 giờ, nên riêng tổng giờ đã thiếu ít nhất 7,5 giờ. Hai bếp có tổng 338 giờ, nhưng ngày nghỉ và trần 8 giờ/ngày làm phát sinh khoảng thiếu dù tổng giờ lớn hơn nhu cầu. Các con số này không chứng minh lịch hiện tại tối ưu.

Cần tạo lại lịch để áp dụng. Không thay dữ liệu nhân viên hoặc lịch đã lưu khi chạy kiểm thử.

## Xác minh

29 kiểm thử đạt: đủ 12 tháng năm 2026, đúng giờ từng người, không lỗi cứng trong bộ xác thực, ngày đóng ngoại lệ, vai trò và độ phủ. Build và TypeScript đạt. Kiểm thử riêng tháng 10 sau khi gom hàm tính điểm cũng đạt. Local 5175 đang chạy.

| Tháng | Thiếu bộ phận (giờ) | Thiếu sau 19:30 | Thiếu cao điểm (giờ-người) |
|---|---:|---:|---:|
| 1 | 38 | 0 | 46,5 |
| 2 | 35,5 | 0 | 16 |
| 3 | 34 | 0 | 50 |
| 4 | 31,5 | 0 | 40,5 |
| 5 | 37,5 | 0 | 46 |
| 6 | 28 | 0 | 37,5 |
| 7 | 38 | 0 | 46 |
| 8 | 37 | 0 | 47 |
| 9 | 31,5 | 0 | 38,5 |
| 10 | 38 | 0 | 46,5 |
| 11 | 31,5 | 0 | 34,5 |
| 12 | 43 | 0 | 42,5 |

Mỗi tháng giữ 656 giờ. Thời gian chạy 14–28 giây trong lượt kiểm thử; chưa cải thiện tốc độ tạo lịch. Tháng 10 có 64 ca 4–6 giờ, 32 ca dài hơn 6 giờ. Không giảm tổng thiếu bằng cách cộng chủ.
