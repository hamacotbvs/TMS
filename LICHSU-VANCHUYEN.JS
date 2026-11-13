// VANCHUYEN.JS - Quản lý lịch sử vận chuyển: Ô tìm kiếm thu gọn, click/focus mở rộng mượt mà
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db; // Dùng chung kết nối Firestore

// Hàm chuẩn hóa chuỗi ngày: Chỉ lấy phần ngày/tháng/năm
function chuanHoaNgay(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return "";
    return ngayStr.trim().split(" ")[0];
}

// Hàm lấy ngày gom nhóm: Chỉ áp dụng "Chuẩn bị" cho xe tải, xe máy lấy ngày xuất kho hoặc ngày tạo bình thường
function layNgayGomNhom(data) {
    const coXe = data.phuongTien && data.phuongTien.trim() !== "";
    const isXeMay = !coXe || data.phuongTien.trim().toUpperCase() === "XE MÁY";

    if (isXeMay) {
        let xk = data.ngayxuatKho ? data.ngayxuatKho.trim() : "";
        let ngayBase = chuanHoaNgay(xk);
        if (!ngayBase) {
            let dat = data.ngayDatHang ? data.ngayDatHang.trim() : "";
            ngayBase = chuanHoaNgay(dat);
        }
        return ngayBase || "Chưa xác định";
    }

    let bd = data.batDauGiaoHang ? data.batDauGiaoHang.trim() : "";
    let kt = data.ketThucGiaoHang ? data.ketThucGiaoHang.trim() : "";
    let xk = data.ngayxuatKho ? data.ngayxuatKho.trim() : "";

    if (!bd && !kt) {
        let ngayBase = chuanHoaNgay(xk);
        if (!ngayBase) ngayBase = "Chưa xác định";
        return `${ngayBase} - Chuẩn bị`;
    }

    let rawDate = bd !== "" ? bd : (kt !== "" ? kt : xk);
    return chuanHoaNgay(rawDate);
}

// Hàm rút gọn chỉ lấy Tên cuối cùng của nhân viên
function layTenRutGon(hoTen) {
    if (!hoTen || typeof hoTen !== "string") return "";
    const arr = hoTen.trim().split(/\s+/);
    return arr[arr.length - 1]; // Lấy từ cuối cùng
}

// Hàm lọc lấy đúng Xã/Phường và Tỉnh/Thành phố từ trường noiGiao
function rutGonDiaChiNoiGiao(noiGiaoStr) {
    if (!noiGiaoStr || typeof noiGiaoStr !== "string") return "---";

    let diaChiClean = noiGiaoStr.split("(")[0].trim();
    let parts = diaChiClean.split(",").map(p => p.trim()).filter(p => p !== "" && !p.toLowerCase().includes("việt nam"));

    let xaPhuong = "";
    let tinhTp = "";

    parts.forEach(part => {
        let lower = part.toLowerCase();
        if (lower.startsWith("xã ") || lower.startsWith("phường ") || lower.startsWith("thị trấn ")) {
            xaPhuong = part.replace(/^(Xã|Phường|Thị trấn)\s+/i, "").trim();
        } else if (lower.startsWith("tỉnh ") || lower.startsWith("thành phố ")) {
            tinhTp = part.replace(/^(Tỉnh|Thành phố|TP\.)\s+/i, "").trim();
        }
    });

    if (!xaPhuong) {
        let foundXa = parts.find(p => /^(xã|phường|thị trấn)\s+/i.test(p));
        if (foundXa) xaPhuong = foundXa.replace(/^(Xã|Phường|Thị trấn)\s+/i, "").trim();
    }

    if (!tinhTp && parts.length > 0) {
        let foundTinh = parts.find(p => /^(tỉnh|thành phố|tp\.)\s+/i.test(p));
        if (foundTinh) {
            tinhTp = foundTinh.replace(/^(Tỉnh|Thành phố|TP\.|TP)\s+/i, "").trim();
        } else {
            let lastPart = parts[parts.length - 1];
            if (!/huyện|quận|thị xã|xã|phường/i.test(lastPart)) {
                tinhTp = lastPart;
            } else if (parts.length >= 2) {
                tinhTp = parts[parts.length - 2];
            }
        }
    }

    let ketQuaArr = [];
    if (xaPhuong) ketQuaArr.push(xaPhuong);
    if (tinhTp) {
        let cleanTinh = tinhTp.replace(/^(Tỉnh|Thành phố|TP\.)\s+/i, "").trim();
        ketQuaArr.push(cleanTinh);
    }

    return ketQuaArr.length > 0 ? ketQuaArr.join(" - ") : diaChiClean;
}

