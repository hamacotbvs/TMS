
    import { collection, query, where, getDocs, getAggregateFromServer, sum } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
    
// Lưu ý: Biến db dùng chung từ window.db đã khởi tạo ở HTML
    const db = window.db;

// CHUYỂN QUA LẠI CÁC TAB
    function switchTab(targetElement, tabId) { 
        document.querySelectorAll('.trang-content').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.MENU-item').forEach(i => i.classList.remove('active')); 
        document.getElementById(tabId).classList.add('active'); 
        if (targetElement) targetElement.classList.add('active');

        // Ép biểu đồ vẽ lại chuẩn kích thước khi quay về tab HOME - BIỂU ĐỒ SẢN LƯỢNG GIAO HÀNG
        if (tabId === 'home' && window.bieuDoSanLuongGiaoHang && Window.bieuDoDoanhThuGiaoHang) {
            setTimeout(() => { 
                window.bieuDoSanLuongGiaoHang.resize(); window.bieuDoSanLuongGiaoHang.update(); 
                window.bieuDoDoanhThuGiaoHang.resize(); window.bieuDoDoanhThuGiaoHang.update();}, 50); } }

        // Lắng nghe sự kiện click
        document.querySelectorAll('.MENU-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const targetBtn = e.currentTarget;
                const tabId = targetBtn.getAttribute('data-tab');
                switchTab(targetBtn, tabId); }); });

// NÚT RESET
    const idNutLamMoi = document.getElementById('NUT-LAM-MOI-APP');
    if (idNutLamMoi) {
        idNutLamMoi.addEventListener('click', () => {
            const iconSvg = idNutLamMoi.querySelector('svg'); 
            if (iconSvg) {iconSvg.style.transform = 'rotate(360deg)'; iconSvg.style.transition = 'transform 0.4s ease';} 
            setTimeout(() => { window.location.reload(); }, 350); });}

// CHỌN NGÀNH
    let nganhHienTai = 'All';   // Biến toàn cục lưu trữ ngành đang chọn để lọc (Mặc định ban đầu là All)
    window.nganhHienTai = nganhHienTai; // Đồng bộ toàn cục nếu cần
    const oChonNganh = document.getElementById('boLocNganh');
    if (oChonNganh) {
        oChonNganh.addEventListener('change', async (e) => {
            nganhHienTai = e.target.value; // Lấy chữ 'TBVS' hoặc 'Sơn' khi chọn
            // Lấy năm đang hiển thị trên màn hình
            window.nganhHienTai = nganhHienTai;
            const txtNam = document.getElementById('hienNam');
            const namHienHanh = txtNam ? parseInt(txtNam.innerText) : new Date().getFullYear();
            console.log(`Bắt đầu lọc theo ngành mới: ${nganhHienTai} cho năm: ${namHienHanh}`); // kiểm tra code đúng chưa, nếu chưa thông báo lỗi trên màn hình để biết lỗi gì
            await taiDuLieuBieuDoSanLuongGiaoHangTuServer(namHienHanh); // Gọi server tải lại theo ngành chọn
            await taiDuLieuBieuDoNhietTuServer(namHienHanh);  }); }   // Gọi server tải lại theo ngành chọn - BIỂU ĐỒ NHIỆT

// CHỌN NGÀY        
    const oChonNgay = document.getElementById('ngayHienHanh');
    const txtNgayThang = document.getElementById('hienNgayThang');
    const txtNam = document.getElementById('hienNam');
    if (oChonNgay && txtNgayThang && txtNam) {
        const homNay = new Date();
        const namGoc = homNay.getFullYear();
        const thangGoc = String(homNay.getMonth() + 1).padStart(2, '0');
        const ngayGoc = String(homNay.getDate()).padStart(2, '0');
        // 1. Gán giá trị gốc vào ô lịch ẩn
        oChonNgay.value = `${namGoc}-${thangGoc}-${ngayGoc}`; 
        // 2. Hiển thị chữ mặc định lên 2 dòng (bỏ số 0 vô nghĩa ở đầu ví dụ: 07/07 thành 7/7)
        txtNgayThang.innerText = `${homNay.getDate()}/${homNay.getMonth() + 1}`;
        txtNam.innerText = namGoc;
        // Tự động chạy tải dữ liệu theo năm hiện hành ngay khi mở app - BIỂU ĐỒ SẢN LƯỢNG GIAO HÀNG
        taiDuLieuBieuDoSanLuongGiaoHangTuServer(namGoc);    // giống như nút START tự động để kích hoạt tất cả các lệnh chạy namGoc
        taiDuLieuBieuDoNhietTuServer(namGoc);               // BIỂU ĐỒ NHIỆT
        // 3. Lắng nghe khi bạn bấm chọn lại ngày khác trên lịch
        oChonNgay.addEventListener('change', (e) => {
            if (!e.target.value) return;
            const ngayDuocChon = new Date(e.target.value);
            const d = ngayDuocChon.getDate();
            const m = ngayDuocChon.getMonth() + 1;
            const y = ngayDuocChon.getFullYear();
            // Cập nhật lại 2 dòng chữ hiển thị mới theo đúng ý bạn
            txtNgayThang.innerText = `${d}/${m}`;
            txtNam.innerText = y;
            // Gọi lại hàm tải dữ liệu với NĂM MỚI vừa chọn - BIỂU ĐỒ SẢN LƯỢNG GIAO HÀNG
            taiDuLieuBieuDoSanLuongGiaoHangTuServer(y);     // giống như nút START tự động để kích hoạt tất cả các lệnh chạy khi năm thay đổi namLoc
            taiDuLieuBieuDoNhietTuServer(y);                // BIỂU ĐỒ NHIỆT
            console.log("Ngày hệ thống nhận:", e.target.value); }); }

