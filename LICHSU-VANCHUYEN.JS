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

// Hàm tính khoảng cách (km) từ tọa độ dinhVi đến checkIn bằng công thức Haversine
function tinhKhoangCach(toaDo1, toaDo2) {
    if (!toaDo1 || !toaDo2 || toaDo1 === "0,0" || toaDo2 === "0,0") return null;
    try {
        const [lat1, lon1] = toaDo1.split(',').map(Number);
        const [lat2, lon2] = toaDo2.split(',').map(Number);

        if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2) || (lat1 === 0 && lon1 === 0)) return null;

        const R = 6371; // Bán kính trái đất tính bằng km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return distance.toFixed(1); // Lấy 1 chữ số thập phân
    } catch (e) {
        return null;
    }
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

            // Quy đổi Doanh thu ra triệu đồng (làm tròn số nguyên)
            const tongDTTr = Math.round(tongDoanhThuTrongNgay / 1000000).toLocaleString('vi-VN');

            // Tiêu đề Ngày
            const dateHeader = document.createElement('div');
            dateHeader.style.cssText = 'background: #0284c7; color: #fff; padding: 8px 12px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;';
            dateHeader.innerHTML = `
                <span>📅 ${ngay}</span> 
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">${tongTaiTrongNgay.toLocaleString('vi-VN')} kg / ${tongDTTr} tr.đ</span>
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

                        // Sắp xếp các đơn trong chuyến theo thời gian kết thúc giao hàng từ nhỏ đến lớn (tăng dần)
                        danhSachDonTrongChuyen.sort((a, b) => {
                            let timeA = a.ketThucGiaoHang || "";
                            let timeB = b.ketThucGiaoHang || "";
                            return timeA.localeCompare(timeB);
                        });

                        let taiChuyen = 0;
                        let dtChuyen = 0;
                        danhSachDonTrongChuyen.forEach(don => {
                            if (don.tTai) taiChuyen += Number(don.tTai) || 0;
                            if (don.thanhTien) dtChuyen += Number(don.thanhTien) || 0;
                        });
                        const dtChuyenTr = Math.round(dtChuyen / 1000000).toLocaleString('vi-VN');

                        const vehicleWrapper = document.createElement('div');
                        vehicleWrapper.style.cssText = `background: ${mauXe.bgHeader}; border: 1px solid ${mauXe.border}; border-radius: 8px; padding: 10px; margin-bottom: 10px; margin-left: 8px;`;

                        const vehicleHeader = document.createElement('div');
                        vehicleHeader.style.cssText = `background: ${mauXe.badgeBg}; color: ${mauXe.textHeader}; padding: 5px 10px; border-radius: 5px; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;`;
                        vehicleHeader.innerHTML = `
                            <span>🚛 <strong style="color: ${mauXe.tagColor};">${nhom.name}</strong> — <span style="color: #d97706;">Chuyến ${soChuyen}</span></span> 
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <span style="background: rgba(16,185,129,0.15); color: #047857; padding: 1px 6px; border-radius: 8px; font-size: 10px;">${taiChuyen.toLocaleString('vi-VN')} kg / ${dtChuyenTr} tr.đ</span>
                                <span style="background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 8px; font-size: 10px;">${danhSachDonTrongChuyen.length} đơn</span>
                            </div>
                        `;
                        vehicleWrapper.appendChild(vehicleHeader);

                        danhSachDonTrongChuyen.forEach(data => renderCardDon(data, vehicleWrapper, false));
                        dateWrapper.appendChild(vehicleWrapper);
                    });

                } else {
                    const mauXeMay = layMauGiaoDienXe("Xe máy"); 

                    // Sắp xếp các đơn xe máy theo thời gian kết thúc giao hàng từ nhỏ đến lớn (tăng dần)
                    nhom.don.sort((a, b) => {
                        let timeA = a.ketThucGiaoHang || "";
                        let timeB = b.ketThucGiaoHang || "";
                        return timeA.localeCompare(timeB);
                    });

                    let taiXeMay = 0;
                    let dtXeMay = 0;
                    nhom.don.forEach(don => {
                        if (don.tTai) taiXeMay += Number(don.tTai) || 0;
                        if (don.thanhTien) dtXeMay += Number(don.thanhTien) || 0;
                    });
                    const dtXeMayTr = Math.round(dtXeMay / 1000000).toLocaleString('vi-VN');

                    const vehicleWrapper = document.createElement('div');
                    vehicleWrapper.style.cssText = `background: ${mauXeMay.bgHeader}; border: 1px solid ${mauXeMay.border}; border-radius: 8px; padding: 10px; margin-bottom: 10px; margin-left: 8px;`;

                    const vehicleHeader = document.createElement('div');
                    vehicleHeader.style.cssText = `background: ${mauXeMay.badgeBg}; color: ${mauXeMay.textHeader}; padding: 5px 10px; border-radius: 5px; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;`;
                    vehicleHeader.innerHTML = `
                        <span>🏍️ <strong style="color: ${mauXeMay.tagColor};">${nhom.name}</strong></span> 
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span style="background: rgba(16,185,129,0.15); color: #047857; padding: 1px 6px; border-radius: 8px; font-size: 10px;">${taiXeMay.toLocaleString('vi-VN')} kg / ${dtXeMayTr} tr.đ</span>
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
