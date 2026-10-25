# Đánh giá cấu hình minijob 20 giờ/tháng

Ngày kiểm tra: 26/10/2026. Mỗi tháng chạy độc lập với dữ liệu mẫu 6 nhân viên; không thay dữ liệu người dùng, không tự cộng chủ tiệm.

Hợp đồng: 173 + 169 + 169 + 105 + 20 + 20 = 656 giờ/tháng. Hai minijob làm bồi, T6–CN, luân phiên cuối tuần. Lễ đóng cửa.

## Thay đổi

- Xếp nhân viên có ít ngày khả dụng trước, để nhân viên còn lại bù khoảng trống.
- Ưu tiên tối thiểu bếp/bồi cao hơn người thứ ba trong cao điểm.
- Trao đổi giờ giữa hai nhân viên cùng bộ phận trên hai ngày cùng lúc; giữ nguyên giờ mỗi người và tổng giờ mỗi ngày. Kiểm tra ngày khả dụng, giới hạn tuần và tối đa 6 ngày liên tiếp.
- Cập nhật mặc định 43 thành 20 giờ một lần cho đúng hai minijob; giữ giờ tùy chỉnh và lịch sử tháng cũ.

## Kết quả

41 kiểm thử đạt; build đạt. Cả 12 tháng xếp đủ 656 giờ, mỗi minijob đúng 20 giờ; không có lỗi cứng từ kiểm tra ca (giới hạn giờ, nghỉ giải lao, ngày nghỉ, ngày lễ). Tháng 10 thử thêm 18 phút: vẫn giữ đủ mục tiêu và báo 18 phút chưa xếp trên lưới 30 phút.

| Tháng 2026 | Đã xếp (h) | Thiếu bếp (h) | Thiếu bồi (h) | Thiếu cao điểm (giờ-người) |
|---|---:|---:|---:|---:|
| 01 | 656 | 21 | 13 | 18.5 |
| 02 | 656 | 23 | 13 | 16 |
| 03 | 656 | 20 | 16.5 | 48.5 |
| 04 | 656 | 17.5 | 7.5 | 21 |
| 05 | 656 | 16 | 10 | 18.5 |
| 06 | 656 | 20.5 | 8.5 | 34.5 |
| 07 | 656 | 25.5 | 15.5 | 45.5 |
| 08 | 656 | 21 | 17.5 | 41 |
| 09 | 656 | 22.5 | 14 | 33.5 |
| 10 | 656 | 18 | 8.5 | 25.5 |
| 11 | 656 | 20 | 17 | 29.5 |
| 12 | 656 | 21 | 9 | 21 |

Thiếu bếp/bồi là thời lượng khoảng không có nhân viên đúng bộ phận trong giờ mở cửa, bao gồm giờ nghỉ giải lao. Hai cột có thể trùng thời điểm; cộng lại là số giờ thiếu theo bộ phận, không phải số giờ tiệm đóng.

Bản trước lần tối ưu này thiếu bếp 17,5 giờ, bồi 16 giờ trong tháng 10. Bản mới thiếu bếp 18 giờ, bồi 8,5 giờ: tổng giảm từ 33,5 xuống 26,5 giờ (~21%). Thiếu cao điểm giảm từ 26,5 xuống 25,5 giờ-người. Cột cao điểm tính số người còn thiếu so với 3 người trong 17:30–19:30, không cộng thêm vào hai cột bộ phận vì có thể trùng khoảng thiếu.

Bổ sung đổi ngày nghỉ đồng thời với giờ của người bàn giao, cân lại giờ sau đổi ngày, tối ưu vị trí ca theo cặp cả khác bộ phận. Giữ nguyên tổng giờ từng hợp đồng. Việc cải thiện không đồng đều giữa các tháng; chưa chứng minh tối ưu toàn cục hoặc mọi khoảng thiếu đều bất khả thi. Kết quả vẫn chưa đạt phủ vận hành đầy đủ.

Có giới hạn thực tế: chỉ hai người bếp, mở 10,5 giờ/ngày, mỗi người tối đa 8 giờ và không làm quá 6 ngày liên tiếp. Trong ba tuần mở đủ 7 ngày của tháng 10, mỗi người phải nghỉ ít nhất một ngày/tuần; dù nghỉ khác ngày vẫn có ít nhất 6 ngày chỉ một bếp, gây ít nhất 15 giờ thiếu bếp. Muốn phủ kín cần thêm người có thể làm bếp vào các khoảng đó hoặc thay đổi điều kiện vận hành; không tự ý đổi bộ phận hay giới hạn.

Kiểm thử 12 tháng này độc lập, không phải mô phỏng nối liên tục lịch cả năm. Thời gian đo từng tháng khoảng 9–19 giây trên máy hiện tại; Worker giữ giao diện phản hồi trong lúc tính.
