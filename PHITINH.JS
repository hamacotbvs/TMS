import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const nguongNoiOTheoXe = new Map();
let daTaiNoiO = false;
let danhSachChuyenDaTinhHienTai = [];

function dinhDangTienVnd(soTien) {
    return `${(Number(soTien) || 0).toLocaleString("vi-VN")} đ`;
}

function dinhDangSoNguyenVN(soTien) {
    return (Number(soTien) || 0).toLocaleString("vi-VN");
}

function chuanHoaSoSanhTen(str) {
    if (!str || typeof str !== "string") return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function chuanHoaNgay(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return "";
    return ngayStr.trim().split(" ")[0];
}

function dinhDangNgayDdMmYyyy(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return "";
    const clean = ngayStr.trim().split(" ")[0];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const [y, m, d] = clean.split("-");
        return `${d}/${m}/${y}`;
    }
    return clean;
}

function layNgayCuoiThangDdMmYyyy(namNum, thangNum) {
    const lastDay = new Date(namNum, thangNum, 0).getDate();
    return `${String(lastDay).padStart(2, "0")}/${String(thangNum).padStart(2, "0")}/${namNum}`;
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

function layElementBoLocNhanVien() {
    return (
        document.getElementById("filterNhanVienXemPhiTinh") ||
        document.getElementById("filterNhanVienPhiTinh") ||
        document.getElementById("inputNhanVienPhiTinh") ||
        null
    );
}

function capNhatTuyChonNhanVien(allTrips = []) {
    const el = layElementBoLocNhanVien();
    if (!el || el.tagName !== "SELECT") return;

    const giaTriHienTai = el.value;
    const setTen = new Map();

    allTrips.forEach((trip) => {
        (trip.danhSachTaiXe || []).forEach((ten) => {
            const key = chuanHoaSoSanhTen(ten);
            if (key && !setTen.has(key)) setTen.set(key, ten.trim());
        });
        (trip.danhSachGiaoNhan || []).forEach((ten) => {
            const key = chuanHoaSoSanhTen(ten);
            if (key && !setTen.has(key)) setTen.set(key, ten.trim());
        });
    });

    const dsSapXep = Array.from(setTen.values()).sort((a, b) => a.localeCompare(b, "vi"));
    el.innerHTML = `<option value="">-- Tất cả nhân viên --</option>` +
        dsSapXep.map((ten) => `<option value="${ten.replace(/"/g, "&quot;")}">${ten}</option>`).join("");

    if (giaTriHienTai && Array.from(el.options).some((opt) => opt.value === giaTriHienTai)) {
        el.value = giaTriHienTai;
    }
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
        const dsTuyen = [];
        const dsTaiXe = new Map();
        const dsGiaoNhan = new Map();

        trip.dons.forEach((don) => {
            const taiDon = laySoAnToan(don.tTai);
            if (!Number.isNaN(taiDon)) {
                khoiLuongKg += taiDon;
            } else {
                const sonKg = laySoAnToan(don.sonTbvsKg);
                const botKg = laySoAnToan(don.botTretKg);
                khoiLuongKg += (Number.isNaN(sonKg) ? 0 : sonKg) + (Number.isNaN(botKg) ? 0 : botKg);
            }

            const khach = String(don.doiTuong || "").trim();
            if (khach && !dsKhach.includes(khach)) {
                dsKhach.push(khach);
            }

            const tuyen = String(don.vungTieuThu || don.thanhPho || don.phuongXa || don.doiTuong || "").trim();
            if (tuyen && !dsTuyen.includes(tuyen)) {
                dsTuyen.push(tuyen);
            }

            const tx = String(don.taiXe || "").trim();
            if (tx) {
                const keyTx = chuanHoaSoSanhTen(tx);
                if (!dsTaiXe.has(keyTx)) dsTaiXe.set(keyTx, tx);
            }

            const gn = String(don.giaoNhan || "").trim();
            if (gn) {
                const keyGn = chuanHoaSoSanhTen(gn);
                if (!dsGiaoNhan.has(keyGn)) dsGiaoNhan.set(keyGn, gn);
            }
        });

        trip.kmDi = kmDi;
        trip.kmVe = kmVe;
        trip.kmDiVe = kmDi + kmVe;
        trip.khoiLuongKg = khoiLuongKg;
        trip.tenChuyen = dsKhach.join(", ") || `Chuyến ${trip.soChuyen}`;
        trip.tuyenGiao = dsTuyen.join(", ") || trip.tenChuyen;
        trip.danhSachTaiXe = Array.from(dsTaiXe.values());
        trip.danhSachGiaoNhan = Array.from(dsGiaoNhan.values());
        trip.taiXe = trip.danhSachTaiXe.join(", ");
        trip.giaoNhan = trip.danhSachGiaoNhan.join(", ");
    }

    return trips;
}

