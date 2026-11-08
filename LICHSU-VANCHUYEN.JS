// VANCHUYEN.JS - Quản lý lịch sử vận chuyển: Gọn gàng, tối ưu tốc độ
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;

function chuanHoaNgay(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return "Chưa xác định ngày";
    return ngayStr.trim().split(" ")[0];
}

function layNgayGomNhom(data) {
    let rawDate = data.batDauGiaoHang || data.ketThucGiaoHang || data.ngayxuatKho || "";
    return chuanHoaNgay(rawDate);
}

function layMauGiaoDienXe(phuongTien) {
    const xe = phuongTien ? phuongTien.trim().toUpperCase() : "";
    if (xe.includes("06126")) {
        return { bgHeader: '#eff6ff', border: '#bfdbfe', textHeader: '#1e40af', badgeBg: '#dbeafe', tagColor: '#2563eb' };
    } else if (xe.includes("12290")) {
        return { bgHeader: '#f0fdf4', border: '#bbf7d0', textHeader: '#166534', badgeBg: '#dcfce7', tagColor: '#16a34a' };
    } else if (xe.includes("02591")) {
        return { bgHeader: '#fef2f2', border: '#fecaca', textHeader: '#991b1b', badgeBg: '#fee2e2', tagColor: '#ef4444' };
    } else if (xe === "XE MÁY" || !phuongTien || phuongTien.trim() === "") {
        return { bgHeader: '#fffbeb', border: '#fde68a', textHeader: '#92400e', badgeBg: '#fef3c7', tagColor: '#d97706' };
    }
    return { bgHeader: '#f8fafc', border: '#e2e8f0', textHeader: '#1e293b', badgeBg: '#e2e8f0', tagColor: '#0284c7' };
}

