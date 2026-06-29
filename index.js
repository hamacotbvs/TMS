const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// 🔗 ĐƯỜNG LINK CÁC FILE EXCEL CỦA BẠN
const INVENTORY_LINKS = {
  "41": "https://docs.google.com/spreadsheets/d/1ZS9K4lSPHMzBR4ifgSpiGx_RbYbDJ8tb/edit",
  "61": "https://docs.google.com/spreadsheets/d/1ONnLc9N7lxZOVbs4udNjEh_JZxYOATLB/edit",
  "69": "https://docs.google.com/spreadsheets/d/1lvbNAVxQ-jXMEIwZ-w3GOsbcd5-TClf/edit"
};

const ROUTE_FILE_LINK = "https://docs.google.com/spreadsheets/d/1JegCpZzUSDj5MmLqifbOD6cbHj7ggsHR/edit"; 

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
    const maHang = row[1] ? row[1].toString().trim() : ""; 
    if (!maHang || maHang === "" || maHang === "Mã hàng" || maHang.includes("CÔNG TY")) continue;

    dataMap[maHang] = {
      category: row[0] ? row[0].toString().trim() : "",    
      maHang: maHang,
      tenHang: row[2] ? row[2].toString().trim() : "",     
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
// 2. XỬ LÝ ĐỌC FILE TUYẾN ĐƯỜNG FULL CỘT
// ----------------------------------------------------
function parseRoutesToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const routeMap = {};
  
  console.log(`📊 [Tuyến Đường] Tổng số dòng đọc được trong file: ${jsonData.length}`);
  
  // Dò tìm dòng chứa thanh tiêu đề
  let headerRowIdx = 7; 
  for (let i = 0; i < Math.min(25, jsonData.length); i++) {
    const rowStr = JSON.stringify(jsonData[i]);
    if (rowStr.includes("Mã Phiếu") || rowStr.includes("Đối tượng") || rowStr.includes("Kho xuất")) {
      headerRowIdx = i; 
      break;
    }
  }
  
  const headers = jsonData[headerRowIdx] || [];
  
  // Tạo một đối tượng lưu vị trí index tự động của tất cả các cột bằng cách dò theo tên
  const colIdx = {};
  
  // Định nghĩa danh sách tên cột cần tìm (viết thường để so sánh không phân biệt hoa thường)
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
    // Các cột mới bổ sung:
    batDauGiaoHang: ["bắt đầu giao hàng", "batdau giaohang", "batdaugiaohang"],
    chuyen: ["chuyến", "chuyen"],
    ghiChu: ["ghi chú", "ghichu"],
    giaoNhan: ["giao nhận", "giaonhan"],
    htGiaoNhan: ["ht giao nhận", "htgiaonhan", "hình thức giao nhận"],
    ketThucGiaoHang: ["kết thúc giao hàng", "ketthuc giaohang", "ketthucgiaohang"],
    kho: ["kho"],
    kmBatDauGiaoHang: ["km bắt đầu giao hàng", "kmbatdaugiaohang"],
    kmDuKien: ["km dự kiến", "kmdukien"],
    kmKetThucGiaoHang: ["km kết thúc giao hàng", "kmketthucgiaohang"],
    ngayGiao: ["ngày giao", "ngaygiao"],
    ngayXuatKho: ["ngày xuất kho", "ngayxuatkho"],
    noiGiao: ["nơi giao", "noigiao"],
    phuongTien: ["phương tiện", "phuongtien"],
    pxk: ["pxk"],
    taiXe: ["tài xế", "taixe"],
    thanhPho: ["thành phố", "thanhpho"]
  };

  // Tiến hành dò tìm index tự động cho từng cột keyword
  headers.forEach((cell, index) => {
    if (!cell) return;
    const cellTxt = cell.toString().toLowerCase().trim();
    
    for (const [key, keywords] of Object.entries(colKeywords)) {
      if (keywords.some(kw => cellTxt === kw || cellTxt.includes(kw))) {
        // Riêng với cột kho, tránh nhận nhầm cột "kho xuất"
        if (key === "kho" && cellTxt.includes("xuất")) continue;
        colIdx[key] = index;
      }
    }
  });

  // Mảng lưu vị trí Lat Long (vì file có nhiều cột Lat Long)
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

  // Gán vị trí Lat Long mặc định hoặc theo tìm kiếm
  const lat1 = latIndexes[0], lon1 = longIndexes[0];
  const lat2 = latIndexes[1], lon2 = longIndexes[1];

  // Hàm đọc text an toàn từ ô Excel
  const getTxt = (row, key, defaultVal = "") => {
    const idx = colIdx[key];
    return (idx !== undefined && row[idx]) ? row[idx].toString().trim() : defaultVal;
  };

  // Hàm đọc số an toàn từ ô Excel
  const getNum = (row, key) => {
    const idx = colIdx[key];
    return (idx !== undefined && row[idx]) ? (parseFloat(row[idx]) || 0) : 0;
  };

  // Quét dữ liệu từ sau dòng tiêu đề
  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 5) continue;

    const maPhieu = getTxt(row, "maPhieu");
    if (!maPhieu || maPhieu === "" || maPhieu === "Mã Phiếu" || maPhieu.includes("CÔNG TY")) continue;

    // 1. Gộp cặp Lat Long đầu tiên thành định vị
    let dinhVi = "";
    if (lat1 !== undefined && lon1 !== undefined && row[lat1] && row[lon1]) {
      dinhVi = `${row[lat1].toString().trim()},${row[lon1].toString().trim()}`;
    }

    // 2. Gộp cặp Lat Long sau thành checkin
    let checkIn = "";
    if (lat2 !== undefined && lon2 !== undefined && row[lat2] && row[lon2]) {
      checkIn = `${row[lat2].toString().trim()},${row[lon2].toString().trim()}`;
    }

    // 3. Đọc sai lệch Km và xử lý cột Theo dõi (>0.5km thì ghi Cần kiểm tra)
    const saiLechKm = getNum(row, "saiLechKm");
    let theoDoi = getTxt(row, "theoDoi");
    if (saiLechKm > 0.5) {
      theoDoi = "Cần kiểm tra";
    }

    // 4. Tính toán Tự động Cột Tháng từ Ngày Xuất Kho
    let thang = "";
    const ngayXuatKhoTxt = getTxt(row, "ngayXuatKho");
    if (ngayXuatKhoTxt) {
      // Tìm các ký tự số đứng sau dấu gạch chéo hoặc dấu gạch ngang đầu tiên (ví dụ: 25/06/2026 hoặc 2026-06-25)
      const match = ngayXuatKhoTxt.match(/[\/\-](\d{2})[\/\-]/) || ngayXuatKhoTxt.match(/-(\d{2})-/);
      if (match && match[1]) {
        thang = `Tháng ${parseInt(match[1])}`;
      } else {
        // Fallback thủ công nếu chuỗi không khớp regex chuẩn
        const parts = ngayXuatKhoTxt.split(/[\/\-\s]/);
        if (parts.length > 1 && !isNaN(parts[1])) {
          thang = `Tháng ${parseInt(parts[1])}`;
        }
      }
    }

    // Đóng gói mảng JSON đầy đủ mọi thuộc tính lên Firestore
    routeMap[maPhieu] = {
      phuongXa: getTxt(row, "phuongXa"),
      khoXuat: getTxt(row, "khoXuat"),
      tuyenDuong: getTxt(row, "tuyenDuong"),
      maPhieu: maPhieu,
      doiTuong: getTxt(row, "doiTuong"),
      ngayDatHang: getTxt(row, "ngayDatHang"),
      ngayXuLy: getTxt(row, "ngayXuLy"),
      ngayDuyet: getTxt(row, "ngayDuyet"),
      ngayDuKien: getTxt(row, "ngayDuKien"),
      duyet: getTxt(row, "duyet"),
      status: getTxt(row, "status"),
      botTretKg: getNum(row, "botTretKg"),
      sonTbvsKg: getNum(row, "sonTbvsKg"),
      tTai: getNum(row, "tTai"),
      thanhTien: getNum(row, "thanhTien"),
      
      // Các trường nâng cao xử lý tọa độ và cảnh báo km lệch:
      dinhVi: dinhVi,
      checkIn: checkIn,
      saiLechKm: saiLechKm,
      theoDoi: theoDoi,

      // Danh sách các cột mới bổ sung theo yêu cầu:
      batDauGiaoHang: getTxt(row, "batDauGiaoHang"),
      chuyen: getTxt(row, "chuyen"),
      ghiChu: getTxt(row, "ghiChu"),
      giaoNhan: getTxt(row, "giaoNhan"),
      htGiaoNhan: getTxt(row, "htGiaoNhan"),
      ketThucGiaoHang: getTxt(row, "ketThucGiaoHang"),
      kho: getTxt(row, "kho"),
      kmBatDauGiaoHang: getNum(row, "kmBatDauGiaoHang"),
      kmDuKIen: getNum(row, "kmDuKien"), 
      kmKetThucGiaoHang: getNum(row, "kmKetThucGiaoHang"),
      ngayGiao: getTxt(row, "ngayGiao"),
      ngayxuatKho: ngayXuatKhoTxt,
      noiGiao: getTxt(row, "noiGiao"),
      phuongTien: getTxt(row, "phuongTien"),
      pxk: getTxt(row, "pxk"),
      taiXe: getTxt(row, "taiXe"),
      thanhPho: getTxt(row, "thanhPho"),
      thoiGianLamViec: getTxt(row, "thoiGianLamViec"),
      thang: thang // Tự động bốc ra từ ngày xuất kho
    };
  }
  return routeMap;
}

