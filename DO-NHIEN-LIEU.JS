import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = window.db;

function khoiTaoMacDinhNhienLieu() {
    const inputNgayDo = document.getElementById("nlNgayDo");
    if (inputNgayDo && !inputNgayDo.value) {
        inputNgayDo.value = new Date().toISOString().slice(0, 10);
    }
}

window.tinhThanhTienNhienLieu = function () {
    const soLitInput = document.getElementById("nlSoLit");
    const donGiaInput = document.getElementById("nlDonGia");
    const soTienInput = document.getElementById("nlSoTien");
    if (!soLitInput || !donGiaInput || !soTienInput) return;

    const soLit = parseFloat(soLitInput.value) || 0;
    const donGia = parseFloat(donGiaInput.value) || 0;

    if (soLit > 0 && donGia > 0) {
        soTienInput.value = Math.round(soLit * donGia);
    } else if (!soLitInput.value && !donGiaInput.value) {
        soTienInput.value = "";
    }
};

window.luuNhienLieuVaoFirebase = async function () {
    const nutBam = document.getElementById("btnLuuNhienLieu");
    if (nutBam && nutBam.disabled) return;

    const ngayDo = document.getElementById("nlNgayDo")?.value || "";
    const bienSo = document.getElementById("nlBienSo")?.value.trim() || "";
    const soLitRaw = document.getElementById("nlSoLit")?.value;
    const donGiaRaw = document.getElementById("nlDonGia")?.value;
    const soTienRaw = document.getElementById("nlSoTien")?.value;
    const ghiChu = document.getElementById("nlGhiChu")?.value.trim() || "";

    const soLit = parseFloat(soLitRaw) || 0;
    const donGia = parseFloat(donGiaRaw) || 0;
    const soTien = soTienRaw !== "" && soTienRaw !== undefined
        ? (parseFloat(soTienRaw) || 0)
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
        const duLieuNhienLieu = {
            ngayDo: ngayDo,
            bienSo: bienSo,
            soLit: soLit,
            donGia: donGia,
            soTien: soTien,
            nam: namNum,
            thang: thangNum,
            ghiChu: ghiChu,
            ngayTaoHeThong: new Date().toISOString()
        };

        await addDoc(collection(db, "NHIENLIEU"), duLieuNhienLieu);

        if (nutBam) {
            nutBam.style.background = "#15803d";
            nutBam.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã lưu (${soLit} lít - ${bienSo})`;
        }

        document.getElementById("nlSoLit").value = "";
        document.getElementById("nlDonGia").value = "";
        document.getElementById("nlSoTien").value = "";
        document.getElementById("nlGhiChu").value = "";

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
