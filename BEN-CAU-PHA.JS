import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;
const COLLECTION_BENCAUPHA = "BENCAUPHA";
const COLLECTION_TUYENDUONG = "TUYENDUONG";
const DIA_DIEM_MAC_DINH = [
    "Phà Cần Thơ",
    "Phà Vàm Cống",
    "Bến phà Rạch Miễu",
    "Cầu Rạch Miễu"
];
const XE_MAC_DINH = ["65C-06126", "65H-02591", "65C-12290"];
const danhSachDiaDiem = new Set(DIA_DIEM_MAC_DINH);
let mapChuyenBcp = new Map();
let cacheDanhSachBcp = new Map();
let docIdDangSuaBcp = "";

function khoiTaoMacDinhBcp() {
    const inputNgay = document.getElementById("bcpNgay");
    if (inputNgay && !inputNgay.value) {
        inputNgay.value = new Date().toISOString().slice(0, 10);
    }
    const thangMacDinh = document.getElementById("thangVanChuyen")?.value || new Date().toISOString().slice(0, 7);
    ["thangVanChuyen", "thangXemEpass", "thangXemBcp"].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = thangMacDinh;
    });

    renderDanhSachDiaDiemBcp();
    taiDanhSachDiaDiemTuFirebase();
    window.taiDanhSachChuyenBcp();
    window.dinhDangSoTienBcp();
    window.goiYTienBcpGanNhat();
    window.xemLaiDanhSachBcp();
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