// ----------------------------------------------------
// 3. TIẾN TRÌNH ĐỒNG BỘ CHÍNH
// ----------------------------------------------------
async function mainSync() {
  const drive = getDriveClient();

  // === PHẦN 1: ĐỒNG BỘ TỒN KHO ===
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
    await db.collection('BÁO_CÁO').doc('TONKHO').set(finalInventoryData, { merge: true });
    console.log(`🎉 HOÀN TẤT: Đã gộp và đẩy Tồn Kho lên Firestore thành công!`);
  }

  console.log('\n--------------------------------------------------\n');

  // === PHẦN 2: ĐỒNG BỘ TUYẾN ĐƯỜNG ===
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

      console.log(`🎉 HOÀN TẤT: Đã cập nhật thành công ${totalRecords} chứng từ với đầy đủ các cột thuộc tính vào collection 'TUYENDUONG' trên Firestore!`);
    } else {
      console.log('⚠️ Không tìm thấy bản ghi hợp lệ nào trong file Tuyến đường.');
    }
  } catch (err) {
    console.error(`❌ Lỗi đồng bộ Tuyến Đường:`, err.message);
  }
}

mainSync().catch(err => {
  console.error('❌ Lỗi hệ thống nghiêm trọng:', err);
  process.exit(1);
});
