const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// 🔗 ĐƯỜNG LINK CÁC FILE EXCEL CỦA BẠN
const INVENTORY_LINKS = {
  "41": "https://docs.google.com/spreadsheets/d/1ZS9K4lSPHMzBR4ifgSpiGx_RbYbDJ8tb/edit",
  "61": "https://docs.google.com/spreadsheets/d/1ONnLc9N7IxZOvbs4udNjEH_JZxYOATLB/edit",
  "69": "https://docs.google.com/spreadsheets/d/1lvbNAvxQ-jXMEIwZ-w3GOdsbcd5-TCIf/edit"
};

const ROUTE_FILE_LINK = "https://docs.google.com/spreadsheets/d/1JEgcPzZUSDj5MmLqifbOD6cBhJ7ggsHR/edit"; 

function extractFileId(input) {
  if (input.includes("spreadsheets/d/")) {
    return input.split("spreadsheets/d/")[1].split("/")[0];
  }
  return input.trim();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}
const db = admin.firestore();

function getDriveClient() {
  const auth = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/drive.readonly']
  );
  return google.drive({ version: 'v3', auth });
}

async function downloadFileBuffer(drive, fileId) {
  return await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  ).then(res => Buffer.from(res.data));
}

// 📡 HÀM ĐỊNH DẠNG NGÀY GIỜ CHUẨN ĐẸP (DD/MM/YYYY HH:mm:ss)
function formatExcelDate(cellValue) {
  if (cellValue === undefined || cellValue === null || cellValue === "") return "";
  
  const pad = (n) => String(n).padStart(2, '0');

  // 1. Nếu cellValue là đối tượng Date nguyên bản
  if (cellValue instanceof Date) {
    const d = cellValue;
    const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return timeStr === "00:00:00" ? dateStr : `${dateStr} ${timeStr}`;
  }

  const strVal = cellValue.toString().trim();
  
  // 2. Nếu đã là chuỗi định dạng sẵn chứa gạch chéo hoặc gạch ngang
  if (strVal.includes('/') || strVal.includes('-')) return strVal;

  // 3. Nếu là dạng số Serial của Excel (ví dụ: 46025.34053)
  const numVal = parseFloat(cellValue);
  if (!isNaN(numVal) && numVal > 30000) {
    try {
      const dateObj = XLSX.SSF.parse_date_code(numVal);
      const y = dateObj.y;
      const m = pad(dateObj.m);
      const d = pad(dateObj.d);
      const hh = pad(dateObj.H);
      const mm = pad(dateObj.M);
      const ss = pad(dateObj.S);
      
      const dateStr = `${d}/${m}/${y}`;
      if (dateObj.H === 0 && dateObj.M === 0 && dateObj.S === 0) {
        return dateStr;
      }
      return `${dateStr} ${hh}:${mm}:${ss}`;
    } catch (e) {
      return strVal;
    }
  }
  return strVal;
}

// ----------------------------------------------------
// 1. XỬ LÝ ĐỌC FILE TỒN KHO
// ----------------------------------------------------
function parseInventoryToMap(buffer, khoName) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const dataMap = {};
  
  let startRowIndex = 9; 
  for (let i = 0; i < Math.min(20, jsonData.length); i++) {
    const rowStr = JSON.stringify(jsonData[i]);
    if (rowStr.includes("Mã hàng") || rowStr.includes("Tên hàng")) {
      startRowIndex = i + 1; 
      break;
    }
  }
  
  for (let i = startRowIndex; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 3) continue;
    
    const tenHang = row[2] ? row[2].toString().trim() : "";
    if (!tenHang || tenHang === "" || tenHang === "Tên hàng") continue;

    const maHang = row[1] ? row[1].toString().trim() : ""; 
    if (!maHang || maHang === "" || maHang === "Mã hàng" || maHang.includes("CÔNG TY")) continue;

    dataMap[maHang] = {
      category: row[0] ? row[0].toString().trim() : "",    
      maHang: maHang,
      tenHang: tenHang,     
      nsx: row[3] ? row[3].toString().trim() : "",         
      dauKy_sl: parseFloat(row[4]) || 0,                   
      dauKy_tl: parseFloat(row[5]) || 0,                   
      nhap_sl: parseFloat(row[6]) || 0,                    
      nhap_tl: parseFloat(row[7]) || 0,                    
      xuat_sl: parseFloat(row[8]) || 0,                    
      xuat_tl: parseFloat(row[9]) || 0,                    
      cuoiKy_sl: parseFloat(row[10]) || 0,                 
      cuoiKy_tl: parseFloat(row[11]) || 0                  
    };
  }
  return dataMap;
}