window.taiLichSuVanChuyen = async function(thangChon, namChon, bienSoTimKiem = "") {
    const container = document.getElementById('danhSachLichSuVanChuyen');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const q = query(collection(db, "TUYENDUONG"), where("nam", "==", parseInt(namChon, 10)), where("thang", "==", parseInt(thangChon, 10)));
        const snapshot = await getDocs(q);
        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không có dữ liệu tháng ${thangChon}/${namChon}.</div>`;
            return;
        }

        let listData = [];
        snapshot.forEach(docSnap => listData.push({ id: docSnap.id, ...docSnap.data(), _ngayGom: layNgayGomNhom(docSnap.data()) }));
        listData.sort((a, b) => b._ngayGom.localeCompare(a._ngayGom));

        let groupedData = {}, countHienThi = 0;

        listData.forEach(data => {
            const coXe = data.phuongTien && data.phuongTien.trim() !== "";
            const nhomKey = coXe ? data.phuongTien.trim() : "Xe máy";

            if (bienSoTimKiem && !nhomKey.toLowerCase().includes(bienSoTimKiem.toLowerCase().trim())) return;

            countHienThi++;
            const ngayKey = data._ngayGom;
            if (!groupedData[ngayKey]) groupedData[ngayKey] = {};

            if (coXe) {
                const soChuyen = data.chuyen || 1;
                const pKey = `XE_${nhomKey}`;
                if (!groupedData[ngayKey][pKey]) groupedData[ngayKey][pKey] = { type: 'xe', name: nhomKey, chuyen: {} };
                if (!groupedData[ngayKey][pKey].chuyen[soChuyen]) groupedData[ngayKey][pKey].chuyen[soChuyen] = [];
                groupedData[ngayKey][pKey].chuyen[soChuyen].push(data);
            } else {
                if (!groupedData[ngayKey]['XE_MAY']) groupedData[ngayKey]['XE_MAY'] = { type: 'xe_may', name: 'Xe máy', don: [] };
                groupedData[ngayKey]['XE_MAY'].don.push(data);
            }
        });

        if (countHienThi === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không tìm thấy dữ liệu khớp phương tiện.</div>';
            return;
        }

        Object.keys(groupedData).forEach(ngay => {
            const danhSachNhom = groupedData[ngay];
            const dateWrapper = document.createElement('div');
            dateWrapper.style.cssText = 'margin-bottom: 20px;';

            let tongDon = 0, tongTai = 0, tongDT = 0;
            Object.values(danhSachNhom).forEach(n => {
                const items = n.type === 'xe' ? Object.values(n.chuyen).flat() : n.don;
                tongDon += items.length;
                items.forEach(d => {
                    if (d.tTai) tongTai += Number(d.tTai) || 0;
                    if (d.thanhTien) tongDT += Number(d.thanhTien) || 0;
                });
            });

            dateWrapper.innerHTML = `
                <div style="background: #0284c7; color: #fff; padding: 8px 12px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <span>📅 ${ngay}</span> 
                    <div style="display: flex; gap: 6px;">
                        <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">Tải: ${tongTai.toLocaleString('vi-VN')} kg</span>
                        <span style="background: rgba(16,185,129,0.3); padding: 2px 6px; border-radius: 8px; font-size: 11px;">DT: ${tongDT.toLocaleString('vi-VN')} đ</span>
                        <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">${tongDon} đơn</span>
                    </div>
                </div>
            `;

            Object.values(danhSachNhom).forEach(nhom => {
                const isXe = nhom.type === 'xe';
                const mau = layMauGiaoDienXe(isXe ? nhom.name : "Xe máy");

                if (isXe) {
                    Object.keys(nhom.chuyen).sort((a, b) => a - b).forEach(soChuyen => {
                        const donList = nhom.chuyen[soChuyen];
                        const wrap = document.createElement('div');
                        wrap.style.cssText = `background: ${mau.bgHeader}; border: 1px solid ${mau.border}; border-radius: 8px; padding: 10px; margin-bottom: 10px; margin-left: 8px;`;
                        wrap.innerHTML = `<div style="background: ${mau.badgeBg}; color: ${mau.textHeader}; padding: 5px 10px; border-radius: 5px; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between;"><span>🚛 Xe: <strong style="color: ${mau.tagColor};">${nhom.name}</strong> — Chuyến ${soChuyen}</span><span>${donList.length} đơn</span></div>`;
                        donList.forEach(d => renderCard(d, wrap, false));
                        dateWrapper.appendChild(wrap);
                    });
                } else {
                    const wrap = document.createElement('div');
                    wrap.style.cssText = `background: ${mau.bgHeader}; border: 1px solid ${mau.border}; border-radius: 8px; padding: 10px; margin-bottom: 10px; margin-left: 8px;`;
                    wrap.innerHTML = `<div style="background: ${mau.badgeBg}; color: ${mau.textHeader}; padding: 5px 10px; border-radius: 5px; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between;"><span>🏍️ Phương tiện: <strong style="color: ${mau.tagColor};">${nhom.name}</strong></span><span>${nhom.don.length} đơn</span></div>`;
                    nhom.don.forEach(d => renderCard(d, wrap, true));
                    dateWrapper.appendChild(wrap);
                }
            });
            container.appendChild(dateWrapper);
        });
    } catch (e) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 13px;">Lỗi tải dữ liệu!</div>';
    }
};

function renderCard(data, parent, isXeMay) {
    const nhanVien = isXeMay ? (data.giaoNhan || 'Chưa có tên') : (data.taiXe || 'Chưa có TX');
    const label = isXeMay ? 'GN' : 'TX';
    const tien = data.thanhTien ? Number(data.thanhTien).toLocaleString('vi-VN') + ' đ' : '0 đ';
    const tai = data.tTai ? Number(data.tTai).toLocaleString('vi-VN') + ' kg' : '0 kg';

    const card = document.createElement('div');
    card.style.cssText = 'background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;';
    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 12px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px; margin-bottom: 4px;">
            <strong>${data.maPhieu || data.id}</strong> <span style="font-size: 10px; color: #64748b;">${data.khoXuat || ''}</span>
        </div>
        <div style="font-weight: 600; font-size: 12px; color: #1e293b; margin-bottom: 3px;">🏢 ${data.doiTuong || '---'}</div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #475569; margin-bottom: 3px;">
            <span>${label}: <strong>${nhanVien}</strong></span><span>📍 ${data.vungTieuThu || data.thanhPho || ''}</span>
        </div>
        <div style="font-size: 11px; background: #f1f5f9; padding: 4px 6px; border-radius: 4px; display: flex; justify-content: space-between;">
            <span>Tải: <strong style="color: #0284c7;">${tai}</strong> | Tiền: <strong style="color: #16a34a;">${tien}</strong></span>
            <span style="color: ${data.duyet === 'Đã giao hàng' ? '#16a34a' : '#64748b'};">${data.duyet || ''}</span>
        </div>
    `;
    parent.appendChild(card);
}