export function tinhPhiTinhTaiXe(kmDiVe, nguongNoiO = 60) {
    const km = Number(kmDiVe) || 0;
    const nguong = Number(nguongNoiO) || 60;
    return km > nguong ? 30000 : 0;
}

export function tinhPhiTinhGiaoNhan(khoiLuongKg, kmDiVe, nguongNoiO = 60) {
    const kg = Number(khoiLuongKg) || 0;
    const km = Number(kmDiVe) || 0;
    const nguong = Number(nguongNoiO) || 60;
    if (km <= nguong) return 0;
    if (kg >= 5000) {
        return km > 120 ? 60000 : 40000;
    }
    return km > 120 ? 45000 : 35000;
}

export function tinhPhiTinhChuyen(chuyen = {}, tenNhanVienLoc = "") {
    const kmDiVe = Number(chuyen.kmDiVe) || 0;
    const khoiLuongKg = Number(chuyen.khoiLuongKg) || 0;
    const nguongNoiO = layNguongNoiOCuaXe(chuyen.phuongTien);
    const coDiTinh = kmDiVe > nguongNoiO;

    const soTaiXe = (chuyen.danhSachTaiXe || []).length;
    const soGiaoNhan = (chuyen.danhSachGiaoNhan || []).length;

    const mucPhiTxChuyen = soTaiXe > 0 ? tinhPhiTinhTaiXe(kmDiVe, nguongNoiO) : 0;
    const mucPhiGnChuyen = soGiaoNhan > 0 ? tinhPhiTinhGiaoNhan(khoiLuongKg, kmDiVe, nguongNoiO) : 0;

    const keyLoc = chuanHoaSoSanhTen(tenNhanVienLoc);
    let laTaiXe = soTaiXe > 0;
    let laGiaoNhan = soGiaoNhan > 0;

    if (keyLoc) {
        laTaiXe = (chuyen.danhSachTaiXe || []).some((t) => chuanHoaSoSanhTen(t).includes(keyLoc));
        laGiaoNhan = (chuyen.danhSachGiaoNhan || []).some((g) => chuanHoaSoSanhTen(g).includes(keyLoc));
    }

    const phiTaiXe = laTaiXe ? mucPhiTxChuyen : 0;
    const phiGiaoNhan = laGiaoNhan ? mucPhiGnChuyen : 0;
    const chucDanhApDung = [
        ...(laTaiXe ? ["Tài xế"] : []),
        ...(laGiaoNhan ? ["Giao nhận"] : [])
    ].join(", ");

    return {
        nguongNoiO,
        kmDiVe,
        khoiLuongKg,
        coDiTinh,
        laTaiXe,
        laGiaoNhan,
        chucDanhApDung,
        phiTaiXe,
        phiGiaoNhan,
        phiApDung: phiTaiXe + phiGiaoNhan,
        tongPhiTinh: mucPhiTxChuyen + mucPhiGnChuyen
    };
}