// ----------------------------------------------------
// 2. XỬ LÝ ĐỌC FILE TUYẾN ĐƯỜNG
// ----------------------------------------------------
function parseRoutesToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
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
  
  const headers = jsonData[headerRowIdx] || [];
  const colIdx = {};
  
  const colKeywords = {
    phuongXa: ["phường/xã", "phương/xã", "phuong/xa", "phuong xa"],
    khoXuat: ["kho xuất", "khoxuat"],
    tuyenDuong: ["tuyến đường", "tuyếnđường", "tuyenduong"],
    maPhieu: ["mã phiếu", "mãphiếu", "maphieu"],
    doiTuong: ["đối tượng", "đốitượng", "doituong"],
    ngayDatHang: ["ngày đặt hàng", "ngaydathang"],
    ngayXuLy: ["ngày xử lý", "ngayxuly"],
    ngayDuyet: ["ngày duyệt", "ngayduyet"],
    ngayDuKien: ["ngày dự kiến", "ngaydukien"],
    duyet: ["duyệt", "duyet"],
    status: ["status", "trạng thái", "trangthai"],
    botTretKg: ["bột trét", "bottret"],
    sonTbvsKg: ["sơn/tbvs", "sontbvs", "sơn", "tbvs"],
    tTai: ["t.tải", "t tải", "ttai", "tổng tải"],
    thanhTien: ["thành tiền", "thanhtien"],
    batDauGiaoHang: ["bắt đầu giao hàng", "bắt đầugiaohàng", "batdau giao hang", "batdaugiaohang", "bắt đầu", "bắt đầu giao"],
    chuyen: ["chuyến", "chuyen"],
    ghiChu: ["ghi chú", "ghichu"],
    giaoNhan: ["giao nhận", "giaonhan"],
    htGiaoNhan: ["ht giao nhận", "htgiaonhan", "hình thức giao nhận"],
    ketThucGiaoHang: ["kết thúc giao hàng", "kết thúcgiaohàng", "ketthuc giaohang", "ketthucgiaohang", "kết thúc", "kết thúc giao"],
    kmBatDauGiaoHang: ["km bắt đầu giao hàng", "kmbatdaugiaohang"],
    kmDuKien: ["km dự kiến", "kmdukien"],
    kmKetThucGiaoHang: ["km kết thúc giao hàng", "kmketthucgiaohang"],
    ngayGiao: ["ngày giao", "ngaygiao"],
    ngayXuatKho: ["ngày xuất kho", "ngayxuatkho", "ngày xuất"],
    noiGiao: ["nơi giao", "noigiao"],
    phuongTien: ["phương tiện", "phuongtien"],
    pxk: ["pxk"],
    taiXe: ["tài xế", "taixe"],
    thanhPho: ["thành phố", "thanhpho"]
  };

  headers.forEach((cell, index) => {
    if (!cell) return;
    const cellTxt = cell.toString().replace(/[\r\n]+/g, ' ').toLowerCase().trim().replace(/\s+/g, ' ');
    
    for (const [key, keywords] of Object.entries(colKeywords)) {
      if (keywords.some(kw => cellTxt === kw || cellTxt.includes(kw))) {
        colIdx[key] = index;
      }
    }
  });

  let latIndexes = [];
  let longIndexes = [];
  headers.forEach((cell, index) => {
    if (!cell) return;
    const txt = cell.toString().toLowerCase().trim();
    if (txt.includes("lat") || txt === "vĩ độ") latIndexes.push(index);
    if (txt.includes("long") || txt === "kinh độ") longIndexes.push(index);
    if (txt.includes("sai lệch") || txt.includes("sailech") || txt.includes("km lệch")) colIdx["saiLechKm"] = index;
    if (txt.includes("theo dõi") || txt.includes("theodoi")) colIdx["theoDoi"] = index;
  });

  const lat1 = latIndexes[0], lon1 = longIndexes[0];
  const lat2 = latIndexes[1], lon2 = longIndexes[1];

  const getTxt = (row, key, defaultVal = "") => {
    const idx = colIdx[key];
    return (idx !== undefined && row[idx] !== undefined) ? row[idx].toString().trim() : defaultVal;
  };

  const getDateVal = (row, key) => {
    const idx = colIdx[key];
    if (idx === undefined || row[idx] === undefined) return "";
    return formatExcelDate(row[idx]);
  };

  const getNum = (row, key) => {
    const idx = colIdx[key];
    return (idx !== undefined && row[idx]) ? (parseFloat(row[idx]) || 0) : 0;
  };

  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 5) continue;

    const khoXuatVal = getTxt(row, "khoXuat");
    if (khoXuatVal !== "41" && khoXuatVal !== "61" && khoXuatVal !== "69") {
      continue; 
    }

    const maPhieu = getTxt(row, "maPhieu");
    if (!maPhieu || maPhieu === "" || maPhieu === "Mã Phiếu" || maPhieu.includes("CÔNG TY")) continue;

    let dinhVi = "";
    if (lat1 !== undefined && lon1 !== undefined && row[lat1] && row[lon1]) {
      dinhVi = `${row[lat1].toString().trim()},${row[lon1].toString().trim()}`;
    }

    let checkIn = "";
    if (lat2 !== undefined && lon2 !== undefined && row[lat2] && row[lon2]) {
      checkIn = `${row[lat2].toString().trim()},${row[lon2].toString().trim()}`;
    }

    const saiLechKm = getNum(row, "saiLechKm");
    let theoDoi = getTxt(row, "theoDoi");
    if (saiLechKm > 0.5) {
      theoDoi = "Cần kiểm tra";
    }

    let thang = "";
    const ngayXuatKhoTxt = getDateVal(row, "ngayXuatKho");
    if (ngayXuatKhoTxt && ngayXuatKhoTxt.includes("/")) {
      const parts = ngayXuatKhoTxt.split("/");
      if (parts[1]) {
        thang = `Tháng ${parseInt(parts[1])}`;
      }
    } else if (ngayXuatKhoTxt && ngayXuatKhoTxt.includes("-")) {
      const parts = ngayXuatKhoTxt.split("-");
      if (parts[1]) {
        thang = `Tháng ${parseInt(parts[1])}`;
      }
    }

    routeMap[maPhieu] = {
      phuongXa: getTxt(row, "phuongXa"),
      khoXuat: khoXuatVal, 
      tuyenDuong: getTxt(row, "tuyenDuong"),
      maPhieu: maPhieu,
      doiTuong: getTxt(row, "doiTuong"),
      duyet: getTxt(row, "duyet"),
      status: getTxt(row, "status"),
      botTretKg: getNum(row, "botTretKg"),
      sonTbvsKg: getNum(row, "sonTbvsKg"),
      tTai: getNum(row, "tTai"),
      thanhTien: getNum(row, "thanhTien"),
      dinhVi: dinhVi,
      checkIn: checkIn,
      saiLechKm: saiLechKm,
      theoDoi: theoDoi,
      chuyen: getTxt(row, "chuyen"),
      ghiChu: getTxt(row, "ghiChu"),
      giaoNhan: getTxt(row, "giaoNhan"),
      htGiaoNhan: getTxt(row, "htGiaoNhan"),
      kmBatDauGiaoHang: getNum(row, "kmBatDauGiaoHang"),
      kmDuKIen: getNum(row, "kmDuKien"), 
      kmKetThucGiaoHang: getNum(row, "kmKetThucGiaoHang"),
      noiGiao: getTxt(row, "noiGiao"),
      phuongTien: getTxt(row, "phuongTien"),
      pxk: getTxt(row, "pxk"),
      taiXe: getTxt(row, "taiXe"),
      thanhPho: getTxt(row, "thanhPho"),
      thoiGianLamViec: getTxt(row, "thoiGianLamViec"),
      thang: thang,
      // 🌟 ĐÃ ĐỒNG BỘ: Cho 2 cột này đi qua hàm getDateVal để tự chuyển đổi số Serial thành Ngày/Giờ chuẩn xác
      ngayDatHang: getDateVal(row, "ngayDatHang"),
      ngayXuLy: getDateVal(row, "ngayXuLy"),
      ngayDuyet: getDateVal(row, "ngayDuyet"),
      ngayDuKien: getDateVal(row, "ngayDuKien"),
      ngayGiao: getDateVal(row, "ngayGiao"),
      ngayxuatKho: ngayXuatKhoTxt,
      batDauGiaoHang: getDateVal(row, "batDauGiaoHang"),
      ketThucGiaoHang: getDateVal(row, "ketThucGiaoHang")
    };
  }
  return routeMap;
}

