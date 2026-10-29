
    const db = window.db; // Dùng chung kết nối Firestore từ file HTML

    // Thiết lập mặc định ngày hôm nay cho form
    const nvNgay = document.getElementById('nvNgay');
    if (nvNgay) {
        nvNgay.value = new Date().toISOString().slice(0, 10);
    }

    // Khai báo hàm tự động chọn tỷ lệ ra phạm vi toàn cục
    window.tuDongChonTyLeTheoHangMuc = function(hangMuc) {
        const selector = document.getElementById('nvKieuPhanBo');
        const vungPhuongTien = document.getElementById('vungPhuongTien');
        if (!hangMuc) return;
        // --- LOGIC ẨN/HIỆN PHƯƠNG TIỆN (Dùng tên trực tiếp cho chính xác 100%) ---
        if (hangMuc === "Đăng kiểm" || hangMuc === "Bảo hiểm xe" || hangMuc === "Giám sát hành trình" || hangMuc === "Nhiên liệu" || hangMuc === "Bảo trì, bảo dưỡng xe" || hangMuc === "Lương km tài xế" || hangMuc === "Lương sản lượng tài xế") {
            vungPhuongTien.style.display = 'flex'; // Hiện ra chia đôi dòng
        } else { 
            vungPhuongTien.style.display = 'none'; // Ẩn đi
            const nvPhuongTien = document.getElementById('nvPhuongTien');
            if (nvPhuongTien) nvPhuongTien.value = '';
        } // Reset lựa chọn xe
        // Nhóm 1: 35 - 65
        if (hangMuc.includes("Thuê mặt bằng")) {
            selector.value = "Sơn: 35 - TBVS: 65"; }
        // Nhóm 2: 67 - 33
        else if (hangMuc === "Thuê xe" || hangMuc.includes("Tài xế") || ["Đăng kiểm", "Bảo hiểm xe", "Giám sát hành trình", "Lương vị trí, phụ cấp TX, GN, BX", "Trích BH, CĐ: TX, GN, BX", "BOT", "Bảo trì, bảo dưỡng xe"].includes(hangMuc)) {
            selector.value = "Sơn: 67 - TBVS: 33"; }
        // Nhóm 3: 50 - 50
        else {selector.value = "Sơn: 50 - TBVS: 50";}
        window.tinhPhanBoNghiepVu(); };
    // Hàm phụ trợ làm tròn đến hàng triệu gần nhất
    function lamTronHangTrieu(soTien) {return Math.round(soTien / 1000000) * 1000000;}
    // Khai báo hàm tính toán thời gian thực ra phạm vi toàn cục
    window.tinhPhanBoNghiepVu = function(nguonThayDoi) {
        const tongTien = parseFloat(document.getElementById('nvTongTien').value) || 0;
        const hangMuc = document.getElementById('nvHangMuc').value;
        const kieuPhanBo = document.getElementById('nvKieuPhanBo').value;
        const vungNhapTBVS = document.getElementById('vungNhapTBVS');
        const inputTBVS = document.getElementById('tienTBVSInput');
        let tienTBVS = 0;

        if (kieuPhanBo === 'tbvs-truoc') {
            // 1. Hiện ô nhập tay nếu chọn 'tbvs-truoc'
            vungNhapTBVS.style.display = 'block';
            let tbvsNhap = parseFloat(inputTBVS.value) || 0;
            if (tbvsNhap > tongTien) { // Khống chế nếu nhập lố tổng tiền
                tbvsNhap = tongTien;
                inputTBVS.value = tongTien;}
            tienTBVS = Math.round(tbvsNhap);
        } else {
            // 2. Ẩn và xóa ô nhập tay khi chọn các tỷ lệ % cố định
            vungNhapTBVS.style.display = 'none';
            if (nguonThayDoi === 'thay-doi-nguyen-tac') inputTBVS.value = '';
            // Tính tiền TBVS trước theo tỷ lệ %
            let phanTramTBVS = 0.5; // Mặc định của 50-50
            if (kieuPhanBo === 'Sơn: 67 - TBVS: 33') phanTramTBVS = 0.33;
            else if (kieuPhanBo === 'Sơn: 35 - TBVS: 65') phanTramTBVS = 0.648;
            tienTBVS = Math.round(tongTien * phanTramTBVS);}

        if (kieuPhanBo !== 'tbvs-truoc' && (hangMuc === "Thuê mặt bằng" || hangMuc === "Thuê xe")) {
            tienTBVS = lamTronHangTrieu(tienTBVS);
            if (tienTBVS > tongTien) tienTBVS = lamTronHangTrieu(tongTien);}

        // ĐỒNG NHẤT CÔNG THỨC: Sơn luôn bằng Tổng trừ đi TBVS
        const tienSon = tongTien - tienTBVS;
        // Hiển thị lên giao diện xem trước
        document.getElementById('previewSon').innerText = tienSon.toLocaleString('vi-VN') + " đ";
        document.getElementById('previewTBVS').innerText = tienTBVS.toLocaleString('vi-VN') + " đ"; };
        
    // HÀM LƯU CHÍNH XÁC ĐÃ ĐƯỢC ĐƯA RA TOÀN CỤC ĐỂ HTML GỌI ONCLICK
    let dangSuaIdDoc = null; // SỬA: Biến toàn cục theo dõi ID bản ghi đang sửa
    window.luuNghiepVuVaoFirebase = async function() {
        const nutBam = document.getElementById('btnLuuNghiepVu');       // 🌟 LẤY ĐỐI TƯỢNG NÚT BẤM
        // Nếu nút đang ở trạng thái disable (đang xử lý), thoát ra luôn không chạy tiếp
        if (nutBam.disabled) return;
        const ngay = document.getElementById('nvNgay').value;
        const hangMuc = document.getElementById('nvHangMuc').value;
        const tongTien = parseFloat(document.getElementById('nvTongTien').value) || 0;
        const kieuPhanBo = document.getElementById('nvKieuPhanBo').value;
        const ghiChu = document.getElementById('nvGhiChu').value.trim();
        const phuongTien = document.getElementById('nvPhuongTien').value;
        if (!hangMuc) { alert("Vui lòng chọn Hạng mục chi phí!"); return; }
        if (tongTien <= 0) { alert("Vui lòng nhập Số tiền phát sinh lớn hơn 0!"); return; }
        // 🌟 THÊM MỚI: Bắt buộc chọn xe nếu thuộc 2 hạng mục này
        if ((hangMuc === "Đăng kiểm" || hangMuc === "Bảo hiểm xe" || hangMuc === "Giám sát hành trình" || hangMuc === "Nhiên liệu" || hangMuc === "Bảo trì, bảo dưỡng xe" || hangMuc === "Lương km tài xế" || hangMuc === "Lương sản lượng tài xế") && !phuongTien) {
            alert("Vui lòng chọn biển số xe phương tiện!"); return;}
        // 🌟 KHÓA NÚT BẤM NGAY LẬP TỨC & THAY ĐỔI GIAO DIỆN KHÁCH HÀNG
        nutBam.disabled = true;
        nutBam.style.opacity = "0.6";
        nutBam.style.cursor = "not-allowed";
        nutBam.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang ghi sổ... Vui lòng đợi`;
        const thoiGian = new Date(ngay);
        const nam = thoiGian.getFullYear();
        const thang = String(thoiGian.getMonth() + 1).padStart(2, '0'); 
        // 🌟 Lấy thẳng kết quả tiền Sơn và TBVS đang hiển thị trực tiếp trên giao diện
        const textTBVS = document.getElementById('previewTBVS') ? document.getElementById('previewTBVS').innerText : '0';
        const textSon = document.getElementById('previewSon') ? document.getElementById('previewSon').innerText : '0';
        // Xóa tất cả các ký tự không phải số để lấy giá trị số nguyên chính xác
        const tienTBVS = parseFloat(textTBVS.replace(/\D/g, '')) || 0;
        const tienSon = parseFloat(textSon.replace(/\D/g, '')) || 0;
            // phân nhóm cố định biến phí
            // Lấy index của option được chọn (0 là -- Chọn hạng mục --)
            const selectElement = document.getElementById('nvHangMuc');
            const selectedIndex = selectElement.selectedIndex;
            // PHÍ KHO: từ 1 đến 12 (đánh số 1-12)
            // PHÍ LOGISTICS: từ 13 đến 25 (đánh số 13-25)
            let cauTruc = ( (selectedIndex >= 1 && selectedIndex <= 12) || (selectedIndex >= 13 && selectedIndex <= 18) ) ? "Cố định" : "Biến phí";
            // Nhân sự: 6-7, 10-12, 17-18, 22-25
            let phanNhom = "Hạ tầng"; // Mặc định
            if (
                (selectedIndex >= 6 && selectedIndex <= 7) ||
                (selectedIndex >= 10 && selectedIndex <= 12) ||
                (selectedIndex >= 17 && selectedIndex <= 18) ||
                (selectedIndex >= 22 && selectedIndex <= 25)
            ) {phanNhom = "Nhân sự";}
            // SỬA
            try {
                if (dangSuaIdDoc) {
                    // TRƯỜNG HỢP A: ĐANG SỬA (CẬP NHẬT BẢN GHI CŨ)
                    const taiLieuChiPhiRef = doc(db, "CHIPHI", dangSuaIdDoc);
                    const duLieuCapNhat = {
                        ngayPhatSinh: ngay,
                        nam: nam,
                        thang: Number(thang), 
                        hangMuc: hangMuc,
                        loaiChiPhi: (selectedIndex <= 12) ? "Kho" : "Logistics",
                        cauTrucKeToan: cauTruc,
                        phanNhom: phanNhom,
                        chiPhiGoc: tongTien,
                        nguyenTacPhanBo: kieuPhanBo,
                        tienSon: tienSon,
                        tienTBVS: tienTBVS,
                        ghiChu: ghiChu};
                    if (phuongTien) {duLieuCapNhat.phuongTien = phuongTien;
                    } else {duLieuCapNhat.phuongTien = deleteField();} // Xóa field nếu bỏ chọn xe
                    // 🌟 2. NHẢY TRỞ VỀ TAB HOME (Nơi chứa modal lịch sử)
                    if (typeof chuyenTab === 'function') {chuyenTab('home');
                    } else {const tabHome = document.querySelector('[data-tab="home"]') || document.getElementById('btnTabHome');
                        if (tabHome) tabHome.click();}
                    // 🌟 3. MỞ LẠI MODAL LỊCH SỬ ĐỂ KIỂM TRA NGAY
                    const modalLichSu = document.getElementById('modalLichSu');
                    if (modalLichSu) {modalLichSu.style.display = 'block';}
                    // bạn cập nhật trực tiếp vào mảng đó để bảng hiện dữ liệu mới luôn khỏi cần chờ tải lại:
                    if (typeof danhSachChiPhi !== 'undefined' && Array.isArray(danhSachChiPhi)) {
                        const indexItem = danhSachChiPhi.findIndex(item => item.id === dangSuaIdDoc || item.IDChiPhi === dangSuaIdDoc);
                        if (indexItem !== -1) {
                            danhSachChiPhi[indexItem] = { ...danhSachChiPhi[indexItem], ...duLieuCapNhat };
                            if (typeof hienThiBangLichSu === 'function') hienThiBangLichSu(danhSachChiPhi); } }  // Hàm vẽ lại bảng từ mảng tạm
                    nutBam.style.background = "#2e7d32";
                    nutBam.innerHTML = `<i class="fa-solid fa-circle-check"></i> Cập nhật thành công!`;
                    // 🌟 2. ĐẨY NGẦM LÊN FIREBASE PHÍA SAU (Chạy bất đồng bộ không chặn UI)
                    updateDoc(taiLieuChiPhiRef, duLieuCapNhat).then(() => {
                        // 🌟 1. GỌI HÀM TẢI LẠI DỮ LIỆU BẢNG/LỊCH SỬ (Thay tên hàm tải lịch sử của bạn vào đây nếu khác tên)
                        if (typeof taiDuLieuTheoThang === 'function') {
                            taiDuLieuTheoThang(thang, nam); }   // Truyền tháng nam vừa sửa để load đúng dữ liệu
                    }).catch(err => {
                        console.error("Lỗi đồng bộ ngầm Firebase:", err);
                    });
                    dangSuaIdDoc = null;        // Reset trạng thái sửa
                } else {
            // HẾT SỬA
                // TRƯỜNG HỢP B: THÊM MỚI (TẠO ID TỰ TĂNG)
                const tenBoDemTheoThang = `bo_dem_${thang}_${nam}`;
                const counterDocRef = doc(db, "CAUHINH_HETHONG", tenBoDemTheoThang);
                const maDinhDanhId = await runTransaction(db, async (transaction) => {
                    const counterSnapshot = await transaction.get(counterDocRef);
                    let STT_HienTai = 1; 
                    if (counterSnapshot.exists()) {
                        STT_HienTai = (counterSnapshot.data().giaTriHienTai || 0) + 1; }
                    transaction.set(counterDocRef, { giaTriHienTai: STT_HienTai }, { merge: true });
                    const chuoiSTT = String(STT_HienTai).padStart(6, '0');
                    return `CP-${chuoiSTT}-${thang}-${nam}`; });
                // 2. Gom đóng dữ liệu
                const duLieuGhiSo = {
                    IDChiPhi: maDinhDanhId, 
                    ngayPhatSinh: ngay,
                    nam: nam,
                    thang: Number(thang), 
                    hangMuc: hangMuc,
                    loaiChiPhi: (selectedIndex <= 12) ? "Kho" : "Logistics",
                    cauTrucKeToan: cauTruc,
                    phanNhom: phanNhom,
                    chiPhiGoc: tongTien,
                    nguyenTacPhanBo: kieuPhanBo,
                    tienSon: tienSon,
                    tienTBVS: tienTBVS,
                    ghiChu: ghiChu,
                    ngayTaoHeThong: new Date().toISOString() };
                if (phuongTien) {duLieuGhiSo.phuongTien = phuongTien;}  // Chỉ đẩy data phương tiện lên Firebase nếu có chọn xe
                // 3. Tiến hành ép ID tùy chỉnh vào tên Document
                const taiLieuChiPhiRef = doc(db, "CHIPHI", maDinhDanhId);
                await setDoc(taiLieuChiPhiRef, duLieuGhiSo);
                // 🌟 HIỂU ỨNG THÔNG BÁO TRÊN NÚT BẤM TRONG 2 GIÂY
                nutBam.style.background = "#2e7d32"; // Đổi sang màu xanh lá
                nutBam.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã ghi sổ thành công! (${maDinhDanhId})`;}
            // Reset sạch form nhập liệu
            document.getElementById('nvTongTien').value = '';
            document.getElementById('tienTBVSInput').value = ''; // 🌟 THÊM DÒNG NÀY ĐỂ XÓA Ô NHẬP TAY TBVS
            document.getElementById('nvGhiChu').value = '';
            document.getElementById('previewSon').innerText = '0 đ';
            document.getElementById('previewTBVS').innerText = '0 đ';
            // Xóa và ẩn ô phương tiện đi sau khi lưu thành công
            document.getElementById('nvPhuongTien').value = ''; 
            document.getElementById('vungPhuongTien').style.display = 'none';
            // Đợi 2 giây rồi trả nút bấm về trạng thái ban đầu để nhập ca tiếp theo
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error("Lỗi hệ thống chi tiết:", error);
            alert("Lỗi kết nối hoặc lỗi cú pháp Firebase! Chi tiết: " + error.message);
        } finally {
            // KHÔI PHỤC TRẠNG THÁI NÚT BẤM VỀ MÀU XANH DƯƠNG BAN ĐẦU
            nutBam.disabled = false;
            nutBam.style.opacity = "1";
            nutBam.style.background = "#0082C8"; // Màu xanh dương ban đầu của bạn
            nutBam.style.cursor = "pointer";
            nutBam.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Ghi Sổ`;} };

        // SỬA LỖI KẸT MÀN HÌNH - TỰ ĐỘNG HẠ KHUNG HÌNH VỀ VỊ TRÍ CŨ KHI ẨN BÀN PHÍM
        document.querySelectorAll('input, select, textarea').forEach(element => {
            element.addEventListener('blur', () => {
                setTimeout(() => {
                    document.body.style.overflow = 'hidden';     // Ép iOS vẽ lại toàn bộ body bằng cách thay đổi tạm thời overflow
                    window.scrollTo(0, 0);      // Cuộn về 0 để reset
                    setTimeout(() => {document.body.style.overflow = ''; }, 50); }, 150); }); });     // Trả lại trạng thái cũ ngay lập tức, Đợi bàn phím đóng xong mới chạy
// LỊCH SỬ CHI PHÍ KHO
    // MỞ LỊCH SỬ CHI PHÍ TỪ TRANG HOME
    window.moLichSuChiPhi = () => {document.getElementById('modalLichSu').style.display = 'block';};
    window.dongModal = () => {document.getElementById('modalLichSu').style.display = 'none';};

    // KHỞI TẠO THÁNG/NĂM HIỆN HÀNH KHI MỞ TRANG
    window.addEventListener('DOMContentLoaded', function() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Định dạng 2 chữ số (VD: 07)
        const inputThang = document.getElementById('inputThangAn');
        const labelThang = document.getElementById('labelThangNam');
        if (inputThang && labelThang) {inputThang.value = `${year}-${month}`;      // Gán giá trị chuẩn cho input type="month" (định dạng YYYY-MM)
            labelThang.innerText = `${month}/${year}`;
            taiDuLieuTheoThang(month, year); } });      // Tự động load dữ liệu của tháng hiện tại ngay khi vừa mở modal hoặc mở trang

    // ONCLICK CHỌN THÁNG NĂM //
    document.querySelector('.bo-chon-thang').addEventListener('click', function() {
        const inputThang = document.getElementById('inputThangAn');
        if (inputThang.showPicker) {inputThang.showPicker(); // Mở bảng lịch chuẩn trên các trình duyệt hiện đại
        } else {inputThang.click(); }  });  // Dự phòng cho các trình duyệt cũ
        
    // XỬ LÝ KHI NGƯỜI DÙNG CHỌN XONG THÁNG/NĂM TỪ BẢNG
    document.getElementById('inputThangAn').addEventListener('change', function() {
        if (this.value) {
            const parts = this.value.split('-'); // Định dạng trả về: YYYY-MM
            const year = parts[0];
            const month = parts[1];
            document.getElementById('labelThangNam').innerText = `${month}/${year}`; 
            taiDuLieuTheoThang(month, year); } });      // 2. Gọi hàm tải dữ liệu từ Firebase theo tháng năm mới chọn

    // 🎨 HÀM XÁC ĐỊNH MÀU NỀN THEO NGUYÊN TẮC PHÂN BỔ
    function layMauNenPhanBo(nguyenTac) {
        if (!nguyenTac) return 'color: #64748b;';
        
        // Tỷ lệ lệch về Sơn (Xanh dương)
        if (nguyenTac.includes('67 - TBVS: 33')) return 'color: #2563eb;'; 
        
        // Tỷ lệ cân bằng (Xanh lá)
        if (nguyenTac.includes('50 - TBVS: 50')) return 'color: #16a34a;'; 
        
        // Tỷ lệ lệch về TBVS (Cam đậm)
        if (nguyenTac.includes('35 - TBVS: 65')) return 'color: #d97706;'; 
        
        // Trường hợp tbvs-truoc (Màu ĐỎ nổi bật)
        if (nguyenTac === 'tbvs-truoc') return 'color: #dc2626;'; 
        
        return 'color: #64748b;';
    }
            
    // HÀM TẢI DỮ LIỆU LỊCH SỬ CHI PHÍ KHO TỪ FIREBASE
    async function taiDuLieuTheoThang(thangChon, namChon) {
        const container = document.getElementById('danhSachLichSu');
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Đang tải dữ liệu...</div>';
        try {
            // Chuyển tháng và năm về kiểu số để khớp với dữ liệu trên Firestore
            const thangNum = parseInt(thangChon, 10);
            const namNum = parseInt(namChon, 10);
            // Truy vấn collection "CHIPHI" dựa theo trường "thang" và "nam"
            const q = query(collection(db, "CHIPHI"), 
                where("thang", "==", thangNum),
                where("nam", "==", namNum),
                orderBy("ngayPhatSinh", "asc") );
            const querySnapshot = await getDocs(q);
            // Xóa nội dung cũ trước khi render
            container.innerHTML = '';
            if (querySnapshot.empty) {container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 13px;">Không có chi phí nào trong tháng này.</div>'; 
            if (typeof capNhatBieuDoChiPhiThang === 'function') {capNhatBieuDoChiPhiThang(0, 0); }; return;}    // Reset biểu đồ về 0 khi không có dữ liệu
            // 🌟 KHAI BÁO BIẾN TỔNG ĐỂ CỘNG DỒN
            let tongPhiKho = 0;
            let tongPhiLogistics = 0;
            let sonKho = 0, tbvsKho = 0;
            let sonLogistics = 0, tbvsLogistics = 0;
            // Duyệt qua từng document và render ra giao diện
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const ghiChu = data.ghiChu || 'Không có ghi chú';
                const ngayPhatSinh = data.ngayPhatSinh || '';
                const chiPhiGocNum = data.chiPhiGoc !== undefined ? Number(data.chiPhiGoc) : 0;
                const tienSonNum = data.tienSon !== undefined ? Number(data.tienSon) : 0;
                const tienTbvsNum = data.tienTBVS !== undefined ? Number(data.tienTBVS) : 0;
                const chiPhiGoc = chiPhiGocNum.toLocaleString('vi-VN') + ' đ';
                const nguyenTacPhanBo = data.nguyenTacPhanBo || 'Chưa phân bổ';
                const tienSon = data.tienSon !== undefined ? Number(data.tienSon).toLocaleString('vi-VN') + ' đ' : '0 đ';
                const tienTBVS = data.tienTBVS !== undefined ? Number(data.tienTBVS).toLocaleString('vi-VN') + ' đ' : '0 đ';
                // Xác định icon dựa vào loaiChiPhi
                const loaiChiPhi = (data.loaiChiPhi || 'Kho').toLowerCase();
                const iconLoai = (loaiChiPhi.includes('logistics') || loaiChiPhi.includes('vận')) ? '🚚' : '📦';
                const stylePhanBo = layMauNenPhanBo(nguyenTacPhanBo);
                // 🌟 CỘNG DỒN VÀO TỔNG PHÍ TƯƠNG ỨNG
                if (loaiChiPhi.includes('logistics') || loaiChiPhi.includes('vận')) {
                    tongPhiLogistics += chiPhiGocNum;
                    sonLogistics += tienSonNum;
                    tbvsLogistics += tienTbvsNum;
                } else {
                    tongPhiKho += chiPhiGocNum;
                    sonKho += tienSonNum;
                    tbvsKho += tienTbvsNum;
                }
                // Tạo khung card cho mỗi bản ghi phát sinh
                const cardItem = document.createElement('div');
                cardItem.className = 'card-lich-su-item';
                cardItem.innerHTML = `
                    <div class="card-dong-1" style="position: relative; display: flex; justify-content: space-between; align-items: center;">
                        <span class="ghi-chu">${ghiChu}</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="ngay-phat-sinh">${ngayPhatSinh} ${iconLoai}</span>
                            <!-- Nút 3 chấm -->
                            <button onclick="toggleMenuAction(event, '${docSnap.id}')" style="background: none; border: none; cursor: pointer; font-size: 18px; padding: 0px 0px; font-weight: bold; color: #64748b;" title="Tùy chọn">⋮</button>
                        </div>
                        
                        <!-- Menu 3 chấm dạng Dropdown -->
                        <div id="menu-${docSnap.id}" class="card-menu-dropdown" style="display: none; position: absolute; right: 0; top: 25px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 10; padding: 4px 0;">
                            <div onclick="chuanBiSuaChiPhi('${docSnap.id}', '${encodeURIComponent(JSON.stringify(data))}')" style="padding: 6px 16px; font-size: 13px; cursor: pointer; color: #334155; white-space: nowrap;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">✏️ Sửa</div>
                            <div onclick="xoaChiPhi('${docSnap.id}')" style="padding: 6px 16px; font-size: 13px; cursor: pointer; color: #ef4444; white-space: nowrap;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">🗑️ Xóa</div>
                        </div>
                    </div>
                    <div class="card-dong-2" style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                        <span><strong>${chiPhiGoc}</strong></span>
                        <span style="${stylePhanBo} font-size: 12px; font-weight: 600;">${nguyenTacPhanBo}</span>
                    </div>
                    <div class="card-dong-3">
                        <span>Sơn: ${tienSon}</span>
                        <span>TBVS: ${tienTBVS}</span>
                    </div> `;
                container.appendChild(cardItem); });
                // 🌟 GỌI HÀM CẬP NHẬT BIỂU ĐỒ SAU KHI TÍNH XONG
                if (typeof capNhatBieuDoChiPhiThang === 'function') {
                    capNhatBieuDoChiPhiThang(tongPhiKho, tongPhiLogistics, sonKho, tbvsKho, sonLogistics, tbvsLogistics);
                }
        } catch (error) {
            console.error("Lỗi tải dữ liệu chi phí kho: ", error);
            // Kiểm tra xem lỗi có phải do thiếu Index của Firebase không
            const errorMessage = error.message || "";
            if (errorMessage.includes("index")) {const matchLink = errorMessage.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
                if (matchLink) {const indexUrl = matchLink[0].replace(/['"].*/, '');
                    container.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #b45309; font-size: 13px; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; margin: 10px;">
                            ⚠️ <strong>Thiếu Index trên Firebase!</strong><br> Hệ thống cần tạo cấu trúc sắp xếp để hiển thị dữ liệu.<br><br>
                            <a href="${indexUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                                👉 Bấm vào đây để tạo Index ngay </a> </div> `; return; } }
            // Trường hợp lỗi khác
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444; font-size: 13px;">Lỗi tải dữ liệu từ máy chủ!</div>';}
    }
    // Đóng menu sửa xóa xổ xuống, Bấm bất kỳ đâu ngoài thẻ menu dropdown thì ẩn đi
    document.addEventListener('click', (event) => {if (!event.target.closest('.card-menu-dropdown')) {document.querySelectorAll('.card-menu-dropdown').forEach(menu => {menu.style.display = 'none';}); } });

    // 3. THAO TÁC SỬA / XÓA BẢN GHI
    window.toggleMenuAction = (event, idDoc) => {event.stopPropagation(); document.querySelectorAll('.card-menu-dropdown').forEach(menu => {if (menu.id !== `menu-${idDoc}`) menu.style.display = 'none'; });
        const currentMenu = document.getElementById(`menu-${idDoc}`); currentMenu.style.display = currentMenu.style.display === 'block' ? 'none' : 'block'; };
    window.addEventListener('click', () => { document.querySelectorAll('.card-menu-dropdown').forEach(menu => { menu.style.display = 'none'; }); });
    // XÓA BẢN GHI
    window.xoaChiPhi = async (idDoc) => {
        if (confirm("Bạn có chắc chắn muốn xóa khoản chi phí này không?")) {
            try {
                await deleteDoc(doc(db, "CHIPHI", idDoc)); alert("Đã xóa thành công!");
                const inputThangVal = document.getElementById('inputThangAn').value;
                if (inputThangVal) { const [nam, thang] = inputThangVal.split('-'); 
                    taiDuLieuTheoThang(thang, nam);} 
            } catch (error) {console.error("Lỗi khi xóa: ", error); alert("Xóa thất bại, vui lòng thử lại!"); } } };
    // CHUẨN BỊ SỬA (Đã sửa lại trỏ chuẩn xác đến các ID input của bạn)
    window.chuanBiSuaChiPhi = (idDoc, dataEncoded) => {
        const data = JSON.parse(decodeURIComponent(dataEncoded));
        dangSuaIdDoc = idDoc; // Đánh dấu đang sửa bản ghi có ID này
        // 🌟 Đổ dữ liệu cũ ngược lại form nhập liệu chính đúng theo ID của bạn
        if(document.getElementById('nvNgay')) document.getElementById('nvNgay').value = data.ngayPhatSinh || '';
        if(document.getElementById('nvHangMuc')) {
            document.getElementById('nvHangMuc').value = data.hangMuc || '';
            if(window.tuDongChonTyLeTheoHangMuc) window.tuDongChonTyLeTheoHangMuc(data.hangMuc); }
        if(document.getElementById('nvTongTien')) document.getElementById('nvTongTien').value = data.chiPhiGoc || '';
        if(document.getElementById('nvKieuPhanBo') && data.nguyenTacPhanBo) {
            document.getElementById('nvKieuPhanBo').value = data.nguyenTacPhanBo;
            window.tinhPhanBoNghiepVu(); }
        if(document.getElementById('nvGhiChu')) document.getElementById('nvGhiChu').value = data.ghiChu || '';
        if(document.getElementById('nvPhuongTien') && data.phuongTien) {document.getElementById('nvPhuongTien').value = data.phuongTien;}
        // Đổi hiển thị tên nút Ghi Sổ thành Cập nhật cho trực quan
        const nutBam = document.getElementById('btnLuuNghiepVu');
        if(nutBam) nutBam.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Cập Nhật Lại`;
        // Đóng modal lịch sử lại để user thấy form chính và bấm lưu
        const modalLichSu = document.getElementById('modalLichSu');
        if(modalLichSu) modalLichSu.style.display = 'none';
        // Nhảy qua tab + để chỉnh sửa
        if (typeof chuyenTab === 'function') {chuyenTab('them-moi');
        } else {
            const tabThemMoi = document.querySelector('[data-tab="them-moi"]') || document.getElementById('btnTabThemMoi');
            if (tabThemMoi) {tabThemMoi.click();} }
    };

    // VẼ BIỂU ĐỒ THANH NGANG TỔNG PHÍ
    function capNhatBieuDoChiPhiThang(tongPhiKho, tongPhiLogistics, sonKho, tbvsKho, sonLogistics, tbvsLogistics) {
        const tongCong = tongPhiKho + tongPhiLogistics;
        // 1. Hiển thị text làm tròn đến hàng triệu
        document.getElementById('lblTongCong').innerText = `${Math.round(tongCong / 1000000)} TRIỆU`;
        document.getElementById('lblTongPhiKho').innerText = `${Math.round(tongPhiKho / 1000000)} trđ`;
        document.getElementById('lblTongPhiLogistics').innerText = `${Math.round(tongPhiLogistics / 1000000)} trđ`;
        // Cập nhật chi tiết số tiền Sơn / TBVS bên dưới (có định dạng hoặc làm tròn tùy ý, ở đây mình để hiển thị dạng trđ hoặc số đầy đủ)
        document.getElementById('lblSonKho').innerText = `${Math.round(sonKho / 1000000)} trđ`;
        document.getElementById('lblTbvsKho').innerText = `${Math.round(tbvsKho / 1000000)} trđ`;
        document.getElementById('lblSonLogistics').innerText = `${Math.round(sonLogistics / 1000000)} trđ`;
        document.getElementById('lblTbvsLogistics').innerText = `${Math.round(tbvsLogistics / 1000000)} trđ`;
        // 2. Tỷ lệ % của toàn bộ Kho và Logistics so với Tổng chung
        let phanTramKho = 50;
        let phanTramLogistics = 50;
        if (tongCong > 0) {
            phanTramKho = (tongPhiKho / tongCong) * 100;
            phanTramLogistics = (tongPhiLogistics / tongCong) * 100;}
        document.getElementById('barPhiKho').style.width = phanTramKho + '%';
        document.getElementById('barPhiLogistics').style.width = phanTramLogistics + '%';
        // 3. Tỷ lệ % của Sơn và TBVS bên trong KHO (Tổng Kho = 100%)
        if (tongPhiKho > 0) {
            let pctSonKho = (sonKho / tongPhiKho) * 100;
            let pctTbvsKho = (tbvsKho / tongPhiKho) * 100;
            // Chiều rộng mỗi thanh được phân bổ theo tỷ lệ trên không gian (100% - 4px)
            document.getElementById('subBarKhoSon').style.width = `calc((100% - 8px) * ${pctSonKho / 100})`;
            document.getElementById('subBarKhoTBVS').style.width = `calc((100% - 8px) * ${pctTbvsKho / 100})`;
            document.getElementById('subBarKhoTBVS').style.left = `calc(4px + (100% - 8px) * ${pctSonKho / 100})`;      // Đặt vị trí thanh TBVS nằm sát ngay sau thanh Sơn theo chiều ngang
        } else {
            document.getElementById('subBarKhoSon').style.width = '0%';
            document.getElementById('subBarKhoTBVS').style.width = '0%';}

        // 4. Tỷ lệ % của Sơn và TBVS bên trong LOGISTICS (Tổng Logistics = 100%)
        if (tongPhiLogistics > 0) {
            let pctSonLog = (sonLogistics / tongPhiLogistics) * 100;
            let pctTbvsLog = (tbvsLogistics / tongPhiLogistics) * 100;
            document.getElementById('subBarLogisticsSon').style.width = `calc((100% - 8px) * ${pctSonLog / 100})`;
            document.getElementById('subBarLogisticsTBVS').style.width = `calc((100% - 8px) * ${pctTbvsLog / 100})`;
            // Đặt vị trí thanh TBVS nằm sát ngay sau thanh Sơn
            document.getElementById('subBarLogisticsTBVS').style.left = `calc(4px + (100% - 8px) * ${pctSonLog / 100})`;
        } else {
            document.getElementById('subBarLogisticsSon').style.width = '0%';
            document.getElementById('subBarLogisticsTBVS').style.width = '0%';
        }
    } 
