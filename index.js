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
const ID_YCGH = "152fW_bkRwUki4Gpz5qQ3_kaHruOnfbAb"; // THÊM TRA CỨU TRÉO YCGH

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

// HÀM ĐỌC FILE YCGH  // THÊM TRA CỨU TRÉO YCGH
function parseYcghToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const ycghMap = {};
  // Duyệt qua từng dòng dữ liệu để lấy thông tin (Chạy từ i = 1)
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i]; 
    if (!row || row.length === 0) continue;
    // Cột B (Index 1) là Mã Phiếu
    const maPhieu = row[1] ? row[1].toString().trim() : ""; 
    if (!maPhieu) continue; 
    // Lưu thông tin dạng Object
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

// 2. XỬ LÝ ĐỌC FILE TUYẾN ĐƯỜNG (TRA CỨU TRÉO YCGH)
function parseRoutesToMap(buffer, ycghMap = {}) {               // THÊM TRA CỨU TRÉO YCGH
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
    
    // 📅 XỬ LÝ TÍNH TOÁN THÁNG / NĂM TỪ NGÀY XUẤT KHO (DẠNG SỐ)
    let thang = "";
    let nam = "";
    const ngayXuatKhoTxt = getDateByIdx(row, 27);
    if (ngayXuatKhoTxt && ngayXuatKhoTxt.includes("/")) {
      const parts = ngayXuatKhoTxt.split("/");
      if (parts[1]) thang = parseInt(parts[1], 10); // Chuyển thành số (VD: 1, 2, 3...)
      if (parts[2]) nam = parseInt(parts[2].split(" ")[0], 10); // Chuyển thành số (VD: 2026)
    } else if (ngayXuatKhoTxt && ngayXuatKhoTxt.includes("-")) {
      const parts = ngayXuatKhoTxt.split("-");
      if (parts[1]) thang = parseInt(parts[1], 10); // Chuyển thành số
      if (parts[0] && parts[0].length === 4) nam = parseInt(parts[0], 10); // Chuyển thành số
    }

    // 🏭 XỬ LÝ PHÂN LOẠI NGÀNH HÀNG THEO KHO XUẤT
    let nganh = "";
    if (khoXuatVal === "41") {
      nganh = "Sơn";
    } else if (khoXuatVal === "61" || khoXuatVal === "69") {
      nganh = "TBVS";
    }
    // 🌟 VỊ TRÍ MỚI 1: DÒ VÙNG TIÊU THỤ TỪ FILE YCGH BẰNG MÃ PHIẾU   // THÊM TRA CỨU TRÉO YCGH
    const vungTieuThu = ycghMap[maPhieu]?.vungTieuThu || ""; // Nếu tìm thấy mã phiếu thì lấy vùng tiêu thụ, không có thì để trống ""

    routeMap[maPhieu] = {
      phuongXa:         getTxtByIdx(row, 0),   
      khoXuat:          khoXuatVal,            
      tuyenDuong:       getTxtByIdx(row, 2),   
      maPhieu:          maPhieu,               
      doiTuong:         getTxtByIdx(row, 4),   
      ngayDatHang:      getDateByIdx(row, 5),  
      ngayXuLy:         getDateByIdx(row, 6),  
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
      batDauGiaoHang:   getDateByIdx(row, 30), 
      ketThucGiaoHang:  getDateByIdx(row, 31), 
      kmBatDauGiaoHang: getNumByIdx(row, 32),  
      kmKetThucGiaoHang:getNumByIdx(row, 33),  
      checkIn:          checkIn,
      saiLechKm:        saiLechKm,
      theoDoi:          theoDoi,
      thang:            thang,
      nam:              nam,
      nganh:            nganh,
      vungTieuThu:      vungTieuThu     // THÊM TRA CỨU TRÉO YCGH
    }; 
  } 
  return routeMap; 
}

