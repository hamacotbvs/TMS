import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const nguongNoiOTheoXe = new Map();
let daTaiPhuongTien = false;

function dinhDangTienVnd(soTien) {
    return `${(Number(soTien) || 0).toLocaleString("vi-VN")} đ`;
}

function layGiaTriSo(obj, danhSachKey, macDinh = 0) {
    for (const key of danhSachKey) {
        if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
            const so = Number(String(obj[key]).replace(/[^\d.-]/g, ""));
            if (!Number.isNaN(so)) return so;
        }
    }
    return macDinh;
}

function layBienSoChuyen(chuyen = {}) {
    return String(
        chuyen.bienSo ||
        chuyen.phuongTien ||
        chuyen.soXe ||
        chuyen.xe ||
        ""
    ).trim();
}

export async function taiNguongNoiOPhuongTien(batBuocTaiLai = false) {
    if (daTaiPhuongTien && !batBuocTaiLai) {
        return nguongNoiOTheoXe;
    }
    if (!window.db) {
        return nguongNoiOTheoXe;
    }

    try {
        const snap = await getDocs(collection(window.db, "PHUONGTIEN"));
        nguongNoiOTheoXe.clear();
        snap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const bienSo = String(
                data.bienSo ||
                data.phuongTien ||
                data.soXe ||
                docSnap.id ||
                ""
            ).trim();
            const noiO = layGiaTriSo(data, ["noiO", "NoiO", "nguongNoiO", "kmNoiO"], 60);
            if (bienSo) {
                nguongNoiOTheoXe.set(bienSo, noiO);
            }
        });
        daTaiPhuongTien = true;
    } catch (err) {
        console.error("Lỗi tải PHUONGTIEN cho phí tỉnh:", err);
    }

    return nguongNoiOTheoXe;
}

export function layNguongNoiOCuaXe(bienSo, chuyen = {}) {
    const bienSoChuan = String(bienSo || layBienSoChuyen(chuyen)).trim();
    if (bienSoChuan && nguongNoiOTheoXe.has(bienSoChuan)) {
        return nguongNoiOTheoXe.get(bienSoChuan);
    }
    return layGiaTriSo(chuyen, ["noiO", "NoiO", "nguongNoiO"], 60);
}

export function tinhPhiTinhTaiXe(kmDiVe, nguongNoiO = 60) {
    const km = Number(kmDiVe) || 0;
    const nguong = Number(nguongNoiO) || 60;
    return km > nguong ? 30000 : 0;
}

export function tinhPhiTinhGiaoNhan(khoiLuongKg, kmDiVe) {
    const kg = Number(khoiLuongKg) || 0;
    const km = Number(kmDiVe) || 0;
    if (kg >= 5000) {
        return km > 120 ? 60000 : 40000;
    }
    return km > 120 ? 45000 : 35000;
}

export function tinhPhiTinhChuyen(chuyen = {}) {
    const bienSo = layBienSoChuyen(chuyen);
    const kmDiVe = layGiaTriSo(
        chuyen,
        ["kmDiVe", "soKmDiVe", "tongKm", "km", "quangDuongDiVe"],
        0
    );
    const khoiLuongKg = layGiaTriSo(
        chuyen,
        ["khoiLuongKg", "trongLuong", "tongKg", "sanLuong", "kg"],
        0
    );
    const nguongNoiO = layNguongNoiOCuaXe(bienSo, chuyen);
    const phiTaiXe = tinhPhiTinhTaiXe(kmDiVe, nguongNoiO);
    const phiGiaoNhan = tinhPhiTinhGiaoNhan(khoiLuongKg, kmDiVe);

    return {
        bienSo,
        kmDiVe,
        khoiLuongKg,
        nguongNoiO,
        coDiTinhTaiXe: kmDiVe > nguongNoiO,
        phiTaiXe,
        phiGiaoNhan,
        tongPhiTinh: phiTaiXe + phiGiaoNhan
    };
}

export async function xemLaiDanhSachPhiTinh() {
    const dsEl = document.getElementById("danhSachXemPhiTinh");
    const tongEl = document.getElementById("tongTienXemPhiTinh");
    const txEl = document.getElementById("tongPhiTinhTaiXe");
    const gnEl = document.getElementById("tongPhiTinhGiaoNhan");
    if (!dsEl) return;

    await taiNguongNoiOPhuongTien(false);

    const thangVal = (document.getElementById("thangXemPhiTinh")?.value || "").trim();
    const xeVal = (document.getElementById("filterXeXemPhiTinh")?.value || "").trim();
    const nguonChuyen = Array.isArray(window.danhSachChuyenVanChuyen)
        ? window.danhSachChuyenVanChuyen
        : (Array.isArray(window.duLieuVanChuyen) ? window.duLieuVanChuyen : []);

    const danhSachLoc = nguonChuyen.filter((item) => {
        if (!item) return false;
        const ngayStr = String(item.ngay || item.ngayChuyen || item.date || "");
        const bienSo = layBienSoChuyen(item);
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
        dsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:14px;">Chưa có dữ liệu chuyến cho bộ lọc hiện tại${thangVal ? ` (${thangVal})` : ""}.</div>`;
        return;
    }

    const htmlCards = danhSachLoc.map((item) => {
        const kq = tinhPhiTinhChuyen(item);
        tongTx += kq.phiTaiXe;
        tongGn += kq.phiGiaoNhan;

        const tenChuyen = item.maChuyen || item.tenChuyen || item.tuyen || item.id || "Chuyến";
        const bienSo = kq.bienSo || "—";
        const ngay = item.ngay || item.ngayChuyen || "—";

        return `
            <div class="the-phi-tinh-item">
                <div class="the-phi-tinh-hang-tren">
                    <span>${bienSo} • ${tenChuyen}</span>
                    <span style="color:#7c3aed;">${dinhDangTienVnd(kq.tongPhiTinh)}</span>
                </div>
                <div class="the-phi-tinh-chi-tiet">
                    <span>📅 ${ngay} | ⚖️ ${kq.khoiLuongKg.toLocaleString("vi-VN")} kg | 🛣️ ${kq.kmDiVe.toLocaleString("vi-VN")} km (noiO: ${kq.nguongNoiO} km)</span>
                    <span>TX: <strong>${dinhDangTienVnd(kq.phiTaiXe)}</strong> • GN: <strong>${dinhDangTienVnd(kq.phiGiaoNhan)}</strong></span>
                </div>
            </div>
        `;
    }).join("");

    if (tongEl) tongEl.textContent = dinhDangTienVnd(tongTx + tongGn);
    if (txEl) txEl.textContent = dinhDangTienVnd(tongTx);
    if (gnEl) gnEl.textContent = dinhDangTienVnd(tongGn);
    dsEl.innerHTML = htmlCards;
}

window.taiNguongNoiOPhuongTien = taiNguongNoiOPhuongTien;
window.layNguongNoiOCuaXe = layNguongNoiOCuaXe;
window.tinhPhiTinhTaiXe = tinhPhiTinhTaiXe;
window.tinhPhiTinhGiaoNhan = tinhPhiTinhGiaoNhan;
window.tinhPhiTinhChuyen = tinhPhiTinhChuyen;
window.xemLaiDanhSachPhiTinh = xemLaiDanhSachPhiTinh;

document.addEventListener("DOMContentLoaded", () => {
    const thangVc = document.getElementById("thangVanChuyen");
    const thangPt = document.getElementById("thangXemPhiTinh");
    if (thangPt && thangVc && thangVc.value && !thangPt.value) {
        thangPt.value = thangVc.value;
    }
    xemLaiDanhSachPhiTinh();
});
