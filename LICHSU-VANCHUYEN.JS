// PHẦN 1: KHỞI TẠO, IMPORT VÀ BIẾN TOÀN CỤC (CACHE & TAB)
import { collection, query, where, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
const db = window.db;
window._cachedVanChuyenData = null;        // Biến lưu trữ bộ nhớ tạm (cache) dữ liệu vận chuyển sau khi tải từ Firebase
window._currentTabVanChuyen = 'da-giao';    // Biến lưu tab hiện tại ('da-giao', 'chuan-bi', 'cho')
window._selectedDieuChinhIds = new Set();  // Lưu danh sách id các đơn được chọn điều chỉnh

// PHẦN 2: CÁC HÀM TIỆN ÍCH XỬ LÝ NGÀY THÁNG, TÊN VÀ ĐỊA BÀN
function chuanHoaNgay(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return "";
    return ngayStr.trim().split(" ")[0];
}

function layNgayGomNhom(data) {
    let bd = data.batDauGiaoHang ? data.batDauGiaoHang.trim() : "";
    let kt = data.ketThucGiaoHang ? data.ketThucGiaoHang.trim() : "";
    let xk = data.ngayxuatKho ? data.ngayxuatKho.trim() : "";
    let xl = data.ngayXuLy ? data.ngayXuLy.trim() : "";
    let rawDate = bd !== "" ? bd : (kt !== "" ? kt : (xk !== "" ? xk : xl));
    let ngayBase = chuanHoaNgay(rawDate);
    return ngayBase || "Chưa xác định";
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
    const duyetVal = data && data.duyet ? data.duyet.trim() : "";
    if (duyetVal === "Đã giao hàng" || duyetVal === "Đang giao hàng") {
        return true;
    }
    if (duyetVal === "Đã xuất kho" && coDuLieuGiaoHang(data)) {
        return true;
    }
    return false;
}

function layNhanTrangThaiNhomDaGiao(data) {
    const duyetVal = data && data.duyet ? data.duyet.trim() : "";
    if (duyetVal === "Đã giao hàng") {
        return { icon: "✓", text: "Đã giao", color: "#16a34a" };
    }
    if (duyetVal === "Đang giao hàng") {
        return { icon: "🚚", text: "Đang giao", color: "#0284c7" };
    }
    if (duyetVal === "Đã xuất kho" && coDuLieuGiaoHang(data)) {
        return { icon: "📦", text: "Đã xuất", color: "#d97706" };
    }
    return { icon: "✓", text: duyetVal || "Đã giao", color: "#16a34a" };
}

function layTenRutGon(hoTen) {
    if (!hoTen || typeof hoTen !== "string") return "";
    const arr = hoTen.trim().split(/\s+/);
    return arr[arr.length - 1];
}

function layVungTieuThu(data) {
    let xa = data.phuongXa ? data.phuongXa.trim() : "";
    let tinh = data.thanhPho ? data.thanhPho.trim() : "";

    xa = xa.replace(/^(Xã|Phường|Thị trấn|P)\s+/i, "").trim();
    tinh = tinh.replace(/^(Tỉnh|Thành phố|TP\.)\s+/i, "").trim();

    if (tinh.toLowerCase().includes("cần thơ")) {
        let duong = "";
        if (data.noiGiao && typeof data.noiGiao === "string") {
            let diaChiClean = data.noiGiao.split("(")[0].trim();
            let parts = diaChiClean.split(",").map(p => p.trim()).filter(p => p !== "");
            
            let foundDuong = parts.find(p => {
                let l = p.toLowerCase();
                return l.includes("đường") || l.includes("ql") || l.includes("đt") || l.includes("quốc lộ") || l.includes("3/2") || l.includes("30/4") || l.includes("cách mạng tháng");
            });

            if (!foundDuong) {
                foundDuong = parts.find(p => {
                    let l = p.toLowerCase();
                    return !l.includes("số nhà") && !l.includes("ấp") && !l.includes("khu phố") && !l.includes("huyện") && !l.includes("quận") && !l.includes("thị xã") && !l.startsWith("xã") && !l.startsWith("phường") && !l.startsWith("tỉnh") && !l.includes("việt nam");
                });
            }

            if (foundDuong) duong = foundDuong;
        }

        let arr = [];
        if (duong) arr.push(duong);
        if (xa) arr.push(xa);
        return arr.length > 0 ? arr.join(" - ") : (data.vungTieuThu || "---");
    } 
    
    let arr = [];
    if (xa) arr.push(xa);
    if (tinh) arr.push(tinh);

    return arr.length > 0 ? arr.join(" - ") : (data.vungTieuThu || "---");
}

function loaiBoDauTiengViet(str) {
    if (!str || typeof str !== "string") return "";
    return str.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/đ/g, "d")
              .replace(/Đ/g, "D")
              .toLowerCase();
}

// PHẦN 3: TÍNH TOÁN KHOẢNG CÁCH GPS VÀ GIAO DIỆN XE
function tinhKhoangCachNoiBo(lat1, lon1, lat2, lon2) {
    if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2) || (lat1 === 0 && lon1 === 0) || (lat2 === 0 && lon2 === 0)) {
        return 0;
    }
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 1.15);
}

function tinhKhoangCachCheckIn(toaDo1, toaDo2) {
    if (!toaDo1 || !toaDo2 || toaDo1 === "0,0" || toaDo2 === "0,0") return null;
    try {
        const [lat1, lon1] = toaDo1.split(',').map(Number);
        const [lat2, lon2] = toaDo2.split(',').map(Number);
        if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2) || (lat1 === 0 && lat1 === 0)) return null;

        const R = 6371; 
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
    } catch (e) {
        return null;
    }
}

function layMauGiaoDienXe(phuongTien) {
    const xe = phuongTien ? phuongTien.trim().toUpperCase() : "";
    
    if (xe.includes("06126")) {
        return {
            bgHeader: '#eff6ff', border: '#bfdbfe', textHeader: '#1e40af', 
            badgeBg: '#dbeafe', badgeText: '#1d4ed8', tagColor: '#2563eb'
        };
    } else if (xe.includes("12290")) {
        return {
            bgHeader: '#f0fdf4', border: '#bbf7d0', textHeader: '#166534', 
            badgeBg: '#dcfce7', badgeText: '#15803d', tagColor: '#16a34a'
        };
    } else if (xe.includes("02591")) {
        return {
            bgHeader: '#fef2f2', border: '#fecaca', textHeader: '#991b1b', 
            badgeBg: '#fee2e2', badgeText: '#dc2626', tagColor: '#ef4444'
        };
    } else if (xe === "XE MÁY" || !phuongTien || phuongTien.trim() === "") {
        return {
            bgHeader: '#fffbeb', border: '#fde68a', textHeader: '#92400e', 
            badgeBg: '#fef3c7', badgeText: '#b45309', tagColor: '#d97706'
        };
    } else {
        return {
            bgHeader: '#f8fafc', border: '#e2e8f0', textHeader: '#1e293b', 
            badgeBg: '#e2e8f0', badgeText: '#334155', tagColor: '#0284c7'
        };
    }
}

function sapXepVaTinhKmNoiBo(danhSachDon, latKho, lonKho) {
    if (!danhSachDon || danhSachDon.length === 0) return { optimized: [], tongKmDi: 0, tongKmVe: 0 };

    let unvisited = [...danhSachDon];
    let optimized = [];
    let currentLat = latKho;
    let currentLon = lonKho;
    let tongKmDi = 0;
    let lastValidLat = latKho;
    let lastValidLon = lonKho;
    let hasValidStop = false;

    while (unvisited.length > 0) {
        let nearestIdx = 0;
        let minDistance = Infinity;

        for (let i = 0; i < unvisited.length; i++) {
            let don = unvisited[i];
            let lat = 0, lon = 0;
            let hasGPS = false;
            if (don.dinhVi && typeof don.dinhVi === 'string' && don.dinhVi.includes(',')) {
                const parts = don.dinhVi.split(',').map(Number);
                if (!isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] !== 0) {
                    lat = parts[0]; lon = parts[1];
                    hasGPS = true;
                }
            }

            let estDist = hasGPS ? Math.abs(currentLat - lat) + Math.abs(currentLon - lon) : 999999;
            if (estDist < minDistance) {
                minDistance = estDist;
                nearestIdx = i;
            }
        }

        let nextDon = unvisited.splice(nearestIdx, 1)[0];
        
        let kmChang = 0;
        if (nextDon.dinhVi && typeof nextDon.dinhVi === 'string' && nextDon.dinhVi.includes(',')) {
            const parts = nextDon.dinhVi.split(',').map(Number);
            if (!isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] !== 0) {
                kmChang = tinhKhoangCachNoiBo(currentLat, currentLon, parts[0], parts[1]);
                tongKmDi += kmChang;
                currentLat = parts[0];
                currentLon = parts[1];
                lastValidLat = parts[0];
                lastValidLon = parts[1];
                hasValidStop = true;
            }
        }

        nextDon._kmTinhToan = kmChang;
        optimized.push(nextDon);
    }

    optimized.forEach((don, idx) => {
        don._thuTu = idx + 1;
    });

    let tongKmVe = 0;
    if (hasValidStop) {
        tongKmVe = tinhKhoangCachNoiBo(lastValidLat, lastValidLon, latKho, lonKho);
    }

    return { optimized, tongKmDi, tongKmVe };
}

