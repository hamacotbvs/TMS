const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const FILE_IDS = {
  "41": "1ZS9K4lSPHMzBR4ifgSpiGx_RbYbDJ8tb",
  "61": "1ONnLc9N7lxZOVbs4udNjEh_JZxYOATLB",
  "69": "1lvbNAVxQ-jXMEIwZ-w3GOsbcd5-TClf"
};

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

function parseExcelToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Đọc toàn bộ file thành mảng thô
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const dataMap = {};
  
  // Quét từ dòng index 9 (tức dòng số 10 trong Excel trở đi)
  for (let i = 9; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 3) continue;

    const maHang = row[1] ? row[1].toString().trim() : ""; // Cột B
    // Loại bỏ các dòng tiêu đề phụ lặp lại nếu có
    if (!maHang || maHang === "" || maHang === "Mã hàng" || maHang.includes("CÔNG TY")) continue;

    dataMap[maHang] = {
      category: row[0] ? row[0].toString().trim() : "",    // Cột A
      maHang: maHang,
      tenHang: row[2] ? row[2].toString().trim() : "",     // Cột C
      nsx: row[3] ? row[3].toString().trim() : "",         // Cột D
      dauKy_sl: parseFloat(row[4]) || 0,                   // Cột E
      dauKy_tl: parseFloat(row[5]) || 0,                   // Cột F
      nhap_sl: parseFloat(row[6]) || 0,                    // Cột G
      nhap_tl: parseFloat(row[7]) || 0,                    // Cột H
      xuat_sl: parseFloat(row[8]) || 0,                    // Cột I
      xuat_tl: parseFloat(row[9]) || 0,                    // Cột J
      cuoiKy_sl: parseFloat(row[10]) || 0,                 // Cột K
      cuoiKy_tl: parseFloat(row[11]) || 0                  // Cột L
    };
  }
  return dataMap;
}

async function syncInventory() {
  console.log('🚀 Bắt đầu tiến trình tự động đồng bộ gộp Tồn Kho...');
  const drive = getDriveClient();
  const tonKhoDocRef = db.collection('BÁO_CÁO').doc('TONKHO');
  let finalUpdateData = {};
  let successCount = 0;

  for (const [khoName, fileId] of Object.entries(FILE_IDS)) {
    try {
      console.log(`📦 Đang bốc dữ liệu từ Drive cho Kho: ${khoName}...`);
      const buffer = await downloadFileBuffer(drive, fileId);
      const dataObject = parseExcelToMap(buffer);
      
      if (Object.keys(dataObject).length > 0) {
        finalUpdateData[`Kho_${khoName}`] = dataObject;
        successCount++;
        console.log(`✅ Thành công Kho ${khoName}: Tìm thấy ${Object.keys(dataObject).length} mặt hàng.`);
      } else {
        console.log(`⚠️ Kho ${khoName} không quét được hàng nào. Kiểm tra lại dữ liệu hàng 10 trở đi.`);
      }
    } catch (err) {
      console.error(`❌ Lỗi kết nối Kho ${khoName}:`, err.message);
    }
  }

  if (successCount > 0) {
    finalUpdateData["last_updated"] = admin.firestore.FieldValue.serverTimestamp();
    console.log('\n📡 Đang đẩy toàn bộ mảng dữ liệu gộp lên Firestore...');
    await tonKhoDocRef.set(finalUpdateData, { merge: true });
    console.log(`\n🎉 HOÀN TẤT: Bảng 'TONKHO' đã được tạo trên Firestore!`);
  } else {
    console.log('\n❌ Thất bại hoàn toàn: Không có dữ liệu kho nào được ghi nhận.');
  }
}

syncInventory().catch(err => {
  console.error('❌ Lỗi hệ thống:', err);
  process.exit(1);
});