export function inPdfBangKePhiTinh() {
    const thangVal = (document.getElementById("thangXemPhiTinh")?.value || "").trim();
    const nvLocRaw = (layElementBoLocNhanVien()?.value || "").trim();

    if (!thangVal || !/^\d{4}-\d{2}$/.test(thangVal)) {
        alert("Vui lòng chọn tháng năm trước khi in PDF!");
        return;
    }

    const [namStr, thangStr] = thangVal.split("-");
    const namNum = parseInt(namStr, 10);
    const thangNum = parseInt(thangStr, 10);
    const thang2So = String(thangNum).padStart(2, "0");
    const ngayCuoiThangStr = layNgayCuoiThangDdMmYyyy(namNum, thangNum);

    const rows = danhSachChuyenDaTinhHienTai;
    const tenNhanVienHienThi = nvLocRaw || "Tất cả nhân viên";

    const setChucDanh = new Set();
    rows.forEach((r) => {
        if (r.ketQua.laTaiXe) setChucDanh.add("Tài xế");
        if (r.ketQua.laGiaoNhan) setChucDanh.add("Giao nhận");
    });
    const chucDanhHienThi = setChucDanh.size > 0
        ? Array.from(setChucDanh).join(", ")
        : "Tài xế";

    const tongChiPhi = rows.reduce((sum, item) => sum + (Number(item.ketQua.phiApDung) || 0), 0);
    const soDongTrongToiThieu = 11;
    const soDongCanThem = Math.max(0, soDongTrongToiThieu - rows.length);

    const rowsHtml = rows.map((item, idx) => {
        const { trip, ketQua } = item;
        const ngayGiao = dinhDangNgayDdMmYyyy(trip.ngay);
        const ghiChuParts = [
            ketQua.chucDanhApDung || "Nội ô",
            `${ketQua.kmDiVe.toLocaleString("vi-VN")} km`,
            `${ketQua.khoiLuongKg.toLocaleString("vi-VN")} kg`
        ];

        return `
            <tr>
                <td class="col-stt">${idx + 1}</td>
                <td class="col-ngay">${ngayGiao}</td>
                <td class="col-xe">${trip.phuongTien}</td>
                <td class="col-tuyen">${trip.tuyenGiao}</td>
                <td class="col-phi">${dinhDangSoNguyenVN(ketQua.phiApDung)}</td>
                <td class="col-ghichu">${ghiChuParts.join(" • ")}</td>
            </tr>
        `;
    }).join("");

    const emptyRowsHtml = Array.from({ length: soDongCanThem }).map(() => `
        <tr>
            <td>&nbsp;</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
    `).join("");

    const printWindow = window.open("", "_blank", "width=920,height=1120");
    if (!printWindow) {
        alert("Trình duyệt đang chặn cửa sổ bật lên (Pop-up). Vui lòng cho phép Pop-up để in PDF!");
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Bảng Kê Chi Phí Giao Hàng Theo Xe - Tháng ${thang2So}/${namNum}</title>
            <style>
                @page {
                    size: A4 portrait;
                    margin: 14mm 12mm 14mm 12mm;
                }
                * {
                    box-sizing: border-box;
                }
                body {
                    font-family: "Times New Roman", Times, serif;
                    color: #000;
                    margin: 0;
                    padding: 0;
                    font-size: 12px;
                }
                .company {
                    font-weight: 700;
                    font-size: 11.5px;
                    line-height: 1.35;
                    text-transform: uppercase;
                }
                .title {
                    text-align: center;
                    font-weight: 700;
                    font-size: 16px;
                    text-transform: uppercase;
                    margin-top: 10px;
                    letter-spacing: 0.2px;
                }
                .subtitle {
                    text-align: center;
                    font-weight: 700;
                    font-size: 12px;
                    margin-top: 3px;
                    margin-bottom: 12px;
                }
                .meta-row {
                    display: flex;
                    gap: 42px;
                    font-size: 12px;
                    margin-bottom: 6px;
                }
                .meta-row strong {
                    font-weight: 700;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
                th, td {
                    border: 1px solid #000;
                    padding: 4px 6px;
                    font-size: 11.5px;
                    line-height: 1.25;
                    word-wrap: break-word;
                }
                thead th {
                    background-color: #a6a6a6 !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    font-weight: 700;
                    text-align: center;
                    vertical-align: middle;
                }
                .col-stt { width: 7%; text-align: center; }
                .col-ngay { width: 14%; text-align: center; }
                .col-xe { width: 14%; text-align: center; }
                .col-tuyen { width: 27%; text-align: left; }
                .col-phi { width: 17%; text-align: right; }
                .col-ghichu { width: 21%; text-align: left; }
                .tong-cong-row td {
                    font-weight: 700;
                    background-color: #ffffff;
                }
                .tong-cong-label {
                    text-align: center;
                }
                .tong-cong-val {
                    text-align: right;
                }
                .footer-sign {
                    margin-top: 14px;
                    width: 100%;
                }
                .sign-date {
                    text-align: right;
                    font-size: 11.5px;
                    padding-right: 16px;
                    margin-bottom: 6px;
                }
                .sign-cols {
                    display: flex;
                    justify-content: space-between;
                    text-align: center;
                    font-weight: 700;
                    font-size: 12px;
                }
                .sign-cols > div {
                    width: 33.33%;
                }
                @media print {
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="background:#f1f5f9; padding:8px 12px; margin-bottom:10px; border-bottom:1px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center; font-family:Arial,sans-serif;">
                <span style="font-size:12px; color:#334155;">Xem trước <b>Bảng kê chi phí giao hàng theo xe</b> — Tháng ${thang2So}/${namNum}</span>
                <button onclick="window.print()" style="background:#0284c7; color:#fff; border:none; padding:6px 14px; border-radius:4px; font-weight:700; cursor:pointer;">🖨️ In / Lưu PDF</button>
            </div>

            <div class="company">
                CÔNG TY CỔ PHẦN VẬT TƯ HẬU GIANG<br>
                PHÒNG KINH DOANH SƠN
            </div>

            <div class="title">BẢNG KÊ CHI PHÍ GIAO HÀNG THEO XE</div>
            <div class="subtitle">Tháng ${thangNum} Năm ${namNum}</div>

            <div class="meta-row">
                <div><strong>Nhân viên:</strong> ${tenNhanVienHienThi}</div>
                <div><strong>Chức danh:</strong> ${chucDanhHienThi}</div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th class="col-stt">STT</th>
                        <th class="col-ngay">Ngày giao hàng</th>
                        <th class="col-xe">Số xe</th>
                        <th class="col-tuyen">Tuyến giao/Điểm đến</th>
                        <th class="col-phi">Chi phí theo xe (VNĐ)</th>
                        <th class="col-ghichu">Ghi chú</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    ${emptyRowsHtml}
                    <tr class="tong-cong-row">
                        <td colspan="4" class="tong-cong-label">TỔNG CỘNG</td>
                        <td class="tong-cong-val">${dinhDangSoNguyenVN(tongChiPhi)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            <div class="footer-sign">
                <div class="sign-date">Cần Thơ, ngày ${ngayCuoiThangStr.split("/")[0]} tháng ${thang2So} năm ${namNum}</div>
                <div class="sign-cols">
                    <div>Trưởng đơn vị</div>
                    <div>Người kiểm tra</div>
                    <div>Người lập bảng</div>
                </div>
            </div>

            <script>
                window.onload = function() {
                    setTimeout(function() { window.print(); }, 250);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

export async function xemLaiDanhSachPhiTinh(batBuocTaiLai = false) {
    const dsEl = document.getElementById("danhSachXemPhiTinh");
    const tongEl = document.getElementById("tongTienXemPhiTinh");
    const txEl = document.getElementById("tongPhiTinhTaiXe");
    const gnEl = document.getElementById("tongPhiTinhGiaoNhan");
    if (!dsEl) return;

    const thangVal = (document.getElementById("thangXemPhiTinh")?.value || "").trim();
    const xeVal = (document.getElementById("filterXeXemPhiTinh")?.value || "").trim();
    const nvVal = (layElementBoLocNhanVien()?.value || "").trim();
    const keyNv = chuanHoaSoSanhTen(nvVal);

    if (!thangVal || !/^\d{4}-\d{2}$/.test(thangVal)) {
        dsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:14px;">Vui lòng chọn tháng năm để tính phí tỉnh.</div>`;
        return;
    }

    dsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:14px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tính phí tỉnh theo nhân viên từ TUYENDUONG & PHUONGTIEN...</div>`;

    const [namStr, thangStr] = thangVal.split("-");
    const namNum = parseInt(namStr, 10);
    const thangNum = parseInt(thangStr, 10);

    try {
        await taiNguongNoiOPhuongTien(batBuocTaiLai);
        const rawList = await layDuLieuTuyenDuongThang(thangNum, namNum);
        const allTrips = tongHopChuyenVaKmDiVe(rawList);
        capNhatTuyChonNhanVien(allTrips);

        const danhSachLoc = allTrips.filter((trip) => {
            if (xeVal && String(trip.phuongTien || "").trim() !== xeVal) {
                return false;
            }
            if (keyNv) {
                const khopTx = (trip.danhSachTaiXe || []).some((t) => chuanHoaSoSanhTen(t).includes(keyNv));
                const khopGn = (trip.danhSachGiaoNhan || []).some((g) => chuanHoaSoSanhTen(g).includes(keyNv));
                if (!khopTx && !khopGn) return false;
            }
            return true;
        });

        danhSachChuyenDaTinhHienTai = danhSachLoc.map((trip) => ({
            trip,
            ketQua: tinhPhiTinhChuyen(trip, nvVal)
        }));

        let tongTx = 0;
        let tongGn = 0;
        let tongHienThi = 0;

        if (!danhSachChuyenDaTinhHienTai.length) {
            if (tongEl) tongEl.textContent = dinhDangTienVnd(0);
            if (txEl) txEl.textContent = dinhDangTienVnd(0);
            if (gnEl) gnEl.textContent = dinhDangTienVnd(0);
            dsEl.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:14px;">Không có chuyến phù hợp trong tháng ${thangStr}/${namNum}.</div>`;
            return;
        }

        const htmlCards = danhSachChuyenDaTinhHienTai.map(({ trip, ketQua }) => {
            tongTx += ketQua.phiTaiXe;
            tongGn += ketQua.phiGiaoNhan;
            tongHienThi += ketQua.phiApDung;

            return `
                <div class="the-phi-tinh-item">
                    <div class="the-phi-tinh-hang-tren">
                        <span>${trip.phuongTien} • Chuyến ${trip.soChuyen} (${dinhDangNgayDdMmYyyy(trip.ngay)})</span>
                        <span style="color:#7c3aed;">${dinhDangTienVnd(ketQua.phiApDung)}</span>
                    </div>
                    <div class="the-phi-tinh-chi-tiet">
                        <span>⚖️ ${ketQua.khoiLuongKg.toLocaleString("vi-VN")} kg | 🛣️ Đi về: ${ketQua.kmDiVe.toLocaleString("vi-VN")} km (Đi ${trip.kmDi} + Về ${trip.kmVe}, noiO: ${ketQua.nguongNoiO} km)</span>
                        <span>TX: <strong>${dinhDangTienVnd(ketQua.phiTaiXe)}</strong> • GN: <strong>${dinhDangTienVnd(ketQua.phiGiaoNhan)}</strong></span>
                    </div>
                    <div style="font-size:10.5px; color:#64748b;">
                        ${trip.taiXe ? `TX: ${trip.taiXe}` : ""}${trip.taiXe && trip.giaoNhan ? " • " : ""}${trip.giaoNhan ? `GN: ${trip.giaoNhan}` : ""}
                    </div>
                </div>
            `;
        }).join("");

        if (tongEl) tongEl.textContent = dinhDangTienVnd(tongHienThi);
        if (txEl) txEl.textContent = dinhDangTienVnd(tongTx);
        if (gnEl) gnEl.textContent = dinhDangTienVnd(tongGn);
        dsEl.innerHTML = htmlCards;
    } catch (err) {
        console.error("Lỗi tính phí tỉnh:", err);
        dsEl.innerHTML = `<div style="text-align:center; color:#ef4444; font-size:12px; padding:14px;">Lỗi tải dữ liệu tính phí tỉnh!</div>`;
    }
}

function ganSuKienGiaoDienPhiTinh() {
    const thangVc = document.getElementById("thangVanChuyen");
    const thangPt = document.getElementById("thangXemPhiTinh");
    const xePt = document.getElementById("filterXeXemPhiTinh");
    const nvPt = layElementBoLocNhanVien();
    const dsEl = document.getElementById("danhSachXemPhiTinh");

    if (thangPt && thangVc && thangVc.value && !thangPt.value) {
        thangPt.value = thangVc.value;
    }

    if (nvPt) {
        const eventName = nvPt.tagName === "SELECT" ? "change" : "input";
        nvPt.addEventListener(eventName, () => {
            xemLaiDanhSachPhiTinh(false);
        });
    }

    if (xePt) {
        xePt.addEventListener("change", () => {
            xemLaiDanhSachPhiTinh(false);
        });
    }

    if (thangPt) {
        thangPt.addEventListener("change", () => {
            xemLaiDanhSachPhiTinh(true);
        });
    }

    if (dsEl && dsEl.parentElement && !document.getElementById("btnInPdfPhiTinh")) {
        const btnIn = document.createElement("button");
        btnIn.id = "btnInPdfPhiTinh";
        btnIn.type = "button";
        btnIn.textContent = "🖨️ In PDF Bảng kê";
        btnIn.style.cssText = "margin-top:8px; padding:6px 12px; background:#0284c7; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;";
        btnIn.onclick = () => inPdfBangKePhiTinh();
        dsEl.parentElement.insertBefore(btnIn, dsEl.nextSibling);
    }

    if (thangPt && thangPt.value) {
        xemLaiDanhSachPhiTinh(false);
    }
}

window.taiNguongNoiOPhuongTien = taiNguongNoiOPhuongTien;
window.layNguongNoiOCuaXe = layNguongNoiOCuaXe;
window.tongHopChuyenVaKmDiVe = tongHopChuyenVaKmDiVe;
window.tinhPhiTinhTaiXe = tinhPhiTinhTaiXe;
window.tinhPhiTinhGiaoNhan = tinhPhiTinhGiaoNhan;
window.tinhPhiTinhChuyen = tinhPhiTinhChuyen;
window.xemLaiDanhSachPhiTinh = () => xemLaiDanhSachPhiTinh(true);
window.inPdfBangKePhiTinh = inPdfBangKePhiTinh;

document.addEventListener("DOMContentLoaded", ganSuKienGiaoDienPhiTinh);
