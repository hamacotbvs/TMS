const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

// 1. Cấu hình biến môi trường bảo mật từ GitHub Secrets
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Khai báo ID của 3 file Excel .xlsx trên Google Drive của bạn
const FILE_IDS = {
  "41": "1ZS9K4lSPHMzBR4ifgSpiGx_RbYbDJ8tb", // Đã điền chuẩn ID Kho 41 dựa trên hình ảnh của bạn
  "61": "1ONnLc9N7lxZOVbs4udNjEh_JZxYOATLB", // Đã điền chuẩn ID Kho 61 dựa trên hình ảnh của bạn
  "69": "1lvbNAVxQ-jXMEIwZ-w3GOsbcd5-TClf"   // Đã điền chuẩn ID Kho 69 dựa trên hình ảnh của bạn
};

// Khởi tạo Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}
const db = admin.firestore();

// Hàm thiết lập xác thực quyền đọc Google Drive API
function getDriveClient() {
  const auth = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/drive.readonly']
  );
  return google.drive({ version: 'v3', auth });
}

// Hàm tải tệp Excel từ Drive về bộ nhớ dưới dạng Buffer RAM
async function downloadFileBuffer(drive, fileId) {
  return await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  ).then(res => Buffer.from(res.data));
}

// Hàm chuyển đổi dữ liệu Buffer Excel thành Cấu trúc Object trực quan trên RAM
function parseExcelToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0]; // Đọc sheet đầu tiên
  const sheet = workbook.Sheets[sheetName];
  
  // Đọc bắt đầu dữ liệu từ hàng số 9 (Dòng chứa InventoryCategoryName, Mã Hàng...)
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const dataMap = {};
  
  // Quét từ dòng thứ 10 trở đi (Index hệ mảng 9)
  for (let i = 9; i < jsonData.length; i++) {
    const row = jsonData[i];
    const maHang = row[1] ? row[1].toString().trim() : ""; // Cột B: Mã hàng
    if (!maHang || maHang === "Mã hàng" || maHang.includes("CÔNG TY")) continue;

    dataMap[maHang] = {
      category: row[0] ? row[0].toString().trim() : "",    // Cột A: InventoryCategoryName
      maHang: maHang,
      tenHang: row[2] ? row[2].toString().trim() : "",     // Cột C: Tên hàng
      nsx: row[3] ? row[3].toString().trim() : "",         // Cột D: NSX
      dauKy_sl: parseFloat(row[4]) || 0,                   // Cột E: Đầu kỳ - Số lượng
      dauKy_tl: parseFloat(row[5]) || 0,                   // Cột F: Đầu kỳ - Trọng lượng
      nhap_sl: parseFloat(row[6]) || 0,                    // Cột G: Nhập - Số lượng
      nhap_tl: parseFloat(row[7]) || 0,                    // Cột H: Nhập - Trọng lượng
      xuat_sl: parseFloat(row[8]) || 0,                    // Cột I: Xuất - Số lượng
      xuat_tl: parseFloat(row[9]) || 0,                    // Cột J: Xuất - Trọng lượng
      cuoiKy_sl: parseFloat(row[10]) || 0,                 // Cột K: Cuối kỳ - Số lượng
      cuoiKy_tl: parseFloat(row[11]) || 0                  // Cột L: Cuối kỳ - Trọng lượng
    };
  }
  return dataMap;
}

async function syncInventory() {
  console.log('🚀 Bắt đầu tiến trình tự động đồng bộ gộp Tồn Kho...');
  const drive = getDriveClient();
  
  // Tham chiếu trực tiếp đến tài liệu duy nhất 'TONKHO' nằm trong bộ sưu tập 'BÁO_CÁO'
  const tonKhoDocRef = db.collection('BÁO_CÁO').doc('TONKHO');
  let finalUpdateData = {};
  let successCount = 0;

  for (const [khoName, fileId] of Object.entries(FILE_IDS)) {
    try {
      console.log(`📦 Đang đọc dữ liệu thời gian thực từ Google Drive cho Kho: ${khoName}...`);
      
      const buffer = await downloadFileBuffer(drive, fileId);
      const dataObject = parseExcelToMap(buffer);
      
      if (Object.keys(dataObject).length > 0) {
        // Gắn cấu trúc dữ liệu mảng đối tượng vào key tương ứng (Kho_41, Kho_61, Kho_69)
        finalUpdateData[`Kho_${khoName}`] = dataObject;
        successCount++;
        console.log(`✅ Xử lý RAM thành công Kho ${khoName}. Tìm thấy ${Object.keys(dataObject).length} mặt hàng.`);
      } else {
        console.log(`⚠️ Kho ${khoName} trống hoặc sai định dạng tiêu đề.`);
      }
    } catch (err) {
      console.error(`❌ Không thể bốc dữ liệu từ Kho ${khoName}:`, err.message);
    }
  }

  if (successCount > 0) {
    // Thêm mốc thời gian cập nhật hệ thống tự động
    finalUpdateData["last_updated"] = admin.firestore.FieldValue.serverTimestamp();
    
    console.log('\n📡 Đang đẩy toàn bộ mảng dữ liệu gộp lên Firestore...');
    await tonKhoDocRef.set(finalUpdateData, { merge: true });
    console.log(`\n🎉 HOÀN TẤT: Bảng 'TONKHO' đã được tạo/cập nhật thành công trên Firestore!`);
  } else {
    console.log('\n❌ Thất bại: Không lấy được dữ liệu của bất kỳ kho nào. Vui lòng kiểm tra quyền chia sẻ file.');
  }
}

// Kích hoạt tiến trình
syncInventory().catch(err => {
  console.error('❌ Lỗi hệ thống:', err);
  process.exit(1);
});
