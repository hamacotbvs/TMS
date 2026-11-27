import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;
const COLLECTION_TUYENDUONG = "TUYENDUONG";
const COLLECTION_EPASS = "EPASS";
const TRAM_MAC_DINH = [
    "Cầu Cần Thơ",
    "Trạm BOT Quốc lộ 1A",
    "Cao tốc TP.HCM - Trung Lương",
    "Cao tốc Trung Lương - Mỹ Thuận"
];
const XE_MAC_DINH = ["65C-06126", "65H-02591", "65C-12290"];
const danhSachTram = new Set(TRAM_MAC_DINH);
let mapChuyenEpass = new Map();
let cacheDanhSachEpass = new Map();
let docIdDangSuaEpass = "";

function khoiTaoMacDinhEpass() {
    const inputNgay = document.getElementById("epNgay");
    if (inputNgay && !inputNgay.value) {
        inputNgay.value = new Date().toISOString().slice(0, 10);
    }
    const thangMacDinh = document.getElementById("thangVanChuyen")?.value || new Date().toISOString().slice(0, 7);
    ["thangVanChuyen", "thangXemEpass", "thangXemBcp"].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = thangMacDinh;
    });

    renderDanhSachTramEpass();
    taiDanhSachTramTuFirebase();
    window.taiDanhSachChuyenEpass();
    window.dinhDangSoTienEpass();
    window.goiYTienEpassGanNhat();
    window.xemLaiDanhSachEpass();
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

async function layDanhSachChuyenTheoNgayVaXe(ngayInput, bienSoInput) {
    const database = window.db || db;
    const ngayIso = chuanHoaNgayIso(ngayInput);
    const ngayDmy = dinhDangNgayThangNam(ngayIso);
    const bienSoChon = chuanHoaBienSo(bienSoInput);
    const danhSachChuyen = new Map();

    if (!database || !ngayIso || !bienSoChon) return danhSachChuyen;

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

    return danhSachChuyen;
}

