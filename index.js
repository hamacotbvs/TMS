function parseRoutesToMap(buffer) {
  // ĐỂ cellDates: true là chính xác, giúp xử lý các ô ngày giờ có cả phút giây
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
  
  const headers = jsonData[headerRowIdx] || [];
  const colIdx = {};
  
  // ĐÃ LỌC SẠCH: Loại bỏ các từ khóa ngắn gây trùng lặp cột (như "bắt đầu", "kết thúc")
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
    sonTbvsKg: ["sơn/tbvs", "sontbvs"], // Bỏ chữ "sơn" rời rạc
    tTai: ["t.tải", "t tải", "ttai", "tổng tải"],
    thanhTien: ["thành tiền", "thanhtien"],
    batDauGiaoHang: ["bắt đầu giao hàng", "bắt đầugiaohàng", "batdau giao hang", "batdaugiaohang"], // Bỏ chữ "bắt đầu"
    chuyen: ["chuyến", "chuyen"],
    ghiChu: ["ghi chú", "ghichu"],
    giaoNhan: ["giao nhận", "giaonhan"],
    htGiaoNhan: ["ht giao nhận", "htgiaonhan", "hình thức giao nhận"],
    ketThucGiaoHang: ["kết thúc giao hàng", "kết thúcgiaohàng", "ketthuc giaohang", "ketthucgiaohang"], // Bỏ chữ "kết thúc"
    kmBatDauGiaoHang: ["km bắt đầu giao hàng", "kmbatdaugiaohang", "km bắt đầu"],
    kmDuKien: ["km dự kiến", "kmdukien"],
    kmKetThucGiaoHang: ["km kết thúc giao hàng", "kmketthucgiaohang", "km kết thúc"],
    ngayGiao: ["ngày giao", "ngaygiao"],
    ngayXuatKho: ["ngày xuất kho", "ngayxuatkho"],
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
    if (khoXuatVal !== "41" && khoXuatVal !== "61" && khoXuatVal !== "69") continue; 

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
      if (parts[1]) thang = `Tháng ${parseInt(parts[1])}`;
    } else if (ngayXuatKhoTxt && ngayXuatKhoTxt.includes("-")) {
      const parts = ngayXuatKhoTxt.split("-");
      if (parts[1]) thang = `Tháng ${parseInt(parts[1])}`;
    }

    // ĐÃ ĐỔI: Sử dụng ĐÚNG getDateVal cho các trường ngày tháng để format chuẩn đẹp
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
      ngayDatHang: getDateVal(row, "ngayDatHang"),
      ngayXuLy: getDateVal(row, "ngayXuLy"),            // <-- Dùng getDateVal
      ngayDuyet: getDateVal(row, "ngayDuyet"),
      ngayDuKien: getDateVal(row, "ngayDuKien"),
      ngayGiao: getDateVal(row, "ngayGiao"),
      ngayxuatKho: ngayXuatKhoTxt,
      batDauGiaoHang: getDateVal(row, "batDauGiaoHang"),   // <-- Dùng getDateVal
      ketThucGiaoHang: getDateVal(row, "ketThucGiaoHang") // <-- Dùng getDateVal
    };
  }
  return routeMap;
}
