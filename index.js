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

// 📍 TỌA ĐỘ KHO 55 TẦM VU
const KHO_55_TAM_VU_LAT = 10.007685;
const KHO_55_TAM_VU_LONG = 105.763084;

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

function formatStandardDate(dateStr) {
  if (!dateStr) return "";
  const cleanDate = dateStr.split(" ")[0];
  if (cleanDate.includes("/")) {
    const parts = cleanDate.split("/");
    if (parts.length === 3) {
      const pad = (n) => String(n).padStart(2, '0');
      const d = pad(parseInt(parts[0], 10));
      const m = pad(parseInt(parts[1], 10));
      const y = parts[2];
      return `${d}/${m}/${y}`;
    }
  } else if (cleanDate.includes("-")) {
    const parts = cleanDate.split("-");
    const pad = (n) => String(n).padStart(2, '0');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const y = parts[0];
        const m = pad(parseInt(parts[1], 10));
        const d = pad(parseInt(parts[2], 10));
        return `${d}/${m}/${y}`;
      } else {
        const d = pad(parseInt(parts[0], 10));
        const m = pad(parseInt(parts[1], 10));
        const y = parts[2];
        return `${d}/${m}/${y}`;
      }
    }
  }
  return cleanDate;
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  return h * 3600 + m * 60 + s;
}

