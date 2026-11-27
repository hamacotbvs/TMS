import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const nguongNoiOTheoXe = new Map();
let daTaiNoiO = false;

function dinhDangTienVnd(soTien) {
    return `${(Number(soTien) || 0).toLocaleString("vi-VN")} đ`;
}

function chuanHoaNgay(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return "";
    return ngayStr.trim().split(" ")[0];
}

function coDuLieuGiaoHang(data) {
    if (!data) return false;
    const hasBD = data.batDauGiaoHang !== undefined && data.batDauGiaoHang !== null && String(data.batDauGiaoHang).trim() !== "";
    const hasKT = data.ketThucGiaoHang !== undefined && data.ketThucGiaoHang !== null && String(data.ketThucGiaoHang).trim() !== "";
    const hasKmBD = data.kmBatDauGiaoHang !== undefined && data.kmBatDauGiaoHang !== null && String(data.kmBatDauGiaoHang).trim() !== "";
    const hasKmKT = data.kmKetThucGiaoHang !== undefined && data.kmKetThucGiaoHang !== null && String(data.kmKetThucGiaoHang).trim() !== "";
    return hasBD || hasKT || hasKmBD || hasKmKT;
}

function laDonThuocNhomDaGiao(data) {
    const duyetVal = data && data.duyet ? String(data.duyet).trim() : "";
    if (duyetVal === "Đã giao hàng" || duyetVal === "Đang giao hàng") {
        return true;
    }
    if (duyetVal === "Đã xuất kho" && coDuLieuGiaoHang(data)) {
        return true;
    }
    return false;
}

function layNgayGomNhom(data) {
    let bd = data.batDauGiaoHang ? String(data.batDauGiaoHang).trim() : "";
    let kt = data.ketThucGiaoHang ? String(data.ketThucGiaoHang).trim() : "";
    let xk = data.ngayxuatKho ? String(data.ngayxuatKho).trim() : "";
    let xl = data.ngayXuLy ? String(data.ngayXuLy).trim() : "";
    let rawDate = bd !== "" ? bd : (kt !== "" ? kt : (xk !== "" ? xk : xl));
    let ngayBase = chuanHoaNgay(rawDate);
    return ngayBase || chuanHoaNgay(data.ngayThangNam) || "Chưa xác định";
}

function laySoAnToan(val) {
    if (val === undefined || val === null || String(val).trim() === "") return NaN;
    const num = Number(val);
    return Number.isNaN(num) ? NaN : num;
}

export async function taiNguongNoiOPhuongTien(batBuocTaiLai = false) {
    if (daTaiNoiO && !batBuocTaiLai) {
        return nguongNoiOTheoXe;
    }
    const db = window.db;
    if (!db) return nguongNoiOTheoXe;

    try {
        const snap = await getDocs(collection(db, "PHUONGTIEN"));
        nguongNoiOTheoXe.clear();
        snap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const bienSo = String(data.bienSo || docSnap.id || "").trim();
            const noiO = laySoAnToan(data.noiO);
            if (bienSo) {
                nguongNoiOTheoXe.set(bienSo, !Number.isNaN(noiO) ? noiO : 60);
            }
        });
        daTaiNoiO = true;
    } catch (err) {
        console.error("Lỗi tải PHUONGTIEN cho phí tỉnh:", err);
    }

    return nguongNoiOTheoXe;
}

export function layNguongNoiOCuaXe(bienSo) {
    const key = String(bienSo || "").trim();
    if (key && nguongNoiOTheoXe.has(key)) {
        return nguongNoiOTheoXe.get(key);
    }
    return 60;
}

