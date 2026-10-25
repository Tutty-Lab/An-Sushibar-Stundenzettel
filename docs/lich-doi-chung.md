# Lịch đối chứng An Sushibar

Input chuẩn: tháng 10/2026, sáu hợp đồng 173 + 169 + 169 + 105 + 20 + 20 = 656 giờ. Chủ chỉ hiển thị hỗ trợ, không tham gia mục tiêu phân ca nhân viên hoặc debug.

## Điều kiện bắt buộc

- Đúng giờ từng hợp đồng trên lưới 30 phút; phần lẻ còn lại phải hiển thị chưa xếp.
- Đúng bộ phận, ngày khả dụng, ngày lễ và ngày nghỉ đã nhập.
- Mỗi nhân viên tối đa 8 giờ công/ngày; ca ít nhất 3 giờ; nghỉ giải lao sau 6 giờ.
- Tối đa 6 ngày làm/tuần và 6 ngày liên tiếp.
- Minijob chỉ bồi, T6–CN, luân phiên cuối tuần theo cấu hình hiện tại.

## Thứ tự đánh giá lịch

1. Giữ các điều kiện bắt buộc, không bù thiếu bằng giờ của chủ.
2. Giảm số phút thiếu bếp hoặc bồi riêng biệt trong giờ mở cửa.
3. Giảm số giờ-người thiếu so với 3 người ở 17:30–19:30 mỗi ngày.
4. Cân ngày tương đương, ưu tiên T6/T7, hạn chế ca phân mảnh.

Không coi “đủ tổng giờ” là “đủ độ phủ”. Lịch đối chứng phải qua bộ kiểm tra ca của ứng dụng trước khi dùng làm chuẩn.

## Chạy đối chứng

1. `npx vite-node scripts/export-reference.mts`
2. `python -m pip install scipy highspy`
3. `python scripts/solve-reference.py KITCHEN`
4. `python scripts/solve-reference.py SERVICE_SUSHI`
5. `npx vite-node scripts/check-reference.mts --combine`

Bộ giải liệt kê ca liên tục neo đầu/cuối giờ mở cửa (cộng các ca của lịch khởi đầu), vị trí nghỉ giải lao trên lưới 30 phút, chọn ca đồng thời cho cả tháng. Dùng lịch hiện tại làm phương án khởi đầu. Chỉ ghi file trong `docs/`, không sửa localStorage hoặc lịch người dùng.

Đây là công cụ đối chứng cho fixture tháng 10, chưa hỗ trợ mọi input tùy chỉnh (BOTH, fixedShift, Urlaub, adjacentShifts, tuần mượn thêm ngày minijob). Không dùng trực tiếp thay bộ lập lịch sản phẩm. Kết quả giới hạn thời gian chỉ là phương án khả thi; chưa chứng minh tối ưu toàn cục. Chưa tối ưu cân ngày T6/T7 trong mô hình đối chứng.

## Đối chiếu lần đầu (26/10/2026)

| Tháng 10/2026 | Lịch hiện tại | Lịch đối chứng |
|---|---:|---:|
| Giờ hợp đồng đã xếp | 656 | 656 |
| Thiếu bếp (giờ) | 18 | 17,5 |
| Thiếu bồi (giờ) | 8,5 | 5 |
| Tổng thiếu theo bộ phận (giờ) | 26,5 | 22,5 |
| Thiếu cao điểm (giờ-người) | 25,5 | 43 |

Đối chứng giữ toàn bộ điều kiện kiểm tra cho fixture này; chưa tối ưu toàn cục. Cao điểm xấu hơn cho thấy đánh đổi thật giữa các tiêu chí. Không dùng lịch này thay trực tiếp lịch khách hàng. File CSV cho phép xem từng ca, giờ nghỉ; JSON giữ dữ liệu để kiểm thử lại.

## Kết luận triển khai

- Đã loại chủ khỏi toàn bộ chi phí độ phủ của bộ lập lịch; test có/không chủ cho lịch nhân viên giống nhau.
- Lịch đối chứng cho thấy còn ít nhất 4 giờ thiếu theo bộ phận có thể giảm với cùng fixture, nhưng phải đánh đổi cao điểm. Đây không phải bằng chứng mọi khoảng thiếu còn lại là bắt buộc.
- Thử tăng trọng số bộ phận 100 lần không giảm tổng thiếu; thử đổi danh sách ngày nhận giờ riêng theo bộ phận làm kết quả xấu hơn. Cả hai đã được gỡ, không đưa vào sản phẩm.
- Chưa đưa bộ giải offline vào ứng dụng. Thuật toán sản phẩm vẫn dùng kết quả đã kiểm chứng 12 tháng; chưa đạt mức lịch đối chứng 22,5 giờ thiếu. Bước thay thuật toán tiếp theo phải so cả độ phủ bộ phận, cao điểm, cân ngày và thời gian tính, không chỉ số cảnh báo.
