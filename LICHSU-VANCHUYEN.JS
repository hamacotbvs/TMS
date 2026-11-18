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
        container.innerHTML = '<div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 13px;">Vui lòng chọn tháng và bấm nút <b>"Tải dữ liệu"</b> để xem lịch sử vận chuyển.</div>';
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
            
            // --- ĐÃ HOÁN ĐỔI: Đưa nguyên cụm Đi/Về (2 dòng) lên chỗ tên xe/tổng tải cũ, và chuyển tổng tải/doanh thu/số đơn xuống hàng dưới ---
            if (trip.isXeMay)