// PHẦN 4: TẢI DỮ LIỆU TỪ FIREBASE VÀ XỬ LÝ HIỂN THỊ
window.taiLichSuVanChuyen = async function(thangChon, namChon) {
    const container = document.getElementById('danhSachLichSuVanChuyen');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu từ hệ thống...</div>';

    try {
        const thangNum = parseInt(thangChon, 10);
        const namNum = parseInt(namChon, 10);

        const thamChieuTuyenDuong = collection(db, "TUYENDUONG");
        const q = query(thamChieuTuyenDuong, where("nam", "==", namNum), where("thang", "==", thangNum));

        const [querySnapshot, dieuChinhSnapshot] = await Promise.all([
            getDocs(q),
            getDocs(collection(db, "TUYENDUONG-DIEUCHINH"))
        ]);

        let dieuChinhMap = {};
        dieuChinhSnapshot.forEach((dcSnap) => {
            const dcData = dcSnap.data();
            const keyById = dcSnap.id;
            const keyByMaPhieu = dcData.maPhieu ? String(dcData.maPhieu).trim() : "";
            dieuChinhMap[keyById] = dcData;
            if (keyByMaPhieu) {
                dieuChinhMap[`MP___${keyByMaPhieu}`] = dcData;
            }
        });

        if (querySnapshot.empty) {
            window._cachedVanChuyenData = [];
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không có chuyến vận chuyển nào trong Tháng ${thangNum}/${namNum}.</div>`;
            return;
        }

        let listData = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const maPhieuVal = (data.maPhieu && String(data.maPhieu).trim() !== "") ? String(data.maPhieu).trim() : docSnap.id;
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
                    taiXe: dc.taiXe !== undefined ? dc.taiXe : data.taiXe,
                    _daDieuChinh: true
                } : {})
            };

            const ngayGom = layNgayGomNhom(mergedData);
            listData.push({ id: docSnap.id, ...mergedData, _ngayGom: ngayGom });
        });
        
        window._cachedVanChuyenData = listData;
        hienThiDanhSachVanChuyen();

    } catch (error) {
        console.error("Lỗi tải lịch sử vận chuyển: ", error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 13px;">Lỗi tải dữ liệu lịch sử vận chuyển!</div>';
    }
};

function capNhatThanhDieuChinh() {
    let bar = document.getElementById('thanhDieuChinhChonDong');
    const count = window._selectedDieuChinhIds.size;

    if (count === 0) {
        if (bar) bar.remove();
        return;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'thanhDieuChinhChonDong';
        bar.style.cssText = 'position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 9998; background: #0f172a; color: #fff; padding: 8px 14px; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.22); display: flex; align-items: center; gap: 10px; font-size: 12px; font-family: Arial, sans-serif;';
        document.body.appendChild(bar);
    }

    bar.innerHTML = `
        <span>Đã chọn <strong>${count}</strong> dòng sai</span>
        <button type="button" id="btnMoBangDieuChinh" style="background: #0284c7; color: #fff; border: none; border-radius: 5px; padding: 5px 10px; font-size: 11.5px; font-weight: 600; cursor: pointer;">
            ✏️ Điều chỉnh
        </button>
        <button type="button" id="btnBoChonDieuChinh" style="background: #334155; color: #e2e8f0; border: none; border-radius: 5px; padding: 5px 8px; font-size: 11px; cursor: pointer;">
            Bỏ chọn
        </button>
    `;

    document.getElementById('btnMoBangDieuChinh').onclick = () => {
        window.moBangDieuChinhVanChuyen(Array.from(window._selectedDieuChinhIds));
    };

    document.getElementById('btnBoChonDieuChinh').onclick = () => {
        window._selectedDieuChinhIds.clear();
        capNhatThanhDieuChinh();
        hienThiDanhSachVanChuyen();
    };
}

function hienThiDanhSachVanChuyen() {
    const container = document.getElementById('danhSachLichSuVanChuyen');
    if (!container) return;

    capNhatThanhDieuChinh();

    if (!window._cachedVanChuyenData) {
        container.innerHTML = '<div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 13px;">Vui lòng chọn tháng và bấm nút <b>"Tải"</b> để xem lịch sử vận chuyển.</div>';
        return;
    }

    const selectPhuongTien = document.getElementById('filterPhuongTien');
    const inputTimKiemTuDo = document.getElementById('inputTimKiemTuDo');

    const bienSoTimKiem = selectPhuongTien ? selectPhuongTien.value : "";
    const tuKhoaTimKiem = inputTimKiemTuDo ? inputTimKiemTuDo.value : "";
    const keywordKhongDau = loaiBoDauTiengViet(tuKhoaTimKiem);

    let listData = [...window._cachedVanChuyenData];

    // Lọc theo Tab hiện tại
    listData = listData.filter(data => {
        const duyetVal = data.duyet ? data.duyet.trim() : "";
        if (window._currentTabVanChuyen === 'da-giao') {
            return laDonThuocNhomDaGiao(data);
        } else if (window._currentTabVanChuyen === 'chuan-bi') {
            if (duyetVal === "Đã xuất kho") {
                return !coDuLieuGiaoHang(data);
            }
            return duyetVal === "Chờ xuất kho";
        } else if (window._currentTabVanChuyen === 'cho') {
            return duyetVal === "Chờ BTGĐ duyệt" || duyetVal === "Chờ duyệt" || duyetVal === "Chờ TĐV duyệt";
        }
        return true;
    });

    if (keywordKhongDau && keywordKhongDau.trim() !== "") {
        listData = listData.filter(data => {
            const hopThanhChuoi = Object.values(data).join(" ") + " " + data.id;
            const chuoiKhongDau = loaiBoDauTiengViet(hopThanhChuoi);
            return chuoiKhongDau.includes(keywordKhongDau);
        });
    }

    listData.sort((a, b) => {
        let timeA = a.batDauGiaoHang || a.ketThucGiaoHang || a.ngayxuatKho || a.ngayXuLy || "";
        let timeB = b.batDauGiaoHang || b.ketThucGiaoHang || b.ngayxuatKho || b.ngayXuLy || "";
        return timeA.localeCompare(timeB);
    });

    let globalVehicleTrips = {}; 
    listData.forEach((data) => {
        const coXe = data.phuongTien && data.phuongTien.trim() !== "";
        const nhomKey = coXe ? data.phuongTien.trim() : "Xe máy";

        if (bienSoTimKiem && bienSoTimKiem.trim() !== "") {
            const tuKhoa = bienSoTimKiem.toLowerCase().trim();
            if (!nhomKey.toLowerCase().includes(tuKhoa)) return; 
        }

        // ĐẶC BIỆT CHO TAB CHỜ: Lấy trực tiếp trường vungTieuThu. Nếu là gửi chành thì gộp chung vào "Cần Thơ"
        if (window._currentTabVanChuyen === 'cho') {
            let vungGoc = (data.vungTieuThu && data.vungTieuThu.trim() !== "") ? data.vungTieuThu.trim() : "---";
            const htGiaoNhan = data.htGiaoNhan ? data.htGiaoNhan.toLowerCase() : "";
            
            let vungKey = vungGoc;
            if (htGiaoNhan.includes("chành") || htGiaoNhan.includes("gửi chành")) {
                vungKey = "Cần Thơ"; 
            }

            const tripKey = `VUNG_${vungKey}`;
            if (!globalVehicleTrips[tripKey]) {
                globalVehicleTrips[tripKey] = {
                    phuongTien: vungKey,
                    isVungGroup: true,
                    ngay: vungKey,
                    dons: []
                };
            }
            globalVehicleTrips[tripKey].dons.push(data);
        } else {
            if (coXe) {
                const soChuyen = data.chuyenVtracking !== undefined && data.chuyenVtracking !== null && data.chuyenVtracking !== "" ? data.chuyenVtracking : 1;
                const tripKey = `XE_${nhomKey}_CHUYEN_${soChuyen}_${data._ngayGom}`;
                if (!globalVehicleTrips[tripKey]) {
                    globalVehicleTrips[tripKey] = {
                        phuongTien: nhomKey,
                        soChuyen: soChuyen,
                        ngay: data._ngayGom,
                        dons: []
                    };
                }
                globalVehicleTrips[tripKey].dons.push(data);
            } else {
                const tripKey = `XE_MAY_${data._ngayGom}`;
                if (!globalVehicleTrips[tripKey]) {
                    globalVehicleTrips[tripKey] = {
                        phuongTien: "Xe máy",
                        soChuyen: 1,
                        ngay: data._ngayGom,
                        isXeMay: true,
                        dons: []
                    };
                }
                globalVehicleTrips[tripKey].dons.push(data);
            }
        }
    });

    let allTripsArray = Object.values(globalVehicleTrips);
    allTripsArray.sort((a, b) => {
        if (window._currentTabVanChuyen === 'cho') {
            return a.phuongTien.localeCompare(b.phuongTien);
        }
        let timeA = a.dons[0]?.batDauGiaoHang || a.dons[0]?.ngayxuatKho || a.dons[0]?.ngayXuLy || "";
        let timeB = b.dons[0]?.batDauGiaoHang || b.dons[0]?.ngayxuatKho || b.dons[0]?.ngayXuLy || "";
        return timeA.localeCompare(timeB);
    });

    const LAT_KHO = 9.9234; 
    const LON_KHO = 105.1245;

    for (let idx = 0; idx < allTripsArray.length; idx++) {
        let trip = allTripsArray[idx];
        const laNhomChuaGiao = trip.ngay.includes("Chưa giao");

        let kmDi = 0;
        let kmVeNum = 0;
        let textKmVe = "chờ"; 

        if (window._currentTabVanChuyen === 'cho') {
            trip.dons.sort((a, b) => (a.maPhieu || a.id || "").localeCompare(b.maPhieu || b.id || ""));
            trip.dons.forEach((don, i) => { don._thuTu = i + 1; don._kmTinhToan = 0; });
        } else if (laNhomChuaGiao) {
            let donsChuaGiao = [];
            let donsDaGiao = [];

            trip.dons.forEach(don => {
                const trangThaiDuyet = don.duyet ? don.duyet.trim() : "";
                const laChuaGiaoHoanToan = !trangThaiDuyet || trangThaiDuyet === "" || trangThaiDuyet.toLowerCase().includes("chuẩn bị") || (trangThaiDuyet.toLowerCase().includes("đã xuất") && !coDuLieuGiaoHang(don));
                
                if (laChuaGiaoHoanToan) {
                    donsChuaGiao.push(don);
                } else {
                    donsDaGiao.push(don);
                }
            });

            let ketQuaSapXep = sapXepVaTinhKmNoiBo(donsChuaGiao, LAT_KHO, LON_KHO);
            trip.dons = [...ketQuaSapXep.optimized, ...donsDaGiao];
            
            kmDi = ketQuaSapXep.tongKmDi;
            kmVeNum = ketQuaSapXep.tongKmVe;
            textKmVe = kmVeNum + "km";
        } else {
            trip.dons.sort((a, b) => (a.ketThucGiaoHang || "").localeCompare(b.ketThucGiaoHang || ""));
            trip.dons.forEach((don, i) => { don._thuTu = i + 1; don._kmTinhToan = 0; });

            if (trip.dons.length > 0) {
                const donDau = trip.dons[0];
                const donCuoi = trip.dons[trip.dons.length - 1];
                const hasKmBD = donDau.kmBatDauGiaoHang !== undefined && donDau.kmBatDauGiaoHang !== null && String(donDau.kmBatDauGiaoHang).trim() !== "";
                const hasKmKT = donCuoi.kmKetThucGiaoHang !== undefined && donCuoi.kmKetThucGiaoHang !== null && String(donCuoi.kmKetThucGiaoHang).trim() !== "";
                const kmBDDau = hasKmBD ? Number(donDau.kmBatDauGiaoHang) : NaN;
                const kmKTCuoi = hasKmKT ? Number(donCuoi.kmKetThucGiaoHang) : NaN;

                if (!isNaN(kmBDDau) && !isNaN(kmKTCuoi)) {
                    kmDi = kmKTCuoi - kmBDDau;
                }

                if (!trip.isXeMay && !isNaN(kmKTCuoi)) {
                    for (let nextIdx = idx + 1; nextIdx < allTripsArray.length; nextIdx++) {
                        let nextTrip = allTripsArray[nextIdx];
                        if (!nextTrip.isXeMay && nextTrip.phuongTien === trip.phuongTien && nextTrip.dons.length > 0) {
                            const rawKmBDSau = nextTrip.dons[0].kmBatDauGiaoHang;
                            const hasKmBDSau = rawKmBDSau !== undefined && rawKmBDSau !== null && String(rawKmBDSau).trim() !== "";
                            const kmBDChuyenSau = hasKmBDSau ? Number(rawKmBDSau) : NaN;
                            if (!isNaN(kmBDChuyenSau)) {
                                kmVeNum = kmBDChuyenSau - kmKTCuoi;
                                textKmVe = kmVeNum + "km";
                            }
                            break;
                        }
                    }
                }
            }
        }

        let tongBotKg = 0, tongSonKg = 0, tongTbvsKg = 0, doanhThuChuyen = 0;
        
        trip.dons.forEach(don => {
            if (don.botTretKg) tongBotKg += Number(don.botTretKg) || 0;
            if (don.thanhTien) doanhThuChuyen += Number(don.thanhTien) || 0;
            
            const nganhStr = don.nganh ? don.nganh.trim().toLowerCase() : "";
            const kg = Number(don.sonTbvsKg) || 0;
            if (nganhStr.includes("thiết bị vệ sinh") || nganhStr.includes("tbvs")) {
                tongTbvsKg += kg;
            } else {
                tongSonKg += kg;
            }
        });

        trip.tongBaoBot = Math.round(tongBotKg / 40);
        trip.tongSon = tongSonKg;
        trip.tongTbvs = tongTbvsKg;
        trip.kmDi = kmDi;
        trip.textKmVe = textKmVe;
        trip._kmVeNum = kmVeNum;

        // Lấy dữ liệu 1 dòng bất kỳ trong chuyến (đơn đầu tiên `dons[0]`) và làm tròn không số lẻ
        const sampleDon = trip.dons[0] || {};
        trip.kmChuyenDiVtracking = sampleDon.kmChuyenDiVtracking !== undefined ? Math.round(Number(sampleDon.kmChuyenDiVtracking) || 0) : 0;
        trip.kmChuyenVeVtracking = sampleDon.kmChuyenVeVtracking !== undefined ? Math.round(Number(sampleDon.kmChuyenVeVtracking) || 0) : 0;
        trip.kmChuyenVtracking = sampleDon.kmChuyenVtracking !== undefined ? Math.round(Number(sampleDon.kmChuyenVtracking) || 0) : 0;

        let tyLePhi = 0;
        const tongKmChuyen = kmDi + (typeof kmVeNum === 'number' ? kmVeNum : 0);
        if (doanhThuChuyen > 0) {
            tyLePhi = ((tongKmChuyen * 10000) / doanhThuChuyen) * 100;
        }
        trip._tyLePhi = tyLePhi.toFixed(1);
    }

    container.innerHTML = '';

    if (allTripsArray.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;';
        emptyMsg.innerText = 'Không tìm thấy dữ liệu nào ở tab này khớp với từ khóa hoặc phương tiện bạn chọn.';
        container.appendChild(emptyMsg);
        return;
    }

    // RENDER RIÊNG CHO TAB CHỜ: HIỂN THỊ THEO VÙNG TIÊU THỤ
    if (window._currentTabVanChuyen === 'cho') {
        allTripsArray.forEach(trip => {
            let taiVung = 0, dtVung = 0;
            trip.dons.forEach(don => {
                if (don.tTai) taiVung += Number(don.tTai) || 0;
                if (don.thanhTien) dtVung += Number(don.thanhTien) || 0;
            });
            const dtVungTr = Math.round(dtVung / 1000000);

            const vungWrapper = document.createElement('div');
            vungWrapper.style.cssText = 'background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; margin-bottom: 12px; width: 100%; box-sizing: border-box;';

            const vungHeader = document.createElement('div');
            vungHeader.style.cssText = 'background: #0284c7; color: #fff; padding: 8px 12px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; width: 100%; box-sizing: border-box;';
            vungHeader.innerHTML = `
                <span>📍 ${trip.phuongTien}</span> 
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">${taiVung.toLocaleString('vi-VN')}kg/${dtVungTr}tr</span>
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">${trip.dons.length} đơn</span>
                </div>
            `;
            vungWrapper.appendChild(vungHeader);

            trip.dons.forEach((data, idx) => {
                renderCardDon(data, vungWrapper, true, idx, trip.dons);
            });

            container.appendChild(vungWrapper);
        });
        return;
    }

    // GOM NHÓM THEO NGÀY CHO 2 TAB CÒN LẠI (ĐÃ GIAO & CHUẨN BỊ)
    let groupedByDate = {};
    allTripsArray.forEach(trip => {
        const ngay = trip.ngay;
        if (!groupedByDate[ngay]) groupedByDate[ngay] = [];
        groupedByDate[ngay].push(trip);
    });

    let sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach(ngay => {
        const tripsInDay = groupedByDate[ngay];

        const dateWrapper = document.createElement('div');
        dateWrapper.style.cssText = 'margin-bottom: 20px; width: 100%; box-sizing: border-box;';

        let tongDonNgay = 0, tongTaiNgay = 0, tongDoanhThuNgay = 0;
        tripsInDay.forEach(trip => {
            tongDonNgay += trip.dons.length;
            trip.dons.forEach(don => {
                if (don.tTai) tongTaiNgay += Number(don.tTai) || 0;
                if (don.thanhTien) tongDoanhThuNgay += Number(don.thanhTien) || 0;
            });
        });
        const tongDTTrNgay = Math.round(tongDoanhThuNgay / 1000000);

        const dateHeader = document.createElement('div');
        dateHeader.style.cssText = 'background: #0284c7; color: #fff; padding: 8px 12px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; width: 100%; box-sizing: border-box;';
        dateHeader.innerHTML = `
            <span>📅 ${ngay}</span> 
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">${tongTaiNgay.toLocaleString('vi-VN')}kg/${tongDTTrNgay}tr</span>
                <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">${tongDonNgay} đơn</span>
            </div>
        `;
        dateWrapper.appendChild(dateHeader);

        tripsInDay.forEach(trip => {
            let taiChuyen = 0, dtChuyen = 0;
            trip.dons.forEach(don => {
                if (don.tTai) taiChuyen += Number(don.tTai) || 0;
                if (don.thanhTien) dtChuyen += Number(don.thanhTien) || 0;
            });
            const dtChuyenTr = Math.round(dtChuyen / 1000000);

            let odometerSum = (typeof trip._kmVeNum === 'number' && trip._kmVeNum !== 0) ? (trip.kmDi + trip._kmVeNum) + 'km' : (trip.kmDi + 'km');

            const mauXe = layMauGiaoDienXe(trip.phuongTien);
            const vehicleWrapper = document.createElement('div');
            vehicleWrapper.style.cssText = `background: ${mauXe.bgHeader}; border: 1px solid ${mauXe.border}; border-radius: 6px; padding: 5px 6px; margin-bottom: 6px; margin-left: 0; width: 100%; box-sizing: border-box;`;

            const vehicleHeader = document.createElement('div');
            vehicleHeader.style.cssText = `background: ${mauXe.badgeBg}; color: ${mauXe.textHeader}; padding: 3px 5px; border-radius: 4px; font-weight: 600; font-size: 11.5px; margin-bottom: 1px; display: flex; justify-content: space-between; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden; width: 100%; box-sizing: border-box;`;
            
            // --- HÀNG TRÊN: Cố định độ rộng cột, chữ canh trái, giãn đều và cân đối ---
            if (trip.isXeMay) {
                vehicleHeader.innerHTML = `
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1; margin-right: 6px;">
                        🏍️ <strong style="color: ${mauXe.tagColor};">${trip.phuongTien}</strong> <span style="color: #0369a1; font-weight: normal; font-size: 9.5px;">(${trip._tyLePhi}%DT)</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0px; line-height: 1.1; font-size: 9.5px; width: max-content; flex-shrink: 0;">
                        <div style="display: grid; grid-template-columns: 16px 52px 52px 55px; align-items: center;">
                            <span style="text-align: center; font-size: 8.5px;">⏱️</span>
                            <span style="text-align: left;">Đi: <strong style="color: #0284c7;">${trip.kmDi}km</strong></span>
                            <span style="text-align: left;">Về: <strong style="color: #d97706;">${trip.textKmVe}</strong></span>
                            <span style="text-align: left;">∑: <strong style="color: #16a34a;">${odometerSum}</strong></span>
                        </div>
                        <div style="display: grid; grid-template-columns: 16px 52px 52px 55px; align-items: center;">
                            <span style="text-align: center; font-size: 8.5px;">📍</span>
                            <span style="text-align: left;">Đi: <strong style="color: #0284c7;">${trip.kmChuyenDiVtracking}km</strong></span>
                            <span style="text-align: left;">Về: <strong style="color: #d97706;">${trip.kmChuyenVeVtracking}km</strong></span>
                            <span style="text-align: left;">∑: <strong style="color: #16a34a;">${trip.kmChuyenVtracking}km</strong></span>
                        </div>
                    </div>
                `;
            } else {
                vehicleHeader.innerHTML = `
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1; margin-right: 6px;">
                        🚛 <strong style="color: ${mauXe.tagColor};">${trip.phuongTien} Chuyến ${trip.soChuyen}</strong> <span style="color: #0369a1; font-weight: normal; font-size: 9.5px;">(${trip._tyLePhi}%DT)</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0px; line-height: 1.1; font-size: 9.5px; width: max-content; flex-shrink: 0;">
                        <div style="display: grid; grid-template-columns: 16px 52px 52px 55px; align-items: center;">
                            <span style="text-align: center; font-size: 8.5px;">⏱️</span>
                            <span style="text-align: left;">Đi: <strong style="color: #0284c7;">${trip.kmDi}km</strong></span>
                            <span style="text-align: left;">Về: <strong style="color: #d97706;">${trip.textKmVe}</strong></span>
                            <span style="text-align: left;">∑: <strong style="color: #16a34a;">${odometerSum}</strong></span>
                        </div>
                        <div style="display: grid; grid-template-columns: 16px 52px 52px 55px; align-items: center;">
                            <span style="text-align: center; font-size: 8.5px;">📍</span>
                            <span style="text-align: left;">Đi: <strong style="color: #0284c7;">${trip.kmChuyenDiVtracking}km</strong></span>
                            <span style="text-align: left;">Về: <strong style="color: #d97706;">${trip.kmChuyenVeVtracking}km</strong></span>
                            <span style="text-align: left;">∑: <strong style="color: #16a34a;">${trip.kmChuyenVtracking}km</strong></span>
                        </div>
                    </div>
                `;
            }
            vehicleWrapper.appendChild(vehicleHeader);

            // --- HÀNG DƯỚI: Cột trái (Bột / Sơn / TBVS), Cột phải (800kg/5tr 1 đơn) ---
            const vehicleSubHeader = document.createElement('div');
            vehicleSubHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-weight: normal; color: #475569; font-size: 9.5px; border-top: 1px dashed rgba(0,0,0,0.08); padding-top: 4px; padding-bottom: 3px; margin-bottom: 2px; width: 100%; box-sizing: border-box;';
            vehicleSubHeader.innerHTML = `
                <div style="display: flex; align-items: center; white-space: nowrap;">
                    <span>Bột: <strong style="color: #16a34a;">${trip.tongBaoBot.toLocaleString('vi-VN')}b</strong> | Sơn: <strong style="color: #2563eb;">${trip.tongSon.toLocaleString('vi-VN')}kg</strong> | TBVS: <strong style="color: #9333ea;">${trip.tongTbvs.toLocaleString('vi-VN')}kg</strong></span>
                </div>
                <div style="display: flex; gap: 4px; align-items: center; white-space: nowrap;">
                    <span style="background: rgba(16,185,129,0.15); color: #047857; padding: 1px 4px; border-radius: 4px; font-size: 9.5px;">${taiChuyen.toLocaleString('vi-VN')}kg/${dtChuyenTr}tr</span>
                    <span style="background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 4px; font-size: 9.5px;">${trip.dons.length} đơn</span>
                </div>
            `;
            vehicleWrapper.appendChild(vehicleSubHeader);

            trip.dons.forEach((data, idx) => {
                renderCardDon(data, vehicleWrapper, trip.isXeMay, idx, trip.dons);
            });

            dateWrapper.appendChild(vehicleWrapper);
        });

        container.appendChild(dateWrapper);
    });
};

// PHẦN 5: RENDER THẺ HIỂN THỊ CHI TIẾT TỪNG ĐƠN HÀNG (CARD ITEM)
function renderCardDon(data, parentElement, isXeMay = false, index = 0, danhSachDon = []) {
    const maPhieu = data.maPhieu || data.id;
    const chuyenVal = (data.chuyen !== undefined && data.chuyen !== null && data.chuyen !== "") ? ` ${data.chuyen}` : "";
    const doiTuong = data.doiTuong || 'Chưa xác định';
    const maPXK = data.pxk ? data.pxk.trim() : '---';

    let nhanVienHtml = '';
    if (isXeMay) {
        const tenGN = layTenRutGon(data.giaoNhan);
        const htmlGN = tenGN ? `<strong>${tenGN}</strong>` : `<span style="color: #dc2626;">❌</span>`;
        nhanVienHtml = `<span>GN: ${htmlGN}</span>`;
    } else {
        const tenTX = layTenRutGon(data.taiXe);
        const tenGN = layTenRutGon(data.giaoNhan);
        const htmlTX = `<strong>${tenTX || '---'}</strong>`;
        const htmlGN = tenGN ? `<strong>${tenGN}</strong>` : `<span style="color: #dc2626;">❌</span>`;
        nhanVienHtml = `<span>TX: ${htmlTX} | GN: ${htmlGN}</span>`;
    }

    const vungTieuThu = layVungTieuThu(data);
    const htGiaoNhan = data.htGiaoNhan || 'Giao hàng';
    const duyet = data.duyet || '';
    
    const tTaiVal = data.tTai ? Number(data.tTai).toLocaleString('vi-VN') : '0';
    const tTaiText = `${tTaiVal}kg`;
    
    let thanhTienText = '0.0tr';
    if (data.thanhTien) {
        const tienNum = Number(data.thanhTien) / 1000000;
        thanhTienText = `${tienNum.toFixed(1)}tr`;
    }

    const ngayxuatKho = data.ngayxuatKho || '';
    const batDauGiaoHang = data.batDauGiaoHang || '';
    const ketThucGiaoHang = data.ketThucGiaoHang || '';

    let kmGiaoText = '';
    const hasKmKT = data.kmKetThucGiaoHang !== undefined && data.kmKetThucGiaoHang !== null && String(data.kmKetThucGiaoHang).trim() !== "";
    const kmKT = hasKmKT ? Number(data.kmKetThucGiaoHang) : NaN;
    if (!isNaN(kmKT)) {
        let kmGiao = 0;
        if (index === 0) {
            const hasKmBD = data.kmBatDauGiaoHang !== undefined && data.kmBatDauGiaoHang !== null && String(data.kmBatDauGiaoHang).trim() !== "";
            const kmBD = hasKmBD ? Number(data.kmBatDauGiaoHang) : NaN;
            if (!isNaN(kmBD)) kmGiao = kmKT - kmBD;
        } else {
            const rawKmKTTruoc = danhSachDon[index - 1]?.kmKetThucGiaoHang;
            const hasKmKTTruoc = rawKmKTTruoc !== undefined && rawKmKTTruoc !== null && String(rawKmKTTruoc).trim() !== "";
            const kmKTTruoc = hasKmKTTruoc ? Number(rawKmKTTruoc) : NaN;
            if (!isNaN(kmKTTruoc)) kmGiao = kmKT - kmKTTruoc;
        }
        kmGiaoText = `⏱️ ${kmGiao}km`;
    } else {
        kmGiaoText = `⏱️ 0km`;
    }

    let kmKhachVtrackingNum = data.kmKhachVtracking !== undefined ? Number(data.kmKhachVtracking) : 0;
    let kmKhachVtrackingText = `📍 ${kmKhachVtrackingNum.toFixed(1)}km`;

    let badgeThuTu = '';
    const trangThaiDuyet = data.duyet ? data.duyet.trim() : "";
    const laChuaGiaoHoanToan = !trangThaiDuyet || trangThaiDuyet === "" || trangThaiDuyet.toLowerCase().includes("chuẩn bị") || (trangThaiDuyet.toLowerCase().includes("đã xuất") && !coDuLieuGiaoHang(data));
    
    if (laChuaGiaoHoanToan) {
        let coGPS = data.dinhVi && typeof data.dinhVi === 'string' && data.dinhVi.includes(',') && data.dinhVi !== '0,0';
        if (coGPS) {
            badgeThuTu = `<span style="background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 4px; font-size: 9.5px; font-weight: 600;" title="Thứ tự tuyến ưu tiên">📍 #${data._thuTu}</span>`;
        } else {
            badgeThuTu = `<span style="background: #fef2f2; color: #dc2626; padding: 1px 4px; border-radius: 4px; font-size: 9.5px; font-weight: 600;" title="Chưa có GPS">📍 #${data._thuTu} (Chưa GPS)</span>`;
        }
    }

    const khoangCachKm = tinhKhoangCachCheckIn(data.dinhVi, data.checkIn);
    let htmlKhoangCach = '';
    if (khoangCachKm !== null) {
        const kcNum = parseFloat(khoangCachKm);
        const iconCheck = kcNum < 0.2 ? '<span style="color: #16a34a; font-weight: bold;">✓</span>' : '<span style="color: #dc2626; font-weight: bold;">✗</span>';
        htmlKhoangCach = ` <span style="font-size: 10px;">${iconCheck} ${khoangCachKm}km</span>`;
    } else {
        htmlKhoangCach = ` <span style="font-size: 10px; color: #dc2626; font-weight: bold;" title="Chưa bật định vị">📍❌</span>`;
    }

    const isChanh = htGiaoNhan.includes("Chành") || htGiaoNhan.includes("Gửi chành");
    const badgeHT = isChanh 
        ? '<span style="background: #fef2f2; color: #dc2626; padding: 2px 5px; border-radius: 4px; font-size: 9.5px; font-weight: 600;">🚚 Chành</span>'
        : '<span style="background: #eff6ff; color: #2563eb; padding: 2px 5px; border-radius: 4px; font-size: 9.5px; font-weight: 600;">🚛 Giao</span>';

    const badgeDieuChinh = data._daDieuChinh
        ? '<span style="background: #fef3c7; color: #92400e; padding: 1px 4px; border-radius: 4px; font-size: 9px; font-weight: 600;" title="Đã có bản điều chỉnh">Đã ĐC</span>'
        : '';

    let badgeDuyet = `<span style="color: #64748b; font-size: 10.5px;">${duyet}</span>`;
    if (laDonThuocNhomDaGiao(data)) {
        const trangThaiInfo = layNhanTrangThaiNhomDaGiao(data);
        badgeDuyet = `<span style="color: ${trangThaiInfo.color}; font-size: 10.5px; font-weight: 600;">${trangThaiInfo.icon} ${trangThaiInfo.text} (<span style="color: #0284c7;">${kmGiaoText} <span style="color: #cbd5e1;">|</span> ${kmKhachVtrackingText}</span>)</span>`;
    } else if (duyet === "Đã xuất kho") {
        let kmHienThi = data._kmTinhToan !== undefined ? data._kmTinhToan : 0;
        badgeDuyet = `<span style="color: #d97706; font-size: 10.5px; font-weight: 600;">📦 Đã xuất (${kmHienThi}km)</span>`;
    } else if (laChuaGiaoHoanToan) {
        let kmHienThi = data._kmTinhToan !== undefined ? data._kmTinhToan : 0;
        badgeDuyet = `<span style="color: #9333ea; font-size: 10.5px; font-weight: 600;">⏳ Chưa giao (${kmHienThi}km)</span>`;
    }

    const isChecked = window._selectedDieuChinhIds.has(data.id);

    const cardItem = document.createElement('div');
    cardItem.className = 'card-lich-su-item';
    cardItem.style.cssText = `background: ${isChecked ? '#f0f9ff' : '#fff'}; border: 1px solid ${isChecked ? '#0284c7' : '#cbd5e1'}; border-radius: 6px; padding: 5px 7px; margin-bottom: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); width: 100%; box-sizing: border-box;`;

    cardItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px; margin-bottom: 2px;">
            <div style="display: flex; align-items: center; gap: 4px;">
                <input type="checkbox" class="chk-dieu-chinh-don" data-id="${data.id}" ${isChecked ? 'checked' : ''} title="Chọn dòng sai để điều chỉnh" style="cursor: pointer; margin: 0;">
                <strong style="color: #0f172a; font-size: 11.5px;">${maPhieu}</strong>
                <span style="font-size: 9.5px; color: #64748b;">(PXK: ${maPXK})</span><strong style="color: #0f172a; font-size: 8px; margin-left: 2px;">${chuyenVal}</strong>
                ${badgeDieuChinh}
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
                ${badgeThuTu}
                ${badgeHT}
                <button type="button" class="btn-sua-don-le" data-id="${data.id}" title="Điều chỉnh dòng này" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #0f172a; border-radius: 4px; padding: 1px 5px; font-size: 9.5px; cursor: pointer;">✏️ Sửa</button>
            </div>
        </div>

        <div style="font-weight: 600; color: #1e293b; font-size: 11.5px; margin-bottom: 2px;">
            🏢 ${doiTuong}
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 10.5px; color: #475569; margin-bottom: 2px; align-items: baseline;">
            <div style="line-height: 1.2;">${nhanVienHtml}</div>
            <div style="text-align: right; line-height: 1.2;">📍 ${vungTieuThu}${htmlKhoangCach}</div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; margin-top: 2px; background: #f1f5f9; padding: 2px 5px; border-radius: 4px; width: 100%; box-sizing: border-box;">
            <span>Tải: <strong style="color: #0284c7;">${tTaiText}</strong> | Tiền: <strong style="color: #16a34a;">${thanhTienText}</strong></span>
            <div>${badgeDuyet}</div>
        </div>
        
        <div style="font-size: 9.5px; color: #64748b; display: flex; justify-content: space-between; margin-top: 2px; border-top: 1px solid #e2e8f0; padding-top: 2px;">
            <span>🚀 BĐ: <strong>${batDauGiaoHang ? batDauGiaoHang.split(" ")[1] || batDauGiaoHang : '---'}</strong></span>
            <span>🏁 KT: <strong>${ketThucGiaoHang ? ketThucGiaoHang.split(" ")[1] || ketThucGiaoHang : '---'}</strong></span>
            <span>📅 XK: <strong>${ngayxuatKho || '---'}</strong></span>
        </div>
    `;

    const chk = cardItem.querySelector('.chk-dieu-chinh-don');
    if (chk) {
        chk.addEventListener('change', function() {
            if (this.checked) {
                window._selectedDieuChinhIds.add(data.id);
            } else {
                window._selectedDieuChinhIds.delete(data.id);
            }
            cardItem.style.background = this.checked ? '#f0f9ff' : '#fff';
            cardItem.style.borderColor = this.checked ? '#0284c7' : '#cbd5e1';
            capNhatThanhDieuChinh();
        });
    }

    const btnSuaLe = cardItem.querySelector('.btn-sua-don-le');
    if (btnSuaLe) {
        btnSuaLe.addEventListener('click', function() {
            window._selectedDieuChinhIds.add(data.id);
            capNhatThanhDieuChinh();
            window.moBangDieuChinhVanChuyen(Array.from(window._selectedDieuChinhIds));
        });
    }

    parentElement.appendChild(cardItem);
}

// PHẦN 5B: BẢNG ĐIỀU CHỈNH & LƯU VÀO TUYENDUONG-DIEUCHINH
window.moBangDieuChinhVanChuyen = function(idsList = []) {
    if (!window._cachedVanChuyenData || idsList.length === 0) {
        alert("Vui lòng chọn ít nhất một dòng cần điều chỉnh!");
        return;
    }

    const rowsData = window._cachedVanChuyenData.filter(item => idsList.includes(item.id));
    if (rowsData.length === 0) return;

    let modal = document.getElementById('modalDieuChinhVanChuyen');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'modalDieuChinhVanChuyen';
    modal.style.cssText = 'position: fixed; inset: 0; z-index: 10000; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 12px; font-family: Arial, sans-serif;';

    const tableRowsHtml = rowsData.map(item => {
        const maPhieu = item.maPhieu || item.id;
        const kmBD = item.kmBatDauGiaoHang !== undefined && item.kmBatDauGiaoHang !== null ? item.kmBatDauGiaoHang : '';
        const kmKT = item.kmKetThucGiaoHang !== undefined && item.kmKetThucGiaoHang !== null ? item.kmKetThucGiaoHang : '';
        const bdGiao = item.batDauGiaoHang || '';
        const ktGiao = item.ketThucGiaoHang || '';
        const pt = item.phuongTien || '';
        const tx = item.taiXe || '';

        return `
            <tr data-doc-id="${item.id}" data-ma-phieu="${maPhieu}">
                <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: 600; font-size: 11.5px; color: #0f172a; white-space: nowrap;">
                    ${maPhieu}<br><span style="font-size: 10px; font-weight: normal; color: #64748b;">${item.doiTuong || ''}</span>
                </td>
                <td style="padding: 4px; border: 1px solid #cbd5e1;">
                    <input type="number" step="any" class="dc-km-bd" value="${kmBD}" style="width: 100%; box-sizing: border-box; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
                </td>
                <td style="padding: 4px; border: 1px solid #cbd5e1;">
                    <input type="number" step="any" class="dc-km-kt" value="${kmKT}" style="width: 100%; box-sizing: border-box; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
                </td>
                <td style="padding: 4px; border: 1px solid #cbd5e1;">
                    <input type="text" class="dc-bd-giao" value="${String(bdGiao).replace(/"/g, '&quot;')}" placeholder="VD: 2026-11-25 08:00" style="width: 100%; box-sizing: border-box; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
                </td>
                <td style="padding: 4px; border: 1px solid #cbd5e1;">
                    <input type="text" class="dc-kt-giao" value="${String(ktGiao).replace(/"/g, '&quot;')}" placeholder="VD: 2026-11-25 09:30" style="width: 100%; box-sizing: border-box; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
                </td>
                <td style="padding: 4px; border: 1px solid #cbd5e1;">
                    <input type="text" class="dc-phuong-tien" value="${String(pt).replace(/"/g, '&quot;')}" style="width: 100%; box-sizing: border-box; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
                </td>
                <td style="padding: 4px; border: 1px solid #cbd5e1;">
                    <input type="text" class="dc-tai-xe" value="${String(tx).replace(/"/g, '&quot;')}" style="width: 100%; box-sizing: border-box; padding: 5px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
                </td>
            </tr>
        `;
    }).join('');

    modal.innerHTML = `
        <div style="background: #fff; border-radius: 8px; max-width: 1060px; width: 100%; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
            <div style="background: #0284c7; color: #fff; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 13px;">✏️ Điều chỉnh thông tin vận chuyển (${rowsData.length} dòng)</strong>
                <button type="button" id="btnDongModalDieuChinh" style="background: transparent; border: none; color: #fff; font-size: 16px; cursor: pointer;">✕</button>
            </div>
            <div style="padding: 12px; overflow: auto; flex: 1;">
                <table style="width: 100%; border-collapse: collapse; min-width: 820px;">
                    <thead>
                        <tr style="background: #f1f5f9; font-size: 11px; color: #334155;">
                            <th style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: left;">maPhieu / Khách</th>
                            <th style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: left;">kmBatDauGiaoHang</th>
                            <th style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: left;">kmKetThucGiaoHang</th>
                            <th style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: left;">batDauGiaoHang</th>
                            <th style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: left;">ketThucGiaoHang</th>
                            <th style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: left;">phuongTien</th>
                            <th style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: left;">taiXe</th>
                        </tr>
                    </thead>
                    <tbody id="tbodyDieuChinhRows">
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
            <div style="padding: 10px 14px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" id="btnHuyDieuChinh" style="padding: 6px 12px; border: 1px solid #cbd5e1; background: #fff; color: #334155; border-radius: 6px; font-size: 12px; cursor: pointer;">Hủy</button>
                <button type="button" id="btnLuuDieuChinh" style="padding: 6px 14px; border: none; background: #16a34a; color: #fff; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">💾 Lưu vào TUYENDUONG-DIEUCHINH</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('btnDongModalDieuChinh').onclick = closeModal;
    document.getElementById('btnHuyDieuChinh').onclick = closeModal;

    document.getElementById('btnLuuDieuChinh').onclick = async function() {
        const btnLuu = this;
        const trList = modal.querySelectorAll('#tbodyDieuChinhRows tr');
        const recordsToSave = [];

        trList.forEach(tr => {
            const docId = tr.getAttribute('data-doc-id');
            const maPhieu = tr.getAttribute('data-ma-phieu') || docId;
            const kmBdRaw = tr.querySelector('.dc-km-bd').value.trim();
            const kmKtRaw = tr.querySelector('.dc-km-kt').value.trim();
            const bdGiaoVal = tr.querySelector('.dc-bd-giao').value.trim();
            const ktGiaoVal = tr.querySelector('.dc-kt-giao').value.trim();
            const phuongTienVal = tr.querySelector('.dc-phuong-tien').value.trim();
            const taiXeVal = tr.querySelector('.dc-tai-xe').value.trim();

            recordsToSave.push({
                docId,
                payload: {
                    maPhieu: maPhieu,
                    kmBatDauGiaoHang: kmBdRaw === "" ? "" : Number(kmBdRaw),
                    kmKetThucGiaoHang: kmKtRaw === "" ? "" : Number(kmKtRaw),
                    batDauGiaoHang: bdGiaoVal,
                    ketThucGiaoHang: ktGiaoVal,
                    phuongTien: phuongTienVal,
                    taiXe: taiXeVal
                }
            });
        });

        btnLuu.disabled = true;
        btnLuu.textContent = "Đang lưu...";

        try {
            await Promise.all(
                recordsToSave.map(rec =>
                    setDoc(doc(db, "TUYENDUONG-DIEUCHINH", rec.docId), rec.payload, { merge: true })
                )
            );

            // Cập nhật cache trên giao diện mà không sửa bảng TUYENDUONG
            const payloadById = {};
            recordsToSave.forEach(rec => {
                payloadById[rec.docId] = rec.payload;
            });

            window._cachedVanChuyenData = window._cachedVanChuyenData.map(item => {
                const p = payloadById[item.id];
                if (!p) return item;
                const updated = {
                    ...item,
                    kmBatDauGiaoHang: p.kmBatDauGiaoHang,
                    kmKetThucGiaoHang: p.kmKetThucGiaoHang,
                    batDauGiaoHang: p.batDauGiaoHang,
                    ketThucGiaoHang: p.ketThucGiaoHang,
                    phuongTien: p.phuongTien,
                    taiXe: p.taiXe,
                    _daDieuChinh: true
                };
                updated._ngayGom = layNgayGomNhom(updated);
                return updated;
            });

            window._selectedDieuChinhIds.clear();
            closeModal();
            hienThiDanhSachVanChuyen();
            alert(`Đã lưu điều chỉnh ${recordsToSave.length} dòng vào TUYENDUONG-DIEUCHINH!`);
        } catch (err) {
            console.error("Lỗi lưu TUYENDUONG-DIEUCHINH:", err);
            alert("Lỗi khi lưu điều chỉnh: " + err.message);
            btnLuu.disabled = false;
            btnLuu.textContent = "💾 Lưu vào TUYENDUONG-DIEUCHINH";
        }
    };
};

