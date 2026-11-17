const { google } = require('googleapis');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// 🌟 ID FILE V-TRACKING THÁNG 11 NĂM 2026
const ID_VTRACKING_THANG_11 = "1t7KgNwHwQuK0terHjSVwrC722ObYsnj8";

// 📍 TỌA ĐỘ KHO 55 TẦM VU
const KHO_55_TAM_VU_LAT = 10.007685;
const KHO_55_TAM_VU_LONG = 105.763084;

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

function formatStandardDate(dateStr) {
  if (!dateStr) return "";
  const cleanDate = dateStr.split(" ")[0];
  if (cleanDate.includes("/")) {
    const parts = cleanDate.split("/");
    if (parts.length === 3) {
      const pad = (n) => String(n).padStart(2, '0');
      const d = pad(parseInt(parts[0], 10));
      const m = pad(parseInt(parts[1], 10));
      const y = parts[2];
      return `${d}/${m}/${y}`;
    }
  } else if (cleanDate.includes("-")) {
    const parts = cleanDate.split("-");
    const pad = (n) => String(n).padStart(2, '0');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const y = parts[0];
        const m = pad(parseInt(parts[1], 10));
        const d = pad(parseInt(parts[2], 10));
        return `${d}/${m}/${y}`;
      } else {
        const d = pad(parseInt(parts[0], 10));
        const m = pad(parseInt(parts[1], 10));
        const y = parts[2];
        return `${d}/${m}/${y}`;
      }
    }
  }
  return cleanDate;
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  return h * 3600 + m * 60 + s;
}