window.taiDanhSachChuyenEpass = async function (giaTriGiuLai = "") {
    const selectChuyen = document.getElementById("epChuyen");
    if (!selectChuyen) return;

    const currentVal = giaTriGiuLai || selectChuyen.value;
    const ngayIso = document.getElementById("epNgay")?.value || "";
    const bienSoChon = document.getElementById("epBienSo")?.value || "";

    const danhSachChuyen = await layDanhSachChuyenTheoNgayVaXe(ngayIso, bienSoChon);
    mapChuyenEpass = danhSachChuyen;

    const sortedList = Array.from(danhSachChuyen.values()).sort((a, b) =>
        a.tenChuyen.localeCompare(b.tenChuyen, "vi", { numeric: true })
    );

    let html = `<option value="">-- Chọn chuyến --</option>`;
    for (const item of sortedList) {
        html += `<option value="${escapeHtml(item.chuyenId)}">${escapeHtml(item.tenChuyen)}</option>`;
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
        html += `<option value="${escapeHtml(tram)}">${escapeHtml(tram)}</option>`;
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
        const snap = await getDocs(query(collection(database, COLLECTION_EPASS), limit(100)));
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
                collection(database, COLLECTION_EPASS),
                where("bienSo", "==", bienSo),
                where("tramThuPhi", "==", tramThuPhi)
            );
            const snapXeTram = await getDocs(qXeTram);
            banGhi = chonBanGhiEpassMoiNhat(snapXeTram);
            if (banGhi) khopCaHai = true;
        }

        if (!banGhi && tramThuPhi) {
            const qTram = query(
                collection(database, COLLECTION_EPASS),
                where("tramThuPhi", "==", tramThuPhi)
            );
            const snapTram = await getDocs(qTram);
            banGhi = chonBanGhiEpassMoiNhat(snapTram);
        }

        if (!banGhi && bienSo) {
            const qXe = query(
                collection(database, COLLECTION_EPASS),
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

function renderDanhSachXemEpass() {
    const container = document.getElementById("danhSachXemEpass");
    const lblTong = document.getElementById("tongTienXemEpass");
    if (!container) return;

    const items = Array.from(cacheDanhSachEpass.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    const tongTien = lamTronHaiLe(items.reduce((acc, it) => acc + it.soTien, 0));
    if (lblTong) {
        lblTong.textContent = `${items.length} khoản • ${dinhDangTienHaiLe(tongTien)}`;
    }

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#94a3b8; font-size:12px; padding:12px;">Không có dữ liệu ePASS khớp tháng / xe.</div>`;
        return;
    }

    const dsXe = Array.from(new Set([...XE_MAC_DINH, ...items.map((x) => x.bienSo).filter(Boolean)]));
    const dsTram = Array.from(danhSachTram);

    container.innerHTML = items.map((it) => {
        const isEditing = docIdDangSuaEpass === it.id;
        if (!isEditing) {
            return `
                <div style="background:#fff; border:1px solid #e2e8f0; border-left:4px solid #0284c7; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div style="min-width:0; flex:1;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11px;">
                            <strong style="color:#1e293b;">${escapeHtml(it.bienSo || "---")}</strong>
                            <span style="color:#64748b;">${escapeHtml(it.ngayHienThi || "---")}</span>
                            <span style="color:#0284c7; font-weight:600;">• ${escapeHtml(it.chuyenText)}</span>
                        </div>
                        ${it.tramText ? `<div style="font-size:11px; color:#475569; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ${escapeHtml(it.tramText)}</div>` : ""}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <span style="font-size:13px; font-weight:700; color:#0284c7; white-space:nowrap;">
                            ${dinhDangTienHaiLe(it.soTien)}
                        </span>
                        <button type="button" onclick="batDauSuaDongEpass('${escapeHtml(it.id)}')" title="Sửa dòng này" style="border:1px solid #bae6fd; background:#f0f9ff; color:#0284c7; border-radius:6px; padding:5px 7px; font-size:11px; font-weight:700; cursor:pointer;">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        const optionsXe = dsXe.map((xe) => `<option value="${escapeHtml(xe)}" ${xe === it.bienSo ? "selected" : ""}>${escapeHtml(xe)}</option>`).join("");
        const optionsTram = dsTram.map((tr) => `<option value="${escapeHtml(tr)}" ${tr === it.tramText ? "selected" : ""}>${escapeHtml(tr)}</option>`).join("");

        return `
            <div style="background:#f8fafc; border:1px solid #0284c7; border-left:4px solid #0284c7; border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700; color:#0284c7;">
                    <span>✏️ Sửa dòng ePASS</span>
                    <button type="button" onclick="huySuaDongEpass()" style="border:none; background:transparent; color:#64748b; font-size:12px; font-weight:700; cursor:pointer;">Huỷ</button>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <input type="date" id="editEpNgay_${escapeHtml(it.id)}" value="${escapeHtml(it.ngayIso)}" onchange="taiChuyenSuaEpass('${escapeHtml(it.id)}')" style="flex:1; min-width:125px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#fff;" />
                    <select id="editEpBienSo_${escapeHtml(it.id)}" onchange="taiChuyenSuaEpass('${escapeHtml(it.id)}')" style="flex:1; min-width:110px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700; background:#fff;">
                        <option value="">-- Xe --</option>
                        ${optionsXe}
                    </select>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <select id="editEpChuyen_${escapeHtml(it.id)}" style="flex:1; min-width:120px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#fff;">
                        <option value="">-- Chuyến --</option>
                        ${it.chuyenId ? `<option value="${escapeHtml(it.chuyenId)}" selected>${escapeHtml(it.chuyenText)}</option>` : ""}
                    </select>
                    <input type="text" list="listTramSuaEpass_${escapeHtml(it.id)}" id="editEpTram_${escapeHtml(it.id)}" value="${escapeHtml(it.tramText)}" placeholder="Trạm thu phí..." style="flex:1.4; min-width:140px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#fff;" />
                    <datalist id="listTramSuaEpass_${escapeHtml(it.id)}">${optionsTram}</datalist>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="text" inputmode="decimal" id="editEpSoTien_${escapeHtml(it.id)}" value="${escapeHtml(String(it.soTien))}" placeholder="Số tiền..." style="flex:1; padding:6px 8px; border:1px solid #0284c7; border-radius:6px; font-size:13px; font-weight:700; color:#0284c7; text-align:right; background:#fff;" />
                    <button type="button" onclick="luuSuaDongEpass('${escapeHtml(it.id)}')" style="padding:7px 12px; border:none; border-radius:6px; background:#0284c7; color:#fff; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">
                        <i class="fa-solid fa-check"></i> Lưu
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

window.taiChuyenSuaEpass = async function (docId, giaTriChuyenMacDinh = "") {
    const selChuyen = document.getElementById(`editEpChuyen_${docId}`);
    if (!selChuyen) return;
    const ngayVal = document.getElementById(`editEpNgay_${docId}`)?.value || "";
    const xeVal = document.getElementById(`editEpBienSo_${docId}`)?.value || "";
    const currentVal = giaTriChuyenMacDinh || selChuyen.value;

    const dsChuyen = await layDanhSachChuyenTheoNgayVaXe(ngayVal, xeVal);
    let html = `<option value="">-- Chuyến --</option>`;
    for (const ch of dsChuyen.values()) {
        html += `<option value="${escapeHtml(ch.chuyenId)}">${escapeHtml(ch.tenChuyen)}</option>`;
    }
    if (currentVal && !dsChuyen.has(currentVal)) {
        html += `<option value="${escapeHtml(currentVal)}">${escapeHtml(`Chuyến ${currentVal}`)}</option>`;
    }
    selChuyen.innerHTML = html;
    if (currentVal) selChuyen.value = currentVal;
};

window.batDauSuaDongEpass = async function (docId) {
    docIdDangSuaEpass = docId;
    renderDanhSachXemEpass();
    const it = cacheDanhSachEpass.get(docId);
    if (it) {
        await window.taiChuyenSuaEpass(docId, it.chuyenId);
    }
};

window.huySuaDongEpass = function () {
    docIdDangSuaEpass = "";
    renderDanhSachXemEpass();
};

window.luuSuaDongEpass = async function (docId) {
    const database = window.db || db;
    if (!database || !docId) return;

    const ngay = document.getElementById(`editEpNgay_${docId}`)?.value || "";
    const bienSo = document.getElementById(`editEpBienSo_${docId}`)?.value.trim() || "";
    const chuyenId = document.getElementById(`editEpChuyen_${docId}`)?.value.trim() || "";
    const tramThuPhi = document.getElementById(`editEpTram_${docId}`)?.value.trim() || "";
    const soTienRaw = document.getElementById(`editEpSoTien_${docId}`)?.value || "";
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
        alert("Số tiền ePass phải lớn hơn 0!");
        return;
    }

    const parts = ngay.split("-");
    const namNum = Number(parts[0]) || new Date().getFullYear();
    const thangNum = Number(parts[1]) || (new Date().getMonth() + 1);

    try {
        const ref = doc(collection(database, COLLECTION_EPASS), docId);
        const snap = await getDoc(ref);
        const oldData = snap.exists() ? (snap.data() || {}) : {};

        await updateDoc(ref, {
            ngay,
            bienSo,
            chuyenVtracking: chuyenId,
            chuyenId,
            tenChuyen: chuyenId ? `Chuyến ${chuyenId}` : "",
            chuyenKey: chuanHoaKeyChuyen(chuyenId),
            tramThuPhi,
            soTien,
            nam: namNum,
            thang: thangNum,
            ngayTaoHeThong: oldData.ngayTaoHeThong || dinhDangNgayGioHeThong(),
            ngayCapNhatHeThong: dinhDangNgayGioHeThong()
        });

        if (tramThuPhi) {
            danhSachTram.add(tramThuPhi);
            renderDanhSachTramEpass();
        }
        docIdDangSuaEpass = "";
        await window.xemLaiDanhSachEpass();
    } catch (err) {
        console.error("Lỗi cập nhật EPASS:", err);
        alert("Lỗi khi lưu chỉnh sửa ePASS: " + err.message);
    }
};

window.xemLaiDanhSachEpass = async function () {
    const database = window.db || db;
    const container = document.getElementById("danhSachXemEpass");
    if (!container || !database) return;

    const thangVal = document.getElementById("thangXemEpass")?.value || document.getElementById("thangVanChuyen")?.value || "";
    const xeLoc = chuanHoaBienSo(document.getElementById("filterXeXemEpass")?.value || document.getElementById("filterPhuongTien")?.value || "");

    let namLoc = 0;
    let thangLoc = 0;
    if (/^\d{4}-\d{2}$/.test(thangVal)) {
        const [y, m] = thangVal.split("-");
        namLoc = Number(y);
        thangLoc = Number(m);
    }

    container.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải ePASS...</div>`;

    try {
        const snap = (namLoc && thangLoc)
            ? await getDocs(query(collection(database, COLLECTION_EPASS), where("nam", "==", namLoc), where("thang", "==", thangLoc)))
            : await getDocs(query(collection(database, COLLECTION_EPASS), limit(150)));

        const nextCache = new Map();
        snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            if (xeLoc && chuanHoaBienSo(d.bienSo || "") !== xeLoc) return;

            const soTien = lamTronHaiLe(d.soTien || 0);
            const ngayIso = chuanHoaNgayIso(d.ngay || "");
            const chuyenVal = d.chuyenVtracking !== undefined && d.chuyenVtracking !== ""
                ? String(d.chuyenVtracking).trim()
                : String(d.chuyenId || "").trim();
            const chuyenText = chuyenVal ? `Chuyến ${chuyenVal}` : (d.tenChuyen || "Chuyến lẻ");
            const tramText = String(d.tramThuPhi || "").trim();

            nextCache.set(docSnap.id, {
                id: docSnap.id,
                ngayIso,
                ngayHienThi: ngayIso ? dinhDangNgayThangNam(ngayIso) : String(d.ngay || ""),
                bienSo: String(d.bienSo || "").trim(),
                chuyenId: chuyenVal,
                chuyenText,
                tramText,
                soTien,
                sortKey: `${ngayIso || ""}|${d.ngayTaoHeThong || ""}|${docSnap.id}`
            });
        });

        cacheDanhSachEpass = nextCache;
        if (docIdDangSuaEpass && !cacheDanhSachEpass.has(docIdDangSuaEpass)) {
            docIdDangSuaEpass = "";
        }
        renderDanhSachXemEpass();
    } catch (err) {
        console.error("Lỗi tải lịch sử EPASS:", err);
        container.innerHTML = `<div style="text-align:center; color:#dc2626; font-size:12px; padding:10px;">Lỗi tải ePASS: ${escapeHtml(err.message)}</div>`;
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

        await setDoc(doc(collection(database, COLLECTION_EPASS), docId), duLieuEpass);

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
        window.xemLaiDanhSachEpass();

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