async function layDuLieuTuyenDuongThang(thangNum, namNum) {
    if (Array.isArray(window._cachedVanChuyenData)) {
        const khopThang = window._cachedVanChuyenData.filter((d) => {
            const t = Number(d.thang);
            const n = Number(d.nam);
            if (t && n) return t === thangNum && n === namNum;
            const ngayStr = String(d.ngayThangNam || d._ngayGom || "");
            return ngayStr.includes(`/${String(thangNum).padStart(2, "0")}/${namNum}`) || ngayStr.startsWith(`${namNum}-${String(thangNum).padStart(2, "0")}`);
        });
        if (khopThang.length > 0) {
            return khopThang;
        }
    }

    const db = window.db;
    if (!db) return [];

    const q = query(
        collection(db, "TUYENDUONG"),
        where("nam", "==", namNum),
        where("thang", "==", thangNum)
    );

    const [querySnapshot, dieuChinhSnapshot] = await Promise.all([
        getDocs(q),
        getDocs(collection(db, "TUYENDUONG-DIEUCHINH"))
    ]);

    const dieuChinhMap = {};
    dieuChinhSnapshot.forEach((dcSnap) => {
        const dcData = dcSnap.data() || {};
        dieuChinhMap[dcSnap.id] = dcData;
        const keyByMaPhieu = dcData.maPhieu ? String(dcData.maPhieu).trim() : "";
        if (keyByMaPhieu) {
            dieuChinhMap[`MP___${keyByMaPhieu}`] = dcData;
        }
    });

    const listData = [];
    querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const maPhieuVal = (data.maPhieu && String(data.maPhieu).trim() !== "")
            ? String(data.maPhieu).trim()
            : docSnap.id;
        const dc = dieuChinhMap[docSnap.id] || dieuChinhMap[`MP___${maPhieuVal}`] || null;

        const mergedData = {
            ...data,
            maPhieu: maPhieuVal,
            ...(dc ? {
                kmBatDauGiaoHang: dc.kmBatDauGiaoHang !== undefined ? dc.kmBatDauGiaoHang : data.kmBatDauGiaoHang,
                kmKetThucGiaoHang: dc.kmKetThucGiaoHang !== undefined ? dc.kmKetThucGiaoHang : data.kmKetThucGiaoHang,
                batDauGiaoHang: dc.batDauGiaoHang !== undefined ? dc.batDauGiaoHang : data.batDauGiaoHang,
                ketThucGiaoHang: dc.ketThucGiaoHang !== undefined ? dc.ketThucGiaoHang : data.ketThucGiaoHang,
                phuongTien: dc.phuongTien !== undefined ? dc.phuongTien : data.phuongTien,
                taiXe: dc.taiXe !== undefined ? dc.taiXe : data.taiXe
            } : {})
        };

        listData.push({
            id: docSnap.id,
            ...mergedData,
            _ngayGom: layNgayGomNhom(mergedData)
        });
    });

    return listData;
}

