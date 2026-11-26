import { collection, doc, setDoc, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;
let donGiaGoiYMacDinh = 0;

function khoiTaoMacDinhNhienLieu() {
    const inputNgayDo = document.getElementById("nlNgayDo");
    if (inputNgayDo && !inputNgayDo.value) {
        inputNgayDo.value = new Date().toISOString().slice(0, 10);
    }
    window.tinhThanhTienNhienLieu();
    window.goiYDonGiaGanNhat({ tuDongDienNeuTrong: true });
}

function chuanHoaSoNhap(val, choPhepThapPhan = true) {
    if (val === undefined || val === null) return "";
    let s = String(val).replace(/,/g, ".");
    if (choPhepThapPhan) {
        s = s.replace(/[^0-9.]/g, "");
        const firstDot = s.indexOf(".");
        if (firstDot !== -1) {
            s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
        }
    } else {
        s = s.replace(/[^0-9]/g, "");
    }
    return s;
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

function taoDocIdNhienLieu(ngayDo, bienSo, nowDate = new Date()) {
    const hh = String(nowDate.getHours()).padStart(2, "0");
    const mm = String(nowDate.getMinutes()).padStart(2, "0");
    const ss = String(nowDate.getSeconds()).padStart(2, "0");
    const bienSoClean = String(bienSo || "").trim().replace(/\s+/g, "");
    return `${ngayDo}_${bienSoClean}_${hh}:${mm}:${ss}`;
}

function chonBanGhiMoiNhat(docsSnap) {
    let best = null;
    docsSnap.forEach((d) => {
        const data = d.data() || {};
        const donGia = Number(data.donGia) || 0;
        if (donGia <= 0) return;

        const key = `${data.ngayDo || ""}|${data.ngayTaoHeThong || ""}|${d.id}`;
        if (!best || key > best.key) {
            best = { key, id: d.id, data };
        }
    });
    return best ? best.data : null;
}

window.apDungDonGiaGoiY = function (donGia) {
    const donGiaInput = document.getElementById("nlDonGia");
    if (!donGiaInput || !donGia) return;
    donGiaInput.value = String(Math.round(Number(donGia)));
    window.tinhThanhTienNhienLieu();
};

window.goiYDonGiaGanNhat = async function ({ tuDongDienNeuTrong = false } = {}) {
    const labelGoiY = document.getElementById("goiYDonGiaNl");
    const donGiaInput = document.getElementById("nlDonGia");
    if (!labelGoiY || !db) return;

    try {
        const qAll = query(
            collection(db, "NHIENLIEU"),
            orderBy("ngayDo", "desc"),
            limit(10)
        );
        const snapAll = await getDocs(qAll);
        const banGhi = chonBanGhiMoiNhat(snapAll);

        if (banGhi && Number(banGhi.donGia) > 0) {
            const dg = Math.round(Number(banGhi.donGia));
            donGiaGoiYMacDinh = dg;
            const ngayText = banGhi.ngayDo ? banGhi.ngayDo.split("-").reverse().join("/") : "";
            const datePart = ngayText ? ` (${ngayText})` : "";

            labelGoiY.innerHTML = `Gợi ý${datePart}: <a href="javascript:void(0)" onclick="apDungDonGiaGoiY(${dg})" style="color:#16a34a; font-weight:700; text-decoration:underline;">${dg.toLocaleString("vi-VN")} đ</a>`;

            if (tuDongDienNeuTrong && donGiaInput && !donGiaInput.value.trim()) {
                donGiaInput.value = String(dg);
                window.tinhThanhTienNhienLieu();
            }
        } else {
            labelGoiY.textContent = "";
        }
    } catch (err) {
        try {
            const snapFallback = await getDocs(query(collection(db, "NHIENLIEU"), limit(15)));
            const banGhi = chonBanGhiMoiNhat(snapFallback);
            if (banGhi && Number(banGhi.donGia) > 0) {
                const dg = Math.round(Number(banGhi.donGia));
                donGiaGoiYMacDinh = dg;
                const ngayText = banGhi.ngayDo ? banGhi.ngayDo.split("-").reverse().join("/") : "";
                const datePart = ngayText ? ` (${ngayText})` : "";
                labelGoiY.innerHTML = `Gợi ý${datePart}: <a href="javascript:void(0)" onclick="apDungDonGiaGoiY(${dg})" style="color:#16a34a; font-weight:700; text-decoration:underline;">${dg.toLocaleString("vi-VN")} đ</a>`;
                if (tuDongDienNeuTrong && donGiaInput && !donGiaInput.value.trim()) {
                    donGiaInput.value = String(dg);
                    window.tinhThanhTienNhienLieu();
                }
            } else {
                labelGoiY.textContent = "";
            }
        } catch (err2) {
            console.warn("Không lấy được đơn giá gợi ý:", err2);
        }
    }
};

window.tinhThanhTienNhienLieu = function () {
    const soLitInput = document.getElementById("nlSoLit");
    const donGiaInput = document.getElementById("nlDonGia");
    const soTienInput = document.getElementById("nlSoTien");
    if (!soLitInput || !donGiaInput || !soTienInput) return;

    const cleanLit = chuanHoaSoNhap(soLitInput.value, true);
    if (soLitInput.value !== cleanLit) {
        soLitInput.value = cleanLit;
    }

    const cleanDonGia = chuanHoaSoNhap(donGiaInput.value, false);
    if (donGiaInput.value !== cleanDonGia) {
        donGiaInput.value = cleanDonGia;
    }

    const soLit = parseFloat(cleanLit) || 0;
    const donGia = parseFloat(cleanDonGia) || 0;
    const thanhTien = soLit > 0 && donGia > 0 ? Math.round(soLit * donGia) : 0;

    soTienInput.dataset.raw = String(thanhTien);
    soTienInput.value = dinhDangHangNghin(thanhTien);
};

window.luuNhienLieuVaoFirebase = async function () {
    const nutBam = document.getElementById("btnLuuNhienLieu");
    if (nutBam && nutBam.disabled) return;

    const ngayDo = document.getElementById("nlNgayDo")?.value || "";
    const bienSo = document.getElementById("nlBienSo")?.value.trim() || "";
    const soLitRaw = document.getElementById("nlSoLit")?.value;
    const donGiaRaw = document.getElementById("nlDonGia")?.value;
    const soTienInput = document.getElementById("nlSoTien");
    const ghiChu = document.getElementById("nlGhiChu")?.value.trim() || "";

    const soLit = parseFloat(chuanHoaSoNhap(soLitRaw, true)) || 0;
    const donGia = parseFloat(chuanHoaSoNhap(donGiaRaw, false)) || 0;
    const soTien = soTienInput?.dataset.raw !== undefined
        ? (parseFloat(soTienInput.dataset.raw) || 0)
        : Math.round(soLit * donGia);

    if (!ngayDo) {
        alert("Vui lòng chọn Ngày đổ nhiên liệu!");
        return;
    }
    if (!bienSo) {
        alert("Vui lòng chọn Phương tiện!");
        return;
    }
    if (soLit <= 0) {
        alert("Vui lòng nhập Số lít đổ lớn hơn 0!");
        return;
    }

    const parts = ngayDo.split("-");
    const namNum = Number(parts[0]) || new Date().getFullYear();
    const thangNum = Number(parts[1]) || (new Date().getMonth() + 1);

    if (nutBam) {
        nutBam.disabled = true;
        nutBam.style.opacity = "0.6";
        nutBam.style.cursor = "not-allowed";
        nutBam.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu nhiên liệu...`;
    }

    try {
        const now = new Date();
        const docId = taoDocIdNhienLieu(ngayDo, bienSo, now);

        const duLieuNhienLieu = {
            ngayDo: ngayDo,
            bienSo: bienSo,
            soLit: soLit,
            donGia: donGia,
            soTien: soTien,
            nam: namNum,
            thang: thangNum,
            ghiChu: ghiChu,
            ngayTaoHeThong: dinhDangNgayGioHeThong(now)
        };

        await setDoc(doc(collection(db, "NHIENLIEU"), docId), duLieuNhienLieu);

        if (nutBam) {
            nutBam.style.background = "#15803d";
            nutBam.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã lưu (${soLit} lít - ${bienSo})`;
        }

        document.getElementById("nlSoLit").value = "";
        document.getElementById("nlDonGia").value = donGiaGoiYMacDinh ? String(donGiaGoiYMacDinh) : "";
        if (soTienInput) {
            soTienInput.dataset.raw = "0";
            soTienInput.value = dinhDangHangNghin(0);
        }
        document.getElementById("nlGhiChu").value = "";
        window.goiYDonGiaGanNhat({ tuDongDienNeuTrong: true });

        await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
        console.error("Lỗi lưu collection NHIENLIEU:", error);
        alert("Lỗi khi lưu lần đổ nhiên liệu: " + error.message);
    } finally {
        if (nutBam) {
            nutBam.disabled = false;
            nutBam.style.opacity = "1";
            nutBam.style.background = "#16a34a";
            nutBam.style.cursor = "pointer";
            nutBam.innerHTML = `<i class="fa-solid fa-gas-pump"></i> Lưu lần đổ nhiên liệu`;
        }
    }
};

document.addEventListener("DOMContentLoaded", khoiTaoMacDinhNhienLieu);