// 📊 HÀM VIẾT THÊM: GOM NHÓM DỮ LIỆU ĐỂ TẠO BẢNG KHACHHANGVUNG
function generateKhachHangVungReport(routeDataMap) {
  const groupMap = {};
  // Hàm phụ để khởi tạo và cộng dồn số liệu vào groupMap
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

  // Duyệt qua dữ liệu Tuyến Đường đã tra cứu chéo từ YCGH
  Object.values(routeDataMap).forEach(item => {
    // 🔍 1. BỘ LỌC CHỨNG TỪ: Chỉ lấy "Đã giao hàng" hoặc "Đã xuất kho"
    const trangThaiDuyet = item.duyet ? item.duyet.toString().trim() : "";
    if (trangThaiDuyet !== "Đã giao hàng" && trangThaiDuyet !== "Đã xuất kho") {return; }
    const doiTuong = item.doiTuong;
    const vung = item.vungTieuThu || "Chưa xác định";
    const thang = item.thang;
    const nam = item.nam || "Chưa xác định";
    if (!doiTuong || !thang || thang < 1 || thang > 12) return;
    // ⚡ XỬ LÝ ĐỌC HÌNH THỨC GỐC TỪ FILE EXCEL
    const htGoc = item.htGiaoNhan ? item.htGiaoNhan.toString().trim() : "";
    const isGuiChanh = htGoc.includes("Gửi chành");
    // ⚡ XỬ LÝ PHÂN LOẠI NGÀNH HÀNG CỤ THỂ
    const nganhCuThe = item.nganh || "Khác";
    const tl = item.tTai || 0;
    const dt = item.thanhTien || 0;
    // ➡️ TIẾN TRÌNH GOM NHÓM DỮ LIỆU ĐA CHIỀU:
    // --- TRƯỜNG HỢP A: Nếu là Gửi chành -> Gom vào nhóm "Gửi chành" ---
    if (isGuiChanh) {
      // 1. Gửi chành + Ngành cụ thể (Sơn/TBVS)
      addToGroup(doiTuong, vung, "Gửi chành", nganhCuThe, nam, thang, tl, dt);
      // 2. Gửi chành + Ngành tổng gộp "All"
      addToGroup(doiTuong, vung, "Gửi chành", "All", nam, thang, tl, dt);}
    // --- TRƯỜNG HỢP B: BẤT KỂ LÀ GÌ (Giao hàng hay Gửi chành) -> Đều đổ vào "Tổng giao" ---
    // 3. Tổng giao + Ngành cụ thể (Sơn/TBVS)
    addToGroup(doiTuong, vung, "Tổng giao", nganhCuThe, nam, thang, tl, dt);
    // 4. Tổng giao + Ngành tổng gộp "All"
    addToGroup(doiTuong, vung, "Tổng giao", "All", nam, thang, tl, dt);
  });
  // Chuyển đổi thành mảng chứa các bản ghi phẳng rộng để chuẩn bị đẩy lên Firestore
  const finalRecords = [];
  Object.values(groupMap).forEach(group => {
    const record = {
      doiTuong: group.doiTuong,
      vungTieuThu: group.vungTieuThu,
      htGiaoNhan: group.htGiaoNhan,
      nganh: group.nganh,
      nam: group.nam
    };
    // Đổ dữ liệu vòng lặp tạo ra các cột số từ TL1 -> TL12 và DT1 -> DT12
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
        console.log(`🔍 [Kho ${khoName}] Phát hiện yêu cầu dò tìm danh mục mở rộng. Đang tải file đối chiếu...`);
        try {
          const catalogBuffer = await downloadFileBuffer(drive, ID_SANPHAM[khoName]);
          catalogMap = parseCatalogToMap(catalogBuffer);
          console.log(`   -> Cấu trúc Map danh mục cho Kho ${khoName} đã sẵn sàng.`); 
        } catch (catErr) {
          console.error(`   ⚠️ Cảnh báo: Không thể nạp file danh mục cho Kho ${khoName} (${catErr.message}). Chạy chế độ không gộp dữ liệu.`);
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
    console.log(`🎉 HOÀN TẤT: Đã gộp và đẩy Tồn Kho kèm dữ liệu mở rộng lên Firestore thành công!`);
  }

  console.log('\n--------------------------------------------------\n');
  console.log('🚀 2. Bắt đầu tiến trình cập nhật Tuyến Đường...');
  
  try {
    // 🌟 VỊ TRÍ 1: TẢI VÀ XỬ LÝ FILE YCGH TRƯỚC ĐỂ LÀM BẢN ĐỒ TRA CỨU        // THÊM TRA CỨU TRÉO YCGH
    console.log(`📦 Đang tải file YCGH từ Drive (ID: ${ID_YCGH})...`);
    const ycghBuffer = await downloadFileBuffer(drive, ID_YCGH);
    const ycghMapData = parseYcghToMap(ycghBuffer);
    console.log(`   -> Cấu trúc dữ liệu tra cứu YCGH đã sẵn sàng.`);

    console.log(`📦 Đang tải file Tuyến Đường từ Drive (ID: ${ID_TUYENDUONG})...`);
    const routeBuffer = await downloadFileBuffer(drive, ID_TUYENDUONG);
    const routeDataMap = parseRoutesToMap(routeBuffer, ycghMapData);          // THÊM TRA CỨU TRÉO YCGH
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
      console.log(`🎉 HOÀN TẤT: Đã cập nhật thành công TUYENDUONG ${totalRecords} chứng từ lên Firestore!`); 
      
      // --- PHẦN B: XỬ LÝ VÀ ĐẨY DỮ LIỆU LÊN KHACHHANGVUNG (VIẾT THÊM) ---
      console.log(`📊 Đang khởi tạo bảng tổng hợp KHACHHANGVUNG...`);
      const reportRows = generateKhachHangVungReport(routeDataMap);
      
      let reportBatch = db.batch();
      let reportCount = 0;

      for (const record of reportRows) {
        // Tạo ID duy nhất cho mỗi dòng dữ liệu trên Fire để tránh bị ghi đè trùng lặp
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
