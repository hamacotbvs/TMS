// Khởi tạo sự kiện lắng nghe khi mở trang
document.addEventListener('DOMContentLoaded', function() {
    const inputThangVC = document.getElementById('thangVanChuyen');
    const inputPhuongTien = document.getElementById('filterPhuongTien');

    if (inputThangVC) {
        // Mặc định gán tháng hiện tại cho ô input nếu chưa có giá trị
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        inputThangVC.value = `${year}-${month}`;

        // Lấy chính xác giá trị đang hiển thị trên ô input để tải dữ liệu
        const [y, m] = inputThangVC.value.split('-');
        taiLichSuVanChuyen(m, y, "");

        // Sự kiện đổi tháng trên ô input
        inputThangVC.addEventListener('change', function() {
            if (this.value) {
                const [yChon, mChon] = this.value.split('-');
                taiLichSuVanChuyen(mChon, yChon, inputPhuongTien ? inputPhuongTien.value : "");
            }
        });
    }

    // Sự kiện gõ tìm kiếm theo biển số xe
    let timeoutId;
    if (inputPhuongTien) {
        inputPhuongTien.addEventListener('input', function() {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                if (inputThangVC && inputThangVC.value) {
                    const [y, m] = inputThangVC.value.split('-');
                    taiLichSuVanChuyen(m, y, this.value);
                }
            }, 300); 
        });
    }
});
