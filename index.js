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

// 🔗 DANH SÁCH ID 12 FILE VTRACKING NĂM 2026
const ID_VTRACKING_2026 = {
  "1": "1sqIs2aBJom_u-Oj0IB1Z2LI2f9heToHP",
  "2": "1Yv144AWuT9iU-EwptWrrfk_79yKrvRB6",
  "3": "1EfCBdpAGaJjKnXnSjH5aBz7lJvysu9RW",
  "4": "1CElJxYpy7hQImjBrfJMEYX9Lm39iITjO",
  "5": "1GRo0ru9i2mR0djDY7A3XckwRx8TTBXoK",
  "6": "1q0vTb0HNC-ldAZg_1Uzr6KJkD0Xy7FIx",
  "7": "1QT2oxfIu4cLCTgpwAHKhQsIyq4KqB0yC",
  "8": "1a2z7w_DLsf9f24XYAsf2SJjzo413d8iM",
  "9": "1nUMJB8FVCN1ObRmW6Gf8aERnmfogs2fd",
  "10": "1L6yuunc1I-v1H-BWSLbQP8TjTyCXNyUq",
  "11": "1t7KgNwHwQuK0terHjSVwrC722ObYsnj8",
  "12": "1pgJsXILGp20zFZ-ddoIbPH23ghT2DYmh"
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

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCoordPair(str) {
  const parts = String(str || "").split(",");
  if (parts.length < 2) return { lat: NaN, lng: NaN };
  return {
    lat: parseFloat(parts[0].trim()),
    lng: parseFloat(parts[1].trim())
  };
}

function normalizePlate(plate) {
  return String(plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseVtrackingToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const vtMap = {};

  let headerRow = 2;
  for (let i = 0; i < Math.min(5, jsonData.length); i++) {
    const rowStr = JSON.stringify(jsonData[i]);
    if (rowStr.includes("Biển số") || rowStr.includes("Ngày")) {
      headerRow = i;
      break;
    }
  }

  for (let i = headerRow + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 12) continue;
    const d = formatExcelDate(row[1]);
    if (!d) continue;
    const dateKey = d.split(" ")[0];
    const plate = normalizePlate(row[2]);
    if (!plate) continue;

    const startCoords = parseCoordPair(row[8]);
    const endCoords = parseCoordPair(row[10]);
    const km = parseFloat(String(row[11] || 0).replace(",", ".")) || 0;

    const key = `${plate}|${dateKey}`;
    if (!vtMap[key]) vtMap[key] = [];
    vtMap[key].push({
      startLat: startCoords.lat,
      startLng: startCoords.lng,
      endLat: endCoords.lat,
      endLng: endCoords.lng,
      km: km
    });
  }
  return vtMap;
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

// 2. XỬ LÝ ĐỌC FILE TUYẾN ĐƯỜNG & TÍNH KM VTRACKING THEO ĐÚNG YÊU CẦU MỚI
function parseRoutesToMap(buffer, ycghMap = {}, vtrackingCache = {}) {
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
  
  const tripGroups = {};

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
    
    const batDauGiaoTxt = getDateByIdx(row, 30);
    const ketThucGiaoTxt = getDateByIdx(row, 31);
    const ngayXuatKhoTxt = getDateByIdx(row, 27);

    // 🌟 Ưu tiên Kết thúc giao hàng, nếu rỗng thì lấy Bắt đầu giao hàng
    const refDateStr = ketThucGiaoTxt || batDauGiaoTxt || ngayXuatKhoTxt;
    let thang = "";
    let nam = "";
    let monthNum = 0;
    
    if (refDateStr && refDateStr.includes("/")) {
      const parts = refDateStr.split("/");
      if (parts[1]) {
        monthNum = parseInt(parts[1], 10);
        thang = monthNum;
      }
      if (parts[2]) nam = parseInt(parts[2].split(" ")[0], 10);
    }

    const phuongTien = getTxtByIdx(row, 20);
    const chuyen = getNumByIdx(row, 22);
    const dateKey = refDateStr ? refDateStr.split(" ")[0] : "";

    const lat = getNumByIdx(row, 24); 
    const lng = getNumByIdx(row, 25); 
    
    // Sắp xếp đơn trước sau dựa vào Kết thúc giao hàng, nếu rỗng lấy Bắt đầu giao hàng
    const timeValStr = ketThucGiaoTxt || batDauGiaoTxt;
    const sortTimeMs = timeValStr ? new Date(timeValStr.split('/').reverse().join('-')).getTime() || 0 : 0;

    const rowObj = {
      row, khoXuatVal, maPhieu, dinhVi, checkIn, saiLechKm, theoDoi,
      thang, nam, monthNum, dateKey, phuongTien, chuyen, lat, lng, sortTimeMs,
      batDauGiaoTxt, ketThucGiaoTxt, ngayXuatKhoTxt
    };

    const groupKey = `${dateKey}|${normalizePlate(phuongTien)}|${chuyen}`;
    if (!tripGroups[groupKey]) tripGroups[groupKey] = [];
    tripGroups[groupKey].push(rowObj);
  }

  Object.values(tripGroups).forEach(group => {
    // Sắp xếp đơn trước sau trong nhóm dựa vào Kết thúc giao hàng (hoặc Bắt đầu nếu rỗng)
    group.sort((a, b) => a.sortTimeMs - b.sortTimeMs);

    const monthNum = group[0].monthNum;
    const plate = normalizePlate(group[0].phuongTien);
    const dateKey = group[0].dateKey;

    const vtDataMap = vtrackingCache[monthNum] || {};
    const vtRows = vtDataMap[`${plate}|${dateKey}`] || [];

    for (let i = 0; i < group.length; i++) {
      const current = group[i];
      let calculatedKm = 0;

      if (vtRows.length > 0 && !isNaN(current.lat) && !isNaN(current.lng)) {
        let targetStartLat, targetStartLng;
        if (i === 0) {
          targetStartLat = vtRows[0].startLat;
          targetStartLng = vtRows[0].startLng;
        } else {
          targetStartLat = group[i - 1].lat;
          targetStartLng = group[i - 1].lng;
        }

        let bestStartIdx = 0, minStartDist = Infinity;
        let bestEndIdx = 0, minEndDist = Infinity;

        vtRows.forEach((vt, idx) => {
          const dStart = haversineKm(targetStartLat, targetStartLng, vt.startLat, vt.startLng);
          if (dStart < minStartDist) { minStartDist = dStart; bestStartIdx = idx; }

          const dEnd = haversineKm(current.lat, current.lng, vt.endLat, vt.endLng);
          if (dEnd < minEndDist) { minEndDist = dEnd; bestEndIdx = idx; }
        });

        const fromIdx = Math.min(bestStartIdx, bestEndIdx);
        const toIdx = Math.max(bestStartIdx, bestEndIdx);
        for (let k = fromIdx; k <= toIdx; k++) {
          calculatedKm += vtRows[k].km;
        }
      }

      const r = current.row;
      const nganh = current.khoXuatVal === "41" ? "Sơn" : "TBVS";
      const vungTieuThu = ycghMap[current.maPhieu]?.vungTieuThu || "";

      routeMap[current.maPhieu] = {
        phuongXa:        getTxtByIdx(r, 0),   
        khoXuat:          current.khoXuatVal,            
        tuyenDuong:       getTxtByIdx(r, 2),   
        maPhieu:          current.maPhieu,               
        doiTuong:         getTxtByIdx(r, 4),   
        ngayDatHang:      getDateByIdx(r, 5),  
        ngayXuLy:         getDateByIdx(r, 6),  
        ngayDuyet:        getDateByIdx(r, 7),  
        ngayDuKien:       getDateByIdx(r, 8),  
        duyet:            getTxtByIdx(r, 9),   
        status:           getTxtByIdx(r, 10),  
        botTretKg:        getNumByIdx(r, 11),  
        sonTbvsKg:        getNumByIdx(r, 12),  
        tTai:             getNumByIdx(r, 13),  
        thanhTien:        getNumByIdx(r, 14),  
        noiGiao:          getTxtByIdx(r, 15),  
        ghiChu:           getTxtByIdx(r, 16),  
        kmDuKIen:         getNumByIdx(r, 17),  
        htGiaoNhan:       getTxtByIdx(r, 18),  
        ngayGiao:         getDateByIdx(r, 19), 
        phuongTien:       getTxtByIdx(r, 20),  
        taiXe:            getTxtByIdx(r, 21),  
        chuyen:           getNumByIdx(r, 22),  
        giaoNhan:         getTxtByIdx(r, 23),  
        pxk:              getTxtByIdx(r, 26),  
        dinhVi:           current.dinhVi,
        ngayxuatKho:      current.ngayxuatKhoTxt,        
        thoiGianLamViec:  getTxtByIdx(r, 28),  
        thanhPho:         getTxtByIdx(r, 29),  
        batDauGiaoHang:   current.batDauGiaoTxt, 
        ketThucGiaoHang:  current.ketThucGiaoTxt, 
        kmBatDauGiaoHang: getNumByIdx(r, 32),  
        kmKetThucGiaoHang:getNumByIdx(r, 33),  
        kmVtracking:      Number(calculatedKm.toFixed(2)), // 🌟 TRƯỜNG MỚI LƯU KM VTRACKING TÍNH TOÁN
        checkIn:          current.checkIn,
        saiLechKm:        current.saiLechKm,
        theoDoi:          current.theoDoi,
        thang:            current.thang,
        nam:              current.nam,
        nganh:            nganh,
        vungTieuThu:      vungTieuThu     
      };
    }
  });

  return routeMap; 
}

function generateKhachHangVungReport(routeDataMap) {
  const groupMap = {};
  const addToGroup = (doiTuong, vung, htGiaoNhan, nganh, nam, thang, tl, dt) => {
    const key = `${doiTuong}_${vung}_${htGiaoNhan}_${nganh}_${nam}`;
    if (!groupMap[key]) {
      groupMap[key] = {
        doiTuong: doiTuong, vungTieuThu: vung, htGiaoNhan: htGiaoNhan, nganh: nganh, nam: nam,
        trongLuongMonths: {}, doanhThuMonths: {}
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
    if (trangThaiDuyet !== "Đã giao hàng" && trangThaiDuyet !== "Đã xuất kho") return;
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
      doiTuong: group.doiTuong, vungTieuThu: group.vungTieuThu,
      htGiaoNhan: group.htGiaoNhan, nganh: group.nganh, nam: group.nam
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
        console.log(`🔍 [Kho ${khoName}] Đang tải file danh mục mở rộng...`);
        try {
          const catalogBuffer = await downloadFileBuffer(drive, ID_SANPHAM[khoName]);
          catalogMap = parseCatalogToMap(catalogBuffer);
        } catch (catErr) {
          console.error(`   ⚠️ Không thể nạp danh mục cho Kho ${khoName} (${catErr.message})`);
        }
      }
      const buffer = await downloadFileBuffer(drive, fileId);
      const dataObject = parseInventoryToMap(buffer, khoName, catalogMap);
      if (Object.keys(dataObject).length > 0) {
        finalInventoryData[`Kho_${khoName}`] = dataObject;
        invSuccessCount++;
        console.log(`✅ Thành công Kho ${khoName}: Đã đọc ${Object.keys(dataObject).length} mặt hàng.`);
      } 
    } catch (err) {
      console.error(`❌ Lỗi kết nối Kho ${khoName}:`, err.message);
    } 
  }

  if (invSuccessCount > 0) {
    finalInventoryData["last_updated"] = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('TONKHO').doc('KHO').set(finalInventoryData, { merge: true });
    console.log(`🎉 HOÀN TẤT: Đã gộp và đẩy Tồn Kho lên Firestore thành công!`);
  }

  console.log('\n--------------------------------------------------\n');
  console.log('🚀 2. Bắt đầu tải và lập chỉ mục 12 file Vtracking 2026...');
  const vtrackingCache = {};
  for (const [monthStr, fileId] of Object.entries(ID_VTRACKING_2026)) {
    const monthNum = parseInt(monthStr, 10);
    try {
      console.log(`📦 Đang tải file Vtracking Tháng ${monthNum}/2026...`);
      const vtBuffer = await downloadFileBuffer(drive, fileId);
      vtrackingCache[monthNum] = parseVtrackingToMap(vtBuffer);
      console.log(`   -> Đã tải xong dữ liệu Vtracking Tháng ${monthNum}.`);
    } catch (vtErr) {
      console.error(`   ⚠️ Không thể tải file Vtracking tháng ${monthNum}: ${vtErr.message}`);
      vtrackingCache[monthNum] = {};
    }
  }

  console.log('\n--------------------------------------------------\n');
  console.log('🚀 3. Bắt đầu tiến trình cập nhật Tuyến Đường & Khách Hàng Vùng...');
  
  try {
    console.log(`📦 Đang tải file YCGH từ Drive...`);
    const ycghBuffer = await downloadFileBuffer(drive, ID_YCGH);
    const ycghMapData = parseYcghToMap(ycghBuffer);

    console.log(`📦 Đang tải file Tuyến Đường từ Drive...`);
    const routeBuffer = await downloadFileBuffer(drive, ID_TUYENDUONG);
    const routeDataMap = parseRoutesToMap(routeBuffer, ycghMapData, vtrackingCache);
    const totalRecords = Object.keys(routeDataMap).length;
    
    if (totalRecords > 0) {
      console.log(`📡 Đang đẩy ${totalRecords} chứng từ vào collection 'TUYENDUONG'...`);
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
      if (count % 400 !== 0) await batch.commit();
      console.log(`🎉 HOÀN TẤT TUYENDUONG kèm trường kmVtracking mới!`); 
      
      console.log(`📊 Đang tạo bảng tổng hợp KHACHHANGVUNG...`);
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
      if (reportCount % 400 !== 0) await reportBatch.commit();
      console.log(`🎉 HOÀN TẤT KHACHHANGVUNG với ${reportRows.length} dòng!`);

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
