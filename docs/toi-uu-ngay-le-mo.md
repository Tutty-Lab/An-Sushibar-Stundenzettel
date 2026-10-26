# Điều chỉnh mới nhất: 14:00–16:00

Khung có thể không bố trí nhân viên thu hẹp từ 14:00–17:00 thành 14:00–16:00. Từ 16:00 cần ít nhất một bếp và một bồi; cao điểm giữ 17:00–19:30. Cập nhật đồng bộ chính sách, thuật toán, debug, khung nhu cầu và kiểm thử. Ca tách chỉ được nghỉ trong khung mới.

Test tháng 10/2026 dữ liệu mẫu: thiếu bộ phận ngoài khung tùy chọn 4 giờ, đều sau 19:30; bếp sáng không thiếu; thiếu người thứ ba cao điểm 26,5 giờ-người. Không còn áp dụng kết quả phủ kín của cấu hình nghỉ chiều 3 giờ. Giữ 656 giờ theo hợp đồng, không tự tăng giờ để bù.

Các phần dưới là lịch sử cấu hình trước.

---

# Cấu hình mới: cho phép trống 14:00–17:00

Theo điều chỉnh của cửa hàng, 14:00–17:00 không yêu cầu nhân viên. Trước 14:00 và từ 17:00 đến đóng cửa vẫn ưu tiên ít nhất một bếp và một bồi; cao điểm 17:00–19:30 ưu tiên thêm người.

Thuật toán bỏ phạt thiếu trong khung tùy chọn, cho phép chuyển ca liền thành hai ca sáng/tối với khoảng nghỉ không tính công nằm hoàn toàn trong 14:00–17:00. Mỗi đoạn từ 3 đến 6 giờ, tổng công không đổi và không quá 8 giờ/ngày. Lịch xuất hai ca thực, không dùng giờ nghỉ giả hoặc tính giờ nghỉ thành công. Ngày làm/nghỉ và số giờ từng hợp đồng giữ nguyên.

Debug ghi “tùy chọn” ở các ô 14:00–17:00; ô không có nhân viên hiển thị “–”, không báo thiếu và không gán chủ. Các khung bắt buộc vẫn giữ số liệu thực, không cộng chủ vào độ phủ. Chính sách khung giờ và bộ xếp dự phòng cũng được cập nhật.

Tháng 10/2026 dữ liệu mẫu: thiếu bếp/bồi ở khung bắt buộc bằng 0, thiếu sau 19:30 bằng 0; thiếu người thứ ba cao điểm là 15 giờ-người. Các ô tùy chọn không nhân viên cộng 66 giờ theo bộ phận; đó không phải giờ công bị bỏ, mỗi người vẫn đúng định mức, tổng 656 giờ.

Xác minh: 30 kiểm thử đạt, đủ 12 tháng năm 2026. Cả 12 tháng mẫu đều không thiếu bếp/bồi trong các khung bắt buộc, đúng giờ từng người và không lỗi cứng. Build đạt. Chưa phủ đủ người thứ ba cao điểm ở mọi ngày.

Các cận thiếu tối thiểu và số liệu dưới đây thuộc yêu cầu cũ phải phủ cả 14:00–17:00; không áp dụng cho cấu hình mới.

---

# Giới hạn phủ kín với dữ liệu mẫu tháng 10

Mỗi bộ phận cần 31 × 10,5 = 325,5 giờ để phủ một người liên tục.

- Bồi: tổng hợp đồng 318 giờ; thiếu tối thiểu 7,5 giờ kể cả không chồng ca.
- Bếp: hai người, mỗi người tối đa 27 ngày trong 31 ngày do tối đa 6 ngày liên tiếp. Tổng tối đa 54 lượt người-ngày. Để phủ 31 ngày, ít nhất 8 ngày chỉ có một bếp (hoặc khoảng thiếu còn lớn hơn nếu cả hai cùng nghỉ). Trần 8 giờ công/người/ngày để lại ít nhất 2,5 giờ thiếu mỗi ngày như vậy: tối thiểu 20 giờ.
- Tổng thiếu tối thiểu: 27,5 giờ. Đây là cận dưới, không chứng minh lịch 32,5 giờ thiếu đã tối ưu. Ràng buộc tuần, ngày có thể làm và nghỉ giải lao có thể nâng mức thiếu thực tế.

