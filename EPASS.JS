import { collection, doc, setDoc, getDocs, query, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;
const TRAM_MAC_DINH = [
    "Cầu Cần Thơ",
    "Trạm BOT Quốc lộ 1A",
    "Cao tốc TP.HCM - Trung Lương",
    "Cao tốc Trung Lương - Mỹ Thuận"
];
const danhSachTram = new Set(TRAM_MAC_DINH);

function khoiTaoMacDinhEpass() {
    const inputNgay = document.getElementById("epNgay");
    if (inputNgay && !inputNgay.value) {
        inputNgay.value = new Date().toISOString().slice(0, 10);
    }
    renderDanhSachTramEpass();
    taiDanhSachTramTuFirebase();
    window.dinhDangSoTienEpass();
}

function renderDanhSachTramEpass(giaTriDangChon = "") {
    const selectTram = document.getElementById("epTramThuPhi");
    if (!selectTram) return;

    const currentVal = giaTriDangChon || selectTram.value;
    const sorted = Array.from(danhSachTram)
        .map((t) => String(t).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi"));

    let html = `<option value="">-- Chọn trạm thu phí --</option>`;
    for (const tram of sorted) {
        const escaped = tram.replace(/"/g, "&quot;");
        html += `<option value="${escaped}">${tram}</option>`;
    }
    html += `<option value="__THEM_MOI__">+ Thêm trạm mới...</option>`;
    selectTram.innerHTML = html;

    if (currentVal && Array.from(selectTram.options).some((o) => o.value === currentVal)) {
        selectTram.value = currentVal;
    }
    window.xuLyChonTramEpass();
}

async function taiDanhSachTramTuFirebase() {
    if (!db) return;
    try {
        const snap = await getDocs(query(collection(db, "EPASS"), limit(100)));
        snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            const tram = String(d.tramThuPhi || d.ghiChu || "").trim();
            if (tram) {
                danhSachTram.add(tram);
            }
        });
        renderDanhSachTramEpass();
    } catch (err) {
        console.warn("Không tải được danh sách trạm ePass:", err);
    }
}

window.xuLyChonTramEpass = function () {
    const selectTram = document.getElementById("epTramThuPhi");
    const inputTramMoi = document.getElementById("epTramMoi");
    if (!selectTram || !inputTramMoi) return;

    if (selectTram.value === "__THEM_MOI__") {
        inputTramMoi.style.display = "block";
        inputTramMoi.focus();
    } else {
        inputTramMoi.style.display = "none";
        inputTramMoi.value = "";
    }
};

function layTenTramChon() {
    const selectTram = document.getElementById("epTramThuPhi");
    const inputTramMoi = document.getElementById("epTramMoi");
    const chon = selectTram?.value.trim() || "";
    if (chon === "__THEM_MOI__") {
        return inputTramMoi?.value.trim() || "";
    }
    return chon;
}

function chuanHoaSoNguyen(val) {
    if (val === undefined || val === null) return "";
    return String(val).replace(/[^0-9]/g, "");
}

function dinhDangHangNghin(so) {
    const num = Number(so) || 0;
    return num.toLocaleString("vi-VN") + " đ";
}

function dinhDangNgayGioHeThong(nowDate = new Date()) {
    const dd = String(nowDate.getDate()).padStart(2, "0");
    const mm = String(nowDate.getMonth() + 1).padStart(2, "0");
    const yyyy = String(nowDate.getFullYear());
    const hh = String(nowDate.getHours()).padStart(2, "0");
    const mi = String(nowDate.getMinutes()).padStart(2, "0");
    const ss = String(nowDate.getSeconds()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

function taoDocIdEpass(ngay, bienSo, nowDate = new Date()) {
    const hh = String(nowDate.getHours()).padStart(2, "0");
    const mm = String(nowDate.getMinutes()).padStart(2, "0");
    const ss = String(nowDate.getSeconds()).padStart(2, "0");
    const bienSoClean = String(bienSo || "").trim().replace(/\s+/g, "");
    return `${ngay}_${bienSoClean}_${hh}:${mm}:${ss}`;
}

window.dinhDangSoTienEpass = function () {
    const soTienInput = document.getElementById("epSoTien");
    const preview = document.getElementById("previewTienEpass");
    if (!soTienInput) return;

    const clean = chuanHoaSoNguyen(soTienInput.value);
    if (soTienInput.value !== clean) {
        soTienInput.value = clean;
    }

    const soTien = parseFloat(clean) || 0;
    if (preview) {
        preview.textContent = dinhDangHangNghin(soTien);
    }
};

window.luuEpassVaoFirebase = async function () {
    const nutBam = document.getElementById("btnLuuEpass");
    if (nutBam && nutBam.disabled) return;

    const ngay = document.getElementById("epNgay")?.value || "";
    const bienSo = document.getElementById("epBienSo")?.value.trim() || "";
    const soTienRaw = document.getElementById("epSoTien")?.value;
    const tramThuPhi = layTenTramChon();

    const soTien = parseFloat(chuanHoaSoNguyen(soTienRaw)) || 0;

    if (!ngay) {
        alert("Vui lòng chọn Ngày giao dịch / phát sinh!");
        return;
    }
    if (!bienSo) {
        alert("Vui lòng chọn Phương tiện!");
        return;
    }
    if (soTien <= 0) {
        alert("Vui lòng nhập Số tiền phí ePass lớn hơn 0!");
        return;
    }

    const parts = ngay.split("-");
    const namNum = Number(parts[0]) || new Date().getFullYear();
    const thangNum = Number(parts[1]) || (new Date().getMonth() + 1);

    if (nutBam) {
        nutBam.disabled = true;
        nutBam.style.opacity = "0.6";
        nutBam.style.cursor = "not-allowed";
        nutBam.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu phí ePass...`;
    }

    try {
        const now = new Date();
        const docId = taoDocIdEpass(ngay, bienSo, now);

        const duLieuEpass = {
            ngay: ngay,
            bienSo: bienSo,
            soTien: soTien,
            nam: namNum,
            thang: thangNum,
            tramThuPhi: tramThuPhi,
            ghiChu: tramThuPhi,
            ngayTaoHeThong: dinhDangNgayGioHeThong(now)
        };

        await setDoc(doc(collection(db, "EPASS"), docId), duLieuEpass);

        if (tramThuPhi) {
            danhSachTram.add(tramThuPhi);
            renderDanhSachTramEpass(tramThuPhi);
        }

        if (nutBam) {
            nutBam.style.background = "#15803d";
            nutBam.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã lưu (${dinhDangHangNghin(soTien)} - ${bienSo})`;
        }

        document.getElementById("epSoTien").value = "";
        const inputTramMoi = document.getElementById("epTramMoi");
        if (inputTramMoi) inputTramMoi.value = "";
        window.dinhDangSoTienEpass();

        await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
        console.error("Lỗi lưu collection EPASS:", error);
        alert("Lỗi khi lưu phí ePass: " + error.message);
    } finally {
        if (nutBam) {
            nutBam.disabled = false;
            nutBam.style.opacity = "1";
            nutBam.style.background = "#0284c7";
            nutBam.style.cursor = "pointer";
            nutBam.innerHTML = `<i class="fa-solid fa-credit-card"></i> Lưu phí ePass`;
        }
    }
};

document.addEventListener("DOMContentLoaded", khoiTaoMacDinhEpass);
