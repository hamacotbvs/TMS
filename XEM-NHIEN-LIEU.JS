import { collection, doc, updateDoc, getDoc, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;
const COLLECTION_NHIENLIEU = "NHIENLIEU";
const XE_MAC_DINH = ["65C-06126", "65H-02591", "65C-12290"];

let cacheDanhSachNhienLieu = new Map();
let docIdDangSuaNhienLieu = "";

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

function parseSoThapPhan(val) {
    if (val === undefined || val === null) return 0;
    const s = String(val).replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const firstDot = s.indexOf(".");
    let clean = s;
    if (firstDot !== -1) {
        clean = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    }
    const num = parseFloat(clean);
    return Number.isFinite(num) ? num : 0;
}

function lamTronHaiLe(so) {
    return Math.round((Number(so) || 0) * 100) / 100;
}

function dinhDangTien(so) {
    const num = Math.round(Number(so) || 0);
    return num.toLocaleString("vi-VN") + " đ";
}

function dinhDangLit(so) {
    const num = lamTronHaiLe(so);
    return num.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " L";
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

function khoiTaoMacDinhXemNhienLieu() {
    const thangMacDinh = document.getElementById("thangVanChuyen")?.value || new Date().toISOString().slice(0, 7);
    ["thangVanChuyen", "thangXemNhienLieu", "thangXemEpass", "thangXemBcp"].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = thangMacDinh;
    });
    window.xemLaiDanhSachNhienLieu();
}

window.capNhatThanhTienSuaNhienLieu = function (docId) {
    const soLit = lamTronHaiLe(parseSoThapPhan(document.getElementById(`editNlSoLit_${docId}`)?.value));
    const donGia = Math.round(parseSoThapPhan(document.getElementById(`editNlDonGia_${docId}`)?.value));
    const thanhTien = Math.round(soLit * donGia);
    const lbl = document.getElementById(`editNlThanhTien_${docId}`);
    if (lbl) {
        lbl.textContent = dinhDangTien(thanhTien);
    }
};

