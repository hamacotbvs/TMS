// Thay vì dùng orderBy trong query (gây lỗi Index), ta bỏ đi và sắp xếp bằng JS
const q = query(
    collection(db, "TUYENDUONG"),
    where("thang", "==", thangNum),
    where("nam", "==", namNum)
);

const querySnapshot = await getDocs(q);
container.innerHTML = '';

if (querySnapshot.empty) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không có chứng từ vận chuyển nào trong tháng này.</div>';
    return;
}

// Chuyển dữ liệu thành mảng để sắp xếp ngày xuất kho giảm dần ngay trên trình duyệt
let listData = [];
querySnapshot.forEach((docSnap) => {
    listData.push({ id: docSnap.id, ...docSnap.data() });
});

// Sắp xếp mới nhất lên đầu dựa theo ngày xuất kho
listData.sort((a, b) => {
    let dateA = a.ngayxuatKho || '';
    let dateB = b.ngayxuatKho || '';
    return dateB.localeCompare(dateA);
});

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

    // Tạo thẻ Card hiển thị từng chuyến
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
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không tìm thấy chuyến xe nào khớp với biển số bạn nhập trong tháng này.</div>';
}
