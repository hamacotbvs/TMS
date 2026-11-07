// VANCHUYEN.JS - Quản lý lịch sử vận chuyển theo Tháng và Phương tiện
import { collection, query, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db; // Dùng chung kết nối Firestore

window.taiLichSuVanChuyen = async function(thangChon, namChon, bienSoTimKiem = "") {
    const container = document.getElementById('danhSachLichSuVanChuyen');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu vận chuyển...</div>';

    try {
        const thangNum = parseInt(thangChon, 10);
        const namNum = parseInt(namChon, 10);

        // Lấy toàn bộ collection TUYENDUONG[cite: 1] để lọc cực kỳ linh hoạt (tránh lệch kiểu dữ liệu số/chuỗi)
        const q = query(collection(db, "TUYENDUONG"));
        const querySnapshot = await getDocs(q);
        container.innerHTML = '';

        if (querySnapshot.empty) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không tìm thấy chứng từ nào trên hệ thống.</div>';
            return;
        }

        let listData = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // Ép kiểu tường minh sang số để so sánh chuẩn xác với dữ liệu lưu trong Firestore
            const dThang = parseInt(data.thang, 10);
            const dNam = parseInt(data.nam, 10);

            if (dThang === thangNum && dNam === namNum) {
                listData.push({ id: docSnap.id, ...data });
            }
        });

        if (listData.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không có chuyến vận chuyển nào trong Tháng ${thangNum}/${namNum}.</div>`;
            return;
        }

        // Sắp xếp ngày xuất kho giảm dần (mới nhất lên đầu) ngay trên client
        listData.sort((a, b) => {
            let dateA = a.ngayxuatKho || '';
            let dateB = b.ngayxuatKho || '';
            return dateB.localeCompare(dateA);
        });

        let countHienThi = 0;

        listData.forEach((data) => {
            const phuongTien = data.phuongTien || '';

            // Lọc theo biển số xe nếu người dùng có gõ vào ô tìm kiếm
            if (bienSoTimKiem && bienSoTimKiem.trim() !== "") {
                const tuKhoa = bienSoTimKiem.toLowerCase().trim();
                const xeHienTai = phuongTien.toLowerCase();
                if (!xeHienTai.includes(tuKhoa)) {
                    return; 
                }
            }

            countHienThi++;
            const maPhieu = data.maPhieu || data.id;
            const doiTuong = data.doiTuong || 'Chưa xác định';
            const taiXe = data.taiXe || 'Chưa có TX';
            const htGiaoNhan = data.htGiaoNhan || 'Giao hàng';
            const duyet = data.duyet || '';
            const tTai = data.tTai ? Number(data.tTai).toLocaleString('vi-VN') + ' kg' : '0 kg';
            const thanhTien = data.thanhTien ? Number(data.thanhTien).toLocaleString('vi-VN') + ' đ' : '0 đ';
            const ngayxuatKho = data.ngayxuatKho || '';
            const vungTieuThu = data.vungTieuThu || data.thanhPho || '';
            const khoXuat = data.khoXuat || '';

            // Huy hiệu hình thức giao nhận
            const isChanh = htGiaoNhan.includes("Chành") || htGiaoNhan.includes("Gửi chành");
            const badgeHT = isChanh 
                ? '<span style="background: #fef2f2; color: #dc2626; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🚚 Gửi chành</span>'
                : '<span style="background: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🚛 Giao hàng</span>';

            // Trạng thái duyệt đơn
            let badgeDuyet = `<span style="color: #64748b; font-size: 11px;">${duyet}</span>`;
            if (duyet === "Đã giao hàng") {
                badgeDuyet = `<span style="color: #16a34a; font-size: 11px; font-weight: 600;">✓ Đã giao hàng</span>`;
            } else if (duyet === "Đã xuất kho") {
                badgeDuyet = `<span style="color: #d97706; font-size: 11px; font-weight: 600;">📦 Đã xuất kho</span>`;
            }

            // Tạo thẻ Card hiển thị từng chuyến vận chuyển
            const cardItem = document.createElement('div');
            cardItem.className = 'card-lich-su-item';
            cardItem.style.cssText = 'background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';

            cardItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
                    <div>
                        <strong style="color: #0f172a; font-size: 13px;">${maPhieu}</strong>
                        <span style="font-size: 11px; color: #64748b; margin-left: 6px;">(Kho ${khoXuat})</span>
                    </div>
                    <div>${badgeHT}</div>
                </div>

                <div style="font-weight: 600; color: #1e293b; font-size: 13px; margin-bottom: 4px;">
                    🏢 ${doiTuong}
                </div>

                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-bottom: 4px;">
                    <span>🚛 BSK: <strong style="color: #0284c7;">${phuongTien || 'Chưa phân xe'}</strong> (${taiXe})</span>
                    <span>📍 ${vungTieuThu}</span>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-top: 6px; background: #f8fafc; padding: 6px 8px; border-radius: 6px;">
                    <span>Tải: <strong style="color: #0284c7;">${tTai}</strong> | Tiền: <strong style="color: #16a34a;">${thanhTien}</strong></span>
                    <div>${badgeDuyet}</div>
                </div>
                
                <div style="font-size: 11px; color: #94a3b8; text-align: right; margin-top: 4px;">
                    📅 Ngày XK: ${ngayxuatKho}
                </div>
            `;

            container.appendChild(cardItem);
        });

        if (countHienThi === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không tìm thấy chuyến xe nào khớp với biển số xe bạn nhập trong tháng này.</div>';
        }

    } catch (error) {
        console.error("Lỗi tải lịch sử vận chuyển: ", error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 13px;">Lỗi tải dữ liệu lịch sử vận chuyển!</div>';
    }
};

// Khởi tạo sự kiện lắng nghe khi mở trang
document.addEventListener('DOMContentLoaded', function() {
    const inputThangVC = document.getElementById('thangVanChuyen');
    const inputPhuongTien = document.getElementById('filterPhuongTien');

    if (inputThangVC) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        inputThangVC.value = `${year}-${month}`;

        // Tải dữ liệu ban đầu cho tháng hiện tại
        taiLichSuVanChuyen(month, year, "");

        // Sự kiện đổi tháng
        inputThangVC.addEventListener('change', function() {
            if (this.value) {
                const [y, m] = this.value.split('-');
                taiLichSuVanChuyen(m, y, inputPhuongTien ? inputPhuongTien.value : "");
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
