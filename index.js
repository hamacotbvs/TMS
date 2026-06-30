const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// 🔗 ĐÃ SỬA: Điền trực tiếp ID file mã hóa của Google Sheets (Không dùng link URL nữa)
const INVENTORY_LINKS = {
  "41": "1ZS9K4lSPHMzBR4ifgSpiGx_RbYbDJ8tb",
  "61": "1ONnLc9N7IxZOvbs4udNjEH_JZxYOATLB",
  "69": "1lvbNAvxQ-jXMEIwZ-w3GOdsbcd5-TCIf"
};
const ROUTE_FILE_LINK = "1JEgcPzZUSDj5MmLqifbOD6cBhJ7ggsHR"; 

if (!admin.apps.length) {admin.initializeApp({credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id});}
const db = admin.firestore();
function getDriveClient() {const auth = new google.auth.JWT(serviceAccount.client_email, null, serviceAccount.private_key, ['https://www.googleapis.com/auth/drive.readonly']); return google.drive({ version: 'v3', auth }); }

async function downloadFileBuffer(drive, fileId) {return await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data));}
// 📡 HÀM ĐỊNH DẠNG NGÀY GIỜ CHUẨN ĐẸP (DD/MM/YYYY HH:mm:ss)
function formatExcelDate(cellValue) {
  if (cellValue === undefined || cellValue === null || cellValue === "") return "";

  const pad = (n) => String(n).padStart(2, '0');

  // Khi cellDates: true, logic này sẽ xử lý chính xác 100% dữ liệu ngày giờ từ Excel
  if (cellValue instanceof Date) {
    const d = cellValue;
    
    // Nếu ngày bị lệch múi giờ khi đọc (đôi khi thư viện đọc dạng UTC), 
    // bạn có thể dùng các hàm Get chuẩn của JS:
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
        if (dateObj.H === 0 && dateObj.M === 0 && dateObj.S === 0) {
          return dateStr;
        }
        return `${dateStr} ${hh}:${mm}:${ss}`;
      } catch (e) {
        return strVal;
      }
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
    if (rowStr.includes("Mã hàng") || rowStr.includes("Tên hàng")) {startRowIndex = i + 1; break;} }
  
  for (let i = startRowIndex; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 3) continue;
    const tenHang = row[2] ? row[2].toString().trim() : "";
    if (!tenHang || tenHang === "" || tenHang === "Tên hàng") continue
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
      cuoiKy_tl: parseFloat(row[11]) || 0                  
    };
  }return dataMap;
}

