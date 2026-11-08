// VANCHUYEN.JS - Quản lý lịch sử vận chuyển: Giao diện tối ưu, Tải thủ công, Phân màu và Xe máy
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db; // Dùng chung kết nối Firestore

// Hàm chuẩn hóa chuỗi ngày: Chỉ lấy phần ngày/tháng/năm, cắt bỏ hoàn toàn phần giờ phút giây
function chuanHoaNgay(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return "Chưa xác định ngày";
    let phanNgay = ngayStr.trim().split(" ")[0];
    return phanNgay;
}

// Hàm lấy ngày ưu tiên và chuẩn hóa (bỏ giờ): batDauGiaoHang -> ketThucGiaoHang -> ngayxuatKho
function layNgayGomNhom(data) {
    let rawDate = "";
    if (data.batDauGiaoHang && data.batDauGiaoHang.trim() !== "") {
        rawDate = data.batDauGiaoHang;
    } else if (data.ketThucGiaoHang && data.ketThucGiaoHang.trim() !== "") {
        rawDate = data.ketThucGiaoHang;
    } else {
        rawDate = data.ngayxuatKho || "";
    }
    return chuanHoaNgay(rawDate);
}

// Hàm gán màu riêng biệt cho từng xe và xe máy
function layMauGiaoDienXe(phuongTien) {
    const xe = phuongTien ? phuongTien.trim().toUpperCase() : "";
    
    if (xe.includes("06126")) {
        // Tông Xanh Dương (Blue)
        return {
            bgHeader: '#eff6ff', border: '#bfdbfe', textHeader: '#1e40af', 
            badgeBg: '#dbeafe', badgeText: '#1d4ed8', tagColor: '#2563eb'
        };
    } else if (xe.includes("12290")) {
        // Tông Xanh Lá / Xanh Ngọc (Green)
        return {
            bgHeader: '#f0fdf4', border: '#bbf7d0', textHeader: '#166534', 
            badgeBg: '#dcfce7', badgeText: '#15803d', tagColor: '#16a34a'
        };
    } else if (xe.includes("02591")) {
        // Tông Đỏ / Cam mạnh mẽ (Red/Orange)
        return {
            bgHeader: '#fef2f2', border: '#fecaca', textHeader: '#991b1b', 
            badgeBg: '#fee2e2', badgeText: '#dc2626', tagColor: '#ef4444'
        };
    } else if (xe === "XE MÁY" || !phuongTien || phuongTien.trim() === "") {
        // Tông Vàng (Xe máy / Chưa phân xe)
        return {
            bgHeader: '#fffbeb', border: '#fde68a', textHeader: '#92400e', 
            badgeBg: '#fef3c7', badgeText: '#b45309', tagColor: '#d97706'
        };
    } else {
        // Tông mặc định cho các xe khác (Xám / Slate)
        return {
            bgHeader: '#f8fafc', border: '#e2e8f0', textHeader: '#1e293b', 
            badgeBg: '#e2e8f0', badgeText: '#334155', tagColor: '#0284c7'
        };
    }
}