// PHẦN 6: LẮNG NGHE SỰ KIỆN GIAO DIỆN & TỰ ĐỘNG CHÈN THANH TAB NẰM CẠNH TIÊU ĐỀ
document.addEventListener('DOMContentLoaded', function() {
    const inputThangVC = document.getElementById('thangVanChuyen');
    const labelThangVC = document.getElementById('labelThangNamVC');
    const selectPhuongTien = document.getElementById('filterPhuongTien');
    const btnTaiDuLieu = document.getElementById('btnTaiLichSuVC');
    const container = document.getElementById('danhSachLichSuVanChuyen');

    if (btnTaiDuLieu) {
        btnTaiDuLieu.textContent = 'Tải';
    }

    const possibleTitles = document.querySelectorAll('h1, h2, h3, h4, .header-title, .title, span, div');
    let titleElement = null;
    for (let el of possibleTitles) {
        if (el.innerText && el.innerText.toUpperCase().includes("LỊCH SỬ VẬN CHUYỂN") && el.children.length === 0) {
            titleElement = el;
            break;
        }
    }

    if (titleElement) {
        let parentRow = document.createElement('div');
        parentRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 10px; flex-wrap: wrap; width: 100%; box-sizing: border-box;';
        
        titleElement.parentNode.insertBefore(parentRow, titleElement);
        parentRow.appendChild(titleElement);
        titleElement.style.margin = '0';

        const tabNavWrapper = document.createElement('div');
        tabNavWrapper.id = 'tabNavVanChuyenContainer';
        tabNavWrapper.style.cssText = 'display: flex; gap: 4px;';

        const tabsConfig = [
            { id: 'da-giao', label: 'Đã giao' },
            { id: 'chuan-bi', label: 'Chuẩn bị' },
            { id: 'cho', label: 'Chờ' }
        ];

        tabsConfig.forEach(tab => {
            const isActive = window._currentTabVanChuyen === tab.id;
            const tabBtn = document.createElement('button');
            tabBtn.type = 'button';
            tabBtn.innerText = tab.label;
            tabBtn.style.cssText = `
                padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: ${isActive ? '700' : '500'};
                cursor: pointer; border: 1px solid ${isActive ? '#0284c7' : '#cbd5e1'};
                background: ${isActive ? '#0284c7' : '#f8fafc'};
                color: ${isActive ? '#ffffff' : '#475569'};
                transition: all 0.2s ease;
            `;
            tabBtn.onclick = function() {
                window._currentTabVanChuyen = tab.id;
                document.querySelectorAll('#tabNavVanChuyenContainer button').forEach(btn => {
                    const isThisActive = btn.innerText === tab.label;
                    btn.style.fontWeight = isThisActive ? '700' : '500';
                    btn.style.borderColor = isThisActive ? '#0284c7' : '#cbd5e1';
                    btn.style.background = isThisActive ? '#0284c7' : '#f8fafc';
                    btn.style.color = isThisActive ? '#ffffff' : '#475569';
                });
                hienThiDanhSachVanChuyen();
            };
            tabNavWrapper.appendChild(tabBtn);
        });

        parentRow.appendChild(tabNavWrapper);
    }

    let inputTimKiemTuDo = document.getElementById('inputTimKiemTuDo');
    if (!inputTimKiemTuDo && selectPhuongTien && selectPhuongTien.parentNode) {
        inputTimKiemTuDo = document.createElement('input');
        inputTimKiemTuDo.id = 'inputTimKiemTuDo';
        inputTimKiemTuDo.type = 'text';
        inputTimKiemTuDo.placeholder = '🔍 Tìm kiếm...';
        inputTimKiemTuDo.style.cssText = 'padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; outline: none; width: 100px; transition: width 0.3s ease, box-shadow 0.3s ease;';
        
        inputTimKiemTuDo.addEventListener('focus', function() {
            this.style.width = '240px';
            this.style.boxShadow = '0 0 0 2px rgba(2, 132, 199, 0.2)';
            this.placeholder = '🔍 Nhập từ khóa tìm kiếm...';
        });

        inputTimKiemTuDo.addEventListener('blur', function() {
            if (!this.value) {
                this.style.width = '100px';
                this.style.boxShadow = 'none';
                this.placeholder = '🔍 Tìm kiếm...';
            }
        });

        selectPhuongTien.parentNode.insertBefore(inputTimKiemTuDo, selectPhuongTien.nextSibling);
    }

    // Tự động chèn nút icon máy in cạnh nút Tải
    if (btnTaiDuLieu && btnTaiDuLieu.parentNode && !document.getElementById('btnXuatPdfBangKe')) {
        const btnXuatPdf = document.createElement('button');
        btnXuatPdf.id = 'btnXuatPdfBangKe';
        btnXuatPdf.type = 'button';
        btnXuatPdf.title = 'Xuất PDF Bảng kê';
        btnXuatPdf.innerHTML = '🖨️';
        btnXuatPdf.style.cssText = 'padding: 6px 9px; background: #dc2626; color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; margin-left: 6px;';
        btnXuatPdf.onclick = function() {
            window.moChonKyInPdf();
        };
        btnTaiDuLieu.parentNode.insertBefore(btnXuatPdf, btnTaiDuLieu.nextSibling);
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    if (inputThangVC) {
        if (!inputThangVC.value) inputThangVC.value = `${year}-${month}`;
        const [currY, currM] = inputThangVC.value.split('-');
        if (labelThangVC) labelThangVC.innerText = `${currM}/${currY}`;

        if (container && container.innerHTML.trim() === "") {
            container.innerHTML = '<div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 13px;">Vui lòng chọn tháng và bấm nút <b>"Tải"</b> để xem lịch sử vận chuyển.</div>';
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
                if (typeof window.taiLichSuVanChuyen === 'function') {
                    window.taiLichSuVanChuyen(m, y);
                }
            } else {
                alert("Vui lòng chọn tháng năm trước khi tải!");
            }
        };
    }

    if (selectPhuongTien) {
        selectPhuongTien.addEventListener('change', function() {
            if (window._cachedVanChuyenData) {
                hienThiDanhSachVanChuyen();
            } else if (inputThangVC && inputThangVC.value) {
                const [y, m] = inputThangVC.value.split('-');
                window.taiLichSuVanChuyen(m, y);
            }
        });
    }

    if (inputTimKiemTuDo) {
        let timer = null;
        inputTimKiemTuDo.addEventListener('input', function() {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (window._cachedVanChuyenData) {
                    hienThiDanhSachVanChuyen();
                } else if (inputThangVC && inputThangVC.value) {
                    const [y, m] = inputThangVC.value.split('-');
                    window.taiLichSuVanChuyen(m, y);
                }
            }, 300);
        });
    }
});

