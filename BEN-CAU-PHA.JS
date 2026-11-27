import { collection, doc, setDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;
const DIA_DIEM_MAC_DINH = [
    "Phà Cần Thơ",
    "Phà Vàm Cống",
    "Bến phà Rạch Miễu",
    "Cầu Rạch Miễu"
];
const danhSachDiaDiem = new Set(DIA_DIEM_MAC_DINH);

function khoiTaoMacDinhBcp() {
    const inputNgay = document.getElementById("bcpNgay");
    if (inputNgay && !inputNgay.value) {
        inputNgay.value = new Date().toISOString().slice(0, 10);
    }
    renderDanhSachDiaDiemBcp();
    taiDanhSachDiaDiemTuFirebase();
    window.dinhDangSoTienBcp();
    window.goiYTienBcpGanNhat();
}

function renderDanhSachDiaDiemBcp(giaTriDangChon = "") {
    const selectDiaDiem = document.getElementById("bcpDiaDiem");
    if (!selectDiaDiem) return;

    const currentVal = giaTriDangChon || selectDiaDiem.value;
    const sorted = Array.from(danhSachDiaDiem)
        .map((t) => String(t).trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi"));

    let html = `<option value="">-- Chọn bến / cầu / phà --</option>`;
    for (const item of sorted) {
        const escaped = item.replace(/"/g, "&quot;");
        html += `<option value="${escaped}">${item}</option>`;
    }
    html += `<option value="__THEM_MOI__">+ Thêm mới...</option>`;
    selectDiaDiem.innerHTML = html;

    if (currentVal && Array.from(selectDiaDiem.options).some((o) => o.value === currentVal)) {
        selectDiaDiem.value = currentVal;
    }
    window.xuLyChonDiaDiemBcp();
}

async function taiDanhSachDiaDiemTuFirebase() {
    const database = window.db || db;
    if (!database) return;
    try {
        const snap = await getDocs(query(collection(database, "BCP"), limit(100)));
        snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            const diaDiem = String(d.diaDiem || d.benCauPha || "").trim();
            if (diaDiem) {
                danhSachDiaDiem.add(diaDiem);
            }
        });
        renderDanhSachDiaDiemBcp();
    } catch (err) {
        console.warn("Không tải được danh sách Bến - Cầu - Phà:", err);
    }
}

window.xuLyChonDiaDiemBcp = function () {
    const selectDiaDiem = document.getElementById("bcpDiaDiem");
    const inputMoi = document.getElementById("bcpDiaDiemMoi");
    if (!selectDiaDiem || !inputMoi) return;

    if (selectDiaDiem.value === "__THEM_MOI__") {
        inputMoi.style.display = "block";
        inputMoi.focus();
    } else {
        inputMoi.style.display = "none";
        inputMoi.value = "";
    }
};

function layTenDiaDiemChon() {
    const selectDiaDiem = document.getElementById("bcpDiaDiem");
    const inputMoi = document.getElementById("bcpDiaDiemMoi");
    const chon = selectDiaDiem?.value.trim() || "";
    if (chon === "__THEM_MOI__") {
        return inputMoi?.value.trim() || "";
    }
    return chon;
}

function chuanHoaSoHaiLe(val) {
    if (val === undefined || val === null) return "";
    let s = String(val).replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) {
        const phanNguyen = s.slice(0, firstDot);
        const phanLe = s.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
        s = `${phanNguyen}.${phanLe}`;
    }
    return s;
}

function lamTronHaiLe(so) {
    return Math.round((Number(so) || 0) * 100) / 100;
}