// ----------------------------------------------------
// 3. TIẾN TRÌNH ĐỒNG BỘ CHÍNH
// ----------------------------------------------------
async function mainSync() {
  const drive = getDriveClient();

  console.log('🚀 1. Bắt đầu tiến trình cập nhật Tồn Kho...');
  let finalInventoryData = {};
  let invSuccessCount = 0;

  for (const [khoName, rawInput] of Object.entries(INVENTORY_LINKS)) {
    try {
      const fileId = extractFileId(rawInput);
      const buffer = await downloadFileBuffer(drive, fileId);
      const dataObject = parseInventoryToMap(buffer, khoName);
      
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
    console.log(`🎉 HOÀN TẤT: Đã gộp và đẩy Tồn Kho lên Firestore (TONKHO/KHO) thành công!`);
  }

  console.log('\n--------------------------------------------------\n');

  console.log('🚀 2. Bắt đầu tiến trình cập nhật Tuyến Đường...');
  try {
    const routeFileId = extractFileId(ROUTE_FILE_LINK);
    console.log(`📦 Đang tải file Tuyến Đường từ Drive (ID: ${routeFileId})...`);
    
    const routeBuffer = await downloadFileBuffer(drive, routeFileId);
    const routeDataMap = parseRoutesToMap(routeBuffer);
    const totalRecords = Object.keys(routeDataMap).length;

    if (totalRecords > 0) {
      console.log(`📡 Đang đẩy dữ liệu tuần tự ${totalRecords} mã phiếu vào collection 'TUYENDUONG'...`);
      
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

      console.log(`🎉 HOÀN TẤT: Đã cập nhật thành công ${totalRecords} chứng từ lên Firestore!`);
    } else {
      console.log('⚠️ Không tìm thấy bản ghi hợp lệ nào thuộc các kho 41, 61, 69 trong file Tuyến đường.');
    }
  } catch (err) {
    console.error(`❌ Lỗi đồng bộ Tuyến Đường:`, err.message);
  }
}

mainSync().catch(err => {
  console.error('❌ Lỗi hệ thống nghiêm trọng:', err);
  process.exit(1);
});