// BIỂU ĐỒ SL DT (BIỂU ĐỒ CỘT LỒNG VÀ ĐƯỜNG)
    Chart.register(ChartDataLabels); // Kích hoạt plugin giúp vẽ các nhãn dữ liệu (chữ, số) trực tiếp lên biểu đồ
    // BIỂU ĐỒ SẢN LƯỢNG GIAO HÀNG
    const KhungVeBieuDoSanLuongGiaoHang = document.getElementById('bieuDoSanLuongGiaoHang').getContext('2d');
    const bieuDoSanLuongGiaoHang = new Chart(KhungVeBieuDoSanLuongGiaoHang, {
        type: 'bar',
        data: {
            labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
            datasets: [
                {   label: 'Cột to',                                                                                                            //*** Sửa cột to dưới / cột nhỏ trên
                    data: Array(12).fill(0), // Tạo sẵn 12 mảng dữ liệu ban đầu bằng 0 để chờ đổ dữ liệu từ server vào sau
                    backgroundColor: [], // Sẽ cấp phát mảng màu động ở hàm nạp dữ liệu                                                         //*** Sửa cột to dưới / cột nhỏ trên
                    borderRadius: 4,           // Bo tròn nhẹ 4px ở các góc đỉnh cột
                    borderSkipped: 'bottom',    // Giữ nguyên góc vuông ở đáy cột
                    barPercentage: 0.8,         // Điều chỉnh độ rộng của cột chiếm 80% không gian cho phép
                    categoryPercentage: 0.8,     // Thêm thuộc tính này để tối ưu khoảng cách nhóm         
                    grouped: false,             // Tắt tính năng tự động chia cụm đứng cạnh nhau, ép các cột phải nằm đè, lồng vào nhau
                    order: 3,                   // Thứ tự vẽ dưới cùng (vẽ trước) để cột khác có thể đè lên
                    datalabels: { display: false } },
                {   label: 'Cột nhở',                                                                                                           //*** Sửa cột to dưới / cột nhỏ trên
                    data: Array(12).fill(0), 
                    backgroundColor: [],                                                                                                        //*** Sửa cột to dưới / cột nhỏ trên
                    borderRadius: 4,            
                    borderSkipped: 'bottom',    
                    barPercentage: 0.6,         // Nhỏ hơn cột xanh để nằm lọt lòng bên trong
                    categoryPercentage: 0.8,     // Đồng bộ với cột xanh        
                    grouped: false, 
                    rder: 2,
                    datalabels: { display: false } },
                {   label: 'Tổng', 
                    data: Array(12).fill(0), 
                    type: 'line',           // Chuyển riêng lớp này thành biểu đồ đường
                    borderColor: '#f1c40f',     
                    backgroundColor: '#f1c40f', 
                    borderWidth: 1, 
                    tension: 0,           // Đường kẻ thăng gãy khúc vuông vắn, không uốn cong    
                    pointRadius: 0,         // Ẩn các chấm tròn tại các nút giao dữ liệu          
                    pointHoverRadius: 0,        
                    fill: false,            // Không đổ màu vùng dưới đường kẻ
                    rder: 1,
                    datalabels: { display: false } } ] },
        // Cấu hình Hiển thị và Tương tác (Options)
        options: { 
            responsive: true,                   // Giúp biểu đồ tự động co giãn vừa vặn khi xoay ngang/dọc màn hình điện thoại
            maintainAspectRatio: false,         // Giúp biểu đồ tự động co giãn vừa vặn khi xoay ngang/dọc màn hình điện thoại
            plugins: {
                datalabels: { display: false },
                legend: {                        // Định dạng hộp ghi chú (Tổng, Gửi chành, Giao hàng) nằm ở trên cùng (top) sử dụng biểu tượng hình chữ nhật bo góc (rectRounded).
                    position: 'top',
                    labels: {
                        usePointStyle: true,    
                        pointStyle: 'rectRounded',
                        font: { size: 12, weight: '500', family: 'Roboto' },
                        padding: 10,            // Khoảng cách giữa tiêu đề và chú thích
                        // Mẹo nhỏ: Ép phần chú thích hiển thị đúng 3 nhãn chuẩn ban đầu của bạn thay vì hiện chữ "Cột To", "Cột Nhỏ"       //*** Sửa cột to dưới / cột nhỏ trên
                        generateLabels: function(chart) {
                            return [
                                { text: 'Tổng', fillStyle: '#f1c40f', strokeStyle: '#f1c40f', pointStyle: 'rectRounded', fontColor: '#666' },
                                { text: 'Giao hàng', fillStyle: '#3498db', strokeStyle: '#3498db', pointStyle: 'rectRounded', fontColor: '#666' },
                                { text: 'Gửi chành', fillStyle: '#e74c3c', strokeStyle: '#e74c3c', pointStyle: 'rectRounded', fontColor: '#666' }
                            ]; } } },
                tooltip: { enabled: false } },     // Không hiện dữ liệu khi click chuột vào cột
            // Định dạng trục tọa độ (Scales)
            scales: { 
                x: {
                    grid: { display: false },  // Ẩn các đường lưới dọc kẻ xuống
                    ticks: { color: '#94a3b8', font: { size: 12 } } },
                y: {
                    beginAtZero: true,          // Trục Y luôn bắt đầu từ số 0
                    grid: { color: '#f0f2f5' }, // Tạo đường lưới ngang màu xám nhạt
                    grace: '25%',               // Tạo khoảng trống 35% ở trên đỉnh biểu đồ để lấy chỗ viết chữ
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 12 },
                        callback: function(value) {
                            return (value / 1000).toLocaleString('vi-VN') + 'T'; } } } } }, // Đổi kg thành đơn vị Tấn (T) để hiển thị ở trục dọc
        // Ghi chú dữ liệu của cột trên đầu
        plugins: [{
            id: 'customDatalabelsColors',
            afterDatasetsDraw(chart) {
                const { ctx: KhungVeBieuDoSanLuongGiaoHang } = chart;
                const meta = chart.getDatasetMeta(0);        // Lấy tọa độ pixel theo cột gốc
                meta.data.forEach((element, index) => {
                    const vTongTai = chart.data.datasets[2].data[index] || 0;
                    if (vTongTai === 0) return; 
                    // Lấy lại giá trị thật từ mảng lưu trữ gốc (ta sẽ xử lý lưu ở hàm dưới)
                    const vGiaoHang = bieuDoSanLuongGiaoHang.giaoHangGoc[index] || 0;
                    const vGuiChanh = bieuDoSanLuongGiaoHang.guiChanhGoc[index] || 0;
                    // Xử lý làm tròn hoặc giữ số thập phân tùy thuộc giá trị lớn/nhỏ hơn 1
                    // Đổi chia 1000 sang giá trị số gốc trước
                    const nTong  = vTongTai / 1000;
                    const nGiao  = vGiaoHang / 1000;
                    const nChanh = vGuiChanh / 1000;
                    // Logic check: Nếu >= 1 thì làm tròn (Math.round), ngược lại (< 1) thì lấy 1 chữ số thập phân
                    const tTong  = nTong >= 1 ? Math.round(nTong) : nTong.toFixed(1);
                    const tGiao  = nGiao >= 1 ? Math.round(nGiao) : nGiao.toFixed(1);
                    const tChanh = nChanh >= 1 ? Math.round(nChanh) : nChanh.toFixed(1);
                    const x = element.x;
                    let y = element.y - 36; // Vị trí xuất phát của dòng đầu tiên (cách đỉnh cột 36px)
                    // Tiến hành viết chữ số tấn thủ công lên màn hình
                    KhungVeBieuDoSanLuongGiaoHang.save();
                    KhungVeBieuDoSanLuongGiaoHang.font = 'bold 10px Roboto, sans-serif';
                    KhungVeBieuDoSanLuongGiaoHang.textAlign = 'center';
                    KhungVeBieuDoSanLuongGiaoHang.textBaseline = 'middle';
                    // Dòng 1: Tổng tải (Vàng)
                    KhungVeBieuDoSanLuongGiaoHang.fillStyle = '#d4ac0d';
                    KhungVeBieuDoSanLuongGiaoHang.fillText(tTong, x, y);
                    // Dòng 2: Giao hàng (Xanh) (nằm thấp hơn dòng 1 là 12px)
                    KhungVeBieuDoSanLuongGiaoHang.fillStyle = '#3498db';
                    KhungVeBieuDoSanLuongGiaoHang.fillText(tGiao, x, y + 12);
                    // Dòng 3: Gửi chành (Đỏ) (nằm thấp hơn dòng 1 là 24px)
                    KhungVeBieuDoSanLuongGiaoHang.fillStyle = '#e74c3c';
                    KhungVeBieuDoSanLuongGiaoHang.fillText(tChanh, x, y + 24);
                    KhungVeBieuDoSanLuongGiaoHang.restore(); }); } }]
    });
    // BIỂU ĐỒ DOANH THU GIAO HÀNG
    const KhungVeBieuDoDoanhThuGiaoHang = document.getElementById('bieuDoDoanhThuGiaoHang').getContext('2d');
    const bieuDoDoanhThuGiaoHang = new Chart(KhungVeBieuDoDoanhThuGiaoHang, {
        type: 'bar',
        data: {
            labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
            datasets: [
                {   label: 'Cột to', 
                    data: Array(12).fill(0), // Tạo sẵn 12 mảng dữ liệu ban đầu bằng 0 để chờ đổ dữ liệu từ server vào sau
                    backgroundColor: [], 
                    borderRadius: 4,           // Bo tròn nhẹ 4px ở các góc đỉnh cột
                    borderSkipped: 'bottom',    // Giữ nguyên góc vuông ở đáy cột
                    barPercentage: 0.8,         // Điều chỉnh độ rộng của cột chiếm 80% không gian cho phép
                    categoryPercentage: 0.8,     // Thêm thuộc tính này để tối ưu khoảng cách nhóm         
                    grouped: false,             // Tắt tính năng tự động chia cụm đứng cạnh nhau, ép các cột phải nằm đè, lồng vào nhau
                    order: 3,                   // Thứ tự vẽ dưới cùng (vẽ trước) để cột khác có thể đè lên
                    datalabels: { display: false } },
                {   label: 'Cột nhở', 
                    data: Array(12).fill(0), 
                    backgroundColor: [], 
                    borderRadius: 4,            
                    borderSkipped: 'bottom',    
                    barPercentage: 0.7,         // Nhỏ hơn cột xanh để nằm lọt lòng bên trong
                    categoryPercentage: 0.8,     // Đồng bộ với cột xanh        
                    grouped: false, 
                    rder: 2,
                    datalabels: { display: false } },
                {   label: 'Tổng', 
                    data: Array(12).fill(0), 
                    type: 'line',           // Chuyển riêng lớp này thành biểu đồ đường
                    borderColor: '#f1c40f',     
                    backgroundColor: '#f1c40f', 
                    borderWidth: 1, 
                    tension: 0,           // Đường kẻ thăng gãy khúc vuông vắn, không uốn cong    
                    pointRadius: 0,         // Ẩn các chấm tròn tại các nút giao dữ liệu          
                    pointHoverRadius: 0,        
                    fill: false,            // Không đổ màu vùng dưới đường kẻ
                    rder: 1,
                    datalabels: { display: false } } ] },
        // Cấu hình Hiển thị và Tương tác (Options)
        options: { 
            responsive: true,                   // Giúp biểu đồ tự động co giãn vừa vặn khi xoay ngang/dọc màn hình điện thoại
            maintainAspectRatio: false,         // Giúp biểu đồ tự động co giãn vừa vặn khi xoay ngang/dọc màn hình điện thoại
            plugins: {
                datalabels: { display: false },
                legend: {                        // Định dạng hộp ghi chú (Tổng, Gửi chành, Giao hàng) nằm ở trên cùng (top) sử dụng biểu tượng hình chữ nhật bo góc (rectRounded).
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        font: { size: 12, weight: '500', lineHeight: 1.1, family: 'Roboto'},
                        padding: 10,
                        // Mẹo nhỏ: Ép phần chú thích hiển thị đúng 3 nhãn chuẩn ban đầu của bạn thay vì hiện chữ "Cột To", "Cột Nhỏ"       //*** Sửa cột to dưới / cột nhỏ trên
                        generateLabels: function(chart) {
                            return [
                                { text: 'Tổng', fillStyle: '#f1c40f', strokeStyle: '#f1c40f', pointStyle: 'rectRounded', fontColor: '#666' },
                                { text: 'Giao hàng', fillStyle: '#3498db', strokeStyle: '#3498db', pointStyle: 'rectRounded', fontColor: '#666' },
                                { text: 'Gửi chành', fillStyle: '#e74c3c', strokeStyle: '#e74c3c', pointStyle: 'rectRounded', fontColor: '#666' }
                            ]; } } },
                tooltip: { enabled: false } },     // Không hiện dữ liệu khi click chuột vào cột
            // Định dạng trục tọa độ (Scales)
            scales: { 
                x: {
                    grid: { display: false },  // Ẩn các đường lưới dọc kẻ xuống
                    ticks: { color: '#94a3b8', font: { size: 12 } } },
                y: {
                    beginAtZero: true,          // Trục Y luôn bắt đầu từ số 0
                    grid: { color: '#f0f2f5' }, // Tạo đường lưới ngang màu xám nhạt
                    grace: '25%',               // Tạo khoảng trống 35% ở trên đỉnh biểu đồ để lấy chỗ viết chữ
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 12 },
                        callback: function(value) {
                            return (value / 1000000).toLocaleString('vi-VN') + 'Tr'; } } } } }, // Định dạng hiển thị thành Triệu (Tr)
        // Ghi chú dữ liệu của cột trên đầu
        plugins: [{
            id: 'customDatalabelsDoanhThuGiaoHang',
            afterDatasetsDraw(chart) {
                const { ctx: KhungVeBieuDoDoanhThuGiaoHang } = chart;
                const meta = chart.getDatasetMeta(0);        // Lấy tọa độ pixel theo cột gốc
                meta.data.forEach((element, index) => {
                    const vTongTai = chart.data.datasets[2].data[index] || 0;
                    if (vTongTai === 0) return; 
                    // Chia cho 1 triệu và làm tròn thành số nguyên ngay lập tức, sau đó định dạng dấu chấm
                    const tTongTai = Math.round(vTongTai / 1000000).toLocaleString('vi-VN');
                    const tGiao = Math.round((bieuDoDoanhThuGiaoHang.giaoHangDTGoc[index] || 0) / 1000000).toLocaleString('vi-VN');
                    const tChanh = Math.round((bieuDoDoanhThuGiaoHang.guiChanhDTGoc[index] || 0) / 1000000).toLocaleString('vi-VN');
                    const x = element.x;
                    let y = element.y - 36; // Vị trí xuất phát của dòng đầu tiên (cách đỉnh cột 36px)
                    // Tiến hành viết chữ số tấn thủ công lên màn hình
                    KhungVeBieuDoDoanhThuGiaoHang.save();
                    KhungVeBieuDoDoanhThuGiaoHang.font = 'bold 10px Roboto, sans-serif';
                    KhungVeBieuDoDoanhThuGiaoHang.textAlign = 'center';
                    KhungVeBieuDoDoanhThuGiaoHang.textBaseline = 'middle';
                    // Dòng 1: Tổng tải (Vàng)
                    KhungVeBieuDoDoanhThuGiaoHang.fillStyle = '#d4ac0d';
                    KhungVeBieuDoDoanhThuGiaoHang.fillText(tTongTai, x, y);
                    // Dòng 2: Giao hàng (Xanh) (nằm thấp hơn dòng 1 là 12px)
                    KhungVeBieuDoDoanhThuGiaoHang.fillStyle = '#3498db';
                    KhungVeBieuDoDoanhThuGiaoHang.fillText(tGiao, x, y + 12);
                    // Dòng 3: Gửi chành (Đỏ) (nằm thấp hơn dòng 1 là 24px)
                    KhungVeBieuDoDoanhThuGiaoHang.fillStyle = '#e74c3c';
                    KhungVeBieuDoDoanhThuGiaoHang.fillText(tChanh, x, y + 24);
                    KhungVeBieuDoDoanhThuGiaoHang.restore(); }); }}]
    });
