const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// 🔗 Link ID các file gốc của bạn
const ID_TONKHO = {
  "41": "1ZS9K4lSPHMzBR4ifgSpiGx_RbYbDJ8tb",
  "61": "1ONnLc9N7IxZOvbs4udNjEH_JZxYOATLB",
  "69": "1lvbNAvxQ-jXMEIwZ-w3GOdsbcd5-TCIf"
};
const ID_TUYENDUONG = "1JEgcPzZUSDj5MmLqifbOD6cBhJ7ggsHR"; 
const ID_SANPHAM = {
  "61": "1HSZMW142a1SeIUhaF8gTCFPGVipwDUPV",
  "69": "1CutRhZzBvh24zUsGPvkXWXQT3_ufUPmW"
};
const ID_YCGH = "152fW_bkRwUki4Gpz5qQ3_kaHruOnfbAb";

// 🌟 TỌA ĐỘ KHO 55 TẦM VU
const KHO_TAM_VU = {
  lat: 10.007685,
  lon: 105.763084
};

// 🌟 DANH SÁCH ID 12 FILE V-TRACKING THEO THÁNG
const ID_VTRACKING_MONTHS = {
  1: "1sqIs2aBJom_u-Oj0IB1Z2LI2f9heToHP",
  2: "1Yv144AWuT9iU-EwptWrrfk_79yKrvRB6",
  3: "1EfCBdpAGaJjKnXnSjH5aBz7lJvysu9RW",
  4: "1CElJxYpy7hQImjBrfJMEYX9Lm39iITjO",
  5: "1GRo0ru9i2mR0djDY7A3XckwRx8TTBXoK",
  6: "1q0vTb0HNC-ldAZg_1Uzr6KJkD0Xy7FIx",
  7: "1QT2oxfIu4cLCTgpwAHKhQsIyq4KqB0yC",
  8: "1a2z7w_DLsf9f24XYAsf2SJjzo413d8iM",
  9: "1nUMJB8FVCN1ObRmW6Gf8aERnmfogs2fd",
  10: "1L6yuunc1I-v1H-BWSLbQP8TjTyCXNyUq",
  11: "1t7KgNwHwQuK0terHjSVwrC722ObYsnj8",
  12: "1pgJsXILGp20zFZ-ddoIbPH23ghT2DYmh"
};

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }); 
}
const db = admin.firestore();

function getDriveClient() {
  const auth = new google.auth.JWT(serviceAccount.client_email, null, serviceAccount.private_key, ['https://www.googleapis.com/auth/drive.readonly']); 
  return google.drive({ version: 'v3', auth }); 
}

async function downloadFileBuffer(drive, fileId) {
  return await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data));
}

// 📡 HÀM CHUẨN HÓA NGÀY THÁNG ĐỒNG BỘ 100% VỚI APP
function chuanHoaNgay(ngayStr) {
    if (!ngayStr || typeof ngayStr !== "string") return "";
    return ngayStr.trim().split(" ")[0];
}

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

    const duyet = data.duyet ? data.duyet.trim() : "";
    const laChuaGiaoHoanToan = !duyet || duyet === "" || duyet.toLowerCase().includes("chuẩn bị") || duyet.toLowerCase().includes("đã xuất");

    if (laChuaGiaoHoanToan && !bd && !kt) {
        let ngayBase = chuanHoaNgay(xk);
        if (!ngayBase) ngayBase = "Chưa xác định";
        return `${ngayBase}Chưa giao`;
    }

    let rawDate = bd !== "" ? bd : (kt !== "" ? kt : xk);
    return chuanHoaNgay(rawDate);
}

