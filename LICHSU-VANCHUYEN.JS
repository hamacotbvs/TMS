// VANCHUYEN.JS - Chỉ tải dữ liệu khi người dùng bấm nút tải theo Tháng/Năm đã chọn
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

        // --- GOM NHÓM THEO CẤU TRÚC: NGÀY -> PHƯƠNG TIỆN -> CHUYẾN ---
        let groupedData = {};
        let countHienThi = 0;

        listData.forEach((data) => {
            const phuongTien = (data.phuongTien || 'Chưa phân xe').trim();

            // Lọc theo biển số xe nếu người dùng có gõ vào ô tìm kiếm
            if (bienSoTimKiem && bienSoTimKiem.trim() !== "") {
                const tuKhoa = bienSoTimKiem.toLowerCase().trim();
                if (!phuongTien.toLowerCase().includes(tuKhoa)) {
                    return; 
                }
            }

            countHienThi++;
            const ngayKey = data._ngayGom;
            const soChuyen = data.chuyen !== undefined && data.chuyen !== null && data.chuyen !== "" ? data.chuyen : 1;

            if (!groupedData[ngayKey]) {
                groupedData[ngayKey] = {};
            }
            if (!groupedData[ngayKey][phuongTien]) {
                groupedData[ngayKey][phuongTien] = {};
            }
            if (!groupedData[ngayKey][phuongTien][soChuyen]) {
                groupedData[ngayKey][phuongTien][soChuyen] = [];
            }

            groupedData[ngayKey][phuongTien][soChuyen].push(data);
        });

        if (countHienThi === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không tìm thấy chuyến xe nào khớp với biển số xe bạn nhập trong tháng này.</div>';
            return;
        }

        // Render ra giao diện theo thứ tự: Ngày -> Xe -> Chuyến
        Object.keys(groupedData).forEach((ngay) => {
            const danhSachXe = groupedData[ngay];

            const dateWrapper = document.createElement('div');
            dateWrapper.style.cssText = 'margin-bottom: 20px;';

            let tongDonTrongNgay = 0;
            Object.values(danhSachXe).forEach(danhSachChuyenCuaXe => {
                Object.values(danhSachChuyenCuaXe).forEach(danhSachDon => {
                    tongDonTrongNgay += danhSachDon.length;
                });
            });

            const dateHeader = document.createElement('div');
            dateHeader.style.cssText = 'background: #0284c7; color: #fff; padding: 8px 12px; border-radius: 6px; font-weight: 700; font-size: 13px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;';
            dateHeader.innerHTML = `<span>📅 Ngày: ${ngay}</span> <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px; font-size: 11px;">Tổng: ${tongDonTrongNgay} đơn</span>`;
            dateWrapper.appendChild(dateHeader);

            Object.keys(danhSachXe).forEach((phuongTien) => {
                const danhSachChuyenCuaXe = danhSachXe[phuongTien];
                const cacChuyenDaSapXep = Object.keys(danhSachChuyenCuaXe).sort((a, b) => Number(a) - Number(b));

                cacChuyenDaSapXep.forEach((soChuyen) => {
                    const danhSachDonTrongChuyen = danhSachChuyenCuaXe[soChuyen];

                    const vehicleWrapper = document.createElement('div');
                    vehicleWrapper.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px; margin-left: 8px;';

                    const vehicleHeader = document.createElement('div');
                    vehicleHeader.style.cssText = 'background: #e2e8f0; color: #1e293b; padding: 5px 10px; border-radius: 5px; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
                    vehicleHeader.innerHTML = `<span>🚛 Xe: <strong style="color: #0284c7;">${phuongTien}</strong> — <span style="color: #d97706;">Chuyến thứ ${soChuyen}</span></span> <span style="background: #cbd5e1; padding: 1px 6px; border-radius: 8px; font-size: 10px; color: #334155;">${danhSachDonTrongChuyen.length} đơn</span>`;
                    vehicleWrapper.appendChild(vehicleHeader);

                    danhSachDonTrongChuyen.forEach((data) => {
                        const maPhieu = data.maPhieu || data.id;
                        const doiTuong = data.doiTuong || 'Chưa xác định';
                        const taiXe = data.taiXe || 'Chưa có TX';
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
                                <span>TX: <strong>${taiXe}</strong></span>
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

                        vehicleWrapper.appendChild(cardItem);
                    });

                    dateWrapper.appendChild(vehicleWrapper);
                });
            });

            container.appendChild(dateWrapper);
        });

    } catch (error) {
        console.error("Lỗi tải lịch sử vận chuyển: ", error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 13px;">Lỗi tải dữ liệu lịch sử vận chuyển!</div>';
    }
};

// Khởi tạo sự kiện: Ban đầu KHÔNG TẢI GÌ, chỉ tải khi bấm nút
document.addEventListener('DOMContentLoaded', function() {
    const inputThangVC = document.getElementById('thangVanChuyen');
    const inputPhuongTien = document.getElementById('filterPhuongTien');
    
    // Tìm hoặc tự động tạo nút "Tải dữ liệu" ngay cạnh ô chọn tháng nếu chưa có trên HTML
    let btnTaiDuLieu = document.getElementById('btnTaiLichSuVC');
    if (!btnTaiDuLieu && inputThangVC) {
        btnTaiDuLieu = document.createElement('button');
        btnTaiDuLieu.id = 'btnTaiLichSuVC';
        btnTaiDuLieu.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Tải dữ liệu';
        btnTaiDuLieu.style.cssText = 'background: #0284c7; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; margin-left: 8px;';
        inputThangVC.parentNode.insertBefore(btnTaiDuLieu, inputThangVC.nextSibling);
    }

    if (inputThangVC) {
        // Gán tháng hiện tại làm mặc định trên ô input (nhưng không gọi hàm tải tự động)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        if (!inputThangVC.value) {
            inputThangVC.value = `${year}-${month}`;
        }

        // Đặt trạng thái ban đầu cho khung danh sách
        const container = document.getElementById('danhSachLichSuVanChuyen');
        if (container && container.innerHTML.trim() === "") {
            container.innerHTML = '<div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 13px;">Vui lòng chọn tháng và bấm nút <b>"Tải dữ liệu"</b> để xem lịch sử vận chuyển.</div>';
        }

        // Khi bấm nút "Tải dữ liệu" mới thực hiện gọi lên Firebase
        if (btnTaiDuLieu) {
            btnTaiDuLieu.onclick = function() {
                if (inputThangVC.value) {
                    const [y, m] = inputThangVC.value.split('-');
                    taiLichSuVanChuyen(m, y, inputPhuongTien ? inputPhuongTien.value : "");
                }
            };
        }
    }

    // Sự kiện gõ tìm kiếm theo biển số xe (chỉ lọc trên dữ liệu đang hiển thị hoặc tự load nếu đã tải)
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