function formatSecondsToTime(totalSeconds) {
  if (totalSeconds <= 0) return "0 giây";
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} giờ ${pad(m)} phút ${pad(s)} giây`;
  if (m > 0) return `${m} phút ${pad(s)} giây`;
  return `${s} giây`;
}

// 🚚 ĐỌC VÀ XỬ LÝ FILE V-TRACKING (Lọc quangDuong > 0 và thêm minThoiGianBatDau)
function parseVTrackingToList(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  const rawRows = [];

  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 12) continue;

    const quangDuong = parseFloat(row[13]) || parseFloat(row[11]) || 0;
    
    // 🌟 CHỈ LẤY DÒNG QUÃNG ĐƯỜNG XE CHẠY (KM) > 0
    if (quangDuong <= 0) continue;

    const rawNgay = row[1] ? row[1].toString().trim() : "";
    const ngayChuan = formatStandardDate(rawNgay);
    const bienSo = row[2] ? row[2].toString().trim() : "";
    const laiXe = row[3] ? row[3].toString().trim() : "";
    const thoiGianBatDauOnly = row[4] ? row[4].toString().trim() : "";
    const thoiGianKetThucOnly = row[5] ? row[5].toString().trim() : "";
    const thoiGianDi = row[6] ? row[6].toString().trim() : "";
    
    const thoiGianBatDau = (ngayChuan && thoiGianBatDauOnly) ? `${ngayChuan} ${thoiGianBatDauOnly}` : thoiGianBatDauOnly;
    const thoiGianKetThuc = (ngayChuan && thoiGianKetThucOnly) ? `${ngayChuan} ${thoiGianKetThucOnly}` : thoiGianKetThucOnly;

    const diaDiemBatDau = row[7] ? row[7].toString().trim() : "";
    const latBatDau = parseFloat(row[8]) || 0;
    const longBatDau = parseFloat(row[9]) || 0;
    const diaDiemKetThuc = row[10] ? row[10].toString().trim() : "";
    const latKetThuc = parseFloat(row[11]) || 0;
    const longKetThuc = parseFloat(row[12]) || 0;

    if (!ngayChuan || !bienSo) continue;

    rawRows.push({
      ngayChuan,
      bienSo,
      laiXe,
      thoiGianBatDau,
      thoiGianKetThuc,
      thoiGianDi,
      thoiGianDau: "",
      diaDiemBatDau,
      latBatDau,
      longBatDau,
      diaDiemKetThuc,
      latKetThuc,
      longKetThuc,
      quangDuong,
      chuyenVtracking: 1
    });
  }

  const groupedMap = {};
  rawRows.forEach(r => {
    const key = `${r.bienSo}_${r.ngayChuan}`;
    if (!groupedMap[key]) groupedMap[key] = [];
    groupedMap[key].push(r);
  });

  const processedTripsList = [];

  Object.keys(groupedMap).forEach(key => {
    const rowsOfGroup = groupedMap[key];
    let currentChuyen = 1;

    rowsOfGroup.forEach((row, idx) => {
      if (idx > 0) {
        const prevRow = rowsOfGroup[idx - 1];
        const prevEndTimeOnly = prevRow.thoiGianKetThuc.split(" ")[1] || "";
        const currStartTimeOnly = row.thoiGianBatDau.split(" ")[1] || "";
        const prevSec = parseTimeToSeconds(prevEndTimeOnly);
        const currSec = parseTimeToSeconds(currStartTimeOnly);
        if (currSec >= prevSec) {
          row.thoiGianDau = formatSecondsToTime(currSec - prevSec);
        } else {
          row.thoiGianDau = "0 giây";
        }
      } else {
        row.thoiGianDau = "0 giây";
      }

      if (row.quangDuong > 0) {
        const isToKho = (Math.abs(row.latKetThuc - KHO_55_TAM_VU_LAT) < 0.002 && Math.abs(row.longKetThuc - KHO_55_TAM_VU_LONG) < 0.002);
        row.chuyenVtracking = currentChuyen;
        if (isToKho) {
          currentChuyen++;
        }
      } else {
        row.chuyenVtracking = currentChuyen;
      }
    });

    const bienSo = rowsOfGroup[0].bienSo;
    const ngay = rowsOfGroup[0].ngayChuan;

    const maxChuyen = rowsOfGroup[rowsOfGroup.length - 1].chuyenVtracking;
    for (let c = 1; c <= maxChuyen; c++) {
      const segsOfTrip = rowsOfGroup.filter(r => r.chuyenVtracking === c);
      if (segsOfTrip.length > 0) {
        // 🌟 TÌM MIN THỜI GIAN BẮT ĐẦU TRONG CÙNG NGÀY, BIỂN SỐ, CHUYẾN
        const minThoiGianBatDau = segsOfTrip.reduce((min, curr) => {
          return curr.thoiGianBatDau < min ? curr.thoiGianBatDau : min;
        }, segsOfTrip[0].thoiGianBatDau);

        // Tạo ID duy nhất cho document trên Firestore: BienSo_Ngay_Chuyen (loại bỏ ký tự đặc biệt)
        const rawDocId = `${bienSo}_${ngay}_Chuyen_${c}`;
        const docId = rawDocId.replace(/[\/.\s#$\[\]]/g, "_");

        processedTripsList.push({
          docId: docId,
          data: {
            bienSo: bienSo,
            ngayChuan: ngay,
            chuyen: c,
            minThoiGianBatDau: minThoiGianBatDau,
            segments: segsOfTrip.map(s => ({
              thoiGianBatDau: s.thoiGianBatDau,
              thoiGianKetThuc: s.thoiGianKetThuc,
              latBatDau: s.latBatDau,
              longBatDau: s.longBatDau,
              latKetThuc: s.latKetThuc,
              longKetThuc: s.longKetThuc,
              quangDuong: s.quangDuong,
              thoiGianDau: s.thoiGianDau
            }))
          }
        });
      }
    }
  });

  return processedTripsList;
}

async function syncVTrackingThang11() {
  const drive = getDriveClient();
  console.log('🚀 Bắt đầu tải và xử lý file V-Tracking Tháng 11.2026...');

  try {
    const vtBuffer = await downloadFileBuffer(drive, ID_VTRACKING_THANG_11);
    const tripsList = parseVTrackingToList(vtBuffer);
    
    console.log(`📦 Đã xử lý xong ${tripsList.length chuyến. Đang đẩy lên collection 'VTRACKING'...`);

    let batch = db.batch();
    let count = 0;
    let totalPushed = 0;

    for (const item of tripsList) {
      const docRef = db.collection('VTRACKING').doc(item.docId);
      batch.set(docRef, item.data, { merge: true });
      count++;
      totalPushed++;

      // Firestore batch giới hạn tối đa 500 thao tác mỗi lần commit
      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`   -> Đã đẩy ${totalPushed}/${tripsList.length} bản ghi...`);
      }
    }

    if (count % 400 !== 0) {
      await batch.commit();
    }

    console.log(`🎉 HOÀN TẤT: Đã đẩy thành công ${totalPushed} bản ghi V-Tracking tháng 11/2026 lên collection 'VTRACKING'!`);

  } catch (err) {
    console.error(`❌ Lỗi khi đồng bộ V-Tracking tháng 11:`, err.message);
  }
}

syncVTrackingThang11().catch(err => {
  console.error('❌ Lỗi hệ thống nghiêm trọng:', err);
  process.exit(1);
});
