import { collection, doc, setDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;
const COLLECTION_BENCAUPHA = "BENCAUPHA";
const COLLECTION_TUYENDUONG = "TUYENDUONG";
const DIA_DIEM_MAC_DINH = [
    "Phà Cần Thơ",
    "Phà Vàm Cống",
    "Bến phà Rạch Miễu",
    "Cầu Rạch Miễu"
];
const danhSachDiaDiem = new Set(DIA_DIEM_MAC_DINH);
let mapChuyenBcp = new Map();

function khoiTaoMacDinhBcp() {
    const inputNgay = document.getElementById("bcpNgay");
    if (inputNgay && !inputNgay.value) {
        inputNgay.value = new Date().toISOString().slice(0, 10);
    }
    renderDanhSachDiaDiemBcp();
    taiDanhSachDiaDiemTuFirebase();
    window.taiDanhSachChuyenBcp();
    window.dinhDangSoTienBcp();
    window.goiYTienBcpGanNhat();
}

function chuanHoaKeyChuyen(val) {
    return String(val || "").trim().toLowerCase().replace(/\s+/g, "");
}

function chuanHoaNgay(val) {
    if (!val) return "";
    if (typeof val === "object" && typeof val.toDate === "function") {
        return val.toDate().toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
        return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    return s;
}

function layNgayTuDocumentTuyenDuong(data = {}) {
    const candidates = [
        data.ngay,
        data.ngayChay,
        data.ngayGiao,
        data.ngayXuatPhat,
        data.batDauGiaoHang,
        data.ketThucGiaoHang,
        data.ngayTao
    ];
    for (const c of candidates) {
        const d = chuanHoaNgay(c);
        if (d) return d;
    }
    return "";
}

function layBienSoTuDocumentTuyenDuong(data = {}) {
    const raw =
        data.bienSo ||
        data.phuongTien ||
        data.bienSoXe ||
        data.soXe ||
        data.xe ||
        data.soPhuongTien ||
        "";
    return String(raw).trim().replace(/\s+/g, "").toUpperCase();
}

function chuanHoaChuyenTuTuyenDuong(docId, data = {}) {
    const chuyenTracking = data.chuyenVtracking ?? data.chuyen ?? "";
    const doiTuong = String(data.doiTuong || data.tenChuyen || data.tuyenDuong || data.loTrinh || "").trim();
    const ngay = layNgayTuDocumentTuyenDuong(data);
    const bienSo = layBienSoTuDocumentTuyenDuong(data);

    const maChuyen = String(
        data.maChuyen || data.chuyenId || docId || ""
    ).trim();

    if (!maChuyen && !doiTuong && chuyenTracking === "") return null;

    const idChuyen = maChuyen || `${docId}`;
    const parts = [];
    if (chuyenTracking !== "") parts.push(`Chuyến ${chuyenTracking}`);
    if (doiTuong) parts.push(doiTuong);
    if (bienSo) parts.push(bienSo);
    if (ngay) parts.push(ngay);
    const tenHienThi = parts.length > 0 ? `${idChuyen} (${parts.join(" - ")})` : idChuyen;

    return {
        chuyenId: idChuyen,
        chuyenVtracking: chuyenTracking,
        tenChuyen: tenHienThi,
        chuyenKey: chuanHoaKeyChuyen(idChuyen),
        ngay,
        bienSo
    };
}

window.taiDanhSachChuyenBcp = async function (giaTriGiuLai = "") {
    const database = window.db || db;
    const selectChuyen = document.getElementById("bcpChuyen");
    if (!selectChuyen) return;

    const currentVal = giaTriGiuLai || selectChuyen.value;
    const ngayChon = chuanHoaNgay(document.getElementById("bcpNgay")?.value || "");
    const bienSoChon = (document.getElementById("bcpBienSo")?.value || "").trim().replace(/\s+/g, "").toUpperCase();

    const danhSachChinhXac = new Map();
    const danhSachDuPhong = new Map();

    if (database) {
        try {
            const snap = await getDocs(query(collection(database, COLLECTION_TUYENDUONG), limit(400)));
            snap.forEach((docSnap) => {
                const item = chuanHoaChuyenTuTuyenDuong(docSnap.id, docSnap.data() || {});
                if (!item) return;

                if (!danhSachDuPhong.has(item.chuyenId)) {
                    danhSachDuPhong.set(item.chuyenId, item);
                }

                const khopNgay = !ngayChon || item.ngay === ngayChon;
                const khopXe = !bienSoChon || item.bienSo === bienSoChon;

                if (khopNgay && khopXe && !danhSachChinhXac.has(item.chuyenId)) {
                    danhSachChinhXac.set(item.chuyenId, item);
                }
            });

            if (danhSachChinhXac.size === 0 && (ngayChon || bienSoChon)) {
                snap.forEach((docSnap) => {
                    const item = chuanHoaChuyenTuTuyenDuong(docSnap.id, docSnap.data() || {});
                    if (!item) return;
                    const khopNgay = ngayChon && item.ngay === ngayChon;
                    const khopXe = bienSoChon && item.bienSo === bienSoChon;
                    if ((khopNgay || khopXe) && !danhSachChinhXac.has(item.chuyenId)) {
                        danhSachChinhXac.set(item.chuyenId, item);
                    }
                });
            }
        } catch (err) {
            console.warn(`Không đọc được chuyến từ ${COLLECTION_TUYENDUONG}:`, err);
        }
    }

    const nguonHienThi = danhSachChinhXac.size > 0 ? danhSachChinhXac : danhSachDuPhong;
    mapChuyenBcp = nguonHienThi;

    const sortedList = Array.from(nguonHienThi.values()).sort((a, b) =>
        (b.ngay || "").localeCompare(a.ngay || "") || a.tenChuyen.localeCompare(b.tenChuyen, "vi")
    );

    let html = `<option value="">-- Không gắn chuyến --</option>`;
    for (const item of sortedList) {
        const escapedId = item.chuyenId.replace(/"/g, "&quot;");
        html += `<option value="${escapedId}">${item.tenChuyen}</option>`;
    }
    selectChuyen.innerHTML = html;

    if (currentVal && Array.from(selectChuyen.options).some((o) => o.value === currentVal)) {
        selectChuyen.value = currentVal;
    }
};

function layThongTinChuyenBcp() {
    const selectChuyen = document.getElementById("bcpChuyen");
    const chuyenId = selectChuyen?.value.trim() || "";
    if (!chuyenId) {
        return { chuyenId: "", chuyenVtracking: "", tenChuyen: "", chuyenKey: "" };
    }
    const found = mapChuyenBcp.get(chuyenId);
    const tenChuyen = found?.tenChuyen || selectChuyen.options[selectChuyen.selectedIndex]?.text.trim() || chuyenId;
    return {
        chuyenId,
        chuyenVtracking: found?.chuyenVtracking ?? "",
        tenChuyen,
        chuyenKey: chuanHoaKeyChuyen(chuyenId)
    };
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
        const snap = await getDocs(query(collection(database, COLLECTION_BENCAUPHA), limit(100)));
        snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            const diaDiem = String(d.diaDiem || d.benCauPha || "").trim();
            if (diaDiem) {
                danhSachDiaDiem.add(diaDiem);
            }
        });
        renderDanhSachDiaDiemBcp();
    } catch (err) {
        console.warn("Không tải được danh sách BENCAUPHA:", err);
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
                collection(database, COLLECTION_BENCAUPHA),
                where("bienSo", "==", bienSo),
                where("diaDiem", "==", diaDiem)
            );
            const snapXeDiaDiem = await getDocs(qXeDiaDiem);
            banGhi = chonBanGhiBcpMoiNhat(snapXeDiaDiem);
            if (banGhi) khopCaHai = true;
        }

        if (!banGhi && diaDiem) {
            const qDiaDiem = query(
                collection(database, COLLECTION_BENCAUPHA),
                where("diaDiem", "==", diaDiem)
            );
            const snapDiaDiem = await getDocs(qDiaDiem);
            banGhi = chonBanGhiBcpMoiNhat(snapDiaDiem);
        }

        if (!banGhi && bienSo) {
            const qXe = query(
                collection(database, COLLECTION_BENCAUPHA),
                where("bienSo", "==", bienSo)
            );
            const snapXe = await getDocs(qXe);
            banGhi = chonBanGhiBcpMoiNhat(snapXe);
        }

        hienThiGoiYTienBcp(banGhi, khopCaHai);
    } catch (err) {
        console.warn("Không lấy được số tiền BENCAUPHA gợi ý:", err);
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
    const thongTinChuyen = layThongTinChuyenBcp();
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
            chuyenId: thongTinChuyen.chuyenId,
            chuyenVtracking: thongTinChuyen.chuyenVtracking,
            tenChuyen: thongTinChuyen.tenChuyen,
            chuyenKey: thongTinChuyen.chuyenKey,
            soTien: soTien,
            nam: namNum,
            thang: thangNum,
            diaDiem: diaDiem,
            ngayTaoHeThong: dinhDangNgayGioHeThong(now)
        };

        await setDoc(doc(collection(database, COLLECTION_BENCAUPHA), docId), duLieuBcp);

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
        console.error("Lỗi lưu collection BENCAUPHA:", error);
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
