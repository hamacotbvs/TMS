const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');
// 1. Cấu hình biến môi trường bảo mật từ GitHub Secrets
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// Khai báo ID của 3 file Excel .xlsx trên Google Drive của bạn
const FILE_IDS = {
  "41": "1ZS9K4lSPHMzBR4ifgSpiGx_RbYbDJ8tb", // Thay ID file Kho 41 vào đây
  "61": "1ONnLc9N7IxZOvbs4udNjEH_JZxYOATLB", // Thay ID file Kho 61 vào đây
  "69": "1lvbNAvxQ-jXMEIwZ-w3GOdsbcd5-TCIf"  // Thay ID file Kho 69 vào đây
};

// Khởi tạo Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});
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
async function downloadFileBuffer(drive, fileId, revisionId = null) {
  const options = { fileId, alt: 'media' };
  if (revisionId) {
    return await drive.revisions.get({ fileId, revisionId, alt: 'media' }, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data));
  }
  return await drive.files.get(options, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data));
}

// Hàm chuyển đổi dữ liệu Buffer Excel thành Cấu trúc Object trực quan trên RAM
function parseExcelToMap(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0]; // Đọc sheet đầu tiên
  const sheet = workbook.Sheets[sheetName];
  
  // Đọc bắt đầu dữ liệu từ hàng số 9 (Header định dạng danh mục hàng hóa)
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const dataMap = new Map();
  
  // Quét từ dòng thứ 10 trở đi (Index hệ mảng 9)
  for (let i = 9; i < jsonData.length; i++) {
    const row = jsonData[i];
    const maHang = row[1] ? row[1].toString().trim() : ""; // Cột B: Mã Hàng
    if (!maHang || maHang === "Mã hàng") continue;

    dataMap.set(maHang, {
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
    });
  }
  return dataMap;
}

async function syncInventory() {
  console.log('🚀 Bắt đầu tiến trình tự động quét biến động Tồn Kho...');
  const drive = getDriveClient();
  
  // Khởi tạo một Firestore Batch để gom tất cả thay đổi đẩy lên 1 lần duy nhất
  let batch = db.batch();
  let updateCount = 0;
  
  // Tham chiếu trực tiếp đến 1 tài liệu duy nhất tên là TONKHO trên Firestore
  const tonKhoDocRef = db.collection('BÁO_CÁO').doc('TONKHO');
  let currentFirestoreData = {};

  for (const [khoName, fileId] of Object.entries(FILE_IDS)) {
    try {
      console.log(`\n📦 Đang xử lý dữ liệu Kho: ${khoName}`);
      
      // 1. Tải phiên bản mới nhất hiện tại trên Drive
      const currentBuffer = await downloadFileBuffer(drive, fileId);
      const currentMap = parseExcelToMap(currentBuffer);
      
      // 2. Lấy danh sách lịch sử để tìm phiên bản ngay trước đó
      const revList = await drive.revisions.list({ fileId, pageSize: 2 });
      let hasChanges = false;
      let diffData = {};

      if (revList.data.revisions && revList.data.revisions.length > 1) {
        // Lấy phiên bản cũ liền trước
        const oldRevisionId = revList.data.revisions[revList.data.revisions.length - 2].id;
        const oldBuffer = await downloadFileBuffer(drive, fileId, oldRevisionId);
        const oldMap = parseExcelToMap(oldBuffer);
        
        // Tiến hành so sánh đối chiếu trực tiếp giữa 2 file Excel ngay trên bộ nhớ RAM
        for (const [maHang, currentItem] of currentMap.entries()) {
          const oldItem = oldMap.get(maHang);
          
          // Kiểm tra nếu là mã hàng mới hoặc có bất kỳ ô số lượng/trọng lượng nào biến động
          if (!oldItem || JSON.stringify(currentItem) !== JSON.stringify(oldItem)) {
            diffData[maHang] = currentItem;
            hasChanges = true;
          }
        }
      } else {
        // Nếu file mới tạo chưa có lịch sử phiên bản, bốc toàn bộ dữ liệu hiện tại làm gốc
        diffData = Object.fromEntries(currentMap);
        hasChanges = true;
      }

      if (hasChanges) {
        // Chuẩn bị dữ liệu lồng cấu trúc theo từng Kho để gộp chung vào 1 file TONKHO duy nhất
        currentFirestoreData[`Kho_${khoName}`] = diffData;
        updateCount++;
        console.log(`✅ Phát hiện biến động số liệu tại Kho ${khoName}. Đã chuẩn hóa danh mục lên RAM.`);
      } else {
        console.log(`💤 Kho ${khoName} không có biến động ô dữ liệu nào so với phiên bản cũ.`);
      }

    } catch (err) {
      console.error(`❌ Lỗi xử lý tại Kho ${khoName}:`, err.message);
    }
  }

  // Tiến hành ghi đè dữ liệu có biến động vào duy nhất 1 tài liệu TONKHO
  if (updateCount > 0) {
    // Sử dụng tính năng { merge: true } để cập nhật riêng biệt kho có thay đổi, giữ nguyên dữ liệu các kho khác
    await tonKhoDocRef.set(currentFirestoreData, { merge: true });
    console.log(`\n🎉 HOÀN TẤT: Đã đồng bộ tự động dữ liệu biến động lên tài liệu duy nhất 'TONKHO' trên Firestore!`);
  } else {
    console.log('\n Balanced: Không có bất kỳ sự thay đổi số liệu nào trong cả 3 file Excel. Không tốn request Firestore.');
  }
}

// Kích hoạt tiến trình hoạt động
syncInventory().catch(err => {
  console.error('❌ Lỗi thực thi hệ thống:', err);
  process.exit(1);
});
