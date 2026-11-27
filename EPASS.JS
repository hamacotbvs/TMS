import { collection, doc, setDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;
const COLLECTION_TUYENDUONG = "TUYENDUONG";
const TRAM_MAC_DINH = [
    "Cầu Cần Thơ",
    "Trạm BOT Quốc lộ 1A",
    "Cao tốc TP.HCM - Trung Lương",
    "Cao tốc Trung Lương - Mỹ Thuận"
];
const danhSachTram = new Set(TRAM_MAC_DINH);
let mapChuyenEpass = new Map();

function khoiTaoMacDinhEpass() {
    const inputNgay = document.getElementById("epNgay");
    if (inputNgay && !inputNgay.value) {
        inputNgay.value = new Date().toISOString().slice(0, 10);
    }
    renderDanhSachTramEpass();
    taiDanhSachTramTuFirebase();
    window.taiDanhSachChuyenEpass();
    window.dinhDangSoTienEpass();
    window.goiYTienEpassGanNhat();
}

function chuanHoaKeyChuyen(val) {
    return String(val ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function chuanHoaNgayIso(val) {
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

function dinhDangNgayThangNam(isoDate) {
    const clean = chuanHoaNgayIso(isoDate);
    const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(isoDate || "").trim();
    return `${m[3]}/${m[2]}/${m[1]}`;
}

function chuanHoaBienSo(val) {
    return String(val ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

window.taiDanhSachChuyenEpass = async function (giaTriGiuLai = "") {
    const database = window.db || db;
    const selectChuyen = document.getElementById("epChuyen");
    if (!selectChuyen) return;

    const currentVal = giaTriGiuLai || selectChuyen.value;
    const ngayIso = chuanHoaNgayIso(document.getElementById("epNgay")?.value || "");
    const ngayDmy = dinhDangNgayThangNam(ngayIso);
    const bienSoChon = chuanHoaBienSo(document.getElementById("epBienSo")?.value || "");

    const danhSachChuyen = new Map();

    if (database && ngayIso && bienSoChon) {
        try {
            const tapDoc = new Map();
            const q1 = query(
                collection(database, COLLECTION_TUYENDUONG),
                where("ngayThangNam", "==", ngayDmy),
                where("phuongTien", "==", bienSoChon)
            );
            const snap1 = await getDocs(q1);
            snap1.forEach((d) => tapDoc.set(d.id, d.data() || {}));

            if (tapDoc.size === 0) {
                const q2 = query(
                    collection(database, COLLECTION_TUYENDUONG),
                    where("ngayThangNam", "==", ngayIso),
                    where("phuongTien", "==", bienSoChon)
                );
                const snap2 = await getDocs(q2);
                snap2.forEach((d) => tapDoc.set(d.id, d.data() || {}));
            }

            if (tapDoc.size === 0) {
                const qFallback = query(
                    collection(database, COLLECTION_TUYENDUONG),
                    where("phuongTien", "==", bienSoChon),
                    limit(200)
                );
                const snapFallback = await getDocs(qFallback);
                snapFallback.forEach((d) => {
                    const data = d.data() || {};
                    if (chuanHoaNgayIso(data.ngayThangNam) === ngayIso) {
                        tapDoc.set(d.id, data);
                    }
                });
            }

            tapDoc.forEach((data) => {
                const soChuyen = data.chuyenVtracking;
                if (soChuyen === undefined || soChuyen === null || String(soChuyen).trim() === "") return;

                const keyVal = String(soChuyen).trim();
                if (!danhSachChuyen.has(keyVal)) {
                    danhSachChuyen.set(keyVal, {
                        chuyenVtracking: soChuyen,
                        chuyenId: keyVal,
                        tenChuyen: `Chuyến ${keyVal}`,
                        chuyenKey: chuanHoaKeyChuyen(keyVal)
                    });
                }
            });
        } catch (err) {
            console.warn(`Không đọc được chuyenVtracking từ ${COLLECTION_TUYENDUONG}:`, err);
        }
    }

    mapChuyenEpass = danhSachChuyen;

    const sortedList = Array.from(danhSachChuyen.values()).sort((a, b) =>
        a.tenChuyen.localeCompare(b.tenChuyen, "vi", { numeric: true })
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

function layThongTinChuyenEpass() {
    const selectChuyen = document.getElementById("epChuyen");
    const val = selectChuyen?.value.trim() || "";
    if (!val) {
        return { chuyenVtracking: "", chuyenId: "", tenChuyen: "", chuyenKey: "" };
    }
    const found = mapChuyenEpass.get(val);
    return {
        chuyenVtracking: found ? found.chuyenVtracking : val,
        chuyenId: val,
        tenChuyen: found ? found.tenChuyen : `Chuyến ${val}`,
        chuyenKey: chuanHoaKeyChuyen(val)
    };
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
    const database = window.db || db;
    if (!database) return;
    try {
        const snap = await getDocs(query(collection(database, "EPASS"), limit(100)));
        snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            const tram = String(d.tramThuPhi || "").trim();
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

function taoDocIdEpass(ngay, bienSo, nowDate = new Date()) {
    const hh = String(nowDate.getHours()).padStart(2, "0");
    const mm = String(nowDate.getMinutes()).padStart(2, "0");
    const ss = String(nowDate.getSeconds()).padStart(2, "0");
    const bienSoClean = String(bienSo || "").trim().replace(/\s+/g, "");
    return `${ngay}_${bienSoClean}_${hh}:${mm}:${ss}`;
}

function chonBanGhiEpassMoiNhat(docsSnap) {
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

window.apDungTienEpassGoiY = function (soTien) {
    const soTienInput = document.getElementById("epSoTien");
    if (!soTienInput || !soTien) return;
    soTienInput.value = String(lamTronHaiLe(soTien));
    window.dinhDangSoTienEpass();
};

function hienThiGoiYTienEpass(banGhi, khopCaXeVaTram = true) {
    const labelGoiY = document.getElementById("goiYTienEpass");
    if (!labelGoiY) return;

    if (banGhi && Number(banGhi.soTien) > 0) {
        const tien = lamTronHaiLe(banGhi.soTien);
        const xeText = banGhi.bienSo ? `${banGhi.bienSo}` : "";
        const tramText = banGhi.tramThuPhi ? `${banGhi.tramThuPhi}` : "";
        const infoParts = [];
        if (xeText) infoParts.push(xeText);
        if (tramText) infoParts.push(tramText);
        if (!khopCaXeVaTram && tramText) infoParts.push("theo trạm");
        const meta = infoParts.length > 0 ? ` (${infoParts.join(" - ")})` : "";

        labelGoiY.innerHTML = `Gợi ý${meta}: <a href="javascript:void(0)" onclick="apDungTienEpassGoiY(${tien})" title="Bấm để áp dụng số tiền này" style="color:#0284c7; font-weight:700; text-decoration:underline;">${dinhDangTienHaiLe(tien)}</a>`;
    } else {
        labelGoiY.textContent = "";
    }
}

window.goiYTienEpassGanNhat = async function () {
    const database = window.db || db;
    const labelGoiY = document.getElementById("goiYTienEpass");
    if (!labelGoiY || !database) return;

    const bienSo = document.getElementById("epBienSo")?.value.trim() || "";
    const tramThuPhi = layTenTramChon();

    if (!bienSo && !tramThuPhi) {
        labelGoiY.textContent = "";
        return;
    }

    try {
        let banGhi = null;
        let khopCaHai = false;

        if (bienSo && tramThuPhi) {
            const qXeTram = query(
                collection(database, "EPASS"),
                where("bienSo", "==", bienSo),
                where("tramThuPhi", "==", tramThuPhi)
            );
            const snapXeTram = await getDocs(qXeTram);
            banGhi = chonBanGhiEpassMoiNhat(snapXeTram);
            if (banGhi) khopCaHai = true;
        }

        if (!banGhi && tramThuPhi) {
            const qTram = query(
                collection(database, "EPASS"),
                where("tramThuPhi", "==", tramThuPhi)
            );
            const snapTram = await getDocs(qTram);
            banGhi = chonBanGhiEpassMoiNhat(snapTram);
        }

        if (!banGhi && bienSo) {
            const qXe = query(
                collection(database, "EPASS"),
                where("bienSo", "==", bienSo)
            );
            const snapXe = await getDocs(qXe);
            banGhi = chonBanGhiEpassMoiNhat(snapXe);
        }

        hienThiGoiYTienEpass(banGhi, khopCaHai);
    } catch (err) {
        console.warn("Không lấy được số tiền ePass gợi ý:", err);
    }
};

window.dinhDangSoTienEpass = function () {
    const soTienInput = document.getElementById("epSoTien");
    const preview = document.getElementById("previewTienEpass");
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

window.luuEpassVaoFirebase = async function () {
    const database = window.db || db;
    const nutBam = document.getElementById("btnLuuEpass");
    if (nutBam && nutBam.disabled) return;

    const ngay = document.getElementById("epNgay")?.value || "";
    const bienSo = document.getElementById("epBienSo")?.value.trim() || "";
    const thongTinChuyen = layThongTinChuyenEpass();
    const soTienRaw = document.getElementById("epSoTien")?.value;
    const tramThuPhi = layTenTramChon();

    const soTien = lamTronHaiLe(parseFloat(chuanHoaSoHaiLe(soTienRaw)) || 0);

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
            chuyenVtracking: thongTinChuyen.chuyenVtracking,
            chuyenId: thongTinChuyen.chuyenId,
            tenChuyen: thongTinChuyen.tenChuyen,
            chuyenKey: thongTinChuyen.chuyenKey,
            soTien: soTien,
            nam: namNum,
            thang: thangNum,
            tramThuPhi: tramThuPhi,
            ngayTaoHeThong: dinhDangNgayGioHeThong(now)
        };

        await setDoc(doc(collection(database, "EPASS"), docId), duLieuEpass);

        if (tramThuPhi) {
            danhSachTram.add(tramThuPhi);
            renderDanhSachTramEpass(tramThuPhi);
        }

        if (nutBam) {
            nutBam.style.background = "#15803d";
            nutBam.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã lưu (${dinhDangTienHaiLe(soTien)} - ${bienSo})`;
        }

        document.getElementById("epSoTien").value = "";
        const inputTramMoi = document.getElementById("epTramMoi");
        if (inputTramMoi) inputTramMoi.value = "";
        window.dinhDangSoTienEpass();
        window.goiYTienEpassGanNhat();

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