// 📡 HÀM ĐỊNH DẠNG GỐC GIỮ NGUYÊN ĐỂ ĐẨY LÊN FIRESTORE
function formatExcelDateOriginal(cellValue) {
  if (cellValue === undefined || cellValue === null || cellValue === "") return "";
  const pad = (n) => String(n).padStart(2, '0');
  if (cellValue instanceof Date) {
    const d = cellValue;
    const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return timeStr === "00:00:00" ? dateStr : `${dateStr} ${timeStr}`;
  }
  const strVal = cellValue.toString().trim();
  if (strVal.includes('/') || strVal.includes('-')) return strVal; 
  if (!isNaN(strVal) && !isNaN(parseFloat(strVal))) {
    const numVal = parseFloat(strVal);
    if (numVal > 30000) {
      try {
        const dateObj = XLSX.SSF.parse_date_code(numVal);
        const y = dateObj.y;
        const m = pad(dateObj.m);
        const d = pad(dateObj.d);
        const hh = pad(dateObj.H);
        const mm = pad(dateObj.M);
        const ss = pad(dateObj.S);
        const dateStr = `${d}/${m}/${y}`;
        if (dateObj.H === 0 && dateObj.M === 0 && dateObj.S === 0) { return dateStr; }
        return `${dateStr} ${hh}:${mm}:${ss}`;
      } catch (e) { return strVal; } 
    } 
  } 
  return strVal;
}

// HÀM ĐỌC FILE SẢN PHẨM
function parseCatalogToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const catalogMap = {};
  
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i]; 
    if (!row || row.length === 0) continue;
    const maCTKT = row[0] ? row[0].toString().trim() : ""; 
    if (!maCTKT) continue; 
    
    catalogMap[maCTKT] = {
      sanPham:   row[5]  ? row[5].toString().trim()  : "",
      phanLoai:  row[6]  ? row[6].toString().trim()  : "",
      maCatalo:  row[10] ? row[10].toString().trim() : "",
      tenCatalo: row[11] ? row[11].toString().trim() : ""
    }; 
  } 
  return catalogMap;
}

// 1. XỬ LÝ ĐỌC FILE TỒN KHO
function parseInventoryToMap(buffer, khoName, catalogMap = null) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const dataMap = {};
  
  let startRowIndex = 9; 
  for (let i = 0; i < Math.min(20, jsonData.length); i++) {
    const rowStr = JSON.stringify(jsonData[i]);
    if (rowStr.includes("Mã hàng") || rowStr.includes("Tên hàng")) { startRowIndex = i + 1; break; } 
  }
  for (let i = startRowIndex; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 3) continue;
    const tenHang = row[2] ? row[2].toString().trim() : "";
    if (!tenHang || tenHang === "" || tenHang === "Tên hàng") continue;
    const maHang = row[1] ? row[1].toString().trim() : ""; 
    if (!maHang || maHang === "" || maHang === "Mã hàng" || maHang.includes("CÔNG TY")) continue;
    const nsxTxt = formatExcelDateOriginal(row[3]);
    let thang = "";
    let nam = "";
    if (nsxTxt && nsxTxt.includes("/")) {
      const parts = nsxTxt.split("/");
      if (parts[1]) thang = `Tháng ${parseInt(parts[1])}`;
      if (parts[2]) nam = parts[2].split(" ")[0]; 
    }
    
    let boSung_maCatalo = "";
    let boSung_tenCatalo = "";
    let boSung_sanPham = "";
    let boSung_phanLoai = "";
    
    if (catalogMap && catalogMap[maHang]) {
      boSung_maCatalo  = catalogMap[maHang].maCatalo;
      boSung_tenCatalo = catalogMap[maHang].tenCatalo;
      boSung_sanPham   = catalogMap[maHang].sanPham;
      boSung_phanLoai  = catalogMap[maHang].phanLoai;
    }
    
    dataMap[tenHang] = {
      category: row[0] ? row[0].toString().trim() : "",    
      maHang: maHang,
      tenHang: tenHang,    
      nsx: nsxTxt,
      thang: thang, 
      nam: nam,    
      dauKy_sl: parseFloat(row[4]) || 0,                 
      dauKy_tl: parseFloat(row[5]) || 0,                 
      nhap_sl: parseFloat(row[6]) || 0,                  
      nhap_tl: parseFloat(row[7]) || 0,                  
      xuat_sl: parseFloat(row[8]) || 0,                  
      xuat_tl: parseFloat(row[9]) || 0,                  
      cuoiKy_sl: parseFloat(row[10]) || 0,                 
      cuoiKy_tl: parseFloat(row[11]) || 0,
      maCatalo: boSung_maCatalo,
      tenCatalo: boSung_tenCatalo,
      sanPham: boSung_sanPham,
      phanLoai: boSung_phanLoai
    }; 
  } 
  return dataMap; 
}