// DỮ LIỆU CHO BIỂU ĐỒ SL DT
    // HÀM TẢI DỮ LIỆU TỪ SERVER FIRE
    async function taiDuLieuBieuDoSanLuongGiaoHangTuServer(namLoc) {
        try {
            // 1. Tự động đổi tên tiêu đề biểu đồ theo năm được chọn
            const tieuDeSLGH = document.getElementById('tieuDeBieuDoSanLuongGiaoHang'); if (tieuDeSLGH) tieuDeSLGH.innerText = `Sản lượng giao hàng năm ${namLoc}`; // Tiêu đề Sản lượng giao hàng
            const tieuDeDTGH = document.getElementById('tieuDeBieuDoDoanhThuGiaoHang'); if (tieuDeDTGH) tieuDeDTGH.innerText = `Doanh thu giao hàng năm ${namLoc}`; // Tiêu đề Doanh thu giao hàng
            // 2. Hiện lại khung Loading trong lúc đợi server phản hồi dữ liệu mới
            const oLoading = document.getElementById('loading'); if (oLoading) {oLoading.innerHTML = `<i class="fa-solid fa-spinner"></i> Đang kết nối dữ liệu từ server...`;oLoading.style.display = 'flex';}
            const thamChieuTuyenDuong = collection(db, "TUYENDUONG"); // Kết nối tới bảng dữ liệu tên là TUYENDUONG trên Cloud Firestore
            // Mảng sản lượng giao hàng
            let mangGiaoHangSLGH = Array(12).fill(0);
            let mangGuiChanhSLGH = Array(12).fill(0);
            let mangTongTaiSLGH = Array(12).fill(0);
            // Mảng doanh thu giao hàng
            let mangGiaoHangDTGH = Array(12).fill(0);
            let mangGuiChanhDTGH = Array(12).fill(0);
            let mangTongTaiDTGH = Array(12).fill(0);
            const cacYeuCauTinhToanSanLuongGiaoHang = [];
            for (let thang = 1; thang <= 12; thang++) {
                // --- ⚙️ KHỞI TẠO ĐIỀU KIỆN LỌC CƠ BẢN ---
                let dieuKienGiaoHang = [
                    where("nam", "==", namLoc),
                    where("duyet", "in", ["Đã xuất kho", "Đã giao hàng"]),
                    where("thang", "==", thang),
                    where("htGiaoNhan", "==", "Giao hàng") ];
                let dieuKienGuiChanh = [
                    where("nam", "==", namLoc),
                    where("duyet", "in", ["Đã xuất kho", "Đã giao hàng"]),
                    where("thang", "==", thang),
                    where("htGiaoNhan", "==", "Gửi chành") ];
                // --- 🔴 ĐOẠN LỌC NGÀNH SIÊU GỌN MỚI THÊM VÀO ---
                if (nganhHienTai !== "All") {
                    dieuKienGiaoHang.push(where("nganh", "==", nganhHienTai));
                    dieuKienGuiChanh.push(where("nganh", "==", nganhHienTai)); }
                // Tiến hành tạo câu lệnh query hoàn chỉnh gửi lên Firebase
                const qGiaoHang = query(thamChieuTuyenDuong, ...dieuKienGiaoHang);
                const qGuiChanh = query(thamChieuTuyenDuong, ...dieuKienGuiChanh);
                // Gom lệnh tính tổng Giao hàng gửi lên Server
                cacYeuCauTinhToanSanLuongGiaoHang.push(
                    getAggregateFromServer(qGiaoHang, { tongTai: sum('tTai'), tongTien: sum('thanhTien') }).then(res => {   // Sử dụng hàm tính tổng (sum) cả tTai và thanhTien trực tiếp từ Server để giảm tải dung lượng mạng
                        mangGiaoHangSLGH[thang - 1] = res.data().tongTai || 0;
                        mangGiaoHangDTGH[thang - 1] = res.data().tongTien || 0; }) );
                // Gom lệnh tính tổng Gửi chành gửi lên Server
                cacYeuCauTinhToanSanLuongGiaoHang.push(
                    getAggregateFromServer(qGuiChanh, { tongTai: sum('tTai'), tongTien: sum('thanhTien') }).then(res => {
                        mangGuiChanhSLGH[thang - 1] = res.data().tongTai || 0;
                        mangGuiChanhDTGH[thang - 1] = res.data().tongTien || 0; }) ); }
            // Gửi gộp tất cả yêu cầu lên server cùng một lúc
            await Promise.all(cacYeuCauTinhToanSanLuongGiaoHang);
            // Sau khi có dữ liệu Giao hàng/Gửi chành, cộng dồn lại để ra mảng Tổng tải (Màu Vàng)
            for (let i = 0; i < 12; i++) {
                mangTongTaiSLGH[i] = mangGiaoHangSLGH[i] + mangGuiChanhSLGH[i];
                mangTongTaiDTGH[i] = mangGiaoHangDTGH[i] + mangGuiChanhDTGH[i]; }
            // Cập nhật mảng dữ liệu mới chạy vào biểu đồ và vẽ lại - BIỂU ĐỒ SẢN LƯỢNG GIAO HÀNG
            // --- ĐOẠN XỬ LÝ ĐỘNG: CỘT CAO NẰM DƯỚI, CỘT THẤP NẰM TRÊN ---
            let mangToData = Array(12).fill(0);
            let mangToColor = Array(12).fill('#3498db'); // Mặc định xanh
            let mangNhoData = Array(12).fill(0);
            let mangNhoColor = Array(12).fill('#e74c3c'); // Mặc định đỏ
            for (let i = 0; i < 12; i++) {
                let giao = mangGiaoHangSLGH[i];
                let chanh = mangGuiChanhSLGH[i];
                if (giao >= chanh) {
                    // Nếu Giao hàng lớn hơn hoặc bằng Gửi chành
                    mangToData[i] = giao;
                    mangToColor[i] = '#3498db'; // Cột to màu xanh (Giao hàng)
                    mangNhoData[i] = chanh;
                    mangNhoColor[i] = '#e74c3c'; // Cột nhỏ màu đỏ (Gửi chành) nằm trong
                } else {
                    // Ngược lại nếu Gửi chành lớn hơn Giao hàng (Ví dụ như tháng 2 của bạn)
                    mangToData[i] = chanh;
                    mangToColor[i] = '#e74c3c'; // Cột to đổi sang màu đỏ (Gửi chành) nằm dưới
                    mangNhoData[i] = giao;
                    mangNhoColor[i] = '#3498db'; } } // Cột nhỏ đổi sang màu xanh (Giao hàng) lọt lòng bên trong
            // Lưu trữ tạm mảng gốc vào biến để plugin vẽ chữ số Tấn đọc chính xác số liệu
            bieuDoSanLuongGiaoHang.giaoHangGoc = mangGiaoHangSLGH;
            bieuDoSanLuongGiaoHang.guiChanhGoc = mangGuiChanhSLGH;
            // Nạp các mảng động vừa tính toán vào biểu đồ
            bieuDoSanLuongGiaoHang.data.datasets[0].data = mangToData;
            bieuDoSanLuongGiaoHang.data.datasets[0].backgroundColor = mangToColor;
            bieuDoSanLuongGiaoHang.data.datasets[1].data = mangNhoData;
            bieuDoSanLuongGiaoHang.data.datasets[1].backgroundColor = mangNhoColor;
            bieuDoSanLuongGiaoHang.data.datasets[2].data = mangTongTaiSLGH;
            bieuDoSanLuongGiaoHang.update();        // Cập nhật hiển thị biểu đồ
            // Cập nhật mảng dữ liệu mới chạy vào biểu đồ và vẽ lại - BIỂU ĐỒ DOANH THU GIAO HÀNG
            // --- ĐOẠN XỬ LÝ ĐỘNG: CỘT CAO NẰM DƯỚI, CỘT THẤP NẰM TRÊN ---
            let mangToDataDT = Array(12).fill(0);
            let mangToColorDT = Array(12).fill('#3498db'); // Mặc định xanh
            let mangNhoDataDT = Array(12).fill(0);
            let mangNhoColorDT = Array(12).fill('#e74c3c'); // Mặc định đỏ
            for (let i = 0; i < 12; i++) {
                let giao = mangGiaoHangDTGH[i];
                let chanh = mangGuiChanhDTGH[i];
                if (giao >= chanh) {
                    // Nếu Giao hàng lớn hơn hoặc bằng Gửi chành
                    mangToDataDT[i] = giao; mangToColorDT[i] = '#3498db'; // Cột to màu xanh (Giao hàng)
                    mangNhoDataDT[i] = chanh; mangNhoColorDT[i] = '#e74c3c'; // Cột nhỏ màu đỏ (Gửi chành) nằm trong
                } else {
                    // Ngược lại nếu Gửi chành lớn hơn Giao hàng (Ví dụ như tháng 2 của bạn)
                    mangToDataDT[i] = chanh; mangToColorDT[i] = '#e74c3c'; // Cột to đổi sang màu đỏ (Gửi chành) nằm dưới
                    mangNhoDataDT[i] = giao; mangNhoColorDT[i] = '#3498db'; } } // Cột nhỏ đổi sang màu xanh (Giao hàng) lọt lòng bên trong
            // Lưu trữ tạm mảng gốc vào biến để plugin vẽ chữ số Tấn đọc chính xác số liệu
            bieuDoDoanhThuGiaoHang.giaoHangDTGoc = mangGiaoHangDTGH;
            bieuDoDoanhThuGiaoHang.guiChanhDTGoc = mangGuiChanhDTGH;
            // Nạp các mảng động vừa tính toán vào biểu đồ
            bieuDoDoanhThuGiaoHang.data.datasets[0].data = mangToDataDT;
            bieuDoDoanhThuGiaoHang.data.datasets[0].backgroundColor = mangToColorDT;
            bieuDoDoanhThuGiaoHang.data.datasets[1].data = mangNhoDataDT;
            bieuDoDoanhThuGiaoHang.data.datasets[1].backgroundColor = mangNhoColorDT;
            bieuDoDoanhThuGiaoHang.data.datasets[2].data = mangTongTaiDTGH;
            bieuDoDoanhThuGiaoHang.update();        // Cập nhật hiển thị biểu đồ
            // Ẩn dòng chữ "Đang tải dữ liệu..." đi vì đã tải xong
            if (oLoading) oLoading.style.display = 'none';
        // Có nhiệm vụ bắt lỗi. Nếu thiếu phân chỉ mục dữ liệu (Index) của Firebase, phần này sẽ hiển thị một đường link màu xanh hướng dẫn bạn click vào để tạo Index
        } catch (e) { 
            console.error("Lỗi đầy đủ:", e);
            let linkIndex = "";
            if (e.message && e.message.includes("https://")) {
                const match = e.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                if (match) linkIndex = match[0];}
            const oLoading = document.getElementById('loading');
            if (oLoading) {
                if (linkIndex) {
                    oLoading.innerHTML = `<span style="color:red; font-weight:bold;">Lỗi thiếu Index! Bấm vào đây để tạo:</span> <br><br> 
                                            <a href="${linkIndex}" target="_blank" style="color:#0082C8; text-decoration:underline; font-weight:bold; word-break:break-all;">Link tạo Index tự động</a>`;
                } else {
                    oLoading.innerHTML = `<span style="color:red;">Lỗi kết nối: ${e.message}</span>`;}}}
    }