// ----------------------------------------------------
// 2. XỬ LÝ ĐỌC FILE TUYẾN ĐƯỜNG
// ----------------------------------------------------
function parseRoutesToMap(buffer) {
  // GIỮ NGUYÊN cellDates: true để thư viện tự chuyển đổi ô ngày giờ sang Object Date của JS
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const routeMap = {};
  
  console.log(`📊 [Tuyến Đường] Tổng số dòng đọc được trong file: ${jsonData.length}`);
  
  // Xác định dòng tiêu đề để bắt đầu lấy dữ liệu từ dòng kế tiếp
  let headerRowIdx = 7; 
  for (let i = 0; i < Math.min(25, jsonData.length); i++) {
    const rowStr = JSON.stringify(jsonData[i]);
    if (rowStr.includes("Mã Phiếu") || rowStr.includes("Đối tượng") || rowStr.includes("Kho xuất")) {
      headerRowIdx = i; 
      break;
    }
  }

  // Hàm phụ trợ bốc dữ liệu theo số cột cố định (Index) chống crash lỗi undefined
  const getTxtByIdx = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? row[idx].toString().trim() : "";
  const getDateByIdx = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? formatExcelDate(row[idx]) : "";
  const getNumByIdx = (row, idx) => (row[idx] !== undefined && row[idx] !== null) ? (parseFloat(row[idx]) || 0) : 0;

  // Duyệt từ dòng sau tiêu đề đến hết file
  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 5) continue;

    // Cột B (Kho xuất) - Index 1
    const khoXuatVal = getTxtByIdx(row, 1);
    if (khoXuatVal !== "41" && khoXuatVal !== "61" && khoXuatVal !== "69") continue; 

    // Cột D (Mã Phiếu) - Index 3
    const maPhieu = getTxtByIdx(row, 3);
    if (!maPhieu || maPhieu === "" || maPhieu === "Mã Phiếu" || maPhieu.includes("CÔNG TY")) continue;

    // Lấy tọa độ Định vị (Cột AJ, AK cũ hoặc dựa theo bộ cột Lat/Long 1)
    let dinhVi = "";
    if (row[25] && row[26]) dinhVi = `${row[25].toString().trim()},${row[26].toString().trim()}`; // Cột Z, AA

    // Lấy tọa độ CheckIn (Bộ Lat/Long số 2)
    let checkIn = "";
    if (row[35] && row[36]) checkIn = `${row[35].toString().trim()},${row[36].toString().trim()}`; // Cột AJ, AK

    const saiLechKm = getNumByIdx(row, 37); // Giả định cột sai lệch nằm sau
    let theoDoi = "";
    if (saiLechKm > 0.5) theoDoi = "Cần kiểm tra";

    // Xử lý tách Tháng/Năm dựa trên cột Ngày xuất kho (Index 27 - Cột AB)
    let thang = "";
    const ngayXuatKhoTxt = getDateByIdx(row, 27);
    if (ngayXuatKhoTxt && ngayXuatKhoTxt.includes("/")) {
      const parts = ngayXuatKhoTxt.split("/");
      if (parts[1]) thang = `Tháng ${parseInt(parts[1])}`;
    } else if (ngayXuatKhoTxt && ngayXuatKhoTxt.includes("-")) {
      const parts = ngayXuatKhoTxt.split("-");
      if (parts[1]) thang = `Tháng ${parseInt(parts[1])}`;
    }

    // Đổ dữ liệu chuẩn xác tuyệt đối vào Map dựa trên số cột cố định
    routeMap[maPhieu] = {
      phuongXa:         getTxtByIdx(row, 0),   // Cột A
      khoXuat:          khoXuatVal,            // Cột B
      tuyenDuong:       getTxtByIdx(row, 2),   // Cột C
      maPhieu:          maPhieu,               // Cột D
      doiTuong:         getTxtByIdx(row, 4),   // Cột E
      ngayDatHang:      getDateByIdx(row, 5),  // Cột F
      ngayXuLy:         getDateByIdx(row, 6),  // Cột G
      ngayDuyet:        getDateByIdx(row, 7),  // Cột H
      ngayDuKien:       getDateByIdx(row, 8),  // Cột I
      duyet:            getTxtByIdx(row, 9),   // Cột J
      status:           getTxtByIdx(row, 10),  // Cột K
      botTretKg:        getNumByIdx(row, 11),  // Cột L
      sonTbvsKg:        getNumByIdx(row, 12),  // Cột M
      tTai:             getNumByIdx(row, 13),  // Cột N
      thanhTien:        getNumByIdx(row, 14),  // Cột O
      noiGiao:          getTxtByIdx(row, 15),  // Cột P
      ghiChu:           getTxtByIdx(row, 16),  // Cột Q
      kmDuKIen:         getNumByIdx(row, 17),  // Cột R
      htGiaoNhan:       getTxtByIdx(row, 18),  // Cột S
      ngayGiao:         getDateByIdx(row, 19), // Cột T
      phuongTien:       getTxtByIdx(row, 20),  // Cột U
      taiXe:            getTxtByIdx(row, 21),  // Cột V
      chuyen:           getTxtByIdx(row, 22),  // Cột W
      giaoNhan:         getTxtByIdx(row, 23),  // Cột X
      pxk:              getTxtByIdx(row, 24),  // Cột Y
      dinhVi:           dinhVi,
      ngayxuatKho:      ngayXuatKhoTxt,        // Cột AB (Index 27)
      thoiGianLamViec:  getTxtByIdx(row, 28),  // Cột AC
      thanhPho:         getTxtByIdx(row, 29),  // Cột AD
      batDauGiaoHang:   getDateByIdx(row, 30), // Cột AE (Index 30)
      ketThucGiaoHang:  getDateByIdx(row, 31), // Cột AF (Index 31)
      kmBatDauGiaoHang: getNumByIdx(row, 32),  // Cột AG
      kmKetThucGiaoHang:getNumByIdx(row, 34),  // Cột AI
      checkIn:          checkIn,
      saiLechKm:        saiLechKm,
      theoDoi:          theoDoi,
      thang:            thang
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

  for (const [khoName, fileId] of Object.entries(INVENTORY_LINKS)) {
    try {
      // Gọi trực tiếp fileId từ cấu hình sạch ở trên
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
    console.log(`📦 Đang tải file Tuyến Đường từ Drive (ID: ${ROUTE_FILE_LINK})...`);
    
    const routeBuffer = await downloadFileBuffer(drive, ROUTE_FILE_LINK);
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
