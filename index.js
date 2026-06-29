const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const FILE_IDS = {
  "41": "1ZS9K4lSPHMzBR4ifgSpiGx_RbYbDJ8tb",
  "61": "1ONnLc9N7IxZOvbs4udNjEH_JZxYOATLB",
  "69": "1lvbNAvxQ-jXMEIwZ-w3GOdsbcd5-TCIf"
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

function parseExcelToMap(buffer, khoName) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const dataMap = {};
  
  console.log(`📊 [Kho ${khoName}] Tổng số dòng đọc được trong file: ${jsonData.length}`);
  if (jsonData.length > 0) {
    console.log(`👀 [Kho ${khoName}] Xem trước 12 dòng đầu tiên để check vị trí:`);
    for (let i = 0; i < Math.min(12, jsonData.length); i++) {
      console.log(`   Dòng ${i + 1}:`, JSON.stringify(jsonData[i]));
    }
  }

  // Tự động tìm dòng tiêu đề chứa dữ liệu chính
  let startRowIndex = 9; // Mặc định dòng 10
  for (let i = 0; i < Math.min(20, jsonData.length); i++) {
    const rowStr = JSON.stringify(jsonData[i]);
    if (rowStr.includes("Mã hàng") || rowStr.includes("Tên hàng")) {
      startRowIndex = i + 1; // Bắt đầu quét từ dòng ngay sau dòng tiêu đề
      console.log(`🎯 [Kho ${khoName}] Đã tìm thấy dòng tiêu đề chuẩn tại hàng số: ${i + 1}. Bắt đầu quét hàng hóa từ hàng: ${startRowIndex + 1}`);
      break;
    }
  }
  
  for (let i = startRowIndex; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 3) continue;

    const maHang = row[1] ? row[1].toString().trim() : ""; // Cột B
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
      const dataObject = parseExcelToMap(buffer, khoName);
      
      if (Object.keys(dataObject).length > 0) {
        finalUpdateData[`Kho_${khoName}`] = dataObject;
        successCount++;
        console.log(`✅ Thành công Kho ${khoName}: Tìm thấy ${Object.keys(dataObject).length} mặt hàng.`);
      } else {
        console.log(`⚠️ Kho ${khoName} quét ra 0 mặt hàng. Vui lòng xem log dòng để chỉnh lại vị trí cột.`);
      }
    } catch (err) {
      console.error(`❌ Lỗi kết nối Kho ${khoName}:`, err.message);
    }
  }

  if (successCount > 0) {
    finalUpdateData["last_updated"] = admin.firestore.FieldValue.serverTimestamp();
    console.log('\n📡 Đang đẩy toàn bộ mảng dữ liệu gộp lên Firestore...');
    await tonKhoDocRef.set(finalUpdateData, { merge: true });
    console.log(`\n🎉 HOÀN TẤT: Bảng 'TONKHO' đã được cập nhật thành công trên Firestore!`);
  } else {
    console.log('\n❌ Thất bại: Không gộp được dữ liệu của bất kỳ kho nào.');
  }
}

syncInventory().catch(err => {
  console.error('❌ Lỗi hệ thống:', err);
  process.exit(1);
});