// DỮ LIỆU BIỂU ĐỒ NHIỆT SL
    // HÀM TẢI DỮ LIỆU BIỂU ĐỒ NHIỆT (TÍNH TOÁN 100% TRÊN SERVER)
    let bieuDoNhietVungTieuThu = null
    let bieuDoNhietVungDoanhThu = null;
    async function taiDuLieuBieuDoNhietTuServer(namLoc) {
        try {
            // Cập nhật tiêu đề động theo năm chọn
            const tieuDeNhiet = document.getElementById('tieuDeNhiet');
            if (tieuDeNhiet) tieuDeNhiet.innerText = `Sản lượng giao hàng theo vùng năm ${namLoc} (Tấn)`;
            const tieuDeNhietDT = document.getElementById('tieuDeNhietDT');
            if (tieuDeNhietDT) tieuDeNhietDT.innerText = `Doanh thu giao hàng theo vùng năm ${namLoc} (Triệu đồng)`;
            // 🌟 KHAI BÁO CỐ ĐỊNH DANH SÁCH TRỤC Y (Bạn tùy ý đổi tên hoặc thêm bớt Tỉnh thành ở đây)
            const mangCacVungCoDinh = [
                "Cần Thơ", 
                "Kiên Giang", 
                "An Giang", 
                "Đồng Tháp",
                "Long An",
                "Hậu Giang", 
                "Sóc Trăng",
                "Tiền Giang",
                "Trà Vinh",
                "Cà Mau",  
                "Bến Tre",
                "",
                "Phú Quốc",
                "Vĩnh Long",
                "Bạc Liêu",]
            const thamChieuTuyenDuong = collection(db, "TUYENDUONG");
            const cacYeuCauTinhToanNhiet = [];
            let dataMatrixSL = [];
            let dataMatrixDT = []; // <-- THÊM MỚI
            let maxSanLuong = 0;
            let maxDoanhThu = 0;  // <-- THÊM MỚI
            // Tạo một cấu trúc lưu trữ tạm thời để gom dữ liệu bất đồng bộ
            let ketQuaTamSL = {}; // <-- Đổi tên từ ketQuaTam
            let ketQuaTamDT = {}; // <-- THÊM MỚI
            mangCacVungCoDinh.forEach(vung => {
                ketQuaTamSL[vung] = Array(13).fill(0); 
                ketQuaTamDT[vung] = Array(13).fill(0); });
            // 2. CHẠY VÒNG LẶP QUÉT QUA TỪNG VÙNG VÀ TỪNG THÁNG (Gửi lệnh gộp lên Server)
            mangCacVungCoDinh.forEach((vung) => {
                for (let thang = 1; thang <= 12; thang++) {
                    // Cấu hình bộ lọc đồng bộ chuẩn với Firestore thực tế của bạn
                    let dieuKienLoc = [
                        where("nam", "==", Number(namLoc)),
                        where("duyet", "in", ["Đã xuất kho", "Đã giao hàng"]),
                        where("thang", "==", thang),
                        where("vungTieuThu", "==", vung), // Thêm bộ lọc Vùng
                        where("htGiaoNhan", "==", "Giao hàng")];
                    if (nganhHienTai !== "All") {dieuKienLoc.push(where("nganh", "==", nganhHienTai));} // Bộ lọc ngành siêu gọn động Sơn / TBVS / All
                    const qLocNhiet = query(thamChieuTuyenDuong, ...dieuKienLoc);   // Tạo câu lệnh truy vấn hoàn chỉnh gửi lên Firebase
                    // Gửi lệnh tính tổng gộp (tTai) trực tiếp lên Server Firebase
                    cacYeuCauTinhToanNhiet.push(
                        getAggregateFromServer(qLocNhiet, { 
                            tongSlanLuong: sum('tTai'),
                            tongDoanhThu: sum('thanhTien')
                        }).then(res => {
                            const dataRes = res.data();
                            const kgDauVao = dataRes.tongSlanLuong || 0;
                            ketQuaTamSL[vung][thang] = kgDauVao / 1000; 
                            const dongDauVao = dataRes.tongDoanhThu || 0;
                            ketQuaTamDT[vung][thang] = dongDauVao / 1000000; }) ); } });
            // Đợi Server xử lý đồng loạt xong toàn bộ các ô ma trận
            await Promise.all(cacYeuCauTinhToanNhiet);
            // Định dạng cấu trúc dữ liệu phẳng cho Plugin Matrix và tìm đỉnh sản lượng cao nhất
            mangCacVungCoDinh.forEach((vung) => {
                for (let t = 1; t <= 12; t++) {
                    // Cho sản lượng
                    const giaTriTan = ketQuaTamSL[vung][t];
                    if (giaTriTan > maxSanLuong) maxSanLuong = giaTriTan;
                    dataMatrixSL.push({ x: String(t), y: vung, v: giaTriTan }); 

                    // THÊM: Cho doanh thu
                    const giaTriTrieu = ketQuaTamDT[vung][t];
                    if (giaTriTrieu > maxDoanhThu) maxDoanhThu = giaTriTrieu;
                    dataMatrixDT.push({ x: String(t), y: vung, v: giaTriTrieu }); }  });
            // Vẽ hoặc cập nhật biểu đồ nhiệt lên màn hình
            veBieuDoNhietSlanLuong(dataMatrixSL, mangCacVungCoDinh, maxSanLuong);
            veBieuDoNhietDoanhThu(dataMatrixDT, mangCacVungCoDinh, maxDoanhThu); // <-- THÊM MỚI
        } catch (e) { 
            console.error("Lỗi đồng bộ biểu đồ nhiệt từ Server:", e);
            // Đoạn bẫy link tạo Index tự động nếu Firebase yêu cầu
            let linkIndex = "";
            if (e.message && e.message.includes("https://")) {
                const match = e.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                if (match) linkIndex = match[0];}
            const oLoading = document.getElementById('loading');
            if (oLoading && linkIndex) {
                oLoading.innerHTML = `<span style="color:red; font-weight:bold;">Lỗi thiếu Index biểu đồ nhiệt! Click vào để sửa:</span> <br><br> 
                                    <a href="${linkIndex}" target="_blank" style="color:#0082C8; text-decoration:underline; font-weight:bold;">Link tạo Index tự động</a>`;
                oLoading.style.display = 'flex';} }
    }