// HÀM ĐỌC FILE YCGH
function parseYcghToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const ycghMap = {};
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i]; 
    if (!row || row.length === 0) continue;
    const maPhieu = row[1] ? row[1].toString().trim() : ""; 
    if (!maPhieu) continue; 
    ycghMap[maPhieu] = {
      congNo:   row[9]  ? row[9].toString().trim()  : "",
      hanMuc:  row[10]  ? row[10].toString().trim()  : "",
      timeNo:  row[11] ? row[11].toString().trim() : "",
      nvbh: row[16] ? row[16].toString().trim() : "",
      vungTieuThu: row[17] ? row[17].toString().trim() : "",
      vanDe: row[22] ? row[22].toString().trim() : ""
    }; 
  } 
  return ycghMap;
}

// HÀM ĐỌC FILE V-TRACKING VÀ CHUẨN HÓA NGÀY VỀ DD/MM/YYYY
function parseVTrackingToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const vTrackingList = [];

  const pad = (n) => String(n).padStart(2, '0');

  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 5) continue;
    
    let rawNgay = row[1]; // Cột B: Ngày
    let ngayFormatted = "";

    if (rawNgay instanceof Date) {
      ngayFormatted = `${pad(rawNgay.getDate())}/${pad(rawNgay.getMonth() + 1)}/${rawNgay.getFullYear()}`;
    } else if (!isNaN(rawNgay) && !isNaN(parseFloat(rawNgay))) {
      try {
        const dateObj = XLSX.SSF.parse_date_code(parseFloat(rawNgay));
        ngayFormatted = `${pad(dateObj.d)}/${pad(dateObj.m)}/${dateObj.y}`;
      } catch (e) {
        ngayFormatted = chuanHoaNgay(rawNgay);
      }
    } else {
      let strDate = chuanHoaNgay(rawNgay);
      let parts = strDate.split(/[\/\-]/);
      if (parts.length === 3) {
        let d = parts[0].length === 4 ? parts[2] : parts[0];
        let m = parts[1];
        let y = parts[0].length === 4 ? parts[0] : parts[2];
        ngayFormatted = `${pad(d)}/${pad(m)}/${y}`;
      } else {
        ngayFormatted = strDate;
      }
    }

    const bienSo = row[2] ? row[2].toString().trim().toUpperCase() : ""; // Cột C: Biển số
    const laiXeVt = row[3] ? row[3].toString().trim() : ""; // Cột D: Lái xe
    
    let latKetThuc = 0;
    let lonKetThuc = 0;
    const toaDoKetThucStr = row[10] ? row[10].toString().trim() : ""; // Cột K
    if (toaDoKetThucStr.includes(',')) {
      const parts = toaDoKetThucStr.split(',');
      latKetThuc = parseFloat(parts[0]) || 0;
      lonKetThuc = parseFloat(parts[1]) || 0;
    }

    const quangDuong = parseFloat(row[11]) || 0; // Cột L: Quãng đường

    if (bienSo && ngayFormatted) {
      vTrackingList.push({
        ngay: ngayFormatted, 
        bienSo,
        laiXe: laiXeVt,
        latKetThuc,
        lonKetThuc,
        quangDuong
      });
    }
  }
  return vTrackingList;
}