Không thể hứa phủ kín chỉ bằng đổi thuật toán dưới cùng dữ liệu/ràng buộc. Cần điều chỉnh nhân sự hoặc điều kiện làm việc để đạt không ô trống; không tự đổi định mức, tự tăng ca hay cộng chủ vào độ phủ.

Đã thử thêm chuyển giờ cuối vòng và nhiều lượt tìm kiếm độc lập; tháng 10 không cải thiện so với bản 32,5 giờ thiếu. Không giữ các bước làm chậm mà không cải thiện ca mẫu.

---

# Ưu tiên phủ bộ phận trước cao điểm

Đã gỡ cân giờ theo hệ số ngày khỏi bộ tối ưu cả tháng và bỏ dòng mục tiêu đó khỏi bảng lịch. Mọi ô thiếu bếp/bồi chịu cùng mức phạt, lớn hơn nhiều mức phạt thiếu người thứ ba cao điểm. Ngoài 17:00–19:30 hạn chế chồng nhân viên cùng bộ phận. Không bỏ giờ hợp đồng để làm đẹp số liệu.

Bổ sung phép đổi giờ đồng thời giữa hai nhân viên cùng bộ phận trên hai ngày. Phép đổi giữ nguyên giờ từng người, kiểm tra khả năng làm việc, ngày bị chặn, giới hạn giờ/ngày, số ngày/tuần, chuỗi nghỉ và hạn mức giờ/tuần. Tăng vòng tìm kiếm để xử lý lựa chọn ngày nghỉ; tốc độ tạo lịch có thể chậm hơn bản vừa push.

Tháng 10, so với lượt sửa trước: tổng thiếu bộ phận 34,5 xuống 32,5 giờ; thiếu bếp 10:30–13:00 từ 11,5 xuống 8,5 giờ; chồng hai bếp 15:00–17:30 từ 13 xuống 10 giờ. Thiếu sau 19:30 tăng từ 9 lên 10,5 giờ. Chưa đạt phủ kín hoặc chứng minh tối ưu; không che khoảng thiếu bằng cách cộng chủ. Số thiếu cao điểm 17:00–19:30 là 46 giờ-người. Mỗi người vẫn đủ định mức.

29 kiểm thử đạt trên 12 tháng, đủ định mức từng người, không lỗi cứng được bộ xác thực phát hiện. Build đạt sau khi gỡ dòng mục tiêu theo hệ số ngày.

Các phần bên dưới là lịch sử phiên bản trước.

---

# Điều chỉnh ưu tiên phủ đều ngày 26/10/2026

Cao điểm mới: 17:00–19:30 cả tuần. Mỗi bộ phận cần ít nhất một người xuyên suốt giờ mở cửa. Bộ tối ưu không còn phạt thiếu buổi sáng nhẹ hơn buổi chiều/tối; chồng người cùng bộ phận ngoài cao điểm chịu thêm chi phí. Cân bằng tổng giờ theo ngày là ưu tiên thấp hơn phủ bộ phận. Nhiệt độ tìm kiếm được điều chỉnh theo thang điểm mới.

Tháng 10/2026 dữ liệu mẫu, so với bản vừa push:

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Tổng thiếu bếp/bồi (giờ) | 36,5 | 34,5 |
| Thiếu bếp 10:30–13:00 (giờ) | 16 | 11,5 |
| Chồng hai bếp 15:00–17:30 (giờ) | 14,5 | 13 |
| Thiếu sau 19:30 (giờ) | 0 | 9 |

Không khẳng định phủ kín: tổng thiếu giảm 2 giờ, nhưng một phần thiếu chuyển sang cuối ngày khi bỏ ưu tiên riêng cuối ngày. Cao điểm hiện đo 17:00–19:30 nên không so trực tiếp với số cũ đo 17:30–19:30; mức thiếu mới là 47,5 giờ-người. Chủ vẫn không được cộng vào độ phủ.

29 kiểm thử đạt trên 12 tháng: giữ đủ 656 giờ theo từng hợp đồng, không lỗi cứng được kiểm tra; policy, roles, coverage, overrides đạt. Build đạt. Các số liệu bên dưới là lịch sử các phiên bản trước.

---

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
