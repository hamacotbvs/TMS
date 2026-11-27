function dinhDangTienVnd(soTien) {
    return `${(Number(soTien) || 0).toLocaleString('vi-VN')} đ`;
}

export function tinhPhiTinhTaiXe(coDiTinh = true) {
    return coDiTinh ? 30000 : 0;
}

export function tinhPhiTinhGiaoNhan(khoiLuongKg, kmDiVe, coDiTinh = true) {
    if (!coDiTinh) return 0;
    const kg = Number(khoiLuongKg) || 0;
    const km = Number(kmDiVe) || 0;
    if (kg >= 5000) {
        return km > 120 ? 60000 : 40000;
    }
    return km > 120 ? 45000 : 35000;
}

export function tinhPhiTinhChuyen(chuyen = {}) {
    const coDiTinh = chuyen.diTinh !== false && chuyen.isTinh !== false;
    const phiTaiXe = tinhPhiTinhTaiXe(coDiTinh);
    const phiGiaoNhan = tinhPhiTinhGiaoNhan(
        chuyen.khoiLuongKg ?? chuyen.trongLuong ?? chuyen.tongKg ?? 0,
        chuyen.kmDiVe ?? chuyen.soKmDiVe ?? chuyen.km ?? 0,
        coDiTinh
    );
    return {
        coDiTinh,
        phiTaiXe,
        phiGiaoNhan,
        tongPhiTinh: phiTaiXe + phiGiaoNhan
    };
}

export function xemLaiDanhSachPhiTinh() {
    const dsEl = document.getElementById('danhSachXemPhiTinh');
    const tongEl = document.getElementById('tongTienXemPhiTinh');
    const txEl = document.getElementById('tongPhiTinhTaiXe');
    const gnEl = document.getElementById('tongPhiTinhGiaoNhan');
    if (!dsEl) return;

    const thangVal = (document.getElementById('thangXemPhiTinh')?.value || '').trim();
    const xeVal = (document.getElementById('filterXeXemPhiTinh')?.value || '').trim();
    const nguonChuyen = Array.isArray(window.danhSachChuyenVanChuyen)
        ? window.danhSachChuyenVanChuyen
        : (Array.isArray(window.duLieuVanChuyen) ? window.duLieuVanChuyen : []);

    const danhSachLoc = nguonChuyen.filter((item) => {
        if (!item) return false;
        const ngayStr = String(item.ngay || item.ngayChuyen || item.date || '');
        const bienSo = String(item.bienSo || item.phuongTien || item.xe || '');
        const khopThang = !thangVal || ngayStr.startsWith(thangVal);
        const khopXe = !xeVal || bienSo === xeVal;
        return khopThang && khopXe;
    });

    let tongTx = 0;
    let tongGn = 0;

    if (!danhSachLoc.length) {
        if (tongEl) tongEl.textContent = dinhDangTienVnd(0);
        if (txEl) txEl.textContent = dinhDangTienVnd(0);
        if (gnEl) gnEl.textContent = dinhDangTienVnd(0);
        dsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:14px;">Chưa có dữ liệu chuyến đi tỉnh cho bộ lọc hiện tại${thangVal ? ` (${thangVal})` : ''}.</div>`;
        return;
    }

    const htmlCards = danhSachLoc.map((item) => {
        const kq = tinhPhiTinhChuyen(item);
        tongTx += kq.phiTaiXe;
        tongGn += kq.phiGiaoNhan;

        const tenChuyen = item.maChuyen || item.tenChuyen || item.tuyen || item.id || 'Chuyến đi tỉnh';
        const bienSo = item.bienSo || item.phuongTien || '—';
        const ngay = item.ngay || item.ngayChuyen || '—';
        const kg = Number(item.khoiLuongKg ?? item.trongLuong ?? item.tongKg ?? 0);
        const km = Number(item.kmDiVe ?? item.soKmDiVe ?? item.km ?? 0);

        return `
            <div class="the-phi-tinh-item">
                <div class="the-phi-tinh-hang-tren">
                    <span>${bienSo} • ${tenChuyen}</span>
                    <span style="color:#7c3aed;">${dinhDangTienVnd(kq.tongPhiTinh)}</span>
                </div>
                <div class="the-phi-tinh-chi-tiet">
                    <span>📅 ${ngay} | ⚖️ ${kg.toLocaleString('vi-VN')} kg | 🛣️ ${km.toLocaleString('vi-VN')} km</span>
                    <span>TX: <strong>${dinhDangTienVnd(kq.phiTaiXe)}</strong> • GN: <strong>${dinhDangTienVnd(kq.phiGiaoNhan)}</strong></span>
                </div>
            </div>
        `;
    }).join('');

    if (tongEl) tongEl.textContent = dinhDangTienVnd(tongTx + tongGn);
    if (txEl) txEl.textContent = dinhDangTienVnd(tongTx);
    if (gnEl) gnEl.textContent = dinhDangTienVnd(tongGn);
    dsEl.innerHTML = htmlCards;
}

window.tinhPhiTinhTaiXe = tinhPhiTinhTaiXe;
window.tinhPhiTinhGiaoNhan = tinhPhiTinhGiaoNhan;
window.tinhPhiTinhChuyen = tinhPhiTinhChuyen;
window.xemLaiDanhSachPhiTinh = xemLaiDanhSachPhiTinh;

document.addEventListener('DOMContentLoaded', () => {
    const thangVc = document.getElementById('thangVanChuyen');
    const thangPt = document.getElementById('thangXemPhiTinh');
    if (thangPt && thangVc && thangVc.value && !thangPt.value) {
        thangPt.value = thangVc.value;
    }
    xemLaiDanhSachPhiTinh();
});