window.taiLichSuVanChuyen = async function(thangChon, namChon, bienSoTimKiem = "") {
    const container = document.getElementById('danhSachLichSuVanChuyen');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu vận chuyển từ server...</div>';

    try {
        const thangNum = parseInt(thangChon, 10);
        const namNum = parseInt(namChon, 10);

        // Lọc trực tiếp bằng where trên Server (Siêu tiết kiệm lượt đọc Reads)
        const thamChieuTuyenDuong = collection(db, "TUYENDUONG");
        const q = query(
            thamChieuTuyenDuong, 
            where("nam", "==", namNum), 
            where("thang", "==", thangNum)
        );

        const querySnapshot = await getDocs(q);
        container.innerHTML = '';

        if (querySnapshot.empty) {
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không có chuyến vận chuyển nào trong Tháng ${thangNum}/${namNum}.</div>`;
            return;
        }

        let listData = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const ngayGom = layNgayGomNhom(data);
            listData.push({ 
                id: docSnap.id, 
                ...data, 
                _ngayGom: ngayGom 
            });
        });

        // Sắp xếp danh sách theo ngày gom nhóm giảm dần (mới nhất lên đầu)
        listData.sort((a, b) => b._ngayGom.localeCompare(a._ngayGom));

        // --- GOM NHÓM THEO CẤU TRÚC: NGÀY -> [XE HOẶC XE MÁY] -> [CHUYẾN HOẶC ĐƠN] ---
        let groupedData = {};
        let countHienThi = 0;

        listData.forEach((data) => {
            const coXe = data.phuongTien && data.phuongTien.trim() !== "";
            const nhomKey = coXe ? data.phuongTien.trim() : "Xe máy";

            // Lọc theo phương tiện nếu chọn từ Dropdown
            if (bienSoTimKiem && bienSoTimKiem.trim() !== "") {
                const tuKhoa = bienSoTimKiem.toLowerCase().trim();
                if (!nhomKey.toLowerCase().includes(tuKhoa)) {
                    return; 
                }
            }

            countHienThi++;
            const ngayKey = data._ngayGom;

            if (!groupedData[ngayKey]) {
                groupedData[ngayKey] = {};
            }

            if (coXe) {
                const soChuyen = data.chuyen !== undefined && data.chuyen !== null && data.chuyen !== "" ? data.chuyen : 1;
                const phuongTienKey = `XE_${nhomKey}`;
                
                if (!groupedData[ngayKey][phuongTienKey]) {
                    groupedData[ngayKey][phuongTienKey] = { type: 'xe', name: nhomKey, chuyen: {} };
                }
                if (!groupedData[ngayKey][phuongTienKey].chuyen[soChuyen]) {
                    groupedData[ngayKey][phuongTienKey].chuyen[soChuyen] = [];
                }
                groupedData[ngayKey][phuongTienKey].chuyen[soChuyen].push(data);
            } else {
                const xeMayKey = `XE_MAY`;

                if (!groupedData[ngayKey][xeMayKey]) {
                    groupedData[ngayKey][xeMayKey] = { type: 'xe_may', name: 'Xe máy', don: [] };
                }
                groupedData[ngayKey][xeMayKey].don.push(data);
            }
        });

        if (countHienThi === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không tìm thấy dữ liệu nào khớp với phương tiện bạn chọn trong tháng này.</div>';
            return;
        }

        // Render ra giao diện theo thứ tự: Ngày -> Nhóm Xe / Xe máy
        Object.keys(groupedData).forEach((ngay) => {
            const danhSachNhom = groupedData[ngay];

            const dateWrapper = document.createElement('div');
            dateWrapper.style.cssText = 'margin-bottom: 20px;';

            let tongDonTrongNgay = 0;
            let tongTaiTrongNgay = 0;
            let tongDoanhThuTrongNgay = 0;

            Object.values(danhSachNhom).forEach(nhom => {
                if (nhom.type === 'xe') {
                    Object.values(nhom.chuyen).forEach(danhSachDon => {
                        tongDonTrongNgay += danhSachDon.length;
                        danhSachDon.forEach(don => {
                            if (don.tTai) tongTaiTrongNgay += Number(don.tTai) || 0;
                            if (don.thanhTien) tongDoanhThuTrongNgay += Number(don.thanhTien) || 0;
                        });
                    });
                } else {
                    tongDonTrongNgay += nhom.don.length;
                    nhom.don.forEach(don => {
                        if (don.tTai) tongTaiTrongNgay += Number(don.tTai) || 0;
                        if (don.thanhTien) tongDoanhThuTrongNgay += Number(don.thanhTien) || 0;
                    });
                }
            });

            // Quy đổi Doanh thu ra triệu đồng (làm tròn 1 hoặc 2 chữ số thập phân cho gọn)
            const tongDTTr = (tongDoanhThuTrongNgay / 1000000).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

            // Tiêu đề Ngày hiển thị DT theo tr.đ
            const dateHeader = document.createElement('div');
            dateHeader.style.cssText = 'background: #0284c7; color: #fff; padding: 8px 12px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;';
            dateHeader.innerHTML = `
                <span>📅 ${ngay}</span> 
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">Tải: ${tongTaiTrongNgay.toLocaleString('vi-VN')} kg</span>
                    <span style="background: rgba(16,185,129,0.3); padding: 2px 6px; border-radius: 8px; font-size: 11px;">DT: ${tongDTTr} tr.đ</span>
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">${tongDonTrongNgay} đơn</span>
                </div>
            `;
            dateWrapper.appendChild(dateHeader);

            // Duyệt qua từng nhóm xe / xe máy
            Object.values(danhSachNhom).forEach((nhom) => {
                if (nhom.type === 'xe') {
                    const mauXe = layMauGiaoDienXe(nhom.name);
                    const cacChuyenDaSapXep = Object.keys(nhom.chuyen).sort((a, b) => Number(a) - Number(b));

                    cacChuyenDaSapXep.forEach((soChuyen) => {
                        const danhSachDonTrongChuyen = nhom.chuyen[soChuyen];

                        let taiChuyen = 0;
                        let dtChuyen = 0;
                        danhSachDonTrongChuyen.forEach(don => {
                            if (don.tTai) taiChuyen += Number(don.tTai) || 0;
                            if (don.thanhTien) dtChuyen += Number(don.thanhTien) || 0;
                        });
                        const dtChuyenTr = (dtChuyen / 1000000).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

                        const vehicleWrapper = document.createElement('div');
                        vehicleWrapper.style.cssText = `background: ${mauXe.bgHeader}; border: 1px solid ${mauXe.border}; border-radius: 8px; padding: 10px; margin-bottom: 10px; margin-left: 8px;`;

                        const vehicleHeader = document.createElement('div');
                        vehicleHeader.style.cssText = `background: ${mauXe.badgeBg}; color: ${mauXe.textHeader}; padding: 5px 10px; border-radius: 5px; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;`;
                        vehicleHeader.innerHTML = `
                            <span>🚛 Xe: <strong style="color: ${mauXe.tagColor};">${nhom.name}</strong> — <span style="color: #d97706;">Chuyến ${soChuyen}</span></span> 
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <span style="background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 8px; font-size: 10px;">Tải: ${taiChuyen.toLocaleString('vi-VN')} kg</span>
                                <span style="background: rgba(16,185,129,0.15); color: #047857; padding: 1px 6px; border-radius: 8px; font-size: 10px;">DT: ${dtChuyenTr} tr.đ</span>
                                <span style="background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 8px; font-size: 10px;">${danhSachDonTrongChuyen.length} đơn</span>
                            </div>
                        `;
                        vehicleWrapper.appendChild(vehicleHeader);

                        danhSachDonTrongChuyen.forEach(data => renderCardDon(data, vehicleWrapper, false));
                        dateWrapper.appendChild(vehicleWrapper);
                    });

                } else {
                    const mauXeMay = layMauGiaoDienXe("Xe máy"); 

                    let taiXeMay = 0;
                    let dtXeMay = 0;
                    nhom.don.forEach(don => {
                        if (don.tTai) taiXeMay += Number(don.tTai) || 0;
                        if (don.thanhTien) dtXeMay += Number(don.thanhTien) || 0;
                    });
                    const dtXeMayTr = (dtXeMay / 1000000).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

                    const vehicleWrapper = document.createElement('div');
                    vehicleWrapper.style.cssText = `background: ${mauXeMay.bgHeader}; border: 1px solid ${mauXeMay.border}; border-radius: 8px; padding: 10px; margin-bottom: 10px; margin-left: 8px;`;

                    const vehicleHeader = document.createElement('div');
                    vehicleHeader.style.cssText = `background: ${mauXeMay.badgeBg}; color: ${mauXeMay.textHeader}; padding: 5px 10px; border-radius: 5px; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;`;
                    vehicleHeader.innerHTML = `
                        <span>🏍️ Phương tiện: <strong style="color: ${mauXeMay.tagColor};">${nhom.name}</strong></span> 
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span style="background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 8px; font-size: 10px;">Tải: ${taiXeMay.toLocaleString('vi-VN')} kg</span>
                            <span style="background: rgba(16,185,129,0.15); color: #047857; padding: 1px 6px; border-radius: 8px; font-size: 10px;">DT: ${dtXeMayTr} tr.đ</span>
                            <span style="background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 8px; font-size: 10px;">${nhom.don.length} đơn</span>
                        </div>
                    `;
                    vehicleWrapper.appendChild(vehicleHeader);

                    nhom.don.forEach(data => renderCardDon(data, vehicleWrapper, true)); 
                    dateWrapper.appendChild(vehicleWrapper);
                }
            });

            container.appendChild(dateWrapper);
        });

    } catch (error) {
        console.error("Lỗi tải lịch sử vận chuyển: ", error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 13px;">Lỗi tải dữ liệu lịch sử vận chuyển!</div>';
    }
};

// Hàm phụ vẽ card thông tin từng đơn
function renderCardDon(data, parentElement, isXeMay = false) {
    const maPhieu = data.maPhieu || data.id;
    const doiTuong = data.doiTuong || 'Chưa xác định';
    
    const nhanVienPhuTrach = isXeMay ? (data.giaoNhan || 'Chưa có tên') : (data.taiXe || 'Chưa có TX');
    const nhanVienLabel = isXeMay ? 'GN' : 'TX';

    const htGiaoNhan = data.htGiaoNhan || 'Giao hàng';
    const duyet = data.duyet || '';
    const tTai = data.tTai ? Number(data.tTai).toLocaleString('vi-VN') + ' kg' : '0 kg';
    const thanhTien = data.thanhTien ? Number(data.thanhTien).toLocaleString('vi-VN') + ' đ' : '0 đ';
    const ngayxuatKho = data.ngayxuatKho || '';
    const batDauGiaoHang = data.batDauGiaoHang || '';
    const ketThucGiaoHang = data.ketThucGiaoHang || '';
    const vungTieuThu = data.vungTieuThu || data.thanhPho || '';
    const khoXuat = data.khoXuat || '';

    const isChanh = htGiaoNhan.includes("Chành") || htGiaoNhan.includes("Gửi chành");
    const badgeHT = isChanh 
        ? '<span style="background: #fef2f2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">🚚 Chành</span>'
        : '<span style="background: #eff6ff; color: #2563eb; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">🚛 Giao</span>';

    let badgeDuyet = `<span style="color: #64748b; font-size: 11px;">${duyet}</span>`;
    if (duyet === "Đã giao hàng") {
        badgeDuyet = `<span style="color: #16a34a; font-size: 11px; font-weight: 600;">✓ Đã giao</span>`;
    } else if (duyet === "Đã xuất kho") {
        badgeDuyet = `<span style="color: #d97706; font-size: 11px; font-weight: 600;">📦 Đã xuất</span>`;
    }

    const cardItem = document.createElement('div');
    cardItem.className = 'card-lich-su-item';
    cardItem.style.cssText = 'background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);';

    cardItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px; margin-bottom: 4px;">
            <div>
                <strong style="color: #0f172a; font-size: 12px;">${maPhieu}</strong>
                <span style="font-size: 10px; color: #64748b; margin-left: 4px;">(Kho ${khoXuat})</span>
            </div>
            <div>${badgeHT}</div>
        </div>

        <div style="font-weight: 600; color: #1e293b; font-size: 12px; margin-bottom: 3px;">
            🏢 ${doiTuong}
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #475569; margin-bottom: 3px;">
            <span>${nhanVienLabel}: <strong>${nhanVienPhuTrach}</strong></span>
            <span>📍 ${vungTieuThu}</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: 4px; background: #f1f5f9; padding: 4px 6px; border-radius: 4px;">
            <span>Tải: <strong style="color: #0284c7;">${tTai}</strong> | Tiền: <strong style="color: #16a34a;">${thanhTien}</strong></span>
            <div>${badgeDuyet}</div>
        </div>
        
        <div style="font-size: 10px; color: #64748b; display: flex; justify-content: space-between; margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 3px;">
            <span>🚀 BĐ: <strong>${batDauGiaoHang ? batDauGiaoHang.split(" ")[1] || batDauGiaoHang : '---'}</strong></span>
            <span>🏁 KT: <strong>${ketThucGiaoHang ? ketThucGiaoHang.split(" ")[1] || ketThucGiaoHang : '---'}</strong></span>
            <span>📅 XK: <strong>${ngayxuatKho || '---'}</strong></span>
        </div>
    `;

    parentElement.appendChild(cardItem);
}

// Khởi tạo sự kiện giao diện và tương tác DOM hoàn chỉnh
document.addEventListener('DOMContentLoaded', function() {
    const inputThangVC = document.getElementById('thangVanChuyen');
    const labelThangVC = document.getElementById('labelThangNamVC');
    const selectPhuongTien = document.getElementById('filterPhuongTien');
    const btnTaiDuLieu = document.getElementById('btnTaiLichSuVC');
    const container = document.getElementById('danhSachLichSuVanChuyen');

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    if (inputThangVC) {
        if (!inputThangVC.value) {
            inputThangVC.value = `${year}-${month}`;
        }
        
        const [currY, currM] = inputThangVC.value.split('-');
        if (labelThangVC) labelThangVC.innerText = `${currM}/${currY}`;

        if (container && container.innerHTML.trim() === "") {
            container.innerHTML = '<div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 13px;">Vui lòng chọn tháng và bấm nút <b>"Tải dữ liệu"</b> để xem lịch sử vận chuyển.</div>';
        }

        inputThangVC.addEventListener('change', function() {
            if (this.value) {
                const [y, m] = this.value.split('-');
                if (labelThangVC) labelThangVC.innerText = `${m}/${y}`;
            }
        });
    }

    if (btnTaiDuLieu) {
        btnTaiDuLieu.onclick = function() {
            if (inputThangVC && inputThangVC.value) {
                const [y, m] = inputThangVC.value.split('-');
                const bienSo = selectPhuongTien ? selectPhuongTien.value : "";
                
                if (typeof window.taiLichSuVanChuyen === 'function') {
                    window.taiLichSuVanChuyen(m, y, bienSo);
                }
            } else {
                alert("Vui lòng chọn tháng năm trước khi tải!");
            }
        };
    }

    if (selectPhuongTien) {
        selectPhuongTien.addEventListener('change', function() {
            if (inputThangVC && inputThangVC.value) {
                const [y, m] = inputThangVC.value.split('-');
                if (typeof window.taiLichSuVanChuyen === 'function') {
                    window.taiLichSuVanChuyen(m, y, this.value);
                }
            }
        });
    }
});
