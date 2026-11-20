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

// 🌟 DANH SÁCH ID 12 FILE V-TRACKING THEO THÁNG NĂM 2026
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

// Tọa độ Kho 55 Tầm Vu để tính chuyến Vtracking
const KHO_55_LAT = 10.007685;
const KHO_55_LON = 105.763084;

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

// 📡 HÀM ĐỊNH DẠNG NGÀY GIỜ CHUẨN ĐẸP (DD/MM/YYYY HH:mm:ss)
function formatExcelDate(cellValue) {
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

// 1. XỬ LÝ ĐỌC FILE TỒN KHO (TRA CỨU CHÉO)
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
    const nsxTxt = formatExcelDate(row[3]);
    let thang = "";
    let nam = "";
    if (nsxTxt && nsxTxt.includes("/")) {
      const parts = nsxTxt.split("/");
      if (parts[1]) thang = `Tháng ${parseInt(parts[1])}`;
      if (parts[2]) nam = parts[2].split(" ")[0]; 
    } else if (nsxTxt && nsxTxt.includes("-")) {
      const parts = nsxTxt.split("-");
      if (parts[1]) thang = `Tháng ${parseInt(parts[1])}`;
      if (parts[0] && parts[0].length === 4) nam = parts[0];
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

// 2. XỬ LÝ ĐỌC FILE TUYẾN ĐƯỜNG (TRA CỨU CHÉO YCGH)
function parseRoutesToMap(buffer, ycghMap = {}) {             
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const routeMap = {};
  
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
  const getDateByIdx = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? formatExcelDate(row[idx]) : "";
  const getNumByIdx = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? (parseFloat(row[idx]) || 0) : 0;
  
  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 5) continue;
    const khoXuatVal = getTxtByIdx(row, 1);
    if (khoXuatVal !== "41" && khoXuatVal !== "61" && khoXuatVal !== "69") continue; 
    const maPhieu = getTxtByIdx(row, 3);
    if (!maPhieu || maPhieu === "" || maPhieu === "Mã Phiếu" || maPhieu.includes("CÔNG TY")) continue;
    
    let dinhVi = "";
    if (row[24] && row[25]) dinhVi = `${row[24].toString().trim()},${row[25].toString().trim()}`;
    let checkIn = "";
    if (row[34] && row[35]) checkIn = `${row[34].toString().trim()},${row[35].toString().trim()}`;
    
    const saiLechKm = getNumByIdx(row, 36); 
    let theoDoi = "";
    if (saiLechKm > 0.5) theoDoi = "Cần kiểm tra";
    
    const ngayXuatKhoTxt = getDateByIdx(row, 27);
    const batDauGiaoTxt = getDateByIdx(row, 30);
    const ketThucGiaoTxt = getDateByIdx(row, 31);
    const ngayXuLyTxt = getDateByIdx(row, 6);

    const ngayChinh = ngayXuatKhoTxt || batDauGiaoTxt || ketThucGiaoTxt || ngayXuLyTxt;

    const rawNgayThangNam = batDauGiaoTxt || ketThucGiaoTxt || ngayXuatKhoTxt || ngayXuLyTxt;
    let ngayThangNam = "";
    if (rawNgayThangNam) {
      ngayThangNam = rawNgayThangNam.split(" ")[0]; 
    }

    let thang = "";
    let nam = "";
    if (ngayChinh && ngayChinh.includes("/")) {
      const parts = ngayChinh.split("/");
      if (parts[1]) thang = parseInt(parts[1], 10); 
      if (parts[2]) nam = parseInt(parts[2].split(" ")[0], 10); 
    } else if (ngayChinh && ngayChinh.includes("-")) {
      const parts = ngayChinh.split("-");
      if (parts[1]) thang = parseInt(parts[1], 10); 
      if (parts[0] && parts[0].length === 4) nam = parseInt(parts[0], 10); 
    }

    let nganh = "";
    if (khoXuatVal === "41") {
      nganh = "Sơn";
    } else if (khoXuatVal === "61" || khoXuatVal === "69") {
      nganh = "TBVS";
    }
    const vungTieuThu = ycghMap[maPhieu]?.vungTieuThu || "";

    routeMap[maPhieu] = {
      phuongXa:           getTxtByIdx(row, 0),   
      khoXuat:          khoXuatVal,          
      tuyenDuong:       getTxtByIdx(row, 2),   
      maPhieu:          maPhieu,                 
      doiTuong:         getTxtByIdx(row, 4),   
      ngayDatHang:      getDateByIdx(row, 5),  
      ngayXuLy:         ngayXuLyTxt,  
      ngayDuyet:        getDateByIdx(row, 7),  
      ngayDuKien:       getDateByIdx(row, 8),  
      duyet:            getTxtByIdx(row, 9),   
      status:           getTxtByIdx(row, 10),  
      botTretKg:        getNumByIdx(row, 11),  
      sonTbvsKg:        getNumByIdx(row, 12),  
      tTai:             getNumByIdx(row, 13),  
      thanhTien:        getNumByIdx(row, 14),  
      noiGiao:          getTxtByIdx(row, 15),  
      ghiChu:           getTxtByIdx(row, 16),  
      kmDuKIen:         getNumByIdx(row, 17),  
      htGiaoNhan:       getTxtByIdx(row, 18),  
      ngayGiao:         getDateByIdx(row, 19), 
      phuongTien:       getTxtByIdx(row, 20),  
      taiXe:            getTxtByIdx(row, 21),  
      chuyen:           getNumByIdx(row, 22),  
      giaoNhan:         getTxtByIdx(row, 23),  
      pxk:              getTxtByIdx(row, 26),  
      dinhVi:           dinhVi,
      ngayxuatKho:      ngayChinh,         
      thoiGianLamViec:  getTxtByIdx(row, 28),  
      thanhPho:         getTxtByIdx(row, 29),  
      batDauGiaoHang:   batDauGiaoTxt, 
      ketThucGiaoHang:  ketThucGiaoTxt, 
      kmBatDauGiaoHang: getNumByIdx(row, 32),  
      kmKetThucGiaoHang:getNumByIdx(row, 33),  
      checkIn:          checkIn,
      saiLechKm:        saiLechKm,
      theoDoi:          theoDoi,
      thang:            thang,
      nam:              nam,
      nganh:            nganh,
      vungTieuThu:      vungTieuThu,      
      ngayThangNam:     ngayThangNam,     
      chuyenVtracking:  null,             
      kmChuyenDiVtracking: 0,   
      kmChuyenVeVtracking: 0,   
      kmChuyenVtracking: 0,
      thoiGianDau:      "00:00:00",  
      thoiGianDi:       "",          
      kmKhachVtracking: 0          
    }; 
  } 
  return routeMap; 
}

