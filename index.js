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
      nsx: formatExcelDate(row[3]), // 🌟 ĐÃ SỬA: Ép định dạng ngày tháng chuẩn cho cột NSX
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
  
  const headers =