export function tongHopChuyenVaKmDiVe(rawList = []) {
    const daGiaoDocs = rawList.filter((d) => {
        if (!d || !laDonThuocNhomDaGiao(d)) return false;
        const pt = String(d.phuongTien || "").trim();
        return pt !== "" && pt.toLowerCase() !== "xe máy";
    });

    const mapChuyen = {};
    daGiaoDocs.forEach((data) => {
        const phuongTien = String(data.phuongTien || "").trim();
        const soChuyen = (data.chuyenVtracking !== undefined && data.chuyenVtracking !== null && String(data.chuyenVtracking).trim() !== "")
            ? data.chuyenVtracking
            : 1;
        const ngayGom = data._ngayGom || layNgayGomNhom(data);
        const tripKey = `XE_${phuongTien}_CHUYEN_${soChuyen}_${ngayGom}`;

        if (!mapChuyen[tripKey]) {
            mapChuyen[tripKey] = {
                tripKey,
                phuongTien,
                soChuyen,
                ngay: ngayGom,
                dons: []
            };
        }
        mapChuyen[tripKey].dons.push(data);
    });

    const trips = Object.values(mapChuyen).sort((a, b) => {
        const timeA = a.dons[0]?.batDauGiaoHang || a.dons[0]?.ngayxuatKho || a.dons[0]?.ngayXuLy || "";
        const timeB = b.dons[0]?.batDauGiaoHang || b.dons[0]?.ngayxuatKho || b.dons[0]?.ngayXuLy || "";
        return String(timeA).localeCompare(String(timeB));
    });

    for (let idx = 0; idx < trips.length; idx++) {
        const trip = trips[idx];
        trip.dons.sort((a, b) => String(a.ketThucGiaoHang || "").localeCompare(String(b.ketThucGiaoHang || "")));

        let kmDi = 0;
        let kmVe = 0;

        if (trip.dons.length > 0) {
            const donDau = trip.dons[0];
            const donCuoi = trip.dons[trip.dons.length - 1];
            const kmBDDau = laySoAnToan(donDau.kmBatDauGiaoHang);
            const kmKTCuoi = laySoAnToan(donCuoi.kmKetThucGiaoHang);

            if (!Number.isNaN(kmBDDau) && !Number.isNaN(kmKTCuoi)) {
                kmDi = kmKTCuoi - kmBDDau;
            }

            if (!Number.isNaN(kmKTCuoi)) {
                for (let nextIdx = idx + 1; nextIdx < trips.length; nextIdx++) {
                    const nextTrip = trips[nextIdx];
                    if (nextTrip.phuongTien === trip.phuongTien && nextTrip.dons.length > 0) {
                        const kmBDChuyenSau = laySoAnToan(nextTrip.dons[0].kmBatDauGiaoHang);
                        if (!Number.isNaN(kmBDChuyenSau)) {
                            kmVe = kmBDChuyenSau - kmKTCuoi;
                        }
                        break;
                    }
                }
            }
        }

        let khoiLuongKg = 0;
        const dsKhach = [];
        const dsTaiXe = new Set();
        const dsGiaoNhan = new Set();

        trip.dons.forEach((don) => {
            const taiDon = laySoAnToan(don.tTai);
            if (!Number.isNaN(taiDon)) {
                khoiLuongKg += taiDon;
            } else {
                const sonKg = laySoAnToan(don.sonTbvsKg);
                const botKg = laySoAnToan(don.botTretKg);
                khoiLuongKg += (Number.isNaN(sonKg) ? 0 : sonKg) + (Number.isNaN(botKg) ? 0 : botKg);
            }

            if (don.doiTuong && !dsKhach.includes(String(don.doiTuong).trim())) {
                dsKhach.push(String(don.doiTuong).trim());
            }
            if (don.taiXe && String(don.taiXe).trim() !== "") {
                dsTaiXe.add(String(don.taiXe).trim());
            }
            if (don.giaoNhan && String(don.giaoNhan).trim() !== "") {
                dsGiaoNhan.add(String(don.giaoNhan).trim());
            }
        });

        trip.kmDi = kmDi;
        trip.kmVe = kmVe;
        trip.kmDiVe = kmDi + kmVe;
        trip.khoiLuongKg = khoiLuongKg;
        trip.tenChuyen = dsKhach.join(", ") || `Chuyến ${trip.soChuyen}`;
        trip.taiXe = Array.from(dsTaiXe).join(", ");
        trip.giaoNhan = Array.from(dsGiaoNhan).join(", ");
    }

    return trips;
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
    const kmDiVe = Number(chuyen.kmDiVe) || 0;
    const khoiLuongKg = Number(chuyen.khoiLuongKg) || 0;
    const nguongNoiO = layNguongNoiOCuaXe(chuyen.phuongTien);
    const phiTaiXe = tinhPhiTinhTaiXe(kmDiVe, nguongNoiO);
    const phiGiaoNhan = tinhPhiTinhGiaoNhan(khoiLuongKg, kmDiVe);

    return {
        nguongNoiO,
        kmDiVe,
        khoiLuongKg,
        phiTaiXe,
        phiGiaoNhan,
        tongPhiTinh: phiTaiXe + phiGiaoNhan
    };
}