// 📌 HÀM TÍNH KHOẢNG CÁCH HAVERSINE (MET)
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 📌 HÀM TÍNH THỜI GIAN ĐẬU
function calculateParkingTime(endTimeCurr, startTimeNext) {
  if (!endTimeCurr || !startTimeNext) return "00:00:00";
  try {
    const t1 = new Date(`1970-01-01T${endTimeCurr}Z`).getTime();
    const t2 = new Date(`1970-01-01T${startTimeNext}Z`).getTime();
    let diffSec = Math.floor((t2 - t1) / 1000);
    if (diffSec < 0) diffSec = 0;
    
    const pad = (n) => String(n).padStart(2, '0');
    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const seconds = diffSec % 60;
    
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  } catch (e) {
    return "00:00:00";
  }
}

// 3. XỬ LÝ ĐỌC VÀ CHUẨN HÓA FILE V-TRACKING
function parseVTrackingToMap(buffer, monthNum) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(15, jsonData.length); i++) {
    const rowStr = JSON.stringify(jsonData[i]);
    if (rowStr.includes("Biển số") || rowStr.includes("Lái xe") || rowStr.includes("Thời gian bắt đầu")) {
      headerRowIdx = i;
      break;
    }
  }

  const getTxt = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? row[idx].toString().trim() : "";
  const getNum = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? (parseFloat(row[idx]) || 0) : 0;

  let rawRows = [];

  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 5) continue;

    const ngayRaw = getTxt(row, 1); 
    const bienSo = getTxt(row, 2);  
    const laiXe = getTxt(row, 3);   
    const thoiGianBatDau = getTxt(row, 4); 
    const thoiGianKetThuc = getTxt(row, 5); 
    const thoiGianDi = getTxt(row, 6);      
    const diaDiemBatDau = getTxt(row, 7);
    const toaDoBatDau = getTxt(row, 8);
    const diaDiemKetThuc = getTxt(row, 9);
    const toaDoKetThuc = getTxt(row, 10);   
    const quangDuong = getNum(row, 11);     

    if (quangDuong <= 0 || !bienSo || !ngayRaw) continue;

    let isStartNearKho55 = false;
    let isEndNearKho55 = false;
    let latS = NaN, lonS = NaN, latE = NaN, lonE = NaN;

    if (toaDoBatDau && toaDoBatDau.includes(",")) {
      const coordsS = toaDoBatDau.split(",");
      latS = parseFloat(coordsS[0]);
      lonS = parseFloat(coordsS[1]);
      if (!isNaN(latS) && !isNaN(lonS)) {
        if (getDistanceFromLatLonInMeters(latS, lonS, KHO_55_LAT, KHO_55_LON) <= 200) {
          isStartNearKho55 = true;
        }
      }
    }

    if (toaDoKetThuc && toaDoKetThuc.includes(",")) {
      const coordsE = toaDoKetThuc.split(",");
      latE = parseFloat(coordsE[0]);
      lonE = parseFloat(coordsE[1]);
      if (!isNaN(latE) && !isNaN(lonE)) {
        if (getDistanceFromLatLonInMeters(latE, lonE, KHO_55_LAT, KHO_55_LON) <= 200) {
          isEndNearKho55 = true;
        }
      }
    }

    let isStartEndUnder200m = false;
    if (!isNaN(latS) && !isNaN(lonS) && !isNaN(latE) && !isNaN(lonE)) {
      if (getDistanceFromLatLonInMeters(latS, lonS, latE, lonE) < 200) {
        isStartEndUnder200m = true;
      }
    }

    // Nếu tọa độ đầu & cuối chênh lệch < 200m nhưng Quãng đường xe chạy (km) > 500m (0.5 km) -> giữ lại tính như 1 chuyến
    const isLongTripDespiteCloseCoords = isStartEndUnder200m && (quangDuong > 0.5);

    if (!isLongTripDespiteCloseCoords && isStartNearKho55 && isEndNearKho55) {
      continue;
    }

    let parts = ngayRaw.includes('/') ? ngayRaw.split('/') : ngayRaw.split('-');
    let d = parts[0] ? parts[0].padStart(2, '0') : "01";
    let m = parts[1] ? parts[1].padStart(2, '0') : String(monthNum).padStart(2, '0');
    let y = parts[2] ? parts[2].split(" ")[0] : "2026";
    const ngayChuan = `${d}/${m}/${y}`;
    const yyyy_mm_dd = `${y}-${m}-${d}`;

    const timeForId = thoiGianBatDau ? thoiGianBatDau : "00:00:00";
    const idRecord = `${bienSo}-${yyyy_mm_dd}-${timeForId}`.replace(/[\/.\s#$\[\]]/g, "_");

    const tgBatDauFull = thoiGianBatDau ? `${ngayChuan} ${thoiGianBatDau}` : "";
    const tgKetThucFull = thoiGianKetThuc ? `${ngayChuan} ${thoiGianKetThuc}` : "";

    rawRows.push({
      id: idRecord,
      ngay: ngayRaw,
      ngayChuan: ngayChuan,
      bienSo: bienSo,
      laiXe: laiXe,
      thoiGianBatDau: tgBatDauFull,
      thoiGianKetThuc: tgKetThucFull,
      thoiGianDi: thoiGianDi,
      thoiGianBatDauOnly: thoiGianBatDau,
      thoiGianKetThucOnly: thoiGianKetThuc,
      diaDiemBatDau: diaDiemBatDau,
      toaDoBatDau: toaDoBatDau,
      diaDiemKetThuc: diaDiemKetThuc,
      toaDoKetThuc: toaDoKetThuc,
      quangDuong: quangDuong,
      thang: monthNum,
      nam: y,
      khachHang: "",
      kmKhachVtracking: 0,
      thoiGianDau: "00:00:00"
    });
  }

  const groupedByVehicleAndDate = {};
  rawRows.forEach(item => {
    const groupKey = `${item.bienSo}_${item.ngayChuan}`;
    if (!groupedByVehicleAndDate[groupKey]) {
      groupedByVehicleAndDate[groupKey] = [];
    }
    groupedByVehicleAndDate[groupKey].push(item);
  });

  const finalizedRows = [];

  Object.keys(groupedByVehicleAndDate).forEach(key => {
    const items = groupedByVehicleAndDate[key];
    items.sort((a, b) => a.thoiGianBatDauOnly.localeCompare(b.thoiGianBatDauOnly));

    let currentChuyen = 1;

    items.forEach(item => {
      let isKho55 = false;
      if (item.toaDoKetThuc && item.toaDoKetThuc.includes(",")) {
        const coords = item.toaDoKetThuc.split(",");
        const latEnd = parseFloat(coords[0]);
        const lonEnd = parseFloat(coords[1]);
        if (!isNaN(latEnd) && !isNaN(lonEnd)) {
          const distanceMeters = getDistanceFromLatLonInMeters(latEnd, lonEnd, KHO_55_LAT, KHO_55_LON);
          if (distanceMeters <= 200) {
            isKho55 = true;
          }
        }
      }

      item.chuyenVtracking = currentChuyen;
      if (isKho55) {
        currentChuyen++;
      }
    });

    items.forEach((item, idx) => {
      let thoiGianDau = "00:00:00";

      let isLastItemKho55 = false;
      if (item.toaDoKetThuc && item.toaDoKetThuc.includes(",")) {
        const coords = item.toaDoKetThuc.split(",");
        const latEnd = parseFloat(coords[0]);
        const lonEnd = parseFloat(coords[1]);
        if (!isNaN(latEnd) && !isNaN(lonEnd)) {
          if (getDistanceFromLatLonInMeters(latEnd, lonEnd, KHO_55_LAT, KHO_55_LON) <= 200) {
            const nextItem = items[idx + 1];
            if (!nextItem || nextItem.chuyenVtracking !== item.chuyenVtracking) {
              isLastItemKho55 = true;
            }
          }
        }
      }

      if (!isLastItemKho55 && idx < items.length - 1) {
        const nextItem = items[idx + 1];
        thoiGianDau = calculateParkingTime(item.thoiGianKetThucOnly, nextItem.thoiGianBatDauOnly);
      }

      item.thoiGianDau = thoiGianDau;
    });

    const tripGroups = {};
    items.forEach(item => {
      const cNum = item.chuyenVtracking;
      if (!tripGroups[cNum]) {
        tripGroups[cNum] = { totalKm: 0 };
      }
      tripGroups[cNum].totalKm += item.quangDuong;
    });

    items.forEach(item => {
      const groupInfo = tripGroups[item.chuyenVtracking];
      item.kmChuyenVtracking = Number(groupInfo.totalKm.toFixed(2));
      item.kmChuyenDiVtracking = 0;
      item.kmChuyenVeVtracking = 0;

      finalizedRows.push(item);
    });
  });

  return finalizedRows;
}

