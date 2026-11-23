// PHẦN 1: KHỞI TẠO, IMPORT VÀ BIẾN TOÀN CỤC (CACHE & TAB)
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
const db = window.db;
window._cachedVanChuyenData = null;        // Biến lưu trữ bộ nhớ tạm (cache) dữ liệu vận chuyển sau khi tải từ Firebase
window._currentTabVanChuyen = 'da-giao';    // Biến lưu tab hiện tại ('da-giao', 'chuan-bi', 'cho')

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

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            window._cachedVanChuyenData = [];
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không có chuyến vận chuyển nào trong Tháng ${thangNum}/${namNum}.</div>`;
            return;
        }

        let listData = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const ngayGom = layNgayGomNhom(data);
            listData.push({ id: docSnap.id, ...data, _ngayGom: ngayGom });
        });
        
        window._cachedVanChuyenData = listData;
        hienThiDanhSachVanChuyen();

    } catch (error) {
        console.error("Lỗi tải lịch sử vận chuyển: ", error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 13px;">Lỗi tải dữ liệu lịch sử vận chuyển!</div>';
    }
};

function hienThiDanhSachVanChuyen() {
    const container = document.getElementById('danhSachLichSuVanChuyen');
    if (!container) return;

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
            return duyetVal === "Đã giao hàng" || duyetVal === "Đang giao hàng";
        } else if (window._currentTabVanChuyen === 'chuan-bi') {
            return duyetVal === "Đã xuất kho" || duyetVal === "Chờ xuất kho";
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
            trip.dons.sort((a, b) => (a.maPhieu || "").localeCompare(b.maPhieu || ""));
            trip.dons.forEach((don, i) => { don._thuTu = i + 1; don._kmTinhToan = 0; });
        } else if (laNhomChuaGiao) {
            let donsChuaGiao = [];
            let donsDaGiao = [];

            trip.dons.forEach(don => {
                const trangThaiDuyet = don.duyet ? don.duyet.trim() : "";
                const laChuaGiaoHoanToan = !trangThaiDuyet || trangThaiDuyet === "" || trangThaiDuyet.toLowerCase().includes("chuẩn bị") || trangThaiDuyet.toLowerCase().includes("đã xuất");
                
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
                const kmBDDau = Number(donDau.kmBatDauGiaoHang) || 0;
                const kmKTCuoi = Number(donCuoi.kmKetThucGiaoHang) || 0;

                if (kmBDDau > 0 && kmKTCuoi >= kmBDDau) {
                    kmDi = kmKTCuoi - kmBDDau;
                }

                if (!trip.isXeMay) {
                    for (let nextIdx = idx + 1; nextIdx < allTripsArray.length; nextIdx++) {
                        let nextTrip = allTripsArray[nextIdx];
                        if (!nextTrip.isXeMay && nextTrip.phuongTien === trip.phuongTien && nextTrip.dons.length > 0) {
                            const kmBDChuyenSau = Number(nextTrip.dons[0].kmBatDauGiaoHang) || 0;
                            if (kmBDChuyenSau > 0 && kmBDChuyenSau >= kmKTCuoi) {
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

            let odometerSum = (typeof trip._kmVeNum === 'number' && trip._kmVeNum > 0) ? (trip.kmDi + trip._kmVeNum) + 'km' : (trip.kmDi + 'km');

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
    const kmKT = Number(data.kmKetThucGiaoHang) || 0;
    if (kmKT > 0) {
        let kmGiao = 0;
        if (index === 0) {
            const kmBD = Number(data.kmBatDauGiaoHang) || 0;
            if (kmBD > 0) kmGiao = kmKT - kmBD;
        } else {
            const kmKTTruoc = Number(danhSachDon[index - 1]?.kmKetThucGiaoHang) || 0;
            if (kmKTTruoc > 0) kmGiao = kmKT - kmKTTruoc;
        }
        kmGiaoText = `⏱️ ${kmGiao}km`;
    } else {
        kmGiaoText = `⏱️ 0km`;
    }

    let kmKhachVtrackingNum = data.kmKhachVtracking !== undefined ? Number(data.kmKhachVtracking) : 0;
    let kmKhachVtrackingText = `📍 ${kmKhachVtrackingNum.toFixed(1)}km`;

    let badgeThuTu = '';
    const trangThaiDuyet = data.duyet ? data.duyet.trim() : "";
    const laChuaGiaoHoanToan = !trangThaiDuyet || trangThaiDuyet === "" || trangThaiDuyet.toLowerCase().includes("chuẩn bị") || trangThaiDuyet.toLowerCase().includes("đã xuất");
    
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

    let badgeDuyet = `<span style="color: #64748b; font-size: 10.5px;">${duyet}</span>`;
    if (duyet === "Đã giao hàng" || duyet === "Đang giao hàng") {
        badgeDuyet = `<span style="color: #16a34a; font-size: 10.5px; font-weight: 600;">✓ Đã giao (<span style="color: #0284c7;">${kmGiaoText} <span style="color: #cbd5e1;">|</span> ${kmKhachVtrackingText}</span>)</span>`;
    } else if (duyet === "Đã xuất kho") {
        let kmHienThi = data._kmTinhToan !== undefined ? data._kmTinhToan : 0;
        badgeDuyet = `<span style="color: #d97706; font-size: 10.5px; font-weight: 600;">📦 Đã xuất (${kmHienThi}km)</span>`;
    } else if (laChuaGiaoHoanToan) {
        let kmHienThi = data._kmTinhToan !== undefined ? data._kmTinhToan : 0;
        badgeDuyet = `<span style="color: #9333ea; font-size: 10.5px; font-weight: 600;">⏳ Chưa giao (${kmHienThi}km)</span>`;
    }

    const cardItem = document.createElement('div');
    cardItem.className = 'card-lich-su-item';
    cardItem.style.cssText = 'background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 7px; margin-bottom: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); width: 100%; box-sizing: border-box;';

    cardItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px; margin-bottom: 2px;">
            <div>
                <strong style="color: #0f172a; font-size: 11.5px;">${maPhieu}</strong>
                <span style="font-size: 9.5px; color: #64748b; margin-left: 4px;">(PXK: ${maPXK})</span><strong style="color: #0f172a; font-size: 8px; margin-left: 3px;">${chuyenVal}</strong>
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
                ${badgeThuTu}
                ${badgeHT}
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

    parentElement.appendChild(cardItem);
}

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

    const moPickerThang = () => {
        if (!inputThangVC) return;
        inputThangVC.disabled = false;
        inputThangVC.readOnly = false;
        try { inputThangVC.focus({ preventScroll: true }); } catch (e) {}
        if (typeof inputThangVC.showPicker === 'function') {
            try { inputThangVC.showPicker(); return; } catch (e) {}
        }
        try { inputThangVC.click(); } catch (e) {}
    };

    if (inputThangVC) {
        inputThangVC.disabled = false;
        inputThangVC.readOnly = false;
        inputThangVC.style.position = 'relative';
        inputThangVC.style.zIndex = '5';
        inputThangVC.style.pointerEvents = 'auto';
        inputThangVC.style.cursor = 'pointer';
        inputThangVC.addEventListener('click', function() {
            if (typeof this.showPicker === 'function') {
                try { this.showPicker(); } catch (e) {}
            }
        });
        if (inputThangVC.parentElement) {
            inputThangVC.parentElement.addEventListener('click', function(e) {
                if (e.target !== inputThangVC) moPickerThang();
            });
        }
    }

    if (labelThangVC && inputThangVC) {
        labelThangVC.style.cursor = 'pointer';
        labelThangVC.addEventListener('click', function(e) {
            e.preventDefault();
            moPickerThang();
        });
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
// PHẦN 7: XUẤT PDF BẢNG KÊ VẬN CHUYỂN THEO KỲ TRONG THÁNG
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

function catSoKhongDau(pxkStr) {
    if (pxkStr === undefined || pxkStr === null) return "";
    return String(pxkStr).trim().replace(/^0+/, "");
}

function layKhoangNgayCuaKy(kyChon, namNum, thangNum) {
    const ngayCuoiThang = new Date(namNum, thangNum, 0).getDate();
    if (kyChon === '16-cuoi') {
        return {
            tuNgay: new Date(namNum, thangNum - 1, 16),
            denNgay: new Date(namNum, thangNum - 1, ngayCuoiThang, 23, 59, 59, 999),
            labelKy: `16/${String(thangNum).padStart(2, '0')}/${namNum} - ${String(ngayCuoiThang).padStart(2, '0')}/${String(thangNum).padStart(2, '0')}/${namNum}`
        };
    }
    return {
        tuNgay: new Date(namNum, thangNum - 1, 1),
        denNgay: new Date(namNum, thangNum - 1, 15, 23, 59, 59, 999),
        labelKy: `01/${String(thangNum).padStart(2, '0')}/${namNum} - 15/${String(thangNum).padStart(2, '0')}/${namNum}`
    };
}

function tinhKmTungDonTheoDongHo(donsSorted) {
    const kmMap = new Map();
    for (let i = 0; i < donsSorted.length; i++) {
        const don = donsSorted[i];
        const kmKT = Number(don.kmKetThucGiaoHang) || 0;
        let kmGiao = 0;

        if (kmKT > 0) {
            if (i === 0) {
                const kmBD = Number(don.kmBatDauGiaoHang) || 0;
                if (kmBD > 0 && kmKT >= kmBD) {
                    kmGiao = kmKT - kmBD;
                }
            } else {
                const kmKTTruoc = Number(donsSorted[i - 1]?.kmKetThucGiaoHang) || 0;
                if (kmKTTruoc > 0 && kmKT >= kmKTTruoc) {
                    kmGiao = kmKT - kmKTTruoc;
                }
            }
        }
        kmMap.set(don, kmGiao);
    }
    return kmMap;
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
    const { tuNgay, denNgay, labelKy } = layKhoangNgayCuaKy(kyChon, namNum, thangNum);

    const btnPdf = document.getElementById('btnXuatPdfBangKe');
    const oldText = btnPdf ? btnPdf.innerHTML : "";
    if (btnPdf) {
        btnPdf.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btnPdf.disabled = true;
    }

    try {
        // 1. Lấy cấu hình PHUONGTIEN của biển số xe đang chọn
        const qPt = query(collection(db, "PHUONGTIEN"), where("bienSo", "==", bienSoChon));
        const snapPt = await getDocs(qPt);
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
        const ngayApDungGoc = cauHinhKy._dateApDung;
        const kmDauKyGoc = Number(cauHinhKy.kmDauKy) || 0;
        const dauDauKyGoc = Number(cauHinhKy.dauDauKy) || 0;
        const dinhMucHienThi = Number(cauHinhKy.dinhMuc) || 0.16;
        const nguongNoiO = Number(cauHinhKy.noiO) || 60;

        // 2. Tải dữ liệu TUYENDUONG của xe này
        const qTd = query(collection(db, "TUYENDUONG"), where("phuongTien", "==", bienSoChon));
        const snapTd = await getDocs(qTd);

        let allDocsXe = [];
        snapTd.forEach(docSnap => {
            const d = docSnap.data();
            const duyetVal = (d.duyet || "").trim();
            if (duyetVal === "Đã giao hàng" || duyetVal === "Đang giao hàng") {
                const rawNgay = d.ngayThangNam || layNgayGomNhom(d);
                const dateChuyen = chuyenNgaySangDate(rawNgay);
                allDocsXe.push({
                    id: docSnap.id,
                    ...d,
                    _rawNgay: rawNgay,
                    _dateChuyen: dateChuyen
                });
            }
        });

        // Gom toàn bộ chuyến từ ngayApDungGoc trở đi (sắp xếp theo ngày & số chuyến) để tính kmDi, kmVe và km tích lũy đầu kỳ giống app
        let mapAllChuyen = {};
        allDocsXe.forEach(d => {
            if (!d._dateChuyen || d._dateChuyen < ngayApDungGoc) return;

            const ngayKey = dinhDangNgayHienThi(d._rawNgay);
            const soChuyen = (d.chuyenVtracking !== undefined && d.chuyenVtracking !== null && d.chuyenVtracking !== "") ? d.chuyenVtracking : 1;
            const tripKey = `${ngayKey}_CHUYEN_${soChuyen}`;

            if (!mapAllChuyen[tripKey]) {
                mapAllChuyen[tripKey] = {
                    ngayStr: ngayKey,
                    dateObj: d._dateChuyen,
                    soChuyen: Number(soChuyen) || 1,
                    dons: []
                };
            }
            mapAllChuyen[tripKey].dons.push(d);
        });

        let dsAllChuyen = Object.values(mapAllChuyen).sort((a, b) => {
            if (a.dateObj - b.dateObj !== 0) return a.dateObj - b.dateObj;
            return a.soChuyen - b.soChuyen;
        });

        // Tính kmDi và kmVe theo đồng hồ kmBatDauGiaoHang & kmKetThucGiaoHang cho từng chuyến
        for (let i = 0; i < dsAllChuyen.length; i++) {
            const ch = dsAllChuyen[i];
            ch.dons.sort((a, b) => (a.ketThucGiaoHang || "").localeCompare(b.ketThucGiaoHang || ""));
            ch._kmDonMap = tinhKmTungDonTheoDongHo(ch.dons);

            let kmDi = 0;
            let kmVe = 0;
            let kmKTCuoi = 0;

            if (ch.dons.length > 0) {
                const donDau = ch.dons[0];
                const donCuoi = ch.dons[ch.dons.length - 1];
                const kmBDDau = Number(donDau.kmBatDauGiaoHang) || 0;
                kmKTCuoi = Number(donCuoi.kmKetThucGiaoHang) || 0;

                if (kmBDDau > 0 && kmKTCuoi >= kmBDDau) {
                    kmDi = kmKTCuoi - kmBDDau;
                }

                // Tìm chuyến tiếp theo của cùng xe để tính kmVe
                for (let nextIdx = i + 1; nextIdx < dsAllChuyen.length; nextIdx++) {
                    const nextCh = dsAllChuyen[nextIdx];
                    if (nextCh.dons.length > 0) {
                        const kmBDChuyenSau = Number(nextCh.dons[0].kmBatDauGiaoHang) || 0;
                        if (kmBDChuyenSau > 0 && kmKTCuoi > 0 && kmBDChuyenSau >= kmKTCuoi) {
                            kmVe = kmBDChuyenSau - kmKTCuoi;
                        }
                        break;
                    }
                }
            }

            ch.kmDi = kmDi;
            ch.kmVe = kmVe;
            ch.tongKmChuyen = kmDi + kmVe;
        }

        // Tính đồng hồ KM đầu kỳ: kmDauKyGoc + tổng tongKmChuyen của các chuyến trước tuNgay
        let kmTichLuyTruocKy = 0;
        let dsChuyenTrongKy = [];

        dsAllChuyen.forEach(ch => {
            if (ch.dateObj < tuNgay) {
                kmTichLuyTruocKy += ch.tongKmChuyen;
            } else if (ch.dateObj >= tuNgay && ch.dateObj <= denNgay) {
                dsChuyenTrongKy.push(ch);
            }
        });

        const dongHoKmDauKy = Math.round(kmDauKyGoc + kmTichLuyTruocKy);

        // 3. Xử lý từng chuyến trong kỳ: gom đơn trùng (doiTuong + dinhVi), cộng km đồng hồ & thêm dòng "Về kho"
        let bangKeRows = [];
        let tongKmNoiO = 0;
        let tongKmTinh = 0;
        let tongKmTatCaChuyen = 0;
        let tongTieuThuLit = 0;

        dsChuyenTrongKy.forEach(chuyen => {
            const cfgNgay = layCauHinhTaiNgay(chuyen.dateObj);
            const dinhMucChuyen = Number(cfgNgay.dinhMuc) || dinhMucHienThi;
            const noiOChuyen = Number(cfgNgay.noiO) || nguongNoiO;

            const kmChuyen = chuyen.tongKmChuyen;
            tongKmTatCaChuyen += kmChuyen;
            if (kmChuyen <= noiOChuyen) {
                tongKmNoiO += kmChuyen;
            } else {
                tongKmTinh += kmChuyen;
            }

            let groupedStops = [];
            let stopIndexMap = {};

            chuyen.dons.forEach(don => {
                const dt = (don.doiTuong || "").trim();
                const dv = (don.dinhVi || "").trim();
                const groupKey = `${dt}___${dv}`;
                const pxkClean = catSoKhongDau(don.pxk);
                const kmDon = chuyen._kmDonMap.get(don) || 0;

                if (stopIndexMap[groupKey] === undefined) {
                    stopIndexMap[groupKey] = groupedStops.length;
                    groupedStops.push({
                        ngay: chuyen.ngayStr,
                        noiGiao: dt,
                        km: kmDon,
                        pxkList: pxkClean ? [pxkClean] : []
                    });
                } else {
                    const idx = stopIndexMap[groupKey];
                    groupedStops[idx].km += kmDon;
                    if (pxkClean && !groupedStops[idx].pxkList.includes(pxkClean)) {
                        groupedStops[idx].pxkList.push(pxkClean);
                    }
                }
            });

            let tongLitDiChuan = chuyen.kmDi * dinhMucChuyen;
            let congDonLitDi = 0;

            groupedStops.forEach((stop, i) => {
                let litHang = 0;
                if (i === groupedStops.length - 1 && groupedStops.length > 0 && chuyen.kmDi > 0) {
                    litHang = Math.max(0, Number((tongLitDiChuan - congDonLitDi).toFixed(2)));
                } else {
                    litHang = Number((stop.km * dinhMucChuyen).toFixed(2));
                    congDonLitDi += litHang;
                }

                tongTieuThuLit += litHang;

                bangKeRows.push({
                    ngay: stop.ngay,
                    noiGiao: stop.noiGiao,
                    km: stop.km > 0 ? stop.km.toFixed(1).replace(/\.0$/, '') : "0",
                    tieuThu: litHang > 0 ? litHang.toFixed(2) : "0.00",
                    doThem: "",
                    chungTu: stop.pxkList.join(", "),
                    ghiChu: ""
                });
            });

            const kmVe = chuyen.kmVe;
            const litVe = Number((kmVe * dinhMucChuyen).toFixed(2));
            tongTieuThuLit += litVe;

            bangKeRows.push({
                ngay: chuyen.ngayStr,
                noiGiao: "Về kho",
                km: kmVe > 0 ? kmVe.toFixed(1).replace(/\.0$/, '') : "0",
                tieuThu: litVe > 0 ? litVe.toFixed(2) : "0.00",
                doThem: "",
                chungTu: "",
                ghiChu: ""
            });
        });

        const dongHoKmCuoiKy = Math.round(dongHoKmDauKy + tongKmTatCaChuyen);
        const dinhMucLit100Km = Math.round(dinhMucHienThi * 100);

        const minRows = 16;
        while (bangKeRows.length < minRows) {
            bangKeRows.push({ ngay: "&nbsp;", noiGiao: "", km: "", tieuThu: "", doThem: "", chungTu: "", ghiChu: "" });
        }

        // 4. Tạo giao diện HTML chuẩn A4 và mở hộp thoại in/lưu PDF
        const rowsHtml = bangKeRows.map(r => `
            <tr>
                <td style="text-align: center;">${r.ngay}</td>
                <td style="text-align: left; padding-left: 6px;">${r.noiGiao}</td>
                <td style="text-align: right; padding-right: 6px;">${r.km}</td>
                <td style="text-align: right; padding-right: 6px;">${r.tieuThu}</td>
                <td style="text-align: right; padding-right: 6px;">${r.doThem}</td>
                <td style="text-align: left; padding-left: 6px;">${r.chungTu}</td>
                <td style="text-align: left; padding-left: 6px;">${r.ghiChu}</td>
            </tr>
        `).join("");

        const today = new Date();
        const ngayKyStr = `Cần Thơ, ngày ${String(today.getDate()).padStart(2, '0')} tháng ${String(today.getMonth() + 1).padStart(2, '0')} năm ${today.getFullYear()}`;

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
                        margin: 12mm 10mm 12mm 10mm;
                    }
                    body {
                        font-family: "Times New Roman", Times, serif;
                        font-size: 11px;
                        color: #000;
                        margin: 0;
                        padding: 0;
                    }
                    .company-header {
                        font-weight: bold;
                        font-size: 11px;
                        line-height: 1.4;
                        text-align: left;
                    }
                    .doc-title {
                        text-align: center;
                        font-weight: bold;
                        font-size: 15px;
                        margin: 8px 0 3px 0;
                        text-transform: uppercase;
                    }
                    .doc-period {
                        text-align: center;
                        font-style: italic;
                        font-size: 11px;
                        margin-bottom: 6px;
                    }
                    .sub-info {
                        display: flex;
                        justify-content: space-between;
                        font-size: 11px;
                        margin-bottom: 4px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                    }
                    th, td {
                        border: 1px solid #000;
                        padding: 3px 4px;
                        font-size: 10.5px;
                        word-wrap: break-word;
                        height: 18px;
                    }
                    th {
                        background-color: #d9d9d9 !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        font-weight: bold;
                        text-align: center;
                    }
                    .summary-table {
                        margin-top: 8px;
                    }
                    .summary-table td {
                        text-align: center;
                        font-weight: bold;
                        height: 20px;
                    }
                    .footer-sign {
                        margin-top: 14px;
                        width: 100%;
                    }
                    .sign-date {
                        text-align: right;
                        font-style: italic;
                        font-size: 11px;
                        padding-right: 25px;
                        margin-bottom: 4px;
                    }
                    .sign-cols {
                        display: flex;
                        justify-content: space-around;
                        text-align: center;
                        font-weight: bold;
                        font-size: 11px;
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
                            <th rowspan="2" style="width: 11%;">NGÀY</th>
                            <th rowspan="2" style="width: 34%;">NƠI GIAO</th>
                            <th rowspan="2" style="width: 8%;">KM</th>
                            <th colspan="2" style="width: 19%;">NHIÊN LIỆU (lít)</th>
                            <th rowspan="2" style="width: 16%;">CHỨNG TỪ</th>
                            <th rowspan="2" style="width: 12%;">GHI CHÚ</th>
                        </tr>
                        <tr>
                            <th style="width: 9.5%;">TIÊU THỤ</th>
                            <th style="width: 9.5%;">ĐỔ THÊM</th>
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
                            <th style="width: 11.25%;">TIÊU THỤ</th>
                            <th style="width: 11.25%;">ĐỔ THÊM</th>
                            <th style="width: 11.25%;">TỒN ĐẦU KỲ</th>
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
                            <td>${tongTieuThuLit.toFixed(2)}</td>
                            <td></td>
                            <td>${dauDauKyGoc.toFixed(3)}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer-sign">
                    <div class="sign-date">${ngayKyStr}</div>
                    <div class="sign-cols">
                        <div style="width: 33%;">Trưởng đơn vị</div>
                        <div style="width: 33%;">Kế toán</div>
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