export async function xemLaiDanhSachPhiTinh(batBuocTaiLai = false) {
    const dsEl = document.getElementById("danhSachXemPhiTinh");
    const tongEl = document.getElementById("tongTienXemPhiTinh");
    const txEl = document.getElementById("tongPhiTinhTaiXe");
    const gnEl = document.getElementById("tongPhiTinhGiaoNhan");
    if (!dsEl) return;

    const thangVal = (document.getElementById("thangXemPhiTinh")?.value || "").trim();
    const xeVal = (document.getElementById("filterXeXemPhiTinh")?.value || "").trim();

    if (!thangVal || !/^\d{4}-\d{2}$/.test(thangVal)) {
        dsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:14px;">Vui lòng chọn tháng năm để tính phí tỉnh.</div>`;
        return;
    }

    dsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:14px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tính phí tỉnh từ TUYENDUONG & PHUONGTIEN...</div>`;

    const [namStr, thangStr] = thangVal.split("-");
    const namNum = parseInt(namStr, 10);
    const thangNum = parseInt(thangStr, 10);

    try {
        await taiNguongNoiOPhuongTien(batBuocTaiLai);
        const rawList = await layDuLieuTuyenDuongThang(thangNum, namNum);
        const allTrips = tongHopChuyenVaKmDiVe(rawList);

        const danhSachLoc = allTrips.filter((trip) => {
            if (!xeVal) return true;
            return String(trip.phuongTien || "").trim() === xeVal;
        });

        let tongTx = 0;
        let tongGn = 0;

        if (!danhSachLoc.length) {
            if (tongEl) tongEl.textContent = dinhDangTienVnd(0);
            if (txEl) txEl.textContent = dinhDangTienVnd(0);
            if (gnEl) gnEl.textContent = dinhDangTienVnd(0);
            dsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:14px;">Không có chuyến phù hợp trong tháng ${thangStr}/${namNum}.</div>`;
            return;
        }

        const htmlCards = danhSachLoc.map((trip) => {
            const kq = tinhPhiTinhChuyen(trip);
            tongTx += kq.phiTaiXe;
            tongGn += kq.phiGiaoNhan;

            return `
                <div class="the-phi-tinh-item">
                    <div class="the-phi-tinh-hang-tren">
                        <span>${trip.phuongTien} • Chuyến ${trip.soChuyen} (${trip.ngay})</span>
                        <span style="color:#7c3aed;">${dinhDangTienVnd(kq.tongPhiTinh)}</span>
                    </div>
                    <div class="the-phi-tinh-chi-tiet">
                        <span>⚖️ ${kq.khoiLuongKg.toLocaleString("vi-VN")} kg | 🛣️ Đi về: ${kq.kmDiVe.toLocaleString("vi-VN")} km (Đi ${trip.kmDi} + Về ${trip.kmVe}, noiO: ${kq.nguongNoiO} km)</span>
                        <span>TX: <strong>${dinhDangTienVnd(kq.phiTaiXe)}</strong> • GN: <strong>${dinhDangTienVnd(kq.phiGiaoNhan)}</strong></span>
                    </div>
                    <div style="font-size:10.5px; color:#64748b;">
                        ${trip.taiXe ? `TX: ${trip.taiXe}` : ""}${trip.taiXe && trip.giaoNhan ? " • " : ""}${trip.giaoNhan ? `GN: ${trip.giaoNhan}` : ""}
                    </div>
                </div>
            `;
        }).join("");

        if (tongEl) tongEl.textContent = dinhDangTienVnd(tongTx + tongGn);
        if (txEl) txEl.textContent = dinhDangTienVnd(tongTx);
        if (gnEl) gnEl.textContent = dinhDangTienVnd(tongGn);
        dsEl.innerHTML = htmlCards;
    } catch (err) {
        console.error("Lỗi tính phí tỉnh:", err);
        dsEl.innerHTML = `<div style="text-align:center; color:#ef4444; font-size:12px; padding:14px;">Lỗi tải dữ liệu tính phí tỉnh!</div>`;
    }
}

window.taiNguongNoiOPhuongTien = taiNguongNoiOPhuongTien;
window.layNguongNoiOCuaXe = layNguongNoiOCuaXe;
window.tongHopChuyenVaKmDiVe = tongHopChuyenVaKmDiVe;
window.tinhPhiTinhTaiXe = tinhPhiTinhTaiXe;
window.tinhPhiTinhGiaoNhan = tinhPhiTinhGiaoNhan;
window.tinhPhiTinhChuyen = tinhPhiTinhChuyen;
window.xemLaiDanhSachPhiTinh = () => xemLaiDanhSachPhiTinh(true);

document.addEventListener("DOMContentLoaded", () => {
    const thangVc = document.getElementById("thangVanChuyen");
    const thangPt = document.getElementById("thangXemPhiTinh");
    if (thangPt && thangVc && thangVc.value && !thangPt.value) {
        thangPt.value = thangVc.value;
    }
    if (thangPt && thangPt.value) {
        xemLaiDanhSachPhiTinh(false);
    }
});
