// VANCHUYEN.JS - Quản lý lịch sử vận chuyển theo Tháng, Phương tiện và Gom nhóm theo Ngày
import { collection, query, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db; // Dùng chung kết nối Firestore

// Hàm phụ: Lấy ngày chuẩn ưu tiên theo logic yêu cầu
function layNgayChuan(data) {
    let rawDate = "";
    if (data.batDauGiaoHang && data.batDauGiaoHang.trim() !== "") {
        rawDate = data.batDauGiaoHang;
    } else if (data.ketThucGiaoHang && data.ketThucGiaoHang.trim() !== "") {
        rawDate = data.ketThucGiaoHang;
    } else {
        rawDate = data.ngayxuatKho || "";
    }
    return rawDate;
}

// Hàm phụ: Trích xuất Tháng và Năm từ chuỗi ngày (Hỗ trợ định dạng DD/MM/YYYY hoặc YYYY-MM-DD)
function trichXuatThangNam(ngayStr) {
    if (!ngayStr) return { thang: 0, nam: 0 };
    let parts = [];
    if (ngayStr.includes("/")) {
        parts = ngayStr.split("/");
        if (parts.length >= 3) {
            return {
                thang: parseInt(parts[1], 10),
                nam: parseInt(parts[2].split(" ")[0], 10)
            };
        }
    } else if (ngayStr.includes("-")) {
        parts = ngayStr.split("-");
        if (parts.length >= 3) {
            // Trường hợp YYYY-MM-DD
            if (parts[0].length === 4) {
                return {
                    thang: parseInt(parts[1], 10),
                    nam: parseInt(parts[0], 10)
                };
            }
            // Trường hợp DD-MM-YYYY
            return {
                thang: parseInt(parts[1], 10),
                nam: parseInt(parts[2].split(" ")[0], 10)
            };
        }
    }
    return { thang: 0, nam: 0 };
}

window.taiLichSuVanChuyen = async function(thangChon, namChon, bienSoTimKiem = "") {
    const container = document.getElementById('danhSachLichSuVanChuyen');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu vận chuyển...</div>';

    try {
        const thangNum = parseInt(thangChon, 10);
        const namNum = parseInt(namChon, 10);

        // Lấy toàn bộ collection TUYENDUONG từ Firestore[cite: 1]
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
            
            // Lấy ngày chuẩn theo ưu tiên: batDauGiaoHang -> ketThucGiaoHang -> ngayxuatKho
            const ngayHieuLuc = layNgayChuan(data);
            const { thang, nam } = trichXuatThangNam(ngayHieuLuc);

            // Nếu không tách được từ ngày ưu tiên, fallback về trường thang/nam có sẵn trong DB
            const dThang = thang > 0 ? thang : parseInt(data.thang, 10);
            const dNam = nam > 0 ? nam : parseInt(data.nam, 10);

            if (dThang === thangNum && dNam === namNum) {
                listData.push({ 
                    id: docSnap.id, 
                    ...data, 
                    _ngayHieuLuc: ngayHieuLuc || "Chưa xác định ngày" 
                });
            }
        });

        if (listData.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không có chuyến vận chuyển nào trong Tháng ${thangNum}/${namNum}.</div>`;
            return;
        }

        // Sắp xếp danh sách theo ngày hiệu lực giảm dần (mới nhất lên đầu)
        listData.sort((a, b) => b._ngayHieuLuc.localeCompare(a._ngayHieuLuc));

        // --- BƯỚC GOM NHÓM (GROUP) THEO NGÀY ---
        let groupedByDate = {};
        let countHienThi = 0;

        listData.forEach((data) => {
            const phuongTien = data.phuongTien || '';

            // Lọc theo biển số xe nếu có nhập
            if (bienSoTimKiem && bienSoTimKiem.trim() !== "") {
                const tuKhoa = bienSoTimKiem.toLowerCase().trim();
                const xeHienTai = phuongTien.toLowerCase();
                if (!xeHienTai.includes(tuKhoa)) {
                    return; 
                }
            }

            countHienThi++;
            const ngayKey = data._ngayHieuLuc;
            if (!groupedByDate[ngayKey]) {
                groupedByDate[ngayKey] = [];
            }
            groupedByDate[ngayKey].push(data);
        });

        if (countHienThi === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không tìm thấy chuyến xe nào khớp với biển số xe bạn nhập trong tháng này.</div>';
            return;
        }

        // Render ra giao diện theo từng nhóm ngày
        Object.keys(groupedByDate).forEach((ngay) => {
            const danhSachChuyen = groupedByDate[ngay];

            // Tạo khung nhóm ngày
            const groupWrapper = document.createElement('div');
            groupWrapper.style.cssText = 'margin-bottom: 16px;';

            // Tiêu đề nhóm Ngày
            const groupHeader = document.createElement('div');
            groupHeader.style.cssText = 'background: #e2e8f0; color: #1e293b; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
            groupHeader.innerHTML = `<span>📅 Ngày: ${ngay}</span> <span style="background: #cbd5e1; padding: 1px 6px; border-radius: 10px; font-size: 10px;">${danhSachChuyen.length} chuyến</span>`;
            groupWrapper.appendChild(groupHeader);

            // Duyệt qua các chuyến trong ngày đó để tạo card
            danhSachChuyen.forEach((data) => {
                const maPhieu = data.maPhieu || data.id;
                const doiTuong = data.doiTuong || 'Chưa xác định';
                const phuongTien = data.phuongTien || '';
                const taiXe = data.taiXe || 'Chưa có TX';
                const htGiaoNhan = data.htGiaoNhan || 'Giao hàng';
                const duyet = data.duyet || '';
                const tTai = data.tTai ? Number(data.tTai).toLocaleString('vi-VN') + ' kg' : '0 kg';
                const thanhTien = data.thanhTien ? Number(data.thanhTien).toLocaleString('vi-VN') + ' đ' : '0 đ';
                const ngayxuatKho = data.ngayxuatKho || '';
                const vungTieuThu = data.vungTieuThu || data.thanhPho || '';
                const khoXuat = data.khoXuat || '';

                const isChanh = htGiaoNhan.includes("Chành") || htGiaoNhan.includes("Gửi chành");
                const badgeHT = isChanh 
                    ? '<span style="background: #fef2f2; color: #dc2626; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🚚 Gửi chành</span>'
                    : '<span style="background: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">🚛 Giao hàng</span>';

                let badgeDuyet = `<span style="color: #64748b; font-size: 11px;">${duyet}</span>`;
                if (duyet === "Đã giao hàng") {
                    badgeDuyet = `<span style="color: #16a34a; font-size: 11px; font-weight: 600;">✓ Đã giao hàng</span>`;
                } else if (duyet === "Đã xuất kho") {
                    badgeDuyet = `<span style="color: #d97706; font-size: 11px; font-weight: 600;">📦 Đã xuất kho</span>`;
                }

                const cardItem = document.createElement('div');
                cardItem.className = 'card-lich-su-item';
                cardItem.style.cssText = 'background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);';

                cardItem.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 5px; margin-bottom: 5px;">
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
                        📅 Ngày XK gốc: ${ngayxuatKho}
                    </div>
                `;

                groupWrapper.appendChild(cardItem);
            });

            container.appendChild(groupWrapper);
        });

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
                taiLichSwVanChuyen(m, y, inputPhuongTien ? inputPhuongTien.value : "");
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