function formatSecondsToTime(totalSeconds) {
  if (totalSeconds <= 0) return "0 giây";
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} giờ ${pad(m)} phút ${pad(s)} giây`;
  if (m > 0) return `${m} phút ${pad(s)} giây`;
  return `${s} giây`;
}

// 🚚 ĐỌC VÀ XỬ LÝ FILE V-TRACKING
function parseVTrackingToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  const rawRows = [];

  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 12) continue;

    const rawNgay = row[1] ? row[1].toString().trim() : "";
    const ngayChuan = formatStandardDate(rawNgay);
    const bienSo = row[2] ? row[2].toString().trim() : "";
    const laiXe = row[3] ? row[3].toString().trim() : "";
    const thoiGianBatDauOnly = row[4] ? row[4].toString().trim() : "";
    const thoiGianKetThucOnly = row[5] ? row[5].toString().trim() : "";
    const thoiGianDi = row[6] ? row[6].toString().trim() : "";
    
    const thoiGianBatDau = (ngayChuan && thoiGianBatDauOnly) ? `${ngayChuan} ${thoiGianBatDauOnly}` : thoiGianBatDauOnly;
    const thoiGianKetThuc = (ngayChuan && thoiGianKetThucOnly) ? `${ngayChuan} ${thoiGianKetThucOnly}` : thoiGianKetThucOnly;

    const diaDiemBatDau = row[7] ? row[7].toString().trim() : "";
    const latBatDau = parseFloat(row[8]) || 0;
    const longBatDau = parseFloat(row[9]) || 0;
    const diaDiemKetThuc = row[10] ? row[10].toString().trim() : "";
    const latKetThuc = parseFloat(row[11]) || 0;
    const longKetThuc = parseFloat(row[12]) || 0;
    const quangDuong = parseFloat(row[13]) || parseFloat(row[11]) || 0;

    if (!ngayChuan || !bienSo) continue;

    rawRows.push({
      ngayChuan,
      bienSo,
      laiXe,
      thoiGianBatDau,
      thoiGianKetThuc,
      thoiGianDi,
      thoiGianDau: "",
      diaDiemBatDau,
      latBatDau,
      longBatDau,
      diaDiemKetThuc,
      latKetThuc,
      longKetThuc,
      quangDuong,
      chuyenVtracking: 1
    });
  }

  const groupedMap = {};
  rawRows.forEach(r => {
    const key = `${r.bienSo}_${r.ngayChuan}`;
    if (!groupedMap[key]) groupedMap[key] = [];
    groupedMap[key].push(r);
  });

  const processedTripsMap = {};

  Object.keys(groupedMap).forEach(key => {
    const rowsOfGroup = groupedMap[key];
    let currentChuyen = 1;

    rowsOfGroup.forEach((row, idx) => {
      if (idx > 0) {
        const prevRow = rowsOfGroup[idx - 1];
        const prevEndTimeOnly = prevRow.thoiGianKetThuc.split(" ")[1] || "";
        const currStartTimeOnly = row.thoiGianBatDau.split(" ")[1] || "";
        const prevSec = parseTimeToSeconds(prevEndTimeOnly);
        const currSec = parseTimeToSeconds(currStartTimeOnly);
        if (currSec >= prevSec) {
          row.thoiGianDau = formatSecondsToTime(currSec - prevSec);
        } else {
          row.thoiGianDau = "0 giây";
        }
      } else {
        row.thoiGianDau = "0 giây";
      }

      if (row.quangDuong > 0) {
        const isToKho = (Math.abs(row.latKetThuc - KHO_55_TAM_VU_LAT) < 0.002 && Math.abs(row.longKetThuc - KHO_55_TAM_VU_LONG) < 0.002);
        row.chuyenVtracking = currentChuyen;
        if (isToKho) {
          currentChuyen++;
        }
      } else {
        row.chuyenVtracking = currentChuyen;
      }
    });

    const bienSo = rowsOfGroup[0].bienSo;
    const ngay = rowsOfGroup[0].ngayChuan;
    if (!processedTripsMap[bienSo]) processedTripsMap[bienSo] = {};
    if (!processedTripsMap[bienSo][ngay]) processedTripsMap[bienSo][ngay] = [];

    const maxChuyen = rowsOfGroup[rowsOfGroup.length - 1].chuyenVtracking;
    for (let c = 1; c <= maxChuyen; c++) {
      const segsOfTrip = rowsOfGroup.filter(r => r.chuyenVtracking === c);
      if (segsOfTrip.length > 0) {
        processedTripsMap[bienSo][ngay].push({
          chuyen: c,
          segments: segsOfTrip.map(s => ({
            thoiGianBatDau: s.thoiGianBatDau,
            thoiGianKetThuc: s.thoiGianKetThuc,
            latBatDau: s.latBatDau,
            longBatDau: s.longBatDau,
            latKetThuc: s.latKetThuc,
            longKetThuc: s.longKetThuc,
            quangDuong: s.quangDuong
          }))
        });
      }
    }
  });

  return processedTripsMap;
}

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

function parseRoutesToMap(buffer, ycghMap = {}) {              
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const routeMap = {};
  
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
    
    let latGiao = parseFloat(row[24]) || 0;
    let longGiao = parseFloat(row[25]) || 0;
    let dinhVi = (latGiao && longGiao) ? `${latGiao},${longGiao}` : "";

    let checkIn = "";
    if (row[34] && row[35]) checkIn = `${row[34].toString().trim()},${row[35].toString().trim()}`;
    
    const saiLechKm = getNumByIdx(row, 36); 
    let theoDoi = "";
    if (saiLechKm > 0.5) theoDoi = "Cần kiểm tra";
    
    const ngayXuatKhoTxt = getDateByIdx(row, 27);
    const batDauGiaoTxt = getDateByIdx(row, 30);
    const ketThucGiaoTxt = getDateByIdx(row, 31);
    const ngayXuLyTxt = getDateByIdx(row, 6);

    const ngayChinh = batDauGiaoTxt || ketThucGiaoTxt || ngayXuatKhoTxt || ngayXuLyTxt;
    const ngayThangNam = formatStandardDate(ngayChinh);
    const ngayTraCuuVTracking = ngayThangNam;

    let thang = "";
    let nam = "";
    if (ngayThangNam && ngayThangNam.includes("/")) {
      const parts = ngayThangNam.split("/");
      if (parts[1]) thang = parseInt(parts[1], 10); 
      if (parts[2]) nam = parseInt(parts[2].split(" ")[0], 10); 
    }

    let nganh = "";
    if (khoXuatVal === "41") {
      nganh = "Sơn";
    } else if (khoXuatVal === "61" || khoXuatVal === "69") {
      nganh = "TBVS";
    }
    
    const vungTieuThu = ycghMap[maPhieu]?.vungTieuThu || ""; 

    routeMap[maPhieu] = {
      phuongXa:         getTxtByIdx(row, 0),   
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
      ngayxuatKho:      ngayXuatKhoTxt,        
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
      ngayTraCuuVTracking: ngayTraCuuVTracking,
      kmVtracking:      0,
      chuyenVtracking:  0,
      minThoiGianBatDau: "", // 🌟 Thêm trường minThoiGianBatDau
      _latGiao:         latGiao,
      _longGiao:        longGiao
    }; 
  } 
  return routeMap; 
}

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
  }

  console.log('\n--------------------------------------------------\n');
  console.log('🚀 2. Bắt đầu tải và nạp bộ nhớ tạm 12 file V-Tracking...');
  
  const vtrackingCache = {};
  for (const [thangNum, fileId] of Object.entries(ID_VTRACKING_MONTHS)) {
    try {
      const vtBuffer = await downloadFileBuffer(drive, fileId);
      vtrackingCache[thangNum] = parseVTrackingToMap(vtBuffer);
      console.log(`   -> Đã nạp thành công bộ nhớ tạm V-Tracking Tháng ${thangNum}`);
    } catch (vtErr) {
      console.error(`   ⚠️ Không thể tải V-Tracking Tháng ${thangNum}: ${vtErr.message}`);
    }
  }

  console.log('\n--------------------------------------------------\n');
  console.log('🚀 3. Bắt đầu xử lý Tuyến Đường & Tra cứu kmVtracking theo điều kiện Duyệt...');
  
  try {
    const ycghBuffer = await downloadFileBuffer(drive, ID_YCGH);
    const ycghMapData = parseYcghToMap(ycghBuffer);

    const routeBuffer = await downloadFileBuffer(drive, ID_TUYENDUONG);
    const routeDataMap = parseRoutesToMap(routeBuffer, ycghMapData);          
    
    const routeList = Object.values(routeDataMap);
    
    // 🌟 SẮP XẾP THEO YÊU CẦU: ngayThangNam -> Kết thúc giao hàng -> Km kết thúc giao hàng
    routeList.sort((a, b) => {
      if (a.phuongTien !== b.phuongTien) return a.phuongTien.localeCompare(b.phuongTien);
      if (a.ngayThangNam !== b.ngayThangNam) return a.ngayThangNam.localeCompare(b.ngayThangNam);

      const dateA = a.ketThucGiaoHang || "";
      const dateB = b.ketThucGiaoHang || "";
      
      if (dateA && dateB) return dateA.localeCompare(dateB);
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;

      return (a.kmKetThucGiaoHang || 0) - (b.kmKetThucGiaoHang || 0);
    });

    // 🌟 TRA CỨU TRÉO TÍNH KM VÀ XÁC ĐỊNH chuyenVtracking + minThoiGianBatDau (DÒ TỪ DƯỚI LÊN)
    routeList.forEach(item => {
      let tongKmDon = 0;
      let matchedChuyenVtracking = 0;
      let matchedMinStartFull = "";

      const trangThaiDuyet = item.duyet ? item.duyet.toString().trim() : "";
      const isHopLeTraCuu = (trangThaiDuyet === "Đã giao hàng" || trangThaiDuyet === "Đang giao hàng");

      const thang = item.thang;
      const bienSo = item.phuongTien;
      const ngay = item.ngayTraCuuVTracking;

      if (thang && vtrackingCache[thang] && vtrackingCache[thang][bienSo] && vtrackingCache[thang][bienSo][ngay]) {
        const trips = vtrackingCache[thang][bienSo][ngay];

        if (item.ketThucGiaoHang && trips.length > 0) {
          const ketThucTimeOnly = item.ketThucGiaoHang.split(" ")[1] || item.ketThucGiaoHang;
          
          // 🌟 Duyệt ngược từ chuyến lớn nhất về chuyến nhỏ nhất (Dò từ dưới lên)
          for (let i = trips.length - 1; i >= 0; i--) {
            const currentTrip = trips[i];
            if (currentTrip.segments.length === 0) continue;

            const startTripTimeFull = currentTrip.segments[0].thoiGianBatDau;
            const startTripTimeOnly = startTripTimeFull.split(" ")[1] || startTripTimeFull;

            // Điều kiện: ketThucGiaoHang > min Thời gian bắt đầu chuyến
            if (ketThucTimeOnly >= startTripTimeOnly) {
              matchedChuyenVtracking = currentTrip.chuyen;
              matchedMinStartFull = startTripTimeFull;
              break;
            }
          }

          if (matchedChuyenVtracking === 0 && trips.length > 0) {
            matchedChuyenVtracking = trips[0].chuyen;
            matchedMinStartFull = trips[0].segments[0].thoiGianBatDau;
          }
        }

        const targetTrip = trips.find(t => t.chuyen === matchedChuyenVtracking);
        if (isHopLeTraCuu && targetTrip && targetTrip.segments.length > 0) {
          const sameTripItems = routeList.filter(r => r.phuongTien === bienSo && r.ngayTraCuuVTracking === ngay && r.chuyenVtracking === matchedChuyenVtracking);
          if (sameTripItems.length > 0 && sameTripItems[0].maPhieu === item.maPhieu) {
            const diemDichLat = item._latGiao;
            const diemDichLong = item._longGiao;

            if (diemDichLat && diemDichLong) {
              for (const seg of targetTrip.segments) {
                tongKmDon += seg.quangDuong;
                const matchEndLat = Math.abs(seg.latKetThuc - diemDichLat) < 0.002;
                const matchEndLong = Math.abs(seg.longKetThuc - diemDichLong) < 0.002;
                if (matchEndLat && matchEndLong) {
                  break;
                }
              }
            }
          }
        }
      }

      item.kmVtracking = Number(tongKmDon.toFixed(2));
      item.chuyenVtracking = matchedChuyenVtracking;
      item.minThoiGianBatDau = matchedMinStartFull; // 🌟 Lưu giá trị minThoiGianBatDau vào object

      delete item._latGiao;
      delete item._longGiao;
    });

    const totalRecords = routeList.length;
    
    if (totalRecords > 0) {
      console.log(`📡 Đang đẩy dữ liệu tuần tự ${totalRecords} mã phiếu vào collection 'TUYENDUONG'...`);
      let batch = db.batch();
      let count = 0;
      for (const data of routeList) {
        const docRef = db.collection('TUYENDUONG').doc(data.maPhieu);
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
      console.log(`🎉 HOÀN TẤT: Đã cập nhật thành công TUYENDUONG kèm minThoiGianBatDau và dò chuyến từ dưới lên!`); 
      
      const reportRows = generateKhachHangVungReport(routeList);
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
      console.log(`🎉 HOÀN TẤT: Đã đẩy ${reportRows.length} dòng báo cáo lên 'KHACHHANGVUNG'!`);

    } 
  } catch (err) {
    console.error(`❌ Lỗi đồng bộ Tuyến Đường:`, err.message);
  } 
}

mainSync().catch(err => {
  console.error('❌ Lỗi hệ thống nghiêm trọng:', err);
  process.exit(1);
});