// 📊 HÀM GOM NHÓM DỮ LIỆU ĐỂ TẠO BẢNG KHACHHANGVUNG
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
    if (trangThaiDuyet !== "Đã giao hàng" && trangThaiDuyet !== "Đã xuất kho" && trangThaiDuyet !== "Đang giao hàng") { return; }
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

function isEligibleForVTracking(item) {
  const statusDuyet = item.duyet ? item.duyet.toString().trim() : "";
  return statusDuyet === "Đã giao hàng" || statusDuyet === "Đang giao hàng";
}

// 4. TIẾN TRÌNH ĐỒNG BỘ CHÍNH & TRA CỨU CHÉO V-TRACKING
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
    console.log(`🎉 Đã cập nhật Tồn Kho lên Firestore!`);
  }

  console.log('\n--------------------------------------------------\n');
  console.log('🚀 2. Bắt đầu tiến trình cập nhật Tuyến Đường và Tra cứu chéo V-Tracking...');
  
  let tuyenDuongMemoryList = [];
  let routeDataMap = {};

  try {
    console.log(`📦 Đang tải file YCGH...`);
    const ycghBuffer = await downloadFileBuffer(drive, ID_YCGH);
    const ycghMapData = parseYcghToMap(ycghBuffer);

    console.log(`📦 Đang tải file Tuyến Đường...`);
    const routeBuffer = await downloadFileBuffer(drive, ID_TUYENDUONG);
    routeDataMap = parseRoutesToMap(routeBuffer, ycghMapData);         

    // Giữ toàn bộ dòng Tuyến Đường để đẩy lên Firestore; chỉ tra cứu chéo V-Tracking cho dòng Đã giao hàng / Đang giao hàng
    tuyenDuongMemoryList = Object.entries(routeDataMap).map(([maPhieu, data]) => ({
      maPhieu,
      ...data
    }));

    const eligibleRoutes = tuyenDuongMemoryList.filter(isEligibleForVTracking);
    console.log(`📋 [Bộ nhớ tạm] Tổng ${tuyenDuongMemoryList.length} dòng Tuyến Đường; có ${eligibleRoutes.length} dòng đủ điều kiện tra cứu chéo V-Tracking (Đã giao hàng / Đang giao hàng).`);

    eligibleRoutes.sort((a, b) => {
      const parseDateStr = (dateStr) => {
        if (!dateStr || !dateStr.includes("/")) return "00000000";
        const parts = dateStr.split(" ")[0].split("/");
        return `${parts[2] || "0000"}${parts[1] || "00"}${parts[0] || "00"}`;
      };

      const dateA = parseDateStr(a.ngayThangNam);
      const dateB = parseDateStr(b.ngayThangNam);
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const timeA = a.ketThucGiaoHang ? a.ketThucGiaoHang.split(" ").pop() : "";
      const timeB = b.ketThucGiaoHang ? b.ketThucGiaoHang.split(" ").pop() : "";

      if (timeA && timeB) {
        return timeA.localeCompare(timeB);
      } else if (!timeA && timeB) {
        return (a.kmKetThucGiaoHang || 0) - (b.kmKetThucGiaoHang || 0);
      } else if (timeA && !timeB) {
        return (a.kmKetThucGiaoHang || 0) - (b.kmKetThucGiaoHang || 0);
      } else {
        return (a.kmKetThucGiaoHang || 0) - (b.kmKetThucGiaoHang || 0);
      }
    });

    const vtrackingCache = {};

    for (const item of eligibleRoutes) {
      const thang = item.thang;
      const bienSo = item.phuongTien; 
      const ngayTuongUng = item.ngayThangNam; 
      const ketThucGiao = item.ketThucGiaoHang; 

      if (!thang || !bienSo || !ketThucGiao) continue;

      if (!vtrackingCache[thang]) {
        const vtFileId = ID_VTRACKING_MONTHS[thang];
        if (vtFileId) {
          try {
            console.log(`📦 Đang tải file V-Tracking Tháng ${thang}/2026 cho tra cứu chéo...`);
            const vtBuffer = await downloadFileBuffer(drive, vtFileId);
            vtrackingCache[thang] = parseVTrackingToMap(vtBuffer, thang);
          } catch (vtLoadErr) {
            console.error(`⚠️ Không thể tải V-Tracking tháng ${thang}:`, vtLoadErr.message);
            vtrackingCache[thang] = [];
          }
        } else {
          vtrackingCache[thang] = [];
        }
      }

      const vtrackingRows = vtrackingCache[thang];
      const matchedVtRows = vtrackingRows.filter(vt => vt.bienSo === bienSo && vt.ngayChuan === ngayTuongUng);

      if (matchedVtRows.length === 0) continue;

      matchedVtRows.sort((a, b) => a.thoiGianBatDauOnly.localeCompare(b.thoiGianBatDauOnly));

      let foundChuyen = null;
      const timeKetThucGiao = ketThucGiao.includes(" ") ? ketThucGiao.split(" ").pop() : ketThucGiao;

      for (let j = matchedVtRows.length - 1; j >= 0; j--) {
        const vtRow = matchedVtRows[j];
        if (timeKetThucGiao > vtRow.thoiGianBatDauOnly) {
          foundChuyen = vtRow.chuyenVtracking;
          break; 
        }
      }

      if (foundChuyen !== null) {
        item.chuyenVtracking = foundChuyen;
      }
    }

    // 1. TẠO CỘT ẢO `khachHang` VÀ `kmKhachVtracking` TRÊN V-TRACKING
    console.log(`🔗 Đang tiến hành tạo cột ảo 'khachHang' và 'kmKhachVtracking' trên bộ nhớ tạm V-Tracking...`);
    Object.keys(vtrackingCache).forEach(thang => {
      const vtrackingRows = vtrackingCache[thang];

      const tripMap = {};
      vtrackingRows.forEach((vtRow, vtIdx) => {
        if (!vtRow.bienSo || !vtRow.ngayChuan || vtRow.chuyenVtracking === undefined) return;
        const tripKey = `${vtRow.bienSo}_${vtRow.ngayChuan}_${vtRow.chuyenVtracking}`;
        if (!tripMap[tripKey]) {
          tripMap[tripKey] = [];
        }
        tripMap[tripKey].push({ vtRow, vtIdx });
      });

      Object.keys(tripMap).forEach(tripKey => {
        const tripItems = tripMap[tripKey];
        const [bienSo, ngayChuan, chuyen] = tripKey.split("_");
        const chuyenNum = parseInt(chuyen, 10);

        const matchedRoutes = eligibleRoutes.filter(rt => 
          rt.phuongTien === bienSo && 
          rt.ngayThangNam === ngayChuan && 
          rt.chuyenVtracking === chuyenNum
        );

        if (matchedRoutes.length === 0) return;

        tripItems.forEach(itemObj => {
          const vt = itemObj.vtRow;
          if (!vt.toaDoKetThuc || !vt.toaDoKetThuc.includes(",")) return;

          const vtCoords = vt.toaDoKetThuc.split(",");
          const latVT = parseFloat(vtCoords[0]);
          const lonVT = parseFloat(vtCoords[1]);
          if (isNaN(latVT) || isNaN(lonVT)) return;

          // Dò từ 200m tăng dần tới 1000m (mỗi bước 50m), ưu tiên khách khớp đầu tiên rồi dừng
          let matchedCustomer = "";
          for (let radius = 200; radius <= 1000; radius += 50) {
            for (const rt of matchedRoutes) {
              if (!rt.dinhVi || !rt.dinhVi.includes(",")) continue;
              const rtCoords = rt.dinhVi.split(",");
              const latRT = parseFloat(rtCoords[0]);
              const lonRT = parseFloat(rtCoords[1]);
              if (isNaN(latRT) || isNaN(lonRT)) continue;

              const distMeters = getDistanceFromLatLonInMeters(latVT, lonVT, latRT, lonRT);
              if (distMeters <= radius) {
                matchedCustomer = rt.doiTuong;
                break;
              }
            }
            if (matchedCustomer) break;
          }

          if (matchedCustomer) {
            vt.khachHang = matchedCustomer;
          }
        });

        let lastFoundCustomer = "";
        for (let i = tripItems.length - 1; i >= 0; i--) {
          const vt = tripItems[i].vtRow;
          if (vt.khachHang) {
            lastFoundCustomer = vt.khachHang;
          } else if (lastFoundCustomer) {
            vt.khachHang = lastFoundCustomer;
          }
        }
      });

      const customerGroupMap = {};
      vtrackingRows.forEach(vt => {
        if (!vt.khachHang) return; 
        const groupKey = `${vt.khachHang}_${vt.ngayChuan}_${vt.bienSo}_${vt.chuyenVtracking}`;
        if (!customerGroupMap[groupKey]) {
          customerGroupMap[groupKey] = [];
        }
        customerGroupMap[groupKey].push(vt);
      });

      Object.keys(customerGroupMap).forEach(groupKey => {
        const groupItems = customerGroupMap[groupKey];
        let totalKmCustomer = 0;
        groupItems.forEach(vt => {
          totalKmCustomer += (vt.quangDuong || 0);
        });

        const roundedKm = Number(totalKmCustomer.toFixed(2));
        groupItems.forEach(vt => {
          vt.kmKhachVtracking = roundedKm;
        });
      });

      // Tính `kmChuyenDiVtracking` trước bằng tổng `kmKhachVtracking` trong chuyến, sau đó `kmChuyenVeVtracking = kmChuyenVtracking - kmChuyenDiVtracking`
      const tripCustomerKmMap = {};
      vtrackingRows.forEach(vt => {
        if (!vt.bienSo || !vt.ngayChuan || vt.chuyenVtracking === undefined || !vt.khachHang) return;
        const tripKey = `${vt.bienSo}_${vt.ngayChuan}_${vt.chuyenVtracking}`;
        if (!tripCustomerKmMap[tripKey]) {
          tripCustomerKmMap[tripKey] = {};
        }
        tripCustomerKmMap[tripKey][vt.khachHang] = vt.kmKhachVtracking || 0;
      });

      Object.keys(tripMap).forEach(tripKey => {
        const tripItems = tripMap[tripKey];
        const custKmObj = tripCustomerKmMap[tripKey] || {};
        const sumKmKhachInTrip = Object.values(custKmObj).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
        const kmDiRounded = Number(sumKmKhachInTrip.toFixed(2));

        tripItems.forEach(itemObj => {
          const vt = itemObj.vtRow;
          const totalTripKm = parseFloat(vt.kmChuyenVtracking) || 0;
          const kmVeRounded = Number((totalTripKm - kmDiRounded).toFixed(2));
          vt.kmChuyenDiVtracking = kmDiRounded;
          vt.kmChuyenVeVtracking = kmVeRounded;
        });
      });
    });

    // 2. TRA CỨU CHÉO KM TỪ V-TRACKING VÀO TUYẾN ĐƯỜNG
    console.log(`📏 Đang tra cứu chéo chỉ số km từ V-Tracking sang Tuyến Đường...`);
    for (const item of eligibleRoutes) {
      const thang = item.thang;
      const bienSo = item.phuongTien;
      const ngayTuongUng = item.ngayThangNam;
      const chuyenNum = item.chuyenVtracking;

      if (!thang || !bienSo || !ngayTuongUng || chuyenNum === null || chuyenNum === undefined) continue;

      const vtrackingRows = vtrackingCache[thang];
      if (!vtrackingRows) continue;

      const matchedVt = vtrackingRows.find(vt => 
        vt.bienSo === bienSo && 
        vt.ngayChuan === ngayTuongUng && 
        vt.chuyenVtracking === chuyenNum
      );

      if (matchedVt) {
        item.kmChuyenDiVtracking = matchedVt.kmChuyenDiVtracking || 0;
        item.kmChuyenVeVtracking = matchedVt.kmChuyenVeVtracking || 0;
        item.kmChuyenVtracking = matchedVt.kmChuyenVtracking || 0;
      }
    }

    // 🌟 3. TRA CỨU CHÉO NGƯỢC LẠI TỪ V-TRACKING VÀO TUYẾN ĐƯỜNG (KÈM ƯU TIÊN SẮP XẾP THÔNG MINH)
    console.log(`⏱️ Đang tra cứu chéo thoiGianDau, thoiGianDi, kmKhachVtracking từ V-Tracking sang Tuyến Đường theo thứ tự ưu tiên...`);
    
    const tuyenDuongTripCustomerCoordMap = {};
    eligibleRoutes.forEach((rt) => {
      if (!rt.phuongTien || !rt.ngayThangNam || rt.chuyenVtracking === null || rt.chuyenVtracking === undefined || !rt.doiTuong) return;
      const coordKey = rt.dinhVi ? rt.dinhVi.trim() : "";
      const key = `${rt.phuongTien}_${rt.ngayThangNam}_${rt.chuyenVtracking}_${rt.doiTuong}_${coordKey}`;
      if (!tuyenDuongTripCustomerCoordMap[key]) {
        tuyenDuongTripCustomerCoordMap[key] = [];
      }
      tuyenDuongTripCustomerCoordMap[key].push(rt);
    });

    Object.keys(tuyenDuongTripCustomerCoordMap).forEach(key => {
      const items = tuyenDuongTripCustomerCoordMap[key];
      const parts = key.split("_");
      const bienSo = parts[0];
      const ngayChuan = parts[1];
      const chuyenNum = parseInt(parts[2], 10);
      const doiTuong = parts[3];

      items.sort((a, b) => {
        const timeEndA = a.ketThucGiaoHang ? a.ketThucGiaoHang.split(" ").pop() : "99:99:99";
        const timeEndB = b.ketThucGiaoHang ? b.ketThucGiaoHang.split(" ").pop() : "99:99:99";
        if (timeEndA !== timeEndB) {
          return timeEndA.localeCompare(timeEndB);
        }

        const timeStartA = a.batDauGiaoHang ? a.batDauGiaoHang.split(" ").pop() : "99:99:99";
        const timeStartB = b.batDauGiaoHang ? b.batDauGiaoHang.split(" ").pop() : "99:99:99";
        if (timeStartA !== timeStartB) {
          return timeStartA.localeCompare(timeStartB);
        }

        const dateXuatA = a.ngayxuatKho || "";
        const dateXuatB = b.ngayxuatKho || "";
        return dateXuatB.localeCompare(dateXuatA);
      });

      const selectedRt = items[0];

      const thang = selectedRt.thang;
      const vtrackingRows = vtrackingCache[thang];
      let matchedVt = null;

      if (vtrackingRows) {
        matchedVt = vtrackingRows.find(vt => 
          vt.bienSo === bienSo && 
          vt.ngayChuan === ngayChuan && 
          vt.chuyenVtracking === chuyenNum && 
          vt.khachHang === doiTuong
        );
      }

      if (matchedVt) {
        selectedRt.thoiGianDau = matchedVt.thoiGianDau || "00:00:00";
        selectedRt.thoiGianDi = matchedVt.thoiGianDi || "";
        selectedRt.kmKhachVtracking = matchedVt.kmKhachVtracking || 0;
      }

      for (let i = 1; i < items.length; i++) {
        items[i].thoiGianDau = "00:00:00";
        items[i].thoiGianDi = "";
        items[i].kmKhachVtracking = 0;
      }
    });

    console.log(`📡 Đang đẩy toàn bộ dữ liệu TUYENDUONG lên Firestore...`);
    let batch = db.batch();
    let count = 0;
    
    for (const item of tuyenDuongMemoryList) {
      const { maPhieu, ...dataToSave } = item;
      const docRef = db.collection('TUYENDUONG').doc(maPhieu);
      batch.set(docRef, dataToSave, { merge: true });
      count++;
      
      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      } 
    } 
    if (count % 400 !== 0) {
      await batch.commit();
    }
    console.log(`🎉 HOÀN TẤT: Đã cập nhật thành công ${tuyenDuongMemoryList.length} chứng từ TUYENDUONG lên Firestore!`); 
    
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
    console.log(`🎉 HOÀN TẤT: Đã gộp và đẩy thành công ${reportRows.length} dòng báo cáo lên 'KHACHHANGVUNG'!`);

  } catch (err) {
    console.error(`❌ Lỗi đồng bộ Tuyến Đường & Tra cứu chéo V-Tracking:`, err.message);
  }
}

mainSync().catch(err => {
  console.error('❌ Lỗi hệ thống nghiêm trọng:', err);
  process.exit(1);
});