// =========================================================================
// PHẦN 7: XUẤT PDF BẢNG KÊ VẬN CHUYỂN THEO KỲ TRONG THÁNG (DÙNG CACHE TUYENDUONG)
// =========================================================================
function chuyenNgaySangDate(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return null;
    const clean = ngayStr.trim().split(" ")[0];
    if (clean.includes("/")) {
        const parts = clean.split("/");
        if (parts.length === 3) {
            return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
    } else if (clean.includes("-")) {
        const parts = clean.split("-");
        if (parts.length === 3) {
            return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
    }
    return null;
}

function dinhDangNgayHienThi(ngayStr) {
    if (!ngayStr) return "";
    const d = chuyenNgaySangDate(ngayStr);
    if (!d || isNaN(d.getTime())) return ngayStr.trim().split(" ")[0];
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function dinhDangSoVN(val, decimals = 2, allowEmpty = false) {
    if (val === null || val === undefined || val === "") {
        return allowEmpty ? "" : (0).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    const num = Number(val);
    if (isNaN(num)) return allowEmpty ? "" : String(val);
    return num.toLocaleString('vi-VN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function dinhDangKmPdf(val) {
    const num = Number(val) || 0;
    const hasDecimal = Math.abs(num % 1) > 0.0001;
    return num.toLocaleString('vi-VN', {
        minimumFractionDigits: hasDecimal ? 1 : 0,
        maximumFractionDigits: hasDecimal ? 1 : 0
    });
}

function chuanHoaMaPhieuChungTu(maPhieuRaw) {
    let s = String(maPhieuRaw || "").trim();
    if (!s) return "";
    s = s.replace(/-11-26/gi, "");
    s = s.replace(/41-41-XKHG00/gi, "");
    s = s.replace(/^[-_\s]+|[-_\s]+$/g, "");
    if (!s) return "HG";
    if (!/^HG/i.test(s)) {
        s = `HG${s}`;
    }
    return s;
}

function layChungTuPdf(don) {
    const pxkTrim = don.pxk !== undefined && don.pxk !== null ? String(don.pxk).trim() : "";
    if (pxkTrim !== "" && pxkTrim !== "--") {
        return pxkTrim;
    }
    const maPhieuVal = don.maPhieu || don.id || "";
    return chuanHoaMaPhieuChungTu(maPhieuVal);
}

function layKhoangNgayCuaKy(kyChon, namNum, thangNum) {
    const ngayCuoiThang = new Date(namNum, thangNum, 0).getDate();
    if (kyChon === '16-cuoi') {
        return {
            tuNgay: new Date(namNum, thangNum - 1, 16),
            denNgay: new Date(namNum, thangNum - 1, ngayCuoiThang, 23, 59, 59, 999),
            ngayKySau: new Date(namNum, thangNum, 1),
            ngayCuoiKy: ngayCuoiThang,
            labelKy: `16/${String(thangNum).padStart(2, '0')}/${namNum} - ${String(ngayCuoiThang).padStart(2, '0')}/${String(thangNum).padStart(2, '0')}/${namNum}`
        };
    }
    return {
        tuNgay: new Date(namNum, thangNum - 1, 1),
        denNgay: new Date(namNum, thangNum - 1, 15, 23, 59, 59, 999),
        ngayKySau: new Date(namNum, thangNum - 1, 16),
        ngayCuoiKy: 15,
        labelKy: `01/${String(thangNum).padStart(2, '0')}/${namNum} - 15/${String(thangNum).padStart(2, '0')}/${namNum}`
    };
}

window.moChonKyInPdf = function() {
    const inputThangVC = document.getElementById('thangVanChuyen');
    const selectPhuongTien = document.getElementById('filterPhuongTien');

    if (!inputThangVC || !inputThangVC.value) {
        alert("Vui lòng chọn tháng năm trước khi xuất PDF!");
        return;
    }

    const bienSoChon = selectPhuongTien ? selectPhuongTien.value.trim() : "";
    if (!bienSoChon || bienSoChon.toLowerCase().includes("xe máy") || bienSoChon.toLowerCase().includes("tất cả")) {
        alert("Vui lòng chọn một biển số xe tải cụ thể (VD: 65C-06126) trong ô lọc Phương tiện để xuất Bảng kê!");
        return;
    }

    const [namStr, thangStr] = inputThangVC.value.split('-');
    const thangNum = parseInt(thangStr, 10);
    const namNum = parseInt(namStr, 10);
    const ngayCuoiThang = new Date(namNum, thangNum, 0).getDate();
    const mm2 = String(thangNum).padStart(2, '0');

    let popover = document.getElementById('popoverKyInBangKe');
    if (popover) popover.remove();

    const btnPdf = document.getElementById('btnXuatPdfBangKe');
    popover = document.createElement('div');
    popover.id = 'popoverKyInBangKe';
    popover.style.cssText = 'position: fixed; z-index: 9999; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.14); display: flex; flex-direction: column; gap: 6px; min-width: 195px; font-family: Arial, sans-serif;';

    if (btnPdf) {
        const rect = btnPdf.getBoundingClientRect();
        popover.style.top = `${Math.min(window.innerHeight - 110, rect.bottom + 6)}px`;
        popover.style.left = `${Math.max(8, Math.min(window.innerWidth - 210, rect.left))}px`;
    } else {
        popover.style.top = '80px';
        popover.style.left = '50%';
    }

    popover.innerHTML = `
        <div style="font-size: 11px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            Chọn kỳ in (${bienSoChon})
        </div>
        <button type="button" data-ky="01-15" style="text-align: left; padding: 6px 8px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1e40af; border-radius: 5px; font-size: 11.5px; font-weight: 600; cursor: pointer;">
            01/${mm2}/${namNum} – 15/${mm2}/${namNum}
        </button>
        <button type="button" data-ky="16-cuoi" style="text-align: left; padding: 6px 8px; border: 1px solid #bbf7d0; background: #f0fdf4; color: #166534; border-radius: 5px; font-size: 11.5px; font-weight: 600; cursor: pointer;">
            16/${mm2}/${namNum} – ${ngayCuoiThang}/${mm2}/${namNum}
        </button>
    `;

    popover.querySelectorAll('button[data-ky]').forEach(b => {
        b.onclick = function() {
            const ky = this.getAttribute('data-ky');
            popover.remove();
            window.xuatPdfBangKeVanChuyen(ky);
        };
    });

    document.body.appendChild(popover);

    setTimeout(() => {
        const closeOutside = (ev) => {
            if (!popover.contains(ev.target) && ev.target !== btnPdf && !(btnPdf && btnPdf.contains(ev.target))) {
                popover.remove();
                document.removeEventListener('click', closeOutside);
            }
        };
        document.addEventListener('click', closeOutside);
    }, 0);
};

window.xuatPdfBangKeVanChuyen = async function(kyChon = '01-15') {
    const inputThangVC = document.getElementById('thangVanChuyen');
    const selectPhuongTien = document.getElementById('filterPhuongTien');

    if (!inputThangVC || !inputThangVC.value) {
        alert("Vui lòng chọn tháng năm trước khi xuất PDF!");
        return;
    }

    const bienSoChon = selectPhuongTien ? selectPhuongTien.value.trim() : "";
    if (!bienSoChon || bienSoChon.toLowerCase().includes("xe máy") || bienSoChon.toLowerCase().includes("tất cả")) {
        alert("Vui lòng chọn một biển số xe tải cụ thể (VD: 65C-06126) trong ô lọc Phương tiện để xuất Bảng kê!");
        return;
    }

    const [namStr, thangStr] = inputThangVC.value.split('-');
    const thangNum = parseInt(thangStr, 10);
    const namNum = parseInt(namStr, 10);
    const { tuNgay, denNgay, ngayKySau, ngayCuoiKy, labelKy } = layKhoangNgayCuaKy(kyChon, namNum, thangNum);

    const btnPdf = document.getElementById('btnXuatPdfBangKe');
    const oldText = btnPdf ? btnPdf.innerHTML : "";
    if (btnPdf) {
        btnPdf.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btnPdf.disabled = true;
    }

    const tinhKmDiCuaChuyen = (dons) => {
        if (!dons || dons.length === 0) return 0;
        const donDau = dons[0];
        const donCuoi = dons[dons.length - 1];
        const hasKmBD = donDau.kmBatDauGiaoHang !== undefined && donDau.kmBatDauGiaoHang !== null && String(donDau.kmBatDauGiaoHang).trim() !== "";
        const hasKmKT = donCuoi.kmKetThucGiaoHang !== undefined && donCuoi.kmKetThucGiaoHang !== null && String(donCuoi.kmKetThucGiaoHang).trim() !== "";
        const kmBDDau = hasKmBD ? Number(donDau.kmBatDauGiaoHang) : NaN;
        const kmKTCuoi = hasKmKT ? Number(donCuoi.kmKetThucGiaoHang) : NaN;
        if (!isNaN(kmBDDau) && !isNaN(kmKTCuoi)) {
            return kmKTCuoi - kmBDDau;
        }
        return 0;
    };

    const tinhKmVeCuaChuyen = (chuyenHienTai, chuyenKeTiep, isLastTripInPeriod, cauHinhKySau) => {
        if (!chuyenHienTai || !chuyenHienTai.dons || chuyenHienTai.dons.length === 0) return 0;
        const donCuoi = chuyenHienTai.dons[chuyenHienTai.dons.length - 1];
        const hasKmKT = donCuoi.kmKetThucGiaoHang !== undefined && donCuoi.kmKetThucGiaoHang !== null && String(donCuoi.kmKetThucGiaoHang).trim() !== "";
        const kmKTCuoi = hasKmKT ? Number(donCuoi.kmKetThucGiaoHang) : NaN;
        if (isNaN(kmKTCuoi)) return 0;

        if (isLastTripInPeriod) {
            const hasKmDauKySau = cauHinhKySau && cauHinhKySau.kmDauKy !== undefined && cauHinhKySau.kmDauKy !== null && String(cauHinhKySau.kmDauKy).trim() !== "";
            const kmDauKySau = hasKmDauKySau ? Number(cauHinhKySau.kmDauKy) : NaN;
            if (!isNaN(kmDauKySau)) {
                return kmDauKySau - kmKTCuoi;
            }
            return 0;
        }

        if (!chuyenKeTiep || !chuyenKeTiep.dons || chuyenKeTiep.dons.length === 0) return 0;
        const rawKmBDSau = chuyenKeTiep.dons[0].kmBatDauGiaoHang;
        const hasKmBDSau = rawKmBDSau !== undefined && rawKmBDSau !== null && String(rawKmBDSau).trim() !== "";
        const kmBDChuyenSau = hasKmBDSau ? Number(rawKmBDSau) : NaN;
        if (!isNaN(kmBDChuyenSau)) {
            return kmBDChuyenSau - kmKTCuoi;
        }
        return 0;
    };

    try {
        // 1. Lấy cấu hình PHUONGTIEN và dữ liệu đổ thêm từ NHIENLIEU
        const qPt = query(collection(db, "PHUONGTIEN"), where("bienSo", "==", bienSoChon));
        const qNl = query(collection(db, "NHIENLIEU"), where("bienSo", "==", bienSoChon));
        const [snapPt, snapNl] = await Promise.all([getDocs(qPt), getDocs(qNl)]);

        let dsCauHinhXe = [];
        snapPt.forEach(docSnap => {
            const d = docSnap.data();
            const dateApDung = chuyenNgaySangDate(d.ngayApDung);
            dsCauHinhXe.push({
                ...d,
                _dateApDung: dateApDung || new Date(2000, 0, 1)
            });
        });

        dsCauHinhXe.sort((a, b) => a._dateApDung - b._dateApDung);

        if (dsCauHinhXe.length === 0) {
            alert(`Không tìm thấy cấu hình phương tiện "${bienSoChon}" trong bảng PHUONGTIEN!`);
            return;
        }

        const layCauHinhTaiNgay = (dateObj) => {
            let chosen = dsCauHinhXe[0];
            for (let i = 0; i < dsCauHinhXe.length; i++) {
                if (dsCauHinhXe[i]._dateApDung <= dateObj) {
                    chosen = dsCauHinhXe[i];
                }
            }
            return chosen;
        };

        const cauHinhKy = layCauHinhTaiNgay(tuNgay);
        const cauHinhKySau = dsCauHinhXe.find(cfg => cfg._dateApDung >= ngayKySau) || null;
        const kmDauKyGoc = Number(cauHinhKy.kmDauKy) || 0;
        const dauDauKyGoc = Number(cauHinhKy.dauDauKy) || 0;
        const dinhMucHienThi = Number(cauHinhKy.dinhMuc) || 0.16;
        const nguongNoiO = Number(cauHinhKy.noiO) || 60;

        // Gom nhiên liệu đổ thêm theo ngày hiển thị (DD/MM/YYYY) trong kỳ báo cáo
        let mapDoThemTheoNgay = {};
        let tongDoThemLit = 0;
        snapNl.forEach(docSnap => {
            const nl = docSnap.data();
            const rawNgayDo = nl.ngayDo || (nl.nam && nl.thang ? `${nl.nam}-${String(nl.thang).padStart(2, '0')}-01` : "");
            const dateDo = chuyenNgaySangDate(rawNgayDo);
            if (!dateDo || isNaN(dateDo.getTime())) return;
            if (dateDo < tuNgay || dateDo > denNgay) return;

            const ngayKey = dinhDangNgayHienThi(rawNgayDo);
            const soLitNum = Number(nl.soLit) || 0;

            tongDoThemLit += soLitNum;
            if (!mapDoThemTheoNgay[ngayKey]) {
                mapDoThemTheoNgay[ngayKey] = { soLit: 0 };
            }
            mapDoThemTheoNgay[ngayKey].soLit += soLitNum;
        });

        // 2. Lấy dữ liệu TUYENDUONG từ bộ nhớ tạm (cache); nếu chưa có thì tải theo tháng/năm đang chọn
        if (!Array.isArray(window._cachedVanChuyenData)) {
            await window.taiLichSuVanChuyen(thangNum, namNum);
        }
        const sourceData = Array.isArray(window._cachedVanChuyenData) ? window._cachedVanChuyenData : [];

        let allDocsXe = [];
        sourceData.forEach(merged => {
            if ((merged.phuongTien || "").trim() !== bienSoChon) return;

            if (laDonThuocNhomDaGiao(merged)) {
                const rawNgay = merged.ngayThangNam || layNgayGomNhom(merged);
                const dateChuyen = chuyenNgaySangDate(rawNgay);
                allDocsXe.push({
                    ...merged,
                    _rawNgay: rawNgay,
                    _dateChuyen: dateChuyen
                });
            }
        });

        let mapChuyenTrongKy = {};

        allDocsXe.forEach(d => {
            if (!d._dateChuyen || d._dateChuyen < tuNgay || d._dateChuyen > denNgay) return;

            const ngayKey = dinhDangNgayHienThi(d._rawNgay);
            const soChuyen = (d.chuyenVtracking !== undefined && d.chuyenVtracking !== null && d.chuyenVtracking !== "") ? d.chuyenVtracking : 1;
            const tripKey = `${ngayKey}_CHUYEN_${soChuyen}`;

            if (!mapChuyenTrongKy[tripKey]) {
                mapChuyenTrongKy[tripKey] = {
                    ngayStr: ngayKey,
                    dateObj: d._dateChuyen,
                    soChuyen: Number(soChuyen) || 1,
                    dons: []
                };
            }
            mapChuyenTrongKy[tripKey].dons.push(d);
        });

        let dsChuyenTrongKy = Object.values(mapChuyenTrongKy).sort((a, b) => {
            if (a.dateObj - b.dateObj !== 0) return a.dateObj - b.dateObj;
            return a.soChuyen - b.soChuyen;
        });

        dsChuyenTrongKy.forEach((chuyen, idx) => {
            chuyen.dons.sort((a, b) => (a.ketThucGiaoHang || "").localeCompare(b.ketThucGiaoHang || ""));
            chuyen.kmDi = tinhKmDiCuaChuyen(chuyen.dons);
            const isLastTripInPeriod = idx === dsChuyenTrongKy.length - 1;
            chuyen.kmVe = tinhKmVeCuaChuyen(chuyen, dsChuyenTrongKy[idx + 1], isLastTripInPeriod, cauHinhKySau);
            chuyen.kmChuyen = chuyen.kmDi + chuyen.kmVe;
        });

        const dongHoKmDauKy = Math.round(kmDauKyGoc);

        // 3. Xử lý từng chuyến: ghi thẳng "DD/MM/YYYY - CHUYẾN X" vào cột Nơi giao, điền ĐỔ THÊM và TỒN trên hàng tổng của ngày đó
        let bangKeRows = [];
        let tongKmNoiO = 0;
        let tongKmTinh = 0;
        let tongKmTatCaChuyen = 0;
        let tongTieuThuLit = 0;
        let tonHienTai = dauDauKyGoc;
        let ngayDaDienDoThem = new Set();

        dsChuyenTrongKy.forEach(chuyen => {
            const cfgNgay = layCauHinhTaiNgay(chuyen.dateObj);
            const dinhMucChuyen = Number(cfgNgay.dinhMuc) || dinhMucHienThi;
            const noiOChuyen = Number(cfgNgay.noiO) || nguongNoiO;

            const kmChuyen = chuyen.kmChuyen;
            tongKmTatCaChuyen += kmChuyen;
            if (kmChuyen <= noiOChuyen) {
                tongKmNoiO += kmChuyen;
            } else {
                tongKmTinh += kmChuyen;
            }

            let groupedStops = [];
            let stopIndexMap = {};

            chuyen.dons.forEach((don, index) => {
                let kmGiaoDon = 0;
                const hasKmKT = don.kmKetThucGiaoHang !== undefined && don.kmKetThucGiaoHang !== null && String(don.kmKetThucGiaoHang).trim() !== "";
                const kmKT = hasKmKT ? Number(don.kmKetThucGiaoHang) : NaN;
                if (!isNaN(kmKT)) {
                    if (index === 0) {
                        const hasKmBD = don.kmBatDauGiaoHang !== undefined && don.kmBatDauGiaoHang !== null && String(don.kmBatDauGiaoHang).trim() !== "";
                        const kmBD = hasKmBD ? Number(don.kmBatDauGiaoHang) : NaN;
                        if (!isNaN(kmBD)) kmGiaoDon = kmKT - kmBD;
                    } else {
                        const rawKmKTTruoc = chuyen.dons[index - 1]?.kmKetThucGiaoHang;
                        const hasKmKTTruoc = rawKmKTTruoc !== undefined && rawKmKTTruoc !== null && String(rawKmKTTruoc).trim() !== "";
                        const kmKTTruoc = hasKmKTTruoc ? Number(rawKmKTTruoc) : NaN;
                        if (!isNaN(kmKTTruoc)) kmGiaoDon = kmKT - kmKTTruoc;
                    }
                }

                const dt = (don.doiTuong || "").trim();
                const dv = (don.dinhVi || "").trim();
                const groupKey = `${dt}___${dv}`;
                const chungTuStr = layChungTuPdf(don);

                if (stopIndexMap[groupKey] === undefined) {
                    stopIndexMap[groupKey] = groupedStops.length;
                    groupedStops.push({
                        noiGiao: dt,
                        km: kmGiaoDon,
                        pxkList: chungTuStr ? [chungTuStr] : []
                    });
                } else {
                    const idx = stopIndexMap[groupKey];
                    groupedStops[idx].km += kmGiaoDon;
                    if (chungTuStr && !groupedStops[idx].pxkList.includes(chungTuStr)) {
                        groupedStops[idx].pxkList.push(chungTuStr);
                    }
                }
            });

            let tongLitDiChuan = chuyen.kmDi * dinhMucChuyen;
            let congDonLitDi = 0;
            let tongKmCuaChuyen = 0;
            let tongLitCuaChuyen = 0;
            const chiTietRowsCuaChuyen = [];

            groupedStops.forEach((stop, i) => {
                let litHang = 0;
                if (i === groupedStops.length - 1 && groupedStops.length > 0 && chuyen.kmDi !== 0) {
                    litHang = Number((tongLitDiChuan - congDonLitDi).toFixed(2));
                } else {
                    litHang = Number((stop.km * dinhMucChuyen).toFixed(2));
                    congDonLitDi += litHang;
                }

                tongKmCuaChuyen += stop.km;
                tongLitCuaChuyen += litHang;
                tongTieuThuLit += litHang;

                chiTietRowsCuaChuyen.push({
                    noiGiao: stop.noiGiao,
                    km: dinhDangKmPdf(stop.km),
                    kmNum: stop.km,
                    tieuThu: dinhDangSoVN(litHang, 2),
                    tieuThuNum: litHang,
                    doThem: "",
                    ton: "",
                    chungTu: stop.pxkList.join(", ")
                });
            });

            const kmVe = chuyen.kmVe;
            const litVe = Number((kmVe * dinhMucChuyen).toFixed(2));
            tongKmCuaChuyen += kmVe;
            tongLitCuaChuyen = Number((tongLitCuaChuyen + litVe).toFixed(2));
            tongTieuThuLit += litVe;

            chiTietRowsCuaChuyen.push({
                noiGiao: "Về kho",
                km: dinhDangKmPdf(kmVe),
                kmNum: kmVe,
                tieuThu: dinhDangSoVN(litVe, 2),
                tieuThuNum: litVe,
                doThem: "",
                ton: "",
                chungTu: ""
            });

            let doThemNgayNum = 0;
            let doThemNgayStr = "";
            const infoDoNgay = mapDoThemTheoNgay[chuyen.ngayStr];
            if (infoDoNgay && !ngayDaDienDoThem.has(chuyen.ngayStr)) {
                doThemNgayNum = infoDoNgay.soLit;
                doThemNgayStr = dinhDangSoVN(doThemNgayNum, 2);
                ngayDaDienDoThem.add(chuyen.ngayStr);
            }

            tonHienTai = Number((tonHienTai + doThemNgayNum - tongLitCuaChuyen).toFixed(2));

            bangKeRows.push({
                noiGiao: `${chuyen.ngayStr} - CHUYẾN ${chuyen.soChuyen}`,
                km: dinhDangKmPdf(tongKmCuaChuyen),
                kmNum: tongKmCuaChuyen,
                tieuThu: dinhDangSoVN(tongLitCuaChuyen, 2),
                tieuThuNum: tongLitCuaChuyen,
                doThem: doThemNgayStr,
                ton: dinhDangSoVN(tonHienTai, 2),
                tonNum: tonHienTai,
                chungTu: "",
                isTongChuyen: true
            });

            bangKeRows.push(...chiTietRowsCuaChuyen);
        });

        const tonCuoiKyLit = dauDauKyGoc + tongDoThemLit - tongTieuThuLit;
        const dongHoKmCuoiKy = Math.round(dongHoKmDauKy + tongKmTatCaChuyen);
        const dinhMucLit100Km = Math.round(dinhMucHienThi * 100);

        const minRows = 16;
        while (bangKeRows.length < minRows) {
            bangKeRows.push({ noiGiao: "&nbsp;", km: "", tieuThu: "", doThem: "", ton: "", chungTu: "" });
        }

        // 4. Tạo giao diện HTML chuẩn A4 và mở hộp thoại in/lưu PDF
        const rowsHtml = bangKeRows.map(r => {
            const isNegative = (typeof r.kmNum === 'number' && r.kmNum < 0) || (typeof r.tieuThuNum === 'number' && r.tieuThuNum < 0) || (typeof r.tonNum === 'number' && r.tonNum < 0);
            const styles = [];
            if (r.isTongChuyen) styles.push('font-weight: bold;', 'background-color: #e5e7eb;', '-webkit-print-color-adjust: exact;', 'print-color-adjust: exact;');
            if (isNegative) styles.push('color: #dc2626 !important;');
            const trStyle = styles.length > 0 ? ` style="${styles.join(' ')}"` : '';
            return `
            <tr${trStyle}>
                <td style="text-align: left; padding-left: 6px;">${r.noiGiao}</td>
                <td style="text-align: right; padding-right: 6px;">${r.km}</td>
                <td style="text-align: right; padding-right: 6px;">${r.tieuThu}</td>
                <td style="text-align: right; padding-right: 6px;">${r.doThem}</td>
                <td style="text-align: right; padding-right: 6px;">${r.ton}</td>
                <td style="text-align: left; padding-left: 6px;">${r.chungTu}</td>
            </tr>
        `;
        }).join("");

        const ngayKyStr = `Cần Thơ, ngày ${String(ngayCuoiKy).padStart(2, '0')} tháng ${String(thangNum).padStart(2, '0')} năm ${namNum}`;

        const printWindow = window.open('', '_blank', 'width=900,height=1100');
        if (!printWindow) {
            alert("Trình duyệt đang chặn cửa sổ bật lên (Pop-up). Vui lòng cho phép mở Pop-up để xuất PDF!");
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>Bảng Kê Vận Chuyển (${labelKy}) - ${bienSoChon}</title>
                <style>
                    @page {
                        size: A4 portrait;
                        margin: 10mm 10mm 10mm 10mm;
                    }
                    body {
                        font-family: "Times New Roman", Times, serif;
                        font-size: 10.5px;
                        color: #000;
                        margin: 0;
                        padding: 0;
                    }
                    .company-header {
                        font-weight: bold;
                        font-size: 10.5px;
                        line-height: 1.3;
                        text-align: left;
                    }
                    .doc-title {
                        text-align: center;
                        font-weight: bold;
                        font-size: 14px;
                        margin: 5px 0 2px 0;
                        text-transform: uppercase;
                    }
                    .doc-period {
                        text-align: center;
                        font-style: italic;
                        font-size: 10.5px;
                        margin-bottom: 4px;
                    }
                    .sub-info {
                        display: flex;
                        justify-content: space-between;
                        font-size: 10.5px;
                        margin-bottom: 3px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                    }
                    th, td {
                        border: 1px solid #000;
                        padding: 1.5px 4px;
                        font-size: 10px;
                        line-height: 1.15;
                        word-wrap: break-word;
                        height: 14px;
                    }
                    th {
                        background-color: #d9d9d9 !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        font-weight: bold;
                        text-align: center;
                        height: 16px;
                    }
                    .summary-table {
                        margin-top: 6px;
                    }
                    .summary-table td {
                        text-align: center;
                        font-weight: bold;
                        height: 16px;
                    }
                    .footer-sign {
                        margin-top: 10px;
                        width: 100%;
                    }
                    .sign-date {
                        text-align: right;
                        font-style: italic;
                        font-size: 10.5px;
                        padding-right: 25px;
                        margin-bottom: 3px;
                    }
                    .sign-cols {
                        display: flex;
                        justify-content: space-around;
                        text-align: center;
                        font-weight: bold;
                        font-size: 10.5px;
                    }
                    @media print {
                        .no-print { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="background: #f1f5f9; padding: 8px 12px; margin-bottom: 10px; border-bottom: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; font-family: Arial, sans-serif;">
                    <span style="font-size: 12px; color: #334155;">Xem trước bản in PDF kỳ <b>${labelKy}</b> (Chọn <b>Lưu dưới dạng PDF / Save as PDF</b> trong hộp thoại in)</span>
                    <button onclick="window.print()" style="background: #0284c7; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer;">🖨️ In / Lưu PDF ngay</button>
                </div>

                <div class="company-header">
                    CÔNG TY CỔ PHẦN VẬT TƯ HẬU GIANG<br>
                    PHÒNG KINH DOANH SƠN
                </div>

                <div class="doc-title">BẢNG KÊ VẬN CHUYỂN THÁNG ${String(thangNum).padStart(2, '0')}/${namNum}</div>
                <div class="doc-period">Kỳ báo cáo: ${labelKy}</div>

                <div class="sub-info">
                    <span>Phương tiện: <strong>${bienSoChon}</strong></span>
                    <span>Định mức: <strong>${dinhMucLit100Km} lít/100 km</strong></span>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th rowspan="2" style="width: 43%;">NƠI GIAO</th>
                            <th rowspan="2" style="width: 8%;">KM</th>
                            <th colspan="3" style="width: 31%;">NHIÊN LIỆU (lít)</th>
                            <th rowspan="2" style="width: 18%;">CHỨNG TỪ</th>
                        </tr>
                        <tr>
                            <th style="width: 10.33%;">TIÊU THỤ</th>
                            <th style="width: 10.33%;">ĐỔ THÊM</th>
                            <th style="width: 10.34%;">TỒN</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <table class="summary-table">
                    <thead>
                        <tr>
                            <th colspan="2" style="width: 22%;">ĐỒNG HỒ KM</th>
                            <th colspan="3" style="width: 33%;">TỔNG QUÃNG ĐƯỜNG (km)</th>
                            <th colspan="4" style="width: 45%;">NHIÊN LIỆU (lít)</th>
                        </tr>
                        <tr>
                            <th style="width: 11%;">ĐẦU KỲ</th>
                            <th style="width: 11%;">CUỐI KỲ</th>
                            <th style="width: 11%;">NỘI Ô</th>
                            <th style="width: 11%;">TỈNH</th>
                            <th style="width: 11%;">TỔNG</th>
                            <th style="width: 11.25%;">TỒN ĐẦU KỲ</th>
                            <th style="width: 11.25%;">ĐỔ THÊM</th>
                            <th style="width: 11.25%;">TIÊU THỤ</th>
                            <th style="width: 11.25%;">TỒN CUỐI KỲ</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${dongHoKmDauKy.toLocaleString('vi-VN')}</td>
                            <td>${dongHoKmCuoiKy.toLocaleString('vi-VN')}</td>
                            <td>${Math.round(tongKmNoiO).toLocaleString('vi-VN')}</td>
                            <td>${Math.round(tongKmTinh).toLocaleString('vi-VN')}</td>
                            <td>${Math.round(tongKmTatCaChuyen).toLocaleString('vi-VN')}</td>
                            <td>${dinhDangSoVN(dauDauKyGoc, 2)}</td>
                            <td>${dinhDangSoVN(tongDoThemLit, 2)}</td>
                            <td>${dinhDangSoVN(tongTieuThuLit, 2)}</td>
                            <td>${dinhDangSoVN(tonCuoiKyLit, 2)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer-sign">
                    <div class="sign-date">${ngayKyStr}</div>
                    <div class="sign-cols">
                        <div style="width: 33%;">Trưởng đơn vị</div>
                        <div style="width: 33%;">Người kiểm tra</div>
                        <div style="width: 33%;">Người lập bảng</div>
                    </div>
                </div>

                <script>
                    window.onload = function() {
                        setTimeout(function() { window.print(); }, 300);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();

    } catch (err) {
        console.error("Lỗi khi xuất PDF Bảng kê:", err);
        alert("Có lỗi xảy ra khi tổng hợp dữ liệu xuất PDF: " + err.message);
    } finally {
        if (btnPdf) {
            btnPdf.innerHTML = oldText;
            btnPdf.disabled = false;
        }
    }
};