// Hàm loại bỏ dấu tiếng Việt để phục vụ tìm kiếm thông minh không dấu/có dấu
function loaiBoDauTiengViet(str) {
    if (!str || typeof str !== "string") return "";
    return str.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/đ/g, "d")
              .replace(/Đ/g, "D")
              .toLowerCase();
}

// Hàm tính khoảng cách (km) từ tọa độ dinhVi đến checkIn bằng công thức Haversine
function tinhKhoangCach(toaDo1, toaDo2) {
    if (!toaDo1 || !toaDo2 || toaDo1 === "0,0" || toaDo2 === "0,0") return null;
    try {
        const [lat1, lon1] = toaDo1.split(',').map(Number);
        const [lat2, lon2] = toaDo2.split(',').map(Number);

        if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2) || (lat1 === 0 && lon1 === 0)) return null;

        const R = 6371; 
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c).toFixed(1);
    } catch (e) {
        return null;
    }
}

// Hàm gán màu riêng biệt cho từng xe và xe máy
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

window.taiLichSuVanChuyen = async function(thangChon, namChon, bienSoTimKiem = "", tuKhoaTimKiem = "") {
    const container = document.getElementById('danhSachLichSuVanChuyen');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu vận chuyển từ server...</div>';

    try {
        const thangNum = parseInt(thangChon, 10);
        const namNum = parseInt(namChon, 10);

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
        const keywordKhongDau = loaiBoDauTiengViet(tuKhoaTimKiem);

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const ngayGom = layNgayGomNhom(data);
            
            if (keywordKhongDau && keywordKhongDau.trim() !== "") {
                let match = false;
                const hopThanhChuoi = Object.values(data).join(" ") + " " + docSnap.id;
                const chuoiKhongDau = loaiBoDauTiengViet(hopThanhChuoi);

                if (chuoiKhongDau.includes(keywordKhongDau)) {
                    match = true;
                }
                
                if (!match) return; 
            }

            listData.push({ 
                id: docSnap.id, 
                ...data, 
                _ngayGom: ngayGom 
            });
        });

        // Sắp xếp dữ liệu tăng dần theo thời gian để dò km Về xuyên ngày chính xác
        listData.sort((a, b) => {
            let timeA = a.batDauGiaoHang || a.ketThucGiaoHang || a.ngayxuatKho || "";
            let timeB = b.batDauGiaoHang || b.ketThucGiaoHang || b.ngayxuatKho || "";
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

            if (coXe) {
                const soChuyen = data.chuyen !== undefined && data.chuyen !== null && data.chuyen !== "" ? data.chuyen : 1;
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
        });

        let allTripsArray = Object.values(globalVehicleTrips);
        allTripsArray.sort((a, b) => {
            let timeA = a.dons[0]?.batDauGiaoHang || a.dons[0]?.ngayxuatKho || "";
            let timeB = b.dons[0]?.batDauGiaoHang || b.dons[0]?.ngayxuatKho || "";
            return timeA.localeCompare(timeB);
        });

        // Tính toán thông số và km Về xuyên ngày
        allTripsArray.forEach((trip, idx, arr) => {
            trip.dons.sort((a, b) => (a.ketThucGiaoHang || "").localeCompare(b.ketThucGiaoHang || ""));

            let kmDi = 0;
            let textKmVe = "chờ"; 
            let tongBotKg = 0, tongSonKg = 0, tongTbvsKg = 0;

            trip.dons.forEach(don => {
                if (don.botTretKg) tongBotKg += Number(don.botTretKg) || 0;
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

            if (trip.dons.length > 0) {
                const donDau = trip.dons[0];
                const donCuoi = trip.dons[trip.dons.length - 1];
                const kmBDDau = Number(donDau.kmBatDauGiaoHang) || 0;
                const kmKTCuoi = Number(donCuoi.kmKetThucGiaoHang) || 0;

                if (kmBDDau > 0 && kmKTCuoi >= kmBDDau) {
                    kmDi = kmKTCuoi - kmBDDau;
                }

                if (!trip.isXeMay) {
                    for (let nextIdx = idx + 1; nextIdx < arr.length; nextIdx++) {
                        let nextTrip = arr[nextIdx];
                        if (!nextTrip.isXeMay && nextTrip.phuongTien === trip.phuongTien && nextTrip.dons.length > 0) {
                            const kmBDChuyenSau = Number(nextTrip.dons[0].kmBatDauGiaoHang) || 0;
                            if (kmBDChuyenSau > 0 && kmBDChuyenSau >= kmKTCuoi) {
                                textKmVe = (kmBDChuyenSau - kmKTCuoi) + "km";
                            }
                            break;
                        }
                    }
                }
            }

            trip.kmDi = kmDi;
            trip.textKmVe = textKmVe;
        });

        // Gom nhóm theo Ngày để hiển thị (Ngày mới nhất lên đầu)
        let groupedByDate = {};
        allTripsArray.forEach(trip => {
            const ngay = trip.ngay;
            if (!groupedByDate[ngay]) groupedByDate[ngay] = [];
            groupedByDate[ngay].push(trip);
        });

        let sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

        if (sortedDates.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không tìm thấy dữ liệu nào khớp với từ khóa hoặc phương tiện bạn chọn.</div>';
            return;
        }

        // Render ra giao diện theo thứ tự Ngày giảm dần
        sortedDates.forEach(ngay => {
            const tripsInDay = groupedByDate[ngay];

            const dateWrapper = document.createElement('div');
            dateWrapper.style.cssText = 'margin-bottom: 20px;';

            let tongDonNgay = 0, tongTaiNgay = 0, tongDoanhThuNgay = 0;
            tripsInDay.forEach(trip => {
                tongDonNgay += trip.dons.length;
                trip.dons.forEach(don => {
                    if (don.tTai) tongTaiNgay += Number(don.tTai) || 0;
                    if (don.thanhTien) tongDoanhThuNgay += Number(don.thanhTien) || 0;
                });
            });
            const tongDTTrNgay = Math.round(tongDoanhThuNgay / 1000000).toLocaleString('vi-VN');

            // Tiêu đề Ngày
            const dateHeader = document.createElement('div');
            dateHeader.style.cssText = 'background: #0284c7; color: #fff; padding: 8px 12px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;';
            dateHeader.innerHTML = `
                <span>📅 ${ngay}</span> 
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 8px; font-size: 11px;">${tongTaiNgay.toLocaleString('vi-VN')} kg / ${tongDTTrNgay} tr.đ</span>
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
                const dtChuyenTr = Math.round(dtChuyen / 1000000).toLocaleString('vi-VN');

                const mauXe = layMauGiaoDienXe(trip.phuongTien);
                const vehicleWrapper = document.createElement('div');
                vehicleWrapper.style.cssText = `background: ${mauXe.bgHeader}; border: 1px solid ${mauXe.border}; border-radius: 8px; padding: 10px; margin-bottom: 10px; margin-left: 8px;`;

                const vehicleHeader = document.createElement('div');
                vehicleHeader.style.cssText = `background: ${mauXe.badgeBg}; color: ${mauXe.textHeader}; padding: 6px 8px; border-radius: 6px; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px;`;
                
                if (trip.isXeMay) {
                    vehicleHeader.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <span>🏍️ <strong style="color: ${mauXe.tagColor};">${trip.phuongTien}</strong></span> 
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <span style="background: rgba(16,185,129,0.15); color: #047857; padding: 1px 5px; border-radius: 6px; font-size: 10px;">${taiChuyen.toLocaleString('vi-VN')}kg / ${dtChuyenTr}tr</span>
                                <span style="background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 6px; font-size: 10px;">${trip.dons.length} đơn</span>
                            </div>
                        </div>
                    `;
                } else {
                    vehicleHeader.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <span>🚛 <strong style="color: ${mauXe.tagColor};">${trip.phuongTien}</strong> — <span style="color: #d97706;">Chuyến ${trip.soChuyen}</span></span>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <span style="background: rgba(16,185,129,0.15); color: #047857; padding: 1px 5px; border-radius: 6px; font-size: 10px;">${taiChuyen.toLocaleString('vi-VN')}kg / ${dtChuyenTr}tr</span>
                                <span style="background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 6px; font-size: 10px;">${trip.dons.length} đơn</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; font-weight: normal; color: #475569; font-size: 10.5px; border-top: 1px dashed rgba(0,0,0,0.08); padding-top: 3px; flex-wrap: wrap; gap: 2px;">
                            <span>Đi: <strong style="color: #0284c7;">${trip.kmDi}km</strong></span>
                            <span style="color: #cbd5e1;">|</span>
                            <span>Về: <strong style="color: #d97706;">${trip.textKmVe}</strong></span>
                            <span style="color: #cbd5e1;">|</span>
                            <span>Bột: <strong style="color: #16a34a;">${trip.tongBaoBot.toLocaleString('vi-VN')}b</strong></span>
                            <span style="color: #cbd5e1;">|</span>
                            <span>Sơn: <strong style="color: #2563eb;">${trip.tongSon.toLocaleString('vi-VN')}kg</strong></span>
                            <span style="color: #cbd5e1;">|</span>
                            <span>TBVS: <strong style="color: #9333ea;">${trip.tongTbvs.toLocaleString('vi-VN')}kg</strong></span>
                        </div>
                    `;
                }
                vehicleWrapper.appendChild(vehicleHeader);

                trip.dons.forEach((data, idx) => {
                    renderCardDon(data, vehicleWrapper, trip.isXeMay, idx, trip.dons);
                });

                dateWrapper.appendChild(vehicleWrapper);
            });

            container.appendChild(dateWrapper);
        });

    } catch (error) {
        console.error("Lỗi tải lịch sử vận chuyển: ", error);
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 13px;">Lỗi tải dữ liệu lịch sử vận chuyển!</div>';
    }
};

// Hàm phụ vẽ card thông tin từng đơn
function renderCardDon(data, parentElement, isXeMay = false, index = 0, danhSachDon = []) {
    const maPhieu = data.maPhieu || data.id;
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

    const vungTieuThu = rutGonDiaChiNoiGiao(data.noiGiao);

    const htGiaoNhan = data.htGiaoNhan || 'Giao hàng';
    const duyet = data.duyet || '';
    const tTai = data.tTai ? Number(data.tTai).toLocaleString('vi-VN') + ' kg' : '0 kg';
    
    let thanhTien = '0.0 tr.đ';
    if (data.thanhTien) {
        const tienNum = Number(data.thanhTien) / 1000000;
        thanhTien = tienNum.toFixed(1) + ' tr.đ';
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
        kmGiaoText = ` <span style="color: #0284c7; font-size: 10px; font-weight: 600;">(${kmGiao} km)</span>`;
    } else {
        kmGiaoText = ` <span style="color: #0284c7; font-size: 10px; font-weight: 600;">(0 km)</span>`;
    }

    const khoangCachKm = tinhKhoangCach(data.dinhVi, data.checkIn);
    let htmlKhoangCach = '';
    if (khoangCachKm !== null) {
        const kcNum = parseFloat(khoangCachKm);
        const iconCheck = kcNum < 0.2 ? '<span style="color: #16a34a; font-weight: bold;">✓</span>' : '<span style="color: #dc2626; font-weight: bold;">✗</span>';
        htmlKhoangCach = ` | ${iconCheck} ${khoangCachKm} km`;
    } else {
        htmlKhoangCach = ` | <span style="color: #dc2626; font-weight: bold;" title="Chưa bật định vị">📍❌</span>`;
    }

    const isChanh = htGiaoNhan.includes("Chành") || htGiaoNhan.includes("Gửi chành");
    const badgeHT = isChanh 
        ? '<span style="background: #fef2f2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">🚚 Chành</span>'
        : '<span style="background: #eff6ff; color: #2563eb; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">🚛 Giao</span>';

    let badgeDuyet = `<span style="color: #64748b; font-size: 11px;">${duyet}</span>`;
    if (duyet === "Đã giao hàng") {
        badgeDuyet = `<span style="color: #16a34a; font-size: 11px; font-weight: 600;">✓ Đã giao${kmGiaoText}</span>`;
    } else if (duyet === "Đã xuất kho") {
        badgeDuyet = `<span style="color: #d97706; font-size: 11px; font-weight: 600;">📦 Đã xuất${kmGiaoText}</span>`;
    }

    const cardItem = document.createElement('div');
    cardItem.className = 'card-lich-su-item';
    cardItem.style.cssText = 'background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);';

    cardItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px; margin-bottom: 4px;">
            <div>
                <strong style="color: #0f172a; font-size: 12px;">${maPhieu}</strong>
                <span style="font-size: 10px; color: #64748b; margin-left: 4px;">(PXK: ${maPXK})</span>
            </div>
            <div>${badgeHT}</div>
        </div>

        <div style="font-weight: 600; color: #1e293b; font-size: 12px; margin-bottom: 3px;">
            🏢 ${doiTuong}
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #475569; margin-bottom: 3px;">
            ${nhanVienHtml}
            <span>📍 ${vungTieuThu}</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: 4px; background: #f1f5f9; padding: 4px 6px; border-radius: 4px;">
            <span>Tải: <strong style="color: #0284c7;">${tTai}</strong> | Tiền: <strong style="color: #16a34a;">${thanhTien}</strong></span>
            <div>${badgeDuyet}${htmlKhoangCach}</div>
        </div>
        
        <div style="font-size: 10px; color: #64748b; display: flex; justify-content: space-between; margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 3px;">
            <span>🚀 BĐ: <strong>${batDauGiaoHang ? batDauGiaoHang.split(" ")[1] || batDauGiaoHang : '---'}</strong></span>
            <span>🏁 KT: <strong>${ketThucGiaoHang ? ketThucGiaoHang.split(" ")[1] || ketThucGiaoHang : '---'}</strong></span>
            <span>📅 XK: <strong>${ngayxuatKho || '---'}</strong></span>
        </div>
    `;

    parentElement.appendChild(cardItem);
}

// Khởi tạo sự kiện giao diện và tương tác DOM hoàn chỉnh
document.addEventListener('DOMContentLoaded', function() {
    const inputThangVC = document.getElementById('thangVanChuyen');
    const labelThangVC = document.getElementById('labelThangNamVC');
    const selectPhuongTien = document.getElementById('filterPhuongTien');
    const btnTaiDuLieu = document.getElementById('btnTaiLichSuVC');
    const container = document.getElementById('danhSachLichSuVanChuyen');

    let inputTimKiemTuDo = document.getElementById('inputTimKiemTuDo');
    if (!inputTimKiemTuDo && selectPhuongTien && selectPhuongTien.parentNode) {
        inputTimKiemTuDo = document.createElement('input');
        inputTimKiemTuDo.id = 'inputTimKiemTuDo';
        inputTimKiemTuDo.type = 'text';
        inputTimKiemTuDo.placeholder = '🔍 Tìm kiếm...';
        
        // Thiết kế ban đầu: nhỏ gọn (width khoảng 100px), có hiệu ứng chuyển động mượt mà (transition)
        inputTimKiemTuDo.style.cssText = 'padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; outline: none; width: 100px; transition: width 0.3s ease, box-shadow 0.3s ease;';
        
        // Khi click vào (focus) hoặc khi đang gõ mà có chữ: tự động mở rộng ra rộng rãi (flex: 1 hoặc width lớn hơn)
        inputTimKiemTuDo.addEventListener('focus', function() {
            this.style.width = '240px';
            this.style.boxShadow = '0 0 0 2px rgba(2, 132, 199, 0.2)';
            this.placeholder = '🔍 Nhập từ khóa tìm kiếm...';
        });

        // Khi bấm ra ngoài (blur): nếu ô trống thì thu nhỏ lại, nếu đang có chữ thì giữ nguyên rộng
        inputTimKiemTuDo.addEventListener('blur', function() {
            if (!this.value) {
                this.style.width = '100px';
                this.style.boxShadow = 'none';
                this.placeholder = '🔍 Tìm kiếm...';
            }
        });

        selectPhuongTien.parentNode.insertBefore(inputTimKiemTuDo, selectPhuongTien.nextSibling);
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    if (inputThangVC) {
        if (!inputThangVC.value) {
            inputThangVC.value = `${year}-${month}`;
        }
        
        const [currY, currM] = inputThangVC.value.split('-');
        if (labelThangVC) labelThangVC.innerText = `${currM}/${currY}`;

        if (container && container.innerHTML.trim() === "") {
            container.innerHTML = '<div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 13px;">Vui lòng chọn tháng và bấm nút <b>"Tải dữ liệu"</b> để xem lịch sử vận chuyển.</div>';
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
                const bienSo = selectPhuongTien ? selectPhuongTien.value : "";
                const tuKhoa = inputTimKiemTuDo ? inputTimKiemTuDo.value : "";
                
                if (typeof window.taiLichSuVanChuyen === 'function') {
                    window.taiLichSuVanChuyen(m, y, bienSo, tuKhoa);
                }
            } else {
                alert("Vui lòng chọn tháng năm trước khi tải!");
            }
        };
    }

    if (selectPhuongTien) {
        selectPhuongTien.addEventListener('change', function() {
            if (inputThangVC && inputThangVC.value) {
                const [y, m] = inputThangVC.value.split('-');
                const tuKhoa = inputTimKiemTuDo ? inputTimKiemTuDo.value : "";
                if (typeof window.taiLichSuVanChuyen === 'function') {
                    window.taiLichSuVanChuyen(m, y, this.value, tuKhoa);
                }
            }
        });
    }

    if (inputTimKiemTuDo) {
        let timer = null;
        inputTimKiemTuDo.addEventListener('input', function() {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (inputThangVC && inputThangVC.value) {
                    const [y, m] = inputThangVC.value.split('-');
                    const bienSo = selectPhuongTien ? selectPhuongTien.value : "";
                    if (typeof window.taiLichSuVanChuyen === 'function') {
                        window.taiLichSuVanChuyen(m, y, bienSo, this.value);
                    }
                }
            }, 300);
        });
    }
});