function dinhDangTienHaiLe(so) {
    const num = lamTronHaiLe(so);
    return num.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " đ";
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

function taoDocIdBcp(ngay, bienSo, nowDate = new Date()) {
    const hh = String(nowDate.getHours()).padStart(2, "0");
    const mm = String(nowDate.getMinutes()).padStart(2, "0");
    const ss = String(nowDate.getSeconds()).padStart(2, "0");
    const bienSoClean = String(bienSo || "").trim().replace(/\s+/g, "");
    return `${ngay}_${bienSoClean}_${hh}:${mm}:${ss}`;
}

function chonBanGhiBcpMoiNhat(docsSnap) {
    let best = null;
    docsSnap.forEach((d) => {
        const data = d.data() || {};
        const soTien = Number(data.soTien) || 0;
        if (soTien <= 0) return;

        const key = `${data.ngay || ""}|${data.ngayTaoHeThong || ""}|${d.id}`;
        if (!best || key > best.key) {
            best = { key, id: d.id, data };
        }
    });
    return best ? best.data : null;
}

window.apDungTienBcpGoiY = function (soTien) {
    const soTienInput = document.getElementById("bcpSoTien");
    if (!soTienInput || !soTien) return;
    soTienInput.value = String(lamTronHaiLe(soTien));
    window.dinhDangSoTienBcp();
};

function hienThiGoiYTienBcp(banGhi, khopCaXeVaDiaDiem = true) {
    const labelGoiY = document.getElementById("goiYTienBcp");
    if (!labelGoiY) return;

    if (banGhi && Number(banGhi.soTien) > 0) {
        const tien = lamTronHaiLe(banGhi.soTien);
        const diaDiemVal = banGhi.diaDiem || banGhi.benCauPha || "";
        const infoParts = [];
        if (banGhi.bienSo) infoParts.push(banGhi.bienSo);
        if (diaDiemVal) infoParts.push(diaDiemVal);
        if (!khopCaXeVaDiaDiem && diaDiemVal) infoParts.push("theo địa điểm");
        const meta = infoParts.length > 0 ? ` (${infoParts.join(" - ")})` : "";

        labelGoiY.innerHTML = `Gợi ý${meta}: <a href="javascript:void(0)" onclick="apDungTienBcpGoiY(${tien})" title="Bấm để áp dụng số tiền này" style="color:#0f766e; font-weight:700; text-decoration:underline;">${dinhDangTienHaiLe(tien)}</a>`;
    } else {
        labelGoiY.textContent = "";
    }
}

window.goiYTienBcpGanNhat = async function () {
    const database = window.db || db;
    const labelGoiY = document.getElementById("goiYTienBcp");
    if (!labelGoiY || !database) return;

    const bienSo = document.getElementById("bcpBienSo")?.value.trim() || "";
    const diaDiem = layTenDiaDiemChon();

    if (!bienSo && !diaDiem) {
        labelGoiY.textContent = "";
        return;
    }

    try {
        let banGhi = null;
        let khopCaHai = false;

        if (bienSo && diaDiem) {
            const qXeDiaDiem = query(
                collection(database, "BCP"),
                where("bienSo", "==", bienSo),
                where("diaDiem", "==", diaDiem)
            );
            const snapXeDiaDiem = await getDocs(qXeDiaDiem);
            banGhi = chonBanGhiBcpMoiNhat(snapXeDiaDiem);
            if (banGhi) khopCaHai = true;
        }

        if (!banGhi && diaDiem) {
            const qDiaDiem = query(
                collection(database, "BCP"),
                where("diaDiem", "==", diaDiem)
            );
            const snapDiaDiem = await getDocs(qDiaDiem);
            banGhi = chonBanGhiBcpMoiNhat(snapDiaDiem);
        }

        if (!banGhi && bienSo) {
            const qXe = query(
                collection(database, "BCP"),
                where("bienSo", "==", bienSo)
            );
            const snapXe = await getDocs(qXe);
            banGhi = chonBanGhiBcpMoiNhat(snapXe);
        }

        hienThiGoiYTienBcp(banGhi, khopCaHai);
    } catch (err) {
        console.warn("Không lấy được số tiền Bến - Cầu - Phà gợi ý:", err);
    }
};

window.dinhDangSoTienBcp = function () {
    const soTienInput = document.getElementById("bcpSoTien");
    const preview = document.getElementById("previewTienBcp");
    if (!soTienInput) return;

    const clean = chuanHoaSoHaiLe(soTienInput.value);
    if (soTienInput.value !== clean) {
        soTienInput.value = clean;
    }

    const soTien = lamTronHaiLe(parseFloat(clean) || 0);
    if (preview) {
        preview.textContent = dinhDangTienHaiLe(soTien);
    }
};

window.luuBcpVaoFirebase = async function () {
    const database = window.db || db;
    const nutBam = document.getElementById("btnLuuBcp");
    if (nutBam && nutBam.disabled) return;

    const ngay = document.getElementById("bcpNgay")?.value || "";
    const bienSo = document.getElementById("bcpBienSo")?.value.trim() || "";
    const soTienRaw = document.getElementById("bcpSoTien")?.value;
    const diaDiem = layTenDiaDiemChon();

    const soTien = lamTronHaiLe(parseFloat(chuanHoaSoHaiLe(soTienRaw)) || 0);

    if (!ngay) {
        alert("Vui lòng chọn Ngày!");
        return;
    }
    if (!bienSo) {
        alert("Vui lòng chọn Phương tiện!");
        return;
    }
    if (soTien <= 0) {
        alert("Vui lòng nhập Số tiền Bến - Cầu - Phà lớn hơn 0!");
        return;
    }

    const parts = ngay.split("-");
    const namNum = Number(parts[0]) || new Date().getFullYear();
    const thangNum = Number(parts[1]) || (new Date().getMonth() + 1);

    if (nutBam) {
        nutBam.disabled = true;
        nutBam.style.opacity = "0.6";
        nutBam.style.cursor = "not-allowed";
        nutBam.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu phí Bến - Cầu - Phà...`;
    }

    try {
        const now = new Date();
        const docId = taoDocIdBcp(ngay, bienSo, now);

        const duLieuBcp = {
            ngay: ngay,
            bienSo: bienSo,
            soTien: soTien,
            nam: namNum,
            thang: thangNum,
            diaDiem: diaDiem,
            ngayTaoHeThong: dinhDangNgayGioHeThong(now)
        };

        await setDoc(doc(collection(database, "BCP"), docId), duLieuBcp);

        if (diaDiem) {
            danhSachDiaDiem.add(diaDiem);
            renderDanhSachDiaDiemBcp(diaDiem);
        }

        if (nutBam) {
            nutBam.style.background = "#15803d";
            nutBam.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã lưu (${dinhDangTienHaiLe(soTien)} - ${bienSo})`;
        }

        document.getElementById("bcpSoTien").value = "";
        const inputMoi = document.getElementById("bcpDiaDiemMoi");
        if (inputMoi) inputMoi.value = "";
        window.dinhDangSoTienBcp();
        window.goiYTienBcpGanNhat();

        await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
        console.error("Lỗi lưu collection BCP:", error);
        alert("Lỗi khi lưu phí Bến - Cầu - Phà: " + error.message);
    } finally {
        if (nutBam) {
            nutBam.disabled = false;
            nutBam.style.opacity = "1";
            nutBam.style.background = "#0f766e";
            nutBam.style.cursor = "pointer";
            nutBam.innerHTML = `<i class="fa-solid fa-ferry"></i> Lưu phí Bến - Cầu - Phà`;
        }
    }
};

document.addEventListener("DOMContentLoaded", khoiTaoMacDinhBcp);