window.taiDanhSachChuyenBcp = async function (giaTriGiuLai = "") {
    const selectChuyen = document.getElementById("bcpChuyen");
    if (!selectChuyen) return;

    const currentVal = giaTriGiuLai || selectChuyen.value;
    const ngayIso = document.getElementById("bcpNgay")?.value || "";
    const bienSoChon = document.getElementById("bcpBienSo")?.value || "";

    const danhSachChuyen = await layDanhSachChuyenTheoNgayVaXe(ngayIso, bienSoChon);
    mapChuyenBcp = danhSachChuyen;

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

function layThongTinChuyenBcp() {
    const selectChuyen = document.getElementById("bcpChuyen");
    const val = selectChuyen?.value.trim() || "";
    if (!val) {
        return { chuyenVtracking: "", chuyenId: "", tenChuyen: "", chuyenKey: "" };
    }
    const found = mapChuyenBcp.get(val);
    return {
        chuyenVtracking: found ? found.chuyenVtracking : val,
        chuyenId: val,
        tenChuyen: found ? found.tenChuyen : `Chuyến ${val}`,
        chuyenKey: chuanHoaKeyChuyen(val)
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
        html += `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`;
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

function renderDanhSachXemBcp() {
    const container = document.getElementById("danhSachXemBcp");
    const lblTong = document.getElementById("tongTienXemBcp");
    if (!container) return;

    const items = Array.from(cacheDanhSachBcp.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    const tongTien = lamTronHaiLe(items.reduce((acc, it) => acc + it.soTien, 0));
    if (lblTong) {
        lblTong.textContent = `${items.length} khoản • ${dinhDangTienHaiLe(tongTien)}`;
    }

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#94a3b8; font-size:12px; padding:12px;">Không có dữ liệu Bến - Cầu - Phà khớp tháng / xe.</div>`;
        return;
    }

    const dsXe = Array.from(new Set([...XE_MAC_DINH, ...items.map((x) => x.bienSo).filter(Boolean)]));
    const dsDiaDiem = Array.from(danhSachDiaDiem);

    container.innerHTML = items.map((it) => {
        const isEditing = docIdDangSuaBcp === it.id;
        if (!isEditing) {
            return `
                <div style="background:#fff; border:1px solid #e2e8f0; border-left:4px solid #0f766e; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div style="min-width:0; flex:1;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11px;">
                            <strong style="color:#1e293b;">${escapeHtml(it.bienSo || "---")}</strong>
                            <span style="color:#64748b;">${escapeHtml(it.ngayHienThi || "---")}</span>
                            <span style="color:#0f766e; font-weight:600;">• ${escapeHtml(it.chuyenText)}</span>
                        </div>
                        ${it.diaDiemText ? `<div style="font-size:11px; color:#475569; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ${escapeHtml(it.diaDiemText)}</div>` : ""}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <span style="font-size:13px; font-weight:700; color:#0f766e; white-space:nowrap;">
                            ${dinhDangTienHaiLe(it.soTien)}
                        </span>
                        <button type="button" onclick="batDauSuaDongBcp('${escapeHtml(it.id)}')" title="Sửa dòng này" style="border:1px solid #99f6e4; background:#f0fdfa; color:#0f766e; border-radius:6px; padding:5px 7px; font-size:11px; font-weight:700; cursor:pointer;">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        const optionsXe = dsXe.map((xe) => `<option value="${escapeHtml(xe)}" ${xe === it.bienSo ? "selected" : ""}>${escapeHtml(xe)}</option>`).join("");
        const optionsDiaDiem = dsDiaDiem.map((dd) => `<option value="${escapeHtml(dd)}" ${dd === it.diaDiemText ? "selected" : ""}>${escapeHtml(dd)}</option>`).join("");

        return `
            <div style="background:#f8fafc; border:1px solid #0f766e; border-left:4px solid #0f766e; border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700; color:#0f766e;">
                    <span>✏️ Sửa dòng Bến - Cầu - Phà</span>
                    <button type="button" onclick="huySuaDongBcp()" style="border:none; background:transparent; color:#64748b; font-size:12px; font-weight:700; cursor:pointer;">Huỷ</button>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <input type="date" id="editBcpNgay_${escapeHtml(it.id)}" value="${escapeHtml(it.ngayIso)}" onchange="taiChuyenSuaBcp('${escapeHtml(it.id)}')" style="flex:1; min-width:125px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#fff;" />
                    <select id="editBcpBienSo_${escapeHtml(it.id)}" onchange="taiChuyenSuaBcp('${escapeHtml(it.id)}')" style="flex:1; min-width:110px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700; background:#fff;">
                        <option value="">-- Xe --</option>
                        ${optionsXe}
                    </select>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <select id="editBcpChuyen_${escapeHtml(it.id)}" style="flex:1; min-width:120px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#fff;">
                        <option value="">-- Chuyến --</option>
                        ${it.chuyenId ? `<option value="${escapeHtml(it.chuyenId)}" selected>${escapeHtml(it.chuyenText)}</option>` : ""}
                    </select>
                    <input type="text" list="listDiaDiemSuaBcp_${escapeHtml(it.id)}" id="editBcpDiaDiem_${escapeHtml(it.id)}" value="${escapeHtml(it.diaDiemText)}" placeholder="Bến / Cầu / Phà..." style="flex:1.4; min-width:140px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#fff;" />
                    <datalist id="listDiaDiemSuaBcp_${escapeHtml(it.id)}">${optionsDiaDiem}</datalist>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="text" inputmode="decimal" id="editBcpSoTien_${escapeHtml(it.id)}" value="${escapeHtml(String(it.soTien))}" placeholder="Số tiền..." style="flex:1; padding:6px 8px; border:1px solid #0f766e; border-radius:6px; font-size:13px; font-weight:700; color:#0f766e; text-align:right; background:#fff;" />
                    <button type="button" onclick="luuSuaDongBcp('${escapeHtml(it.id)}')" style="padding:7px 12px; border:none; border-radius:6px; background:#0f766e; color:#fff; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">
                        <i class="fa-solid fa-check"></i> Lưu
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

window.taiChuyenSuaBcp = async function (docId, giaTriChuyenMacDinh = "") {
    const selChuyen = document.getElementById(`editBcpChuyen_${docId}`);
    if (!selChuyen) return;
    const ngayVal = document.getElementById(`editBcpNgay_${docId}`)?.value || "";
    const xeVal = document.getElementById(`editBcpBienSo_${docId}`)?.value || "";
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

window.batDauSuaDongBcp = async function (docId) {
    docIdDangSuaBcp = docId;
    renderDanhSachXemBcp();
    const it = cacheDanhSachBcp.get(docId);
    if (it) {
        await window.taiChuyenSuaBcp(docId, it.chuyenId);
    }
};

window.huySuaDongBcp = function () {
    docIdDangSuaBcp = "";
    renderDanhSachXemBcp();
};

window.luuSuaDongBcp = async function (docId) {
    const database = window.db || db;
    if (!database || !docId) return;

    const ngay = document.getElementById(`editBcpNgay_${docId}`)?.value || "";
    const bienSo = document.getElementById(`editBcpBienSo_${docId}`)?.value.trim() || "";
    const chuyenId = document.getElementById(`editBcpChuyen_${docId}`)?.value.trim() || "";
    const diaDiem = document.getElementById(`editBcpDiaDiem_${docId}`)?.value.trim() || "";
    const soTienRaw = document.getElementById(`editBcpSoTien_${docId}`)?.value || "";
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
        alert("Số tiền Bến - Cầu - Phà phải lớn hơn 0!");
        return;
    }

    const parts = ngay.split("-");
    const namNum = Number(parts[0]) || new Date().getFullYear();
    const thangNum = Number(parts[1]) || (new Date().getMonth() + 1);

    try {
        const ref = doc(collection(database, COLLECTION_BENCAUPHA), docId);
        const snap = await getDoc(ref);
        const oldData = snap.exists() ? (snap.data() || {}) : {};

        await updateDoc(ref, {
            ngay,
            bienSo,
            chuyenVtracking: chuyenId,
            chuyenId,
            tenChuyen: chuyenId ? `Chuyến ${chuyenId}` : "",
            chuyenKey: chuanHoaKeyChuyen(chuyenId),
            diaDiem,
            soTien,
            nam: namNum,
            thang: thangNum,
            ngayTaoHeThong: oldData.ngayTaoHeThong || dinhDangNgayGioHeThong(),
            ngayCapNhatHeThong: dinhDangNgayGioHeThong()
        });

        if (diaDiem) {
            danhSachDiaDiem.add(diaDiem);
            renderDanhSachDiaDiemBcp();
        }
        docIdDangSuaBcp = "";
        await window.xemLaiDanhSachBcp();
    } catch (err) {
        console.error("Lỗi cập nhật BENCAUPHA:", err);
        alert("Lỗi khi lưu chỉnh sửa Bến - Cầu - Phà: " + err.message);
    }
};

window.xemLaiDanhSachBcp = async function () {
    const database = window.db || db;
    const container = document.getElementById("danhSachXemBcp");
    if (!container || !database) return;

    const thangVal = document.getElementById("thangXemBcp")?.value || document.getElementById("thangVanChuyen")?.value || "";
    const xeLoc = chuanHoaBienSo(document.getElementById("filterXeXemBcp")?.value || document.getElementById("filterPhuongTien")?.value || "");

    let namLoc = 0;
    let thangLoc = 0;
    if (/^\d{4}-\d{2}$/.test(thangVal)) {
        const [y, m] = thangVal.split("-");
        namLoc = Number(y);
        thangLoc = Number(m);
    }

    container.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải Bến - Cầu - Phà...</div>`;

    try {
        const snap = (namLoc && thangLoc)
            ? await getDocs(query(collection(database, COLLECTION_BENCAUPHA), where("nam", "==", namLoc), where("thang", "==", thangLoc)))
            : await getDocs(query(collection(database, COLLECTION_BENCAUPHA), limit(150)));

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
            const diaDiemText = String(d.diaDiem || d.benCauPha || "").trim();

            nextCache.set(docSnap.id, {
                id: docSnap.id,
                ngayIso,
                ngayHienThi: ngayIso ? dinhDangNgayThangNam(ngayIso) : String(d.ngay || ""),
                bienSo: String(d.bienSo || "").trim(),
                chuyenId: chuyenVal,
                chuyenText,
                diaDiemText,
                soTien,
                sortKey: `${ngayIso || ""}|${d.ngayTaoHeThong || ""}|${docSnap.id}`
            });
        });

        cacheDanhSachBcp = nextCache;
        if (docIdDangSuaBcp && !cacheDanhSachBcp.has(docIdDangSuaBcp)) {
            docIdDangSuaBcp = "";
        }
        renderDanhSachXemBcp();
    } catch (err) {
        console.error("Lỗi tải lịch sử BENCAUPHA:", err);
        container.innerHTML = `<div style="text-align:center; color:#dc2626; font-size:12px; padding:10px;">Lỗi tải Bến - Cầu - Phà: ${escapeHtml(err.message)}</div>`;
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
            chuyenVtracking: thongTinChuyen.chuyenVtracking,
            chuyenId: thongTinChuyen.chuyenId,
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
        window.xemLaiDanhSachBcp();

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