function renderDanhSachXemNhienLieu() {
    const container = document.getElementById("danhSachXemNhienLieu");
    const lblTong = document.getElementById("tongTienXemNhienLieu");
    if (!container) return;

    const items = Array.from(cacheDanhSachNhienLieu.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    const tongTien = items.reduce((acc, it) => acc + (Number(it.thanhTien) || 0), 0);
    const tongLit = lamTronHaiLe(items.reduce((acc, it) => acc + (Number(it.soLit) || 0), 0));

    if (lblTong) {
        lblTong.textContent = `${items.length} lần • ${dinhDangLit(tongLit)} • ${dinhDangTien(tongTien)}`;
    }

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#94a3b8; font-size:12px; padding:12px;">Không có dữ liệu nhiên liệu khớp tháng / xe.</div>`;
        return;
    }

    const dsXe = Array.from(new Set([...XE_MAC_DINH, ...items.map((x) => x.bienSo).filter(Boolean)]));

    container.innerHTML = items.map((it) => {
        const isEditing = docIdDangSuaNhienLieu === it.id;
        if (!isEditing) {
            return `
                <div style="background:#fff; border:1px solid #e2e8f0; border-left:4px solid #16a34a; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div style="min-width:0; flex:1;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11px;">
                            <strong style="color:#1e293b;">${escapeHtml(it.bienSo || "---")}</strong>
                            <span style="color:#64748b;">${escapeHtml(it.ngayHienThi || "---")}</span>
                            <span style="color:#16a34a; font-weight:700;">• ${dinhDangLit(it.soLit)}</span>
                            <span style="color:#475569;">x ${dinhDangTien(it.donGia)}</span>
                        </div>
                        ${it.ghiChu ? `<div style="font-size:11px; color:#475569; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📝 ${escapeHtml(it.ghiChu)}</div>` : ""}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                        <span style="font-size:13px; font-weight:700; color:#16a34a; white-space:nowrap;">
                            ${dinhDangTien(it.thanhTien)}
                        </span>
                        <button type="button" onclick="batDauSuaDongNhienLieu('${escapeHtml(it.id)}')" title="Sửa dòng này" style="border:1px solid #bbf7d0; background:#f0fdf4; color:#16a34a; border-radius:6px; padding:5px 7px; font-size:11px; font-weight:700; cursor:pointer;">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        const optionsXe = dsXe.map((xe) => `<option value="${escapeHtml(xe)}" ${xe === it.bienSo ? "selected" : ""}>${escapeHtml(xe)}</option>`).join("");

        return `
            <div style="background:#f8fafc; border:1px solid #16a34a; border-left:4px solid #16a34a; border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700; color:#16a34a;">
                    <span>✏️ Sửa lần đổ nhiên liệu</span>
                    <button type="button" onclick="huySuaDongNhienLieu()" style="border:none; background:transparent; color:#64748b; font-size:12px; font-weight:700; cursor:pointer;">Huỷ</button>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <input type="date" id="editNlNgay_${escapeHtml(it.id)}" value="${escapeHtml(it.ngayIso)}" style="flex:1; min-width:125px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#fff;" />
                    <select id="editNlBienSo_${escapeHtml(it.id)}" style="flex:1; min-width:110px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700; background:#fff;">
                        <option value="">-- Xe --</option>
                        ${optionsXe}
                    </select>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <input type="text" inputmode="decimal" id="editNlSoLit_${escapeHtml(it.id)}" value="${escapeHtml(String(it.soLit))}" oninput="capNhatThanhTienSuaNhienLieu('${escapeHtml(it.id)}')" placeholder="Số lít..." style="flex:1; min-width:95px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700; color:#0284c7; text-align:right; background:#fff;" />
                    <input type="text" inputmode="numeric" id="editNlDonGia_${escapeHtml(it.id)}" value="${escapeHtml(String(Math.round(it.donGia)))}" oninput="capNhatThanhTienSuaNhienLieu('${escapeHtml(it.id)}')" placeholder="Đơn giá..." style="flex:1.2; min-width:110px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700; text-align:right; background:#fff;" />
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <input type="text" id="editNlGhiChu_${escapeHtml(it.id)}" value="${escapeHtml(it.ghiChu)}" placeholder="Ghi chú..." style="flex:1.4; min-width:130px; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; background:#fff;" />
                    <span id="editNlThanhTien_${escapeHtml(it.id)}" style="font-size:13px; font-weight:700; color:#16a34a; white-space:nowrap;">${dinhDangTien(it.thanhTien)}</span>
                    <button type="button" onclick="luuSuaDongNhienLieu('${escapeHtml(it.id)}')" style="padding:7px 12px; border:none; border-radius:6px; background:#16a34a; color:#fff; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">
                        <i class="fa-solid fa-check"></i> Lưu
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

window.batDauSuaDongNhienLieu = function (docId) {
    docIdDangSuaNhienLieu = docId;
    renderDanhSachXemNhienLieu();
};

window.huySuaDongNhienLieu = function () {
    docIdDangSuaNhienLieu = "";
    renderDanhSachXemNhienLieu();
};

window.luuSuaDongNhienLieu = async function (docId) {
    const database = window.db || db;
    if (!database || !docId) return;

    const ngay = document.getElementById(`editNlNgay_${docId}`)?.value || "";
    const bienSo = document.getElementById(`editNlBienSo_${docId}`)?.value.trim() || "";
    const soLit = lamTronHaiLe(parseSoThapPhan(document.getElementById(`editNlSoLit_${docId}`)?.value));
    const donGia = Math.round(parseSoThapPhan(document.getElementById(`editNlDonGia_${docId}`)?.value));
    const ghiChu = document.getElementById(`editNlGhiChu_${docId}`)?.value.trim() || "";
    const thanhTien = Math.round(soLit * donGia);

    if (!ngay) {
        alert("Vui lòng chọn Ngày đổ nhiên liệu!");
        return;
    }
    if (!bienSo) {
        alert("Vui lòng chọn Phương tiện!");
        return;
    }
    if (soLit <= 0) {
        alert("Số lít đổ phải lớn hơn 0!");
        return;
    }
    if (donGia <= 0) {
        alert("Đơn giá nhiên liệu phải lớn hơn 0!");
        return;
    }

    const parts = ngay.split("-");
    const namNum = Number(parts[0]) || new Date().getFullYear();
    const thangNum = Number(parts[1]) || (new Date().getMonth() + 1);

    try {
        const ref = doc(collection(database, COLLECTION_NHIENLIEU), docId);
        const snap = await getDoc(ref);
        const oldData = snap.exists() ? (snap.data() || {}) : {};

        await updateDoc(ref, {
            ngayDo: ngay,
            ngay: ngay,
            bienSo,
            soLit,
            donGia,
            thanhTien,
            soTien: thanhTien,
            ghiChu,
            nam: namNum,
            thang: thangNum,
            ngayTaoHeThong: oldData.ngayTaoHeThong || dinhDangNgayGioHeThong(),
            ngayCapNhatHeThong: dinhDangNgayGioHeThong()
        });

        docIdDangSuaNhienLieu = "";
        await window.xemLaiDanhSachNhienLieu();
    } catch (err) {
        console.error("Lỗi cập nhật NHIENLIEU:", err);
        alert("Lỗi khi lưu chỉnh sửa nhiên liệu: " + err.message);
    }
};

window.xemLaiDanhSachNhienLieu = async function () {
    const database = window.db || db;
    const container = document.getElementById("danhSachXemNhienLieu");
    if (!container || !database) return;

    const thangVal = document.getElementById("thangXemNhienLieu")?.value || document.getElementById("thangVanChuyen")?.value || "";
    const xeLoc = chuanHoaBienSo(document.getElementById("filterXeXemNhienLieu")?.value || document.getElementById("filterPhuongTien")?.value || "");

    let namLoc = 0;
    let thangLoc = 0;
    if (/^\d{4}-\d{2}$/.test(thangVal)) {
        const [y, m] = thangVal.split("-");
        namLoc = Number(y);
        thangLoc = Number(m);
    }

    container.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải nhiên liệu...</div>`;

    try {
        const snap = (namLoc && thangLoc)
            ? await getDocs(query(collection(database, COLLECTION_NHIENLIEU), where("nam", "==", namLoc), where("thang", "==", thangLoc)))
            : await getDocs(query(collection(database, COLLECTION_NHIENLIEU), limit(150)));

        const nextCache = new Map();
        snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            if (xeLoc && chuanHoaBienSo(d.bienSo || "") !== xeLoc) return;

            const soLit = lamTronHaiLe(d.soLit || 0);
            const donGia = Math.round(Number(d.donGia) || 0);
            const thanhTien = Math.round(Number(d.thanhTien ?? d.soTien) || (soLit * donGia));
            const ngayIso = chuanHoaNgayIso(d.ngayDo || d.ngay || "");
            const ghiChu = String(d.ghiChu || "").trim();

            nextCache.set(docSnap.id, {
                id: docSnap.id,
                ngayIso,
                ngayHienThi: ngayIso ? dinhDangNgayThangNam(ngayIso) : String(d.ngayDo || d.ngay || ""),
                bienSo: String(d.bienSo || "").trim(),
                soLit,
                donGia,
                thanhTien,
                ghiChu,
                sortKey: `${ngayIso || ""}|${d.ngayTaoHeThong || ""}|${docSnap.id}`
            });
        });

        cacheDanhSachNhienLieu = nextCache;
        if (docIdDangSuaNhienLieu && !cacheDanhSachNhienLieu.has(docIdDangSuaNhienLieu)) {
            docIdDangSuaNhienLieu = "";
        }
        renderDanhSachXemNhienLieu();
    } catch (err) {
        console.error("Lỗi tải lịch sử NHIENLIEU:", err);
        container.innerHTML = `<div style="text-align:center; color:#dc2626; font-size:12px; padding:10px;">Lỗi tải nhiên liệu: ${escapeHtml(err.message)}</div>`;
    }
};

document.addEventListener("DOMContentLoaded", khoiTaoMacDinhXemNhienLieu);