// Hàm tính khoảng cách GPS (Haversine) - Đơn vị: km
function tinhKhoangCachGPS(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

// 2. XỬ LÝ ĐỌC FILE TUYẾN ĐƯỜNG VÀ GOM NHÓM ĐÚNG CHUẨN APP ĐỂ DÒ V-TRACKING
function parseRoutesToMap(buffer, ycghMap = {}, vTrackingCacheByMonth = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  console.log(`📊 [Tuyến Đường] Tổng số dòng đọc được trong file: ${jsonData.length}`);
  
  let headerRowIdx = 7; 
  for (let i = 0; i < Math.min(25, jsonData.length); i++) {
    const rowStr = JSON.stringify(jsonData[i]);
    if (rowStr.includes("Mã Phiếu") || rowStr.includes("Đối tượng") || rowStr.includes("Kho xuất")) {
      headerRowIdx = i; 
      break;
    } 
  }
  const getTxtByIdx = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? row[idx].toString().trim() : "";
  const getOrigDateByIdx = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? formatExcelDateOriginal(row[idx]) : "";
  const getNumByIdx = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? (parseFloat(row[idx]) || 0) : 0;
  
  const tempRows = [];
  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 5) continue;
    const khoXuatVal = getTxtByIdx(row, 1);
    if (khoXuatVal !== "41" && khoXuatVal !== "61" && khoXuatVal !== "69") continue; 
    const maPhieu = getTxtByIdx(row, 3);
    if (!maPhieu || maPhieu === "" || maPhieu === "Mã Phiếu" || maPhieu.includes("CÔNG TY")) continue;

    const phuongTien = getTxtByIdx(row, 20).toUpperCase(); 
    const chuyen = getNumByIdx(row, 22) || 1; // Số chuyến (Cột W)
    let lat = row[24] ? parseFloat(row[24]) : 0; 
    let lon = row[25] ? parseFloat(row[25]) : 0; 

    const dummyDataForDate = {
      phuongTien: phuongTien,
      ngayxuatKho: getOrigDateByIdx(row, 27),
      ngayDatHang: getOrigDateByIdx(row, 5),
      batDauGiaoHang: getOrigDateByIdx(row, 30),
      ketThucGiaoHang: getOrigDateByIdx(row, 31),
      duyet: getTxtByIdx(row, 9)
    };
    const _ngayGom = layNgayGomNhom(dummyDataForDate);

    let thang = "";
    if (_ngayGom && _ngayGom.includes("/")) {
      const parts = _ngayGom.split("/");
      if (parts[1]) thang = parseInt(parts[1], 10); 
    }

    tempRows.push({
      row, khoXuatVal, maPhieu, _ngayGom, thang, phuongTien, chuyen, lat, lon
    });
  }

  // 🌟 GOM NHÓM ĐÚNG CHUẨN 100% THEO CƠ CHẾ `tripKey` CỦA APP
  const globalVehicleTrips = {};
  tempRows.forEach((item) => {
    const coXe = item.phuongTien && item.phuongTien !== "" && item.phuongTien !== "XE MÁY";
    const nhomKey = coXe ? item.phuongTien : "Xe máy";

    if (coXe) {
      const tripKey = `XE_${nhomKey}_CHUYEN_${item.chuyen}_${item._ngayGom}`;
      if (!globalVehicleTrips[tripKey]) {
        globalVehicleTrips[tripKey] = {
          phuongTien: nhomKey,
          soChuyen: item.chuyen,
          ngay: item._ngayGom,
          dons: []
        };
      }
      globalVehicleTrips[tripKey].dons.push(item);
    } else {
      const tripKey = `XE_MAY_${item._ngayGom}`;
      if (!globalVehicleTrips[tripKey]) {
        globalVehicleTrips[tripKey] = {
          phuongTien: "Xe máy",
          soChuyen: 1,
          ngay: item._ngayGom,
          isXeMay: true,
          dons: []
        };
      }
      globalVehicleTrips[tripKey].dons.push(item);
    }
  });

  const computedResults = {};

  Object.values(globalVehicleTrips).forEach(trip => {
    const sampleItem = trip.dons[0];
    const thangNum = sampleItem.thang;
    const ngayDonSearch = sampleItem._ngayGom.replace("Chưa giao", ""); 

    const vTrackingList = (thangNum >= 1 && thangNum <= 12) ? (vTrackingCacheByMonth[thangNum] || []) : [];
    const chặngCuaXeTrongNgay = vTrackingList.filter(vt => vt.bienSo === trip.phuongTien && vt.ngay === ngayDonSearch);

    const totalOrdersInTrip = trip.dons.length;

    trip.dons.forEach((item, idx) => {
      const { row, khoXuatVal, maPhieu, lat, lon } = item;
      
      let kmVtracking = 0;
      let laiXeFromVtracking = ""; 

      if (chặngCuaXeTrongNgay.length > 0) {
        laiXeFromVtracking = chặngCuaXeTrongNgay[0].laiXe;

        let matchedIndex = -1;
        let minKC = Infinity;

        chặngCuaXeTrongNgay.forEach((vt, index) => {
          if (lat !== 0 && lon !== 0 && vt.latKetThuc !== 0 && vt.lonKetThuc !== 0) {
            const kc = tinhKhoangCachGPS(lat, lon, vt.latKetThuc, vt.lonKetThuc);
            if (kc < 0.5 && kc < minKC) {
              minKC = kc;
              matchedIndex = index;
            }
          }
        });

        if (matchedIndex !== -1) {
          const step = Math.max(1, Math.floor((matchedIndex + 1) / totalOrdersInTrip));
          const endIndex = Math.min(matchedIndex, (idx + 1) * step);
          const startIndex = idx === 0 ? 0 : idx * step;

          for (let k = startIndex; k <= endIndex && k < chặngCuaXeTrongNgay.length; k++) {
            kmVtracking += chặngCuaXeTrongNgay[k].quangDuong;
          }
        } else {
          const totalKmDay = chặngCuaXeTrongNgay.reduce((sum, vt) => sum + vt.quangDuong, 0);
          kmVtracking = totalKmDay / totalOrdersInTrip;
        }
      }

      if (idx === 0 && lat !== 0 && lon !== 0) {
        const khoangCachTuKho = tinhKhoangCachGPS(KHO_TAM_VU.lat, KHO_TAM_VU.lon, lat, lon);
        if (kmVtracking < khoangCachTuKho) {
          kmVtracking += khoangCachTuKho;
        }
      }

      if (idx === trip.dons.length - 1 && lat !== 0 && lon !== 0) {
        const khoangCachVeKho = tinhKhoangCachGPS(lat, lon, KHO_TAM_VU.lat, KHO_TAM_VU.lon);
        kmVtracking += khoangCachVeKho;
      }

      let dinhVi = "";
      if (row[24] && row[25]) dinhVi = `${row[24].toString().trim()},${row[25].toString().trim()}`;
      let checkIn = "";
      if (row[34] && row[35]) checkIn = `${row[34].toString().trim()},${row[35].toString().trim()}`;
      const saiLechKm = getNumByIdx(row, 36); 
      let theoDoi = saiLechKm > 0.5 ? "Cần kiểm tra" : "";

      let thangNumVal = "";
      let namNumVal = "";
      const ngayChonOriginal = getOrigDateByIdx(row, 31) || getOrigDateByIdx(row, 27);
      if (ngayChonOriginal && ngayChonOriginal.includes("/")) {
        const parts = ngayChonOriginal.split("/");
        if (parts[1]) thangNumVal = parseInt(parts[1], 10); 
        if (parts[2]) namNumVal = parseInt(parts[2].split(" ")[0], 10); 
      }

      let nganh = khoXuatVal === "41" ? "Sơn" : "TBVS";
      const vungTieuThu = ycghMap[maPhieu]?.vungTieuThu || ""; 

      computedResults[maPhieu] = {
        phuongXa:        getTxtByIdx(row, 0),   
        khoXuat:         khoXuatVal,            
        tuyenDuong:      getTxtByIdx(row, 2),   
        maPhieu:         maPhieu,               
        doiTuong:        getTxtByIdx(row, 4),   
        ngayDatHang:     getOrigDateByIdx(row, 5),  
        ngayXuLy:        getOrigDateByIdx(row, 6),  
        ngayDuyet:       getOrigDateByIdx(row, 7),  
        ngayDuKien:      getOrigDateByIdx(row, 8),  
        duyet:           getTxtByIdx(row, 9),   
        status:          getTxtByIdx(row, 10),  
        botTretKg:       getNumByIdx(row, 11),  
        sonTbvsKg:       getNumByIdx(row, 12),  
        tTai:            getNumByIdx(row, 13),  
        thanhTien:       getNumByIdx(row, 14),  
        noiGiao:         getTxtByIdx(row, 15),  
        ghiChu:          getTxtByIdx(row, 16),  
        kmDuKIen:        getNumByIdx(row, 17),  
        htGiaoNhan:      getTxtByIdx(row, 18),  
        ngayGiao:        getOrigDateByIdx(row, 19), 
        phuongTien:      item.phuongTien,  
        taiXe:           getTxtByIdx(row, 21),  
        laiXe:           laiXeFromVtracking,    
        chuyen:          trip.soChuyen,  
        giaoNhan:        getTxtByIdx(row, 23),  
        pxk:             getTxtByIdx(row, 26),  
        dinhVi:          dinhVi,
        ngayxuatKho:     getOrigDateByIdx(row, 27),        
        thoiGianLamViec: getTxtByIdx(row, 28),  
        thanhPho:        getTxtByIdx(row, 29),  
        batDauGiaoHang:  getOrigDateByIdx(row, 30), 
        ketThucGiaoHang: getOrigDateByIdx(row, 31), 
        kmBatDauGiaoHang:getNumByIdx(row, 32),  
        kmKetThucGiaoHang:getNumByIdx(row, 33), 
        checkIn:         checkIn,
        saiLechKm:       saiLechKm,
        theoDoi:         theoDoi,
        thang:           thangNumVal,
        nam:             namNumVal,
        nganh:           nganh,
        vungTieuThu:     vungTieuThu,     
        kmVtracking:     Number(kmVtracking.toFixed(2))     
      };
    });
  });

  return computedResults; 
}