// BIỂU ĐỒ NHIỆT SL
    // KHỞI TẠO CẤU HÌNH BIỂU ĐỒ SL (Hàm chịu trách nhiệm dựng hình ô vuông, căn chỉnh tọa độ trục và đổ màu gradient xanh dương đồng bộ)
    function veBieuDoNhietSlanLuong(dataMatrix, danhSachVungY, maxSanLuong) {
        const canvasElement = document.getElementById('bieuDoNhietVung');
        if (!canvasElement) return;
        const ctx = canvasElement.getContext('2d');
        if (bieuDoNhietVungTieuThu) {bieuDoNhietVungTieuThu.destroy(); }    // Nếu biểu đồ đã tồn tại trước đó, xóa đi để vẽ lại dữ liệu mới tránh bị đè chèn
        bieuDoNhietVungTieuThu = new Chart(ctx, {
            type: 'matrix',
            data: {
                datasets: [{
                    label: 'Sản lượng theo vùng (Tấn)',
                    data: dataMatrix,
                    // Định hình kích thước ô vuông nhiệt
                    width: ({chart}) => chart.chartArea ? (chart.chartArea.width / 12) - 2 : 0,
                    height: ({chart}) => chart.chartArea ? (chart.chartArea.height / (danhSachVungY.length || 1)) - 2 : 0,
                    // Hàm đổ màu động: Ô nào sản lượng càng cao thì màu xanh càng đậm theo tỉ lệ sản lượng / maxSanLuong
                    backgroundColor(context) {
                        const item = context.raw;
                        const value = item ? item.v : 0;
                        // 1. Nếu không có sản lượng (bằng 0), trả về màu xám cực nhạt (Ô trống)
                        if (value === 0) return '#f8fafc'; 
                        // 2. Tính tỉ lệ phần trăm sản lượng (Giá trị từ 0 đến 1)
                        const ratio = Math.min(value / (maxSanLuong || 1), 1); 
                        let r, g, b;
                        // 3. THUẬT TOÁN PHÂN CHIA PHÂN ĐOẠN MÀU THEO MỐC % CỦA BẠN
                        if (ratio >= 0.25) {
                            // PHÂN ĐOẠN 1: Từ 25% (Vàng) đến 100% (Xanh đậm)
                            // Nội suy tuyến tính tỉ lệ nằm trong khoảng [0.25 -> 1.0] thành [0.0 -> 1.0]
                            const p = (ratio - 0.25) / (1.0 - 0.25); 
                            // Vàng chanh nhẹ: rgb(241, 220, 100) | Xanh Navy: rgb(41, 128, 185)
                            r = Math.round(241 + (41 - 241) * p);
                            g = Math.round(220 + (128 - 220) * p);
                            b = Math.round(100 + (185 - 100) * p); } 
                        else if (ratio >= 0.05 && ratio < 0.25) {
                            // PHÂN ĐOẠN 2: Từ 5% (Đỏ nhạt/Cam pastel) đến 25% (Vàng chanh)
                            // Nội suy tuyến tính tỉ lệ nằm trong khoảng [0.05 -> 0.25] thành [0.0 -> 1.0]
                            const p = (ratio - 0.05) / (0.25 - 0.05); 
                            // Đỏ nhạt/Cam pastel dịu: rgb(240, 140, 130) | Vàng chanh: rgb(241, 220, 100)
                            r = Math.round(240 + (241 - 240) * p);
                            g = Math.round(140 + (220 - 140) * p);
                            b = Math.round(130 + (100 - 130) * p); } 
                        else {
                            // PHÂN ĐOẠN YẾU: Dưới 5% sản lượng, khóa ở màu đỏ pastel nhạt (Soft Red) cho đỡ nhức mắt
                            r = 245; 
                            g = 160;
                            b = 150;}
                        // Giữ độ hiển thị màu vừa phải (Alpha 0.85 giúp màu dịu và tôn chữ số lên rõ hơn)
                        const alpha = 0.85; 
                        return `rgba(${r}, ${g}, ${b}, ${alpha})`; },
                    // Bo góc nhẹ cho các ô nhiệt nhìn hiện đại
                    borderRadius: 2 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // 🌟 BẠN CHÈN ĐÚNG ĐOẠN ONCLICK NÀY VÀO TRONG OPTIONS:
                    onClick: (event, elements, chartInstance) => {
                        const khuVucHienThi = document.getElementById('khuVucBieuDoKhachHang');
                        // Trường hợp 1: Có click trúng phần tử (ô vuông) trên biểu đồ
                        if (elements && elements.length > 0) {
                            const firstElement = elements[0];
                            const datasetIndex = firstElement.datasetIndex;
                            const elementIndex = firstElement.index;
                            const currentChart = chartInstance || firstElement.element.$context.chart;
                            const dataPoint = currentChart.data.datasets[datasetIndex].data[elementIndex];
                            // Nếu ô click vào có sản lượng thực tế > 0
                            if (dataPoint && dataPoint.v > 0) {
                                const thangDaClick = Number(dataPoint.x); 
                                const vungDuocClick = dataPoint.y;
                                // Kiểm tra lại trên Console để debug nếu cần
                                // Log thử ra console F12 để kiểm tra xem đã lấy đúng chữ chưa
                                console.log("Đang gọi dữ liệu tỉnh:", vungDuocClick, "Tháng:", thangDaClick);
                                // Gọi hàm hiển thị biểu đồ chi tiết khách hàng
                                taiBieuDoNhietKhachHangTheoVung(vungDuocClick);
                            } else {
                                // Nếu bấm vào ô trắng (Sản lượng = 0), ẩn biểu đồ khách hàng đi
                                if (khuVucHienThi) khuVucHienThi.style.display = 'none';}
                        } else {
                            // Trường hợp 2: Click ra ngoài rìa, trục tọa độ hoặc vùng trống của canvas
                            if (khuVucHienThi) khuVucHienThi.style.display = 'none';} },
                plugins: {
                    legend: { display: false }, // Ẩn chú thích vì biểu đồ nhiệt nhìn trực quan qua màu sắc
                    tooltip: {enabled: false},  // Khỏi cho hiện bảng "Thông tin sản lượng" khi ghê chuột
                    // Cấu hình hiển thị số trực tiếp lên các ô vuông nhiệt
                    datalabels: {
                        display: true,
                        color: '#2c3e50',
                        font: { size: 10, weight: '600' },
                        padding: 2,     // Tùy chọn: Thêm padding để số không chạm viền ô
                        formatter: (value) => {
                            const sanLuong = value ? value.v : 0;
                            return sanLuong > 0 ? Math.round(sanLuong) : ''; } } },   // Chỉ hiện số nguyên nếu > 0 Tấn
                scales: {
                    x: {type: 'category',
                        labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
                        offset: true,       // Bắt buộc bật để căn giữa các ô vuông khớp với cột tháng
                        grid: { display: false },
                        ticks: { color: '#94a3b8' } },
                    y: {type: 'category',
                        labels: danhSachVungY, // Nạp danh sách các vùng tự động lấy từ Firebase
                        offset: true,   // Bắt buộc bật để căn đều hàng cố định
                        grid: { display: false },
                        ticks: { color: '#94a3b8' } } } }
        });
    }
// BIỂU ĐỒ NHIỆT DT
    // VẼ BIỂU ĐỒ NHIỆT DOANH THU
    function veBieuDoNhietDoanhThu(dataMatrix, danhSachVungY, maxDoanhThu) {
        const canvasElement = document.getElementById('bieuDoNhietVungDT');
        if (!canvasElement) return;
        const ctx = canvasElement.getContext('2d');
        if (bieuDoNhietVungDoanhThu) { bieuDoNhietVungDoanhThu.destroy(); }
        
        bieuDoNhietVungDoanhThu = new Chart(ctx, {
            type: 'matrix',
            data: {
                datasets: [{
                    label: 'Doanh thu theo vùng (Triệu Đan)',
                    data: dataMatrix,
                    width: ({chart}) => chart.chartArea ? (chart.chartArea.width / 12) - 2 : 0,
                    height: ({chart}) => chart.chartArea ? (chart.chartArea.height / (danhSachVungY.length || 1)) - 2 : 0,
                    backgroundColor(context) {
                        const item = context.raw;
                        const value = item ? item.v : 0;
                        if (value === 0) return '#f8fafc'; 
                        
                        // Đổ màu theo tỷ lệ doanh thu của ô đó so với đỉnh doanh thu maxDoanhThu
                        const ratio = Math.min(value / (maxDoanhThu || 1), 1); 
                        let r, g, b;
                        if (ratio >= 0.25) {
                            const p = (ratio - 0.25) / (1.0 - 0.25); 
                            r = Math.round(241 + (41 - 241) * p); 
                            g = Math.round(220 + (128 - 220) * p); 
                            b = Math.round(100 + (185 - 100) * p); 
                        } else if (ratio >= 0.05 && ratio < 0.25) {
                            const p = (ratio - 0.05) / (0.25 - 0.05); 
                            r = Math.round(240 + (241 - 240) * p); 
                            g = Math.round(140 + (220 - 140) * p); 
                            b = Math.round(130 + (100 - 130) * p); 
                        } else {
                            r = 245; g = 160; b = 150;
                        }
                        return `rgba(${r}, ${g}, ${b}, 0.85)`; 
                    },
                    borderRadius: 2
                }] 
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements, chartInstance) => {
                    const khuVucHienThi = document.getElementById('khuVucBieuDoKhachHang');
                    if (elements && elements.length > 0) {
                        const firstElement = elements[0];
                        const currentChart = chartInstance || firstElement.element.$context.chart;
                        const dataPoint = currentChart.data.datasets[firstElement.datasetIndex].data[firstElement.index];
                        if (dataPoint && dataPoint.v > 0) {
                            taiBieuDoNhietKhachHangTheoVung(dataPoint.y); // Đồng bộ bấm bên Doanh thu vẫn gọi được bảng khách hàng
                        } else {
                            if (khuVucHienThi) khuVucHienThi.style.display = 'none';
                        }
                    } else {
                        if (khuVucHienThi) khuVucHienThi.style.display = 'none';
                    } 
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                    datalabels: {
                        display: true,
                        color: '#2c3e50',
                        font: { size: 10, weight: '600' },
                        padding: 2,
                        formatter: (value) => {
                            const doanhThu = value ? value.v : 0;
                            // Làm tròn số doanh thu và định dạng dấu chấm ngăn cách hàng nghìn
                            return doanhThu > 0 ? Math.round(doanhThu).toLocaleString('vi-VN') : ''; 
                        } 
                    } 
                },
                scales: {
                    x: { type: 'category', labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], offset: true, grid: { display: false }, ticks: { color: '#94a3b8' } },
                    y: { type: 'category', labels: danhSachVungY, offset: true, grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }
// BIỂU ĐỒ NHIỆT CON KHÁCH HÀNG
    // TẠO BIỂU ĐỒ NHIỆT CON - KHÁCH HÀNG
    let bieuDoNhietKhachHangInstance = null;
    const boNhoDemVung = new Map();     // BỘ NHỚ ĐỆM (CACHE) THỦ CÔNG - Lưu trữ theo phiên làm việc để tiết kiệm lượt đọc
    let dangTaiDuLieuVung = false;      // Khóa chống spam click khi dữ liệu đang tải
    async function taiBieuDoNhietKhachHangTheoVung(vungDuocClick, namHienHanh) {
        if (dangTaiDuLieuVung) return;
        const namThucTe = typeof namHienHanh !== 'undefined' ? namHienHanh : 2026;
        if (vungDuocClick === undefined || vungDuocClick === null || typeof vungDuocClick === 'number' || !isNaN(vungDuocClick)) {console.error("Lỗi: vungDuocClick nhận vào sai định dạng:", vungDuocClick); return;}
        const vungChuanHoa = vungDuocClick.trim();
        const nganhThucTe = typeof nganhHienTai !== "undefined" ? nganhHienTai : "All";      // 2. Xác định ngành hiện tại (Lấy từ biến toàn cục của bạn, nếu chưa định nghĩa thì để mặc định)
        const khoaCache = `${namThucTe}_${vungChuanHoa}_${nganhThucTe}`;    // 🌟 ĐỊNH DANH KHÓA CACHE TUYỆT ĐỐI: Kết hợp Năm + Vùng + Ngành
        
        const khuVucHienThi = document.getElementById('khuVucBieuDoKhachHang');
        const tieuDe = document.getElementById('tieuDeBieuDoKhachHang'); 
        if (khuVucHienThi) khuVucHienThi.style.display = 'flex';
        // 1. Đổi tiêu đề báo trạng thái đang tải liền
        if (tieuDe) tieuDe.innerText = `⏳ Đang tải dữ liệu khách hàng khu vực ${vungChuanHoa}...`;
        // 2. Hủy biểu đồ Chart.js cũ để giải phóng bộ nhớ
        if (bieuDoNhietKhachHangInstance) { 
            bieuDoNhietKhachHangInstance.destroy(); 
            bieuDoNhietKhachHangInstance = null;
        }
        // 3. Xóa sạch khung hình cũ về trắng tinh
        const canvasElement = document.getElementById('bieuDoNhietKhachHang');
        if (canvasElement) {
            const ctx = canvasElement.getContext('2d');
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height); 
            canvasElement.style.height = '0px'; // Thu nhỏ tạm để không bị giữ dáng biểu đồ cũ
        } else {
            console.error("Không tìm thấy thẻ canvas..."); return;
        }
        try {
            const canvasElement = document.getElementById('bieuDoNhietKhachHang');
            if (!canvasElement) { console.error("Không tìm thấy thẻ canvas..."); return; }
            const ctx = canvasElement.getContext('2d');
            let mangDuLieuGoc = [];
            // 🌟 KIỂM TRA BỘ NHỚ ĐỆM TRƯỚC KHI GỌI FIRESTORE
            if (boNhoDemVung.has(khoaCache)) {
                console.log(`⚡ [Cache Hit] Lấy dữ liệu từ bộ nhớ đệm cho khóa: ${khoaCache}. Tốn 0 lượt đọc!`);
                mangDuLieuGoc = boNhoDemVung.get(khoaCache);
            } else {
                // Nếu chưa có trong Cache -> Tiến hành gọi Firestore
                dangTaiDuLieuVung = true; 
                console.log(`🔍 [Firestore Read] Đang tải dữ liệu: Vùng [${vungChuanHoa}] | Năm [${namThucTe}] | Ngành [${nganhThucTe}]`);
            const thamChieuKhachHangVung = collection(db, "KHACHHANGVUNG");
            let dieuKienLoc = [
                where("nam", "==", Number(namThucTe)),
                where("vungTieuThu", "==", vungChuanHoa), 
                where("htGiaoNhan", "==", "Tổng giao") ];
            if (typeof nganhHienTai !== "undefined") { dieuKienLoc.push(where("nganh", "==", nganhHienTai)); }
            const q = query(thamChieuKhachHangVung, ...dieuKienLoc);
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {mangDuLieuGoc.push(doc.data());});
                // Ghi dữ liệu vừa tải vào Cache theo khóa định danh
                boNhoDemVung.set(khoaCache, mangDuLieuGoc);
                dangTaiDuLieuVung = false;}
            if (tieuDe) tieuDe.innerText = `Chi tiết Khách hàng khu vực ${vungDuocClick} năm ${namThucTe}`;
            let tongDoanhThuCuaKhach = {}; 
            let mangDuLieuMaTran = [];  
            let maxSanLuongKhach = 0; 
            let maxDoanhThuKhach = 0; 
            
            mangDuLieuGoc.forEach((data) => {
                const tenKhachHang = data.doiTuong || "Chưa phân loại";
                if (!tongDoanhThuCuaKhach[tenKhachHang]) { tongDoanhThuCuaKhach[tenKhachHang] = 0; }
                // 🌟 ĐÃ ĐẢO: VÒNG LẶP 1 - Gom toàn bộ 12 tháng Doanh thu chạy TRƯỚC
                for (let thang = 1; thang <= 12; thang++) {
                    const doanhThuThang = (Number(data[`DT${thang}`]) || 0) / 1000000;
                    tongDoanhThuCuaKhach[tenKhachHang] += doanhThuThang;
                    if (doanhThuThang > maxDoanhThuKhach) { maxDoanhThuKhach = doanhThuThang; }
                    mangDuLieuMaTran.push({
                        x: `${thang} `, // Dấu cách để nhận diện đây thuộc nhóm Doanh thu
                        y: tenKhachHang,
                        v: doanhThuThang,
                        loai: 'DT'});  }
                // 🌟 ĐÃ ĐẢO: VÒNG LẶP 2 - Gom toàn bộ 12 tháng Sản lượng chạy SAU
                for (let thang = 1; thang <= 12; thang++) {
                    const sanLuongThang = Number(data[`TL${thang}`]) || 0;
                    if (sanLuongThang > maxSanLuongKhach) { maxSanLuongKhach = sanLuongThang; }
                    mangDuLieuMaTran.push({
                        x: `${thang}`, // Chuỗi không dấu cách thuộc nhóm Sản lượng
                        y: tenKhachHang,
                        v: sanLuongThang,
                        loai: 'SL'}); } });
            const danhSachDoiTuongY = Object.entries(tongDoanhThuCuaKhach)
                .sort((a, b) => b[1] - a[1])
                .map(item => item[0]);
            if (danhSachDoiTuongY.length === 0) {
                alert(`Không có dữ liệu khách hàng cho vùng: ${vungDuocClick}`);
                if (khuVucHienThi) khuVucHienThi.style.display = 'none'; return;}
            if (bieuDoNhietKhachHangInstance) { bieuDoNhietKhachHangInstance.destroy(); }
            const chieuCaoMoiDong = 18; 
            const phanDemCuaTrucX = 70;  
            const chieuCaoTinhToan = (danhSachDoiTuongY.length * chieuCaoMoiDong) + phanDemCuaTrucX;
            canvasElement.style.height = `${chieuCaoTinhToan}px`;
            canvasElement.style.width = '100%'; 
            // 🌟 ĐÃ ĐẢO: Mảng nhãn trục X chuẩn đưa nhóm '1 ' -> '12 ' (Doanh thu) lên trước
            const nhanTracX_Chuan = [
                '1 ', '2 ', '3 ', '4 ', '5 ', '6 ', '7 ', '8 ', '9 ', '10 ', '11 ', '12 ',
                '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
            function layMauNhietTheoRatio(ratio) {
                let r, g, b;
                if (ratio >= 0.25) {
                    const p = (ratio - 0.25) / 0.75; 
                    r = Math.round(241 + (41 - 241) * p); g = Math.round(220 + (128 - 220) * p); b = Math.round(100 + (185 - 100) * p); 
                } else if (ratio >= 0.05) {
                    const p = (ratio - 0.05) / 0.20; 
                    r = Math.round(240 + (241 - 240) * p); g = Math.round(140 + (220 - 140) * p); b = Math.round(130 + (100 - 130) * p); 
                } else { r = 245; g = 160; b = 150; }
                return `rgba(${r}, ${g}, ${b}, 0.85)`; }
            bieuDoNhietKhachHangInstance = new Chart(ctx, {
                type: 'matrix',
                data: {
                    datasets: [{
                        label: 'Dữ liệu khách hàng',
                        data: mangDuLieuMaTran,
                        backgroundColor(context) {
                            const item = context.raw;
                            if (!item || item.v === 0) return '#f8fafc';
                            if (item.loai === 'SL') {
                                return layMauNhietTheoRatio(Math.min(item.v / (maxSanLuongKhach || 1), 1));
                            } else {
                                return layMauNhietTheoRatio(Math.min(item.v / (maxDoanhThuKhach || 1), 1)); } },
                        borderRadius: 2, borderWidth: 1, borderColor: '#ffffff', 
                        width: ({chart}) => chart.chartArea ? (chart.chartArea.width / 24) - 1.5 : 0, 
                        height: ({chart}) => chart.chartArea ? (chart.chartArea.height / (danhSachDoiTuongY.length || 1)) - 1.5 : 0 }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        x: {type: 'category', labels: nhanTracX_Chuan, offset: true, grid: { display: false }, 
                            ticks: { 
                                color: '#475569', font: { size: 10, weight: '700' }, maxRotation: 0, minRotation: 0, autoSkip: false,
                                // 🌟 ĐÃ CẬP NHẬT CALLBACK: Gán đúng nhãn phụ ở chân cột Tháng 1 đầu tiên của mỗi nhóm
                                callback: function(val, index) {
                                    const label = this.getLabelForValue(val);
                                    if (label === '1 ') {return ['1', 'Doanh thu (tr.đ)'];}
                                    if (label === '1') {return ['1', 'Sản lượng (kg)'];}
                                    return label.trim(); } } },
                        y: { type: 'category', labels: danhSachDoiTuongY, offset: true, grid: { display: false }, 
                            ticks: { color: '#475569', autoSkip: false, font: { size: 11, weight: '500' },
                                callback: function(value, index) {
                                    let originalLabel = this.getLabelForValue(value);
                                    let label = originalLabel;
                                    // --- BƯỚC 1: BÓC TẦNG PHÁP LÝ NGOÀI CÙNG ---
                                    label = label.replace(/^(CÔNG TY TRÁCH NHIỆM HỮU HẠN MỘT THÀNH VIÊN|CÔNG TY TRÁCH NHIỆM HỮU HẠN|CÔNG TY CỔ PHẦN|CÔNG TY TNHH MỘT THÀNH VIÊN|CÔNG TY TNHH MTV|CÔNG TY TNHH|CONG TY TNHH MỘT THÀNH VIÊN|CONG TY TNHH MTV|CONG TY TNHH|DOANH NGHIỆP TƯ NHÂN|DOANH NGHIỆP TN|CTY TNHH MTV|CTY TNHH|CTY CP|DNTN|HỘ KINH DOANH|HO KINH DOANH|Hộ Kinh Doanh|CỬA HÀNG|SHOWROOM|CHI NHÁNH|CN)\s+/gi, '');
                                    // --- BƯỚC 2: BÓC TIẾP CÁC CỤM TỪ NGÀNH NGHỀ DÀI ---
                                    label = label.replace(/^(Tư Vấn & Xây Dựng Thương Mại Dịch Vụ|VẬT LIỆU XÂY DỰNG|SẢN XUẤT THƯƠNG MẠI DỊCH VỤ|XÂY DỰNG THƯƠNG MẠI DỊCH VỤ|XÂY DỰNG \- THƯƠNG MẠI \- DỊCH VỤ|THIẾT KẾ XÂY DỰNG VÀ THƯƠNG MẠI|TỔNG HỢP VÀ ĐẦU TƯ XÂY DỰNG|ĐẦU TƯ THƯƠNG MẠI DỊCH VỤ|ĐẦU TƯ XÂY DỰNG VÀ THƯƠNG MẠI|THƯƠNG MẠI XÂY DỰNG VẬN TẢI|TƯ VẤN XÂY DỰNG MẠNH QUÂN|TƯ VẤN XÂY DỰNG VÀ THƯƠNG MẠI|TRANG TRÍ NỘI THẤT THÀNH TÍN|VẬT LIỆU XÂY DỰNG \\- TRANG TRÍ NỘI THẤT|VẠT LIỆU XÂY DỰNG \\- TRANG TRÍ NỘI THẤT|VẬT LIỆU XÂY DỰNG VÀ TRANG TRÍ|KIẾN TRÚC \\& THƯƠNG MẠI|KIẾN TRÚC \\- XÂY DỰNG \\- NỘI THẤT|ĐẦU TƯ XÂY DỰNG|XÂY DỰNG THƯƠNG MẠI|THƯƠNG MẠI TỔNG HỢP|THƯƠNG MẠI DỊCH VỤ|THƯƠNG MẠI VÀ DỊCH VỤ|THƯƠNG MẠI MẠI VÀ DỊCH VỤ|VẬT LIỆU XÂY DỰNG|SẢN XUẤT THƯƠNG MẠI|SẢN XUẤT VÀ THƯƠNG MẠI|NỘI THẤT PHÚC MỘT|DỊCH VỤ XÂY DỰNG|GIẢI PHÁP XÂY DỰNG|SẢN XUẤT XÂY DỰNG|TRANG TRÍ NỘI THẤT|VẬT TƯ ĐẠI LỘC|THƯƠNG MẠI CỦA|TIỆM SƠN TRỌN|THƯƠNG MẠI|SẢN XUẤT|DỊCH VỤ|VẬT TƯ|GAS)\s+/gi, '');
                                    // --- BƯỚC 3: DỌN DẸP KHỐI VIẾT TẮT ---
                                    label = label.replace(/^(MTV\-VLXD|MỘT THÀNH VIÊN|MOT THANH VIEN|TM DV \& XD|XD \- TM VÀ DV|XD \- TM|DV SX TM|TM DV|TMDV|VLXD|MTV|NPP|VÀ|CƠ)\s+/gi, '');
                                    // --- BƯỚC 4: DỌN DẸP KÝ TỰ THỪA ---
                                    label = label.replace(/^[\s\-\&\·\,\+\/]+/g, '').trim();
                                    if (label.includes('(')) { label = label.split('(')[0].trim(); }
                                    // Nếu không cắt được gì (tên gốc đã ngắn sẵn) thì giữ nguyên
                                    if (label === originalLabel) { return label; }
                                    // --- BƯỚC 5: TÌM PHẦN BỊ CẮT VÀ GHÉP NGANG NHAU ---
                                    let phanBiCat = originalLabel.replace(label, '').trim();
                                    phanBiCat = phanBiCat.replace(/[\s\-\&\·\,\+\/]+$/g, '').trim(); // Dọn dấu thừa ở cuối
                                    // Trả về trên cùng 1 dòng: TÊN CHÍNH viết hoa + (phần phụ viết thường)
                                    return '(' + phanBiCat.toLowerCase() + ') ' + label.toUpperCase(); } } }  },
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }, 
                        datalabels: {display: true, align: 'center', anchor: 'center', textAlign: 'center', padding: 0, color: '#000000', 
                            font: { size: 9.5, weight: '700' }, 
                            formatter: (value) => {
                                if (!value || value.v === 0) return '';
                                return `${Math.round(value.v).toLocaleString('vi-VN')}`; } } }  }
            });
            bieuDoNhietKhachHangInstance.resize();
        } catch (error) { 
            console.error("Lỗi dựng biểu đồ nhiệt khách hàng:", error); 
            } finally {
            dangTaiDuLieuVung = false;
        }
    }
// CLICK ĐÓNG NHIẾT KHÁCH HÀNG
    // ĐÓNG BIỂU ĐỒ NHIỆT CON - KHÁCH HÀNG VÙNG KHI CLCK RA NGOÀI BIỂU ĐỒ KHÁCH HÀNG VÙNG
    document.getElementById('khuVucBieuDoKhachHang').addEventListener('click', function(event) {
        // Biến đại diện cho chính lớp nền mờ (thẻ div ngoài cùng)
        const lopNenMo = this; 
        // Nếu điểm người dùng click vào CHÍNH LÀ lớp nền mờ (chứ không phải hộp trắng bên trong)
        if (event.target === lopNenMo) {lopNenMo.style.display = 'none';} });   // Ẩn toàn bộ modal đi