// 📊 GOM NHÓM BÁO CÁO KHACHHANGVUNG
function generateKhachHangVungReport(routeDataMap) {
  const groupMap = {};
  const addToGroup = (doiTuong, vung, htGiaoNhan, nganh, nam, thang, tl, dt) => {
    const key = `${doiTuong}_${vung}_${htGiaoNhan}_${nganh}_${nam}`;
    if (!groupMap[key]) {
      groupMap[key] = {
        doiTuong: doiTuong,
        vungTieuThu: vung,
        htGiaoNhan: htGiaoNhan,
        nganh: nganh,
        nam: nam,
        trongLuongMonths: {},
        doanhThuMonths: {}
      };
      for (let m = 1; m <= 12; m++) {
        groupMap[key].trongLuongMonths[m] = 0;
        groupMap[key].doanhThuMonths[m] = 0;
      }
    }
    groupMap[key].trongLuongMonths[thang] += tl;
    groupMap[key].doanhThuMonths[thang] += dt;
  };

  Object.values(routeDataMap).forEach(item => {
    const trangThaiDuyet = item.duyet ? item.duyet.toString().trim() : "";
    if (trangThaiDuyet !== "Đã giao hàng" && trangThaiDuyet !== "Đã xuất kho") { return; }
    const doiTuong = item.doiTuong;
    const vung = item.vungTieuThu || "Chưa xác định";
    const thang = item.thang;
    const nam = item.nam || "Chưa xác định";
    if (!doiTuong || !thang || thang < 1 || thang > 12) return;
    
    const htGoc = item.htGiaoNhan ? item.htGiaoNhan.toString().trim() : "";
    const isGuiChanh = htGoc.includes("Gửi chành");
    const nganhCuThe = item.nganh || "Khác";
    const tl = item.tTai || 0;
    const dt = item.thanhTien || 0;

    if (isGuiChanh) {
      addToGroup(doiTuong, vung, "Gửi chành", nganhCuThe, nam, thang, tl, dt);
      addToGroup(doiTuong, vung, "Gửi chành", "All", nam, thang, tl, dt);
    }
    addToGroup(doiTuong, vung, "Tổng giao", nganhCuThe, nam, thang, tl, dt);
    addToGroup(doiTuong, vung, "Tổng giao", "All", nam, thang, tl, dt);
  });

  const finalRecords = [];
  Object.values(groupMap).forEach(group => {
    const record = {
      doiTuong: group.doiTuong,
      vungTieuThu: group.vungTieuThu,
      htGiaoNhan: group.htGiaoNhan,
      nganh: group.nganh,
      nam: group.nam
    };
    for (let m = 1; m <= 12; m++) {
      record[`TL${m}`] = Number(group.trongLuongMonths[m].toFixed(2));
      record[`DT${m}`] = Number(group.doanhThuMonths[m].toFixed(2));
    }
    finalRecords.push(record);
  });
  return finalRecords;
}

// 3. TIẾN TRÌNH ĐỒNG BỘ CHÍNH
async function mainSync() {
  const drive = getDriveClient();
  console.log('🚀 1. Bắt đầu tiến trình cập nhật Tồn Kho...');
  let finalInventoryData = {};
  let invSuccessCount = 0;

  for (const [khoName, fileId] of Object.entries(ID_TONKHO)) {
    try {
      let catalogMap = null;
      if (ID_SANPHAM[khoName]) {
        const catalogBuffer = await downloadFileBuffer(drive, ID_SANPHAM[khoName]);
        catalogMap = parseCatalogToMap(catalogBuffer);
      }
      const buffer = await downloadFileBuffer(drive, fileId);
      const dataObject = parseInventoryToMap(buffer, khoName, catalogMap);
      if (Object.keys(dataObject).length > 0) {
        finalInventoryData[`Kho_${khoName}`] = dataObject;
        invSuccessCount++;
      } 
    } catch (err) {
      console.error(`❌ Lỗi kết nối Kho ${khoName}:`, err.message);
    } 
  }

  if (invSuccessCount > 0) {
    finalInventoryData["last_updated"] = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('TONKHO').doc('KHO').set(finalInventoryData, { merge: true });
    console.log(`🎉 HOÀN TẤT: Đã cập nhật Tồn Kho lên Firestore!`);
  }

  console.log('\n--------------------------------------------------\n');
  console.log('🚀 2. Tải dữ liệu 12 file V-Tracking từ Drive...');
  
  const vTrackingCacheByMonth = {};
  for (let m = 1; m <= 12; m++) {
    const fileIdVt = ID_VTRACKING_MONTHS[m];
    if (fileIdVt) {
      try {
        console.log(`📦 Đang tải V-Tracking Tháng ${m}...`);
        const vtBuffer = await downloadFileBuffer(drive, fileIdVt);
        vTrackingCacheByMonth[m] = parseVTrackingToMap(vtBuffer);
      } catch (err) {
        console.error(`⚠️ Không thể tải V-Tracking tháng ${m}:`, err.message);
        vTrackingCacheByMonth[m] = [];
      }
    }
  }

  try {
    console.log(`📦 Đang tải file YCGH...`);
    const ycghBuffer = await downloadFileBuffer(drive, ID_YCGH);
    const ycghMapData = parseYcghToMap(ycghBuffer);

    console.log(`📦 Đang tải file Tuyến Đường (ID: ${ID_TUYENDUONG})...`);
    const routeBuffer = await downloadFileBuffer(drive, ID_TUYENDUONG);
    const routeDataMap = parseRoutesToMap(routeBuffer, ycghMapData, vTrackingCacheByMonth);          
    const totalRecords = Object.keys(routeDataMap).length;
    
    if (totalRecords > 0) {
      console.log(`📡 Đang đẩy dữ liệu ${totalRecords} mã phiếu vào collection 'TUYENDUONG'...`);
      let batch = db.batch();
      let count = 0;
      for (const [maPhieu, data] of Object.entries(routeDataMap)) {
        const docRef = db.collection('TUYENDUONG').doc(maPhieu);
        batch.set(docRef, data, { merge: true });
        count++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = db.batch();
        } 
      } 
      if (count % 400 !== 0) {
        await batch.commit();
      }
      console.log(`🎉 HOÀN TẤT: Đã cập nhật thành công TUYENDUONG!`); 
      
      // --- XỬ LÝ VÀ ĐẨY DỮ LIỆU LÊN KHACHHANGVUNG ---
      console.log(`📊 Đang khởi tạo bảng tổng hợp KHACHHANGVUNG...`);
      const reportRows = generateKhachHangVungReport(routeDataMap);
      
      let reportBatch = db.batch();
      let reportCount = 0;

      for (const record of reportRows) {
        const rawId = `${record.doiTuong}_${record.vungTieuThu}_${record.htGiaoNhan}_${record.nganh}_${record.nam}`;
        const docId = rawId.replace(/[\/.\s#$\[\]]/g, "_");
        const docRef = db.collection('KHACHHANGVUNG').doc(docId);
        
        reportBatch.set(docRef, record, { merge: true });
        reportCount++;

        if (reportCount % 400 === 0) {
          await reportBatch.commit();
          reportBatch = db.batch();
        }
      }
      if (reportCount % 400 !== 0) {
        await reportBatch.commit();
      }
      console.log(`🎉 HOÀN TẤT: Đã đẩy thành công ${reportRows.length} dòng báo cáo lên 'KHACHHANGVUNG'!`);

    } else {
      console.log('⚠️ Không tìm thấy bản ghi hợp lệ nào.'); 
    } 
  } catch (err) {
    console.error(`❌ Lỗi đồng bộ Tuyến Đường:`, err.message);
  } 
}

mainSync().catch(err => {
  console.error('❌ Lỗi hệ thống nghiêm trọng:', err);
  process.exit(1);
});
