
// if ("serviceWorker" in navigator) {
      //   navigator.serviceWorker.register("/sw.js")
      //     .then(() => console.log("Service Worker registered"));
      // }
let db;

// Open DB
const openReq = indexedDB.open("palletDB", 1);
openReq.onupgradeneeded = (event) => {
  const db = event.target.result;
  if (!db.objectStoreNames.contains("pallets")) {
    const store = db.createObjectStore("pallets", { keyPath: "pallet" });
  }
};
openReq.onsuccess = (event) => {
  db = event.target.result;
  renderList();
};

function setStatus(msg, isError = false, duration = 2000) {
  // const el = document.getElementById('status');
  // el.textContent = msg;
  // el.style.color = isError ? '#c00' : '#070';
  const status = document.getElementById("status");
  status.textContent = msg;
  status.classList.add("show");

  // hilang otomatis
  setTimeout(() => {
    status.classList.remove("show");
  }, duration);
}

function saveData(pallet, gulungan) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pallets", "readwrite");
    const store = tx.objectStore("pallets");
    const getReq = store.get(pallet);

    getReq.onsuccess = () => {
      let record = getReq.result || {
        pallet,
        gulungan: [],
        seriJenis: null,
      };

      // siapkan array error
      gulungan.errors = [];

      // ✅ 1. NO GUL kosong / 0 / x
      if (
        !gulungan.noGul ||
        gulungan.noGul === "0" ||
        gulungan.noGul.toLowerCase() === "x"
      ) {
        gulungan.errors.push({
          type: "NO_GUL",
          message: "No gul kosong atau tidak valid",
        });
      }

      // ✅ 2. NO GUL dobel
      const isDuplicate = record.gulungan.some(
        (g) => g.noGul === gulungan.noGul
      );
      if (isDuplicate) {
        gulungan.errors.push({
          type: "NO_GUL",
          message: "No gul dobel dalam pallet",
        });
      }

      // ✅ 3. Seri tidak ada di master
      const jenisBaru = getSeriJenis(gulungan.seri);
      if (!jenisBaru) {
        gulungan.errors.push({
          type: "SERI",
          message: `Seri ${gulungan.seri} tidak ada di master`,
        });
      }

      // ✅ 4. Seri beda dari pallet (salah naruh kain)
      if (
        record.seriJenis &&
        jenisBaru &&
        record.seriJenis !== jenisBaru
      ) {
        gulungan.errors.push({
          type: "SERI",
          message: `Seri beda! Pallet ini ${record.seriJenis}, gulungan ${jenisBaru}`,
        });
      }

      // jika pallet belum punya seriJenis → tetapkan
      if (!record.seriJenis && jenisBaru) {
        record.seriJenis = jenisBaru;
      }

      // simpan gulungan
      record.gulungan.push(gulungan);
      store.put(record);
      resolve();
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

const panjangInput = document.getElementById("panjang");
const noGulInput = document.getElementById("noGul");
const form = document.getElementById("data-form");

panjangInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault(); // cegah submit default

    // trigger submit form secara manual
    form.dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true })
    );

    // setelah submit selesai, fokus balik ke No Gul
    setTimeout(() => {
      noGulInput.focus();
    }, 100); // beri sedikit delay agar IndexedDB selesai
  }
});

function getAll() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pallets", "readonly");
    const store = tx.objectStore("pallets");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function renderList() {
  if (!db) return;
  const pallets = await getAll();
  // const groups = groupPallets(pallets);
  const container = document.getElementById("pallet-list");
  container.innerHTML = "";

  pallets.forEach((p) => {
    const { totalGulung, totalPanjang } = getPalletSummary(p);
    const isActive = currentInputPallet === p.pallet;
    const div = document.createElement("div");
    const hasError = p.gulungan.some(
      (g) => g.errors && g.errors.length > 0
    );

    const totals = getTotalPerBenang(pallets);
    const totalContainer = document.getElementById("total-benang");

    totalContainer.innerHTML = `

<table style="width:100%; border-collapse: collapse; margin:12px;">
<thead>
<tr style="background:#eee;">
  <th style="border:1px solid #ccc; ">Benang</th>
  <th style="border:1px solid #ccc; ">Total Gulung</th>
  <th style="border:1px solid #ccc; ">Total Panjang</th>
</tr>
</thead>
<tbody>

${Object.keys(totals)

  .map(
    (key) => `
  <tr>
    <td style="border:1px solid #ccc; ">${key}</td>
    <td style="border:1px solid #ccc; ">${totals[key].gulung}</td>
    <td style="border:1px solid #ccc; ">${totals[key].panjang}</td>
  </tr>
`
  )
  .join("")}
  
</tbody>
</table>
`;
    div.className = "pallet";
    div.innerHTML = `
  <div class="pallet-header 
${hasError ? "pallet-error" : ""} 
${p.verifyStatus === "ok" ? "pallet-verified-ok" : ""} 
${p.verifyStatus === "error" ? "pallet-verified-error" : ""}" 
   onclick="togglePallet('${p.pallet}')">
   <strong 
onmousedown="startLineHold('${p.pallet}', this)"
onmouseup="endLineHold()"
ontouchstart="startLineHold('${p.pallet}', this)"
ontouchend="endLineHold()">
<span>${p.pallet} - 
${p.seriJenis || ""} ${
      hasError ? `<span class='header-error-flag'>⚠</span>` : ""
    }</span>
<span>[ ${totalGulung} / 
     ${totalPanjang} ]</span>
     <div class="verify-buttons">
<button onclick="setPalletVerify('${p.pallet}', 'ok')">✅</button>
<button onclick="setPalletVerify('${p.pallet}', 'error')">❌</button>
</div>
</strong>
</div>
<div class="pallet-body ${isActive ? "show" : "hide"}">
<table style="width:100%; border-collapse: collapse; margin-top:8px;">
<thead>
 <tr style="background:#eee;">
   <th style="border:1px solid #ccc; ">No Gul</th>
   <th style="border:1px solid #ccc; ">Seri</th>
   <th style="border:1px solid #ccc; ">pjg </th>
   <th style="border:1px solid #ccc; ">Aksi</th>
 </tr>
</thead>
<tbody>
${p.gulungan
  .map((g, idx) => {
    const hasError =
      (g.errors && g.errors.length > 0) ||
      (g.errorsManual && Object.keys(g.errorsManual).length > 0);

    const errManualNo = g.errorsManual?.noGul;
    const errManualSeri = g.errorsManual?.seri;
    const errManualPjg = g.errorsManual?.panjang;

    // cek error per kolom
    const errNoGul = g.errors?.some((e) => e.type === "NO_GUL");
    const errSeri = g.errors?.some((e) => e.type === "SERI");
    const errPjg = g.errors?.some((e) => e.type === "PANJANG");

    const errorFlag = hasError
      ? `<span class="error-flag" onclick="showGulError('${p.pallet}', ${idx})">*</span>`
      : "";

    return `
<tr>
<!-- NO GUL -->
<td class="${errNoGul | errManualNo ? "error-cell" : ""} "
    style="border:1px solid #ccc; "
    onmousedown="startHold('${p.pallet}', ${idx}, this)"
    onmouseup="endHold()"
    ontouchstart="startHold('${p.pallet}', ${idx}, this)"
    ontouchend="endHold()">
    ${g.mark || ""} ${g.noGul} ${errorFlag}
</td>

<!-- SERI -->
<td class="${errSeri | errManualSeri ? "error-cell" : ""}"
    style="border:1px solid #ccc; "
    onmousedown="startManualEdit('${p.pallet}', ${idx}, 'seri')">
    ${g.seri}
</td>

<!-- PANJANG -->
<td class="${errPjg | errManualPjg ? "error-cell" : ""}"
onmousedown="startManualEdit('${p.pallet}', ${idx}, 'pjg')"
    style="border:1px solid #ccc; ">
    ${g.panjang}
</td>

<td style="border:1px solid #ccc; ">
  <button onclick="handleEdit('${p.pallet}', ${idx})">edit</button>
  <button onclick="handleDelete('${p.pallet}', ${idx})">Delete</button>
</td>
</tr>
`;
  })
  .join("")}


</tbody>
</table>
</div>
<div id="mark-popup" style="
display:none;
position:absolute;
background:#fff;
border:1px solid #ccc;
border-radius:8px;
padding:8px;
box-shadow:0 4px 12px rgba(0,0,0,0.2);
z-index:1000;
">
<button onclick="applyMark('_')">_</button>
<button onclick="applyMark('<')"><</button>
<button onclick="applyMark('a')">a</button>
<button onclick="deleteMark()">Hapus</button>d
<button onclick="closeMarkPopup()">✕</button>
</div>


`;
    container.appendChild(div);
  });
}
let lastPallet = "";

// input data submit
document
  .getElementById("data-form")
  .addEventListener("submit", async (e) => {
    const data = new FormData(document
      .getElementById("data-form"));
    e.preventDefault();
    const pallet = document.getElementById("pallet").value.trim();
    const noGul = document.getElementById("noGul").value.trim();
    const seri = document.getElementById("seri").value.trim();
    const panjang = Number(
      document.getElementById("panjang").value.trim()
    );
    const markInput = document.querySelector('input[name="mark2"]:checked').value;

    // const markInput = document.getElementById("mark").value;
    // const markInput2 = document.getElementById("mark2").value;
    // const mark =
    // markInput && markInput.value ? markInput.value : "";
    // console.log(mark);
    if (!pallet || !noGul || !seri || Number.isNaN(panjang)) {
      setStatus("Isi semua data dengan benar.", true);
      return;
    }

    const gulungan = { noGul, seri, panjang };
    if (markInput) gulungan.mark = markInput; // hanya tambahkan jika ada
    try {
      await saveData(pallet, gulungan);
      await detectDuplicateNoGul();
      setStatus("Data tersimpan.");
      lastPallet = pallet;
      e.target.reset();
      document.getElementById("pallet").value = lastPallet;
      document.getElementById("noGul").focus();
      renderList();
    } catch (err) {
      setStatus("Gagal menyimpan.", true);
    }
  });

// Edit gulungan in a pallet by index
function editGulungan(pallet, index, newData) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pallets", "readwrite");
    const store = tx.objectStore("pallets");
    const getReq = store.get(pallet);
    getReq.onsuccess = () => {
      detectDuplicateNoGul();
      const record = getReq.result;
      if (!record || !record.gulungan[index]) {
        reject("Data tidak ditemukan");
        return;
      }
      record.gulungan[index] = { ...record.gulungan[index], ...newData };
      store.put(record);
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// Delete gulungan in a pallet by index
function deleteGulungan(pallet, index) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pallets", "readwrite");
    const store = tx.objectStore("pallets");
    const getReq = store.get(pallet);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record || !record.gulungan[index]) {
        reject("Data tidak ditemukan");
        return;
      }
      record.gulungan.splice(index, 1);
      store.put(record);
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}
async function handleEdit(pallet, index) {
  const noGul = prompt("No Gul baru:");
  const seri = prompt("Seri baru:");
  const panjang = Number(prompt("Panjang baru (m):"));
  try {
    await editGulungan(pallet, index, { noGul, seri, panjang });
    await recalcAutoErrors();
    setStatus("Data berhasil diubah.");
    renderList();
  } catch (err) {
    setStatus("Gagal edit data.", true);
  }
}

async function handleDelete(pallet, index) {
  if (!confirm("Yakin hapus data ini?")) return;
  try {
    await deleteGulungan(pallet, index);
    setStatus("Data berhasil dihapus.");
    renderList();
  } catch (err) {
    setStatus("Gagal hapus data.", true);
  }
}

async function copyAllToClipboard() {
  if (!db) {
    setStatus("Database belum siap.", true);
    return;
  }
  const pallets = await getAll();
  let lines = [];
  let text = "";

  pallets.forEach((p) => {
    if (p.verifyStatus === "ok") return;

    // ✅ Pallet lain tetap ikut
    text += `Pallet: ${p.pallet} - ${p.seriJenis || ""}\n`;

    p.gulungan.forEach((g) => {
      text += `${g.noGul}\t${g.seri}\t${g.panjang}\n`;
    });

    text += "\n";

    console.log(p);
    lines.push(`\t${p.pallet} \t${p.seriJenis}`);
    p.gulungan.forEach((g) => {
      lines.push(`${g.noGul}\t${g.seri}\t${g.panjang}\t${g.mark || ""}`);
    });
  });
  text = lines.join("\n");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Data berhasil disalin ke clipboard.");
      return;
    } catch (err) {
      console.error("Clipboard API gagal:", err);
    }
  }

  // Fallback untuk browser mobile lama
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed"; // hindari scroll ke bawah
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const successful = document.execCommand("copy");
    setStatus(
      successful
        ? "Data berhasil disalin (fallback)."
        : "Gagal menyalin data.",
      !successful
    );
  } catch (err) {
    setStatus("Gagal menyalin data.", true);
    console.error(err);
  }

  document.body.removeChild(textarea);
}
function flushAllData() {
  if (!db) {
    setStatus("Database belum siap.", true);
    return;
  }

  // tampilkan dialog konfirmasi
  if (!confirm("Yakin ingin menghapus SEMUA data pallet dan gulungan?")) {
    return; // batal jika user pilih Cancel
  }

  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  const clearReq = store.clear();
  clearReq.onsuccess = () => {
    setStatus("Semua data berhasil dihapus.");
    renderList();
  };
  clearReq.onerror = () => {
    setStatus("Gagal menghapus semua data.", true);
  };
}

let holdTimer;
let currentPallet = null;
let currentIndex = null;

function startHold(pallet, index, el) {
  holdTimer = setTimeout(() => {
    currentPallet = pallet;
    currentIndex = index;
    const popup = document.getElementById("mark-popup");
    const rect = el.getBoundingClientRect();
    popup.style.top = window.scrollY + rect.bottom + 5 + "px";
    popup.style.left = window.scrollX + rect.left + "px";
    popup.style.display = "block";
  }, 600); // long press 600ms
}

function endHold() {
  clearTimeout(holdTimer);
}

function closeMarkPopup() {
  document.getElementById("mark-popup").style.display = "none";
  currentPallet = null;
  currentIndex = null;
}

function applyMark(mark) {
  if (!currentPallet && currentIndex == null) return;
  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  const getReq = store.get(currentPallet);
  getReq.onsuccess = () => {
    const record = getReq.result;
    record.gulungan[currentIndex].mark = mark;
    store.put(record);
    renderList();
    closeMarkPopup();
  };
}
function deleteMark() {
  if (!currentPallet && currentIndex == null) return;
  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  const getReq = store.get(currentPallet);
  getReq.onsuccess = () => {
    const record = getReq.result;
    // hapus mark dengan set ke null/undefined
    delete record.gulungan[currentIndex].mark;
    store.put(record);
    renderList();
    closeMarkPopup();
  };
}

// edit title line
let lineHoldTimer;
let currentLine = null;

function startLineHold(pallet, el) {
  lineHoldTimer = setTimeout(() => {
    currentLine = pallet;
    const popup = document.getElementById("line-popup");
    const input = document.getElementById("line-input");
    input.value = pallet; // isi default nama lama

    const rect = el.getBoundingClientRect();
    popup.style.top = window.scrollY + rect.bottom + 5 + "px";
    popup.style.left = window.scrollX + rect.left + "px";
    popup.style.display = "block";
  }, 600); // long press 600ms
}

function endLineHold() {
  clearTimeout(lineHoldTimer);
}

function closeLinePopup() {
  document.getElementById("line-popup").style.display = "none";
  currentLine = null;
}

function applyLineEdit() {
  const newName = document.getElementById("line-input").value.trim();
  if (!newName || !currentLine) return;

  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  const getReq = store.get(currentLine);
  getReq.onsuccess = () => {
    const record = getReq.result;
    if (!record) return;

    // hapus record lama
    store.delete(currentLine);

    // simpan record dengan nama baru
    record.pallet = newName;
    store.put(record);

    renderList();
    closeLinePopup();
    setStatus(`Pallet "${currentLine}" diubah menjadi "${newName}".`);
  };
}

function deleteLine() {
  if (!currentLine) return;
  if (
    !confirm(
      `Yakin hapus pallet "${currentLine}" beserta semua gulungan?`
    )
  )
    return;

  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  store.delete(currentLine);

  renderList();
  closeLinePopup();
  setStatus(`Pallet "${currentLine}" berhasil dihapus.`);
}

// form melayang
const toggleBtn = document.getElementById("toggle-form");
const floatingForm = document.getElementById("floating-form");

toggleBtn.addEventListener("click", () => {
  if (floatingForm.style.display === "none") {
    floatingForm.style.display = "block";
  } else {
    floatingForm.style.display = "none";
  }
});

// setelah submit, sembunyikan form lagi
document.getElementById("data-form").addEventListener("submit", (e) => {
  e.preventDefault();
  // ... proses simpan data ke IndexedDB ...
  // floatingForm.style.display = 'none';
});

// import data
function showImportPopup() {
  document.getElementById("import-popup").style.display = "block";
}

function closeImportPopup() {
  document.getElementById("import-popup").style.display = "none";
}

async function processImport() {
  const text = document.getElementById("import-text").value.trim();
  if (!text) return;

  const lines = text.split("\n");
  let currentPallet = null;
  let pallets = [];

  lines.forEach((line) => {
    if (!line.trim()) return; // skip baris kosong
    const firstChar = line.trim()[0];
    if (/[A-Za-z]/.test(firstChar)) {
      // baris ini adalah judul pallet
      currentPallet = line.trim().split("\t");
      console.log(line.trim().split("\t"));
      
      pallets.push({ pallet: currentPallet[0], seriJenis:currentPallet[1], gulungan: [] });
    } else if (/[0-9]/.test(firstChar)) {
      // baris ini adalah data gulungan
      const parts = line.split("\t");
      const [noGul, seri, panjang, mark] = parts;
      pallets[pallets.length - 1].gulungan.push({
        noGul,
        seri,
        panjang,
        mark: mark || "",
      });
    }
  });

  // simpan ke IndexedDB (replace semua data lama)
  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  store.clear(); // hapus semua data lama
  pallets.forEach((p) => store.put(p));

  tx.oncomplete = () => {
    setStatus("Data berhasil diimport.");
    renderList();
    closeImportPopup();
  };
  tx.onerror = () => {
    setStatus("Gagal import data.", true);
  };
  renderList();
}

let currentInputPallet = null;

function setActivePallet(palletName) {
  currentInputPallet = palletName;
  renderList(); // refresh tampilan, hanya pallet aktif yang terbuka
}

function togglePallet(palletName) {
  if (currentInputPallet === palletName) {
    currentInputPallet = null; // tutup kalau diklik lagi
  } else {
    currentInputPallet = palletName;
  }
  renderList();
}

document.getElementById("noGul").addEventListener("input", function () {
  if (this.value.length >= 4) {
    document.getElementById("seri").focus();
  }
});

document.getElementById("seri").addEventListener("input", function () {
  if (this.value.length >= 3) {
    document.getElementById("panjang").focus();
  }
});

function getPalletSummary(pallet) {
  const totalGulung = pallet.gulungan.length;
  const totalPanjang = pallet.gulungan.reduce(
    (sum, g) => sum + Number(g.panjang),
    0
  );
  return { totalGulung, totalPanjang };
}

// if ("serviceWorker" in navigator) {
//   navigator.serviceWorker.register("/sw.js").then(reg => {
//     // cek jika ada SW baru waiting
//     if (reg.waiting) {
//       showUpdateBanner(reg.waiting);
//     }

//     reg.addEventListener("updatefound", () => {
//       const newWorker = reg.installing;
//       newWorker.addEventListener("statechange", () => {
//         if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
//           showUpdateBanner(newWorker);
//         }
//       });
//     });
//   });
// }

function showUpdateBanner(worker) {
  const banner = document.createElement("div");
  banner.innerHTML = `
<div style="position:fixed;bottom:0;left:0;right:0;background:#ffc107;padding:10px;text-align:center;">
Versi baru tersedia 
<button id="reloadBtn">Reload</button>
</div>
`;
  document.body.appendChild(banner);

  document.getElementById("reloadBtn").onclick = () => {
    worker.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  };
}

function setMark(value) {
  document.getElementById("mark").value = value;
  console.log(document.getElementById("mark").value)
  // markInput.focus();
}

function deleteMark() {
  document.getElementById("mark").value = "";
}

function showGulError(palletId, idx) {
  getAll().then((pallets) => {
    const pallet = pallets.find((p) => p.pallet === palletId);
    if (!pallet) return;

    const gul = pallet.gulungan[idx];
    if (!gul || !gul.errors || gul.errors.length === 0) return;

    const msg = gul.errors.map((e) => `• ${e.message}`).join("\n");
    setStatus(msg);
  });
}
async function detectDuplicateNoGul() {
  const pallets = await getAll();

  // map: noGul → array of { pallet, index }
  const map = {};

  pallets.forEach((p) => {
    p.gulungan.forEach((g, idx) => {
      if (!map[g.noGul]) map[g.noGul] = [];
      map[g.noGul].push({ pallet: p.pallet, index: idx });
    });
  });

  // tandai error
  pallets.forEach((p) => {
    p.gulungan.forEach((g) => {
      // reset error NO_GUL dulu
      g.errors = g.errors?.filter((e) => e.type !== "NO_GUL") || [];
    });
  });

  // untuk setiap no gul yang muncul lebih dari 1 kali → error
  Object.keys(map).forEach((no) => {
    if (map[no].length > 1) {
      map[no].forEach((loc) => {
        const p = pallets.find((pp) => pp.pallet === loc.pallet);
        const g = p.gulungan[loc.index];

        g.errors.push({
          type: "NO_GUL",
          message: `No gul ${no} dobel di beberapa pallet`,
        });
      });
    }
  });

  // simpan kembali semua pallet
  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  pallets.forEach((p) => store.put(p));

  return pallets;
}

async function setPalletVerify(palletId, status) {
  
  const pallets = await getAll();
  const pallet = pallets.find((p) => p.pallet === palletId);
  if (!pallet) return;

  pallet.verifyStatus = status;

  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  store.put(pallet);

  setStatus(
    status === "ok" ? "Pallet ditandai benar ✅" : "Pallet ditandai salah ❌"
  );

  renderList();
}

function getTotalPerBenang(pallets) {
  const totals = {};

  pallets.forEach((p) => {
    if (!p.seriJenis) return; // skip pallet yang belum punya jenis

    if (!totals[p.seriJenis]) {
      totals[p.seriJenis] = { gulung: 0, panjang: 0 };
    }

    p.gulungan.forEach((g) => {
      totals[p.seriJenis].gulung += 1;
      totals[p.seriJenis].panjang += Number(g.panjang || 0);
    });
  });

  return totals;
}

async function recalcAutoErrors() {
  const pallets = await getAll();

  // reset semua error otomatis
  pallets.forEach((p) => {
    p.gulungan.forEach((g) => {
      if (g.errors) {
        g.errors = g.errors.filter((e) => !e.auto); // hapus error otomatis saja
      }
    });
  });

  // 1. cek no gul kosong / tidak valid
  pallets.forEach((p) => {
    p.gulungan.forEach((g) => {
      if (!g.noGul || g.noGul === "0" || g.noGul.toLowerCase() === "x") {
        g.errors = g.errors || [];
        g.errors.push({
          type: "NO_GUL",
          message: "No gul kosong atau tidak valid",
          auto: true,
        });
      }
    });
  });

  // 2. cek no gul dobel antar pallet
  const map = {};
  pallets.forEach((p) => {
    p.gulungan.forEach((g, idx) => {
      if (!map[g.noGul]) map[g.noGul] = [];
      map[g.noGul].push({ pallet: p.pallet, index: idx });
    });
  });

  Object.keys(map).forEach((no) => {
    if (map[no].length > 1) {
      map[no].forEach((loc) => {
        const p = pallets.find((pp) => pp.pallet === loc.pallet);
        const g = p.gulungan[loc.index];
        g.errors = g.errors || [];
        g.errors.push({
          type: "NO_GUL",
          message: `No gul ${no} dobel di beberapa pallet`,
          auto: true,
        });
      });
    }
  });

  // 3. cek seri tidak ada di master
  pallets.forEach((p) => {
    p.gulungan.forEach((g) => {
      const jenis = getSeriJenis(g.seri);
      if (!jenis) {
        g.errors = g.errors || [];
        g.errors.push({
          type: "SERI",
          message: `Seri ${g.seri} tidak ada di master`,
          auto: true,
        });
      }
    });
  });

  // 4. cek salah naruh kain (seri beda dalam pallet)
  pallets.forEach((p) => {
    if (!p.seriJenis) return;
    p.gulungan.forEach((g) => {
      const jenis = getSeriJenis(g.seri);
      if (jenis && jenis !== p.seriJenis) {
        g.errors = g.errors || [];
        g.errors.push({
          type: "SERI",
          message: `Seri beda! Pallet ini ${p.seriJenis}, gulungan ${jenis}`,
          auto: true,
        });
      }
    });
  });

  // simpan kembali
  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  pallets.forEach((p) => store.put(p));

  return pallets;
}

let manualEdit = null;

async function startManualEdit(palletId, index, field) {
  manualEdit = { palletId, index, field };

  const pallets = await getAll();
  const pallet = pallets.find((p) => p.pallet === palletId);
  const gul = pallet.gulungan[index];

  const wrongValue = gul[field];

  // tampilkan popup
  document.getElementById("manual-popup").style.display = "block";
  document.getElementById("manual-correct-input").value =
    gul.errorsManual?.[field]?.fixed || "";
}

async function applyManualFix() {
  const correct = document.getElementById("manual-correct-input").value.trim();
  const { palletId, index, field } = manualEdit;

  const pallets = await getAll();
  const pallet = pallets.find((p) => p.pallet === palletId);
  const gul = pallet.gulungan[index];

  const wrong = gul[field]; // nilai lama = salah

  // simpan nilai benar ke data utama
  gul[field] = correct;

  // simpan nilai salah ke error manual
  gul.errorsManual = gul.errorsManual || {};
  gul.errorsManual[field] = {
    wrong,
    fixed: correct,
    verified: false,
  };

  // simpan ke DB
  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  store.put(pallet);

  closeManualPopup();

  // recalc error otomatis jika field terkait
  if (field === "noGul") {
    await recalcNoGulErrorsForNumber(wrong, correct);
  }
  if (field === "seri") {
    await recalcSeriErrorsForPallet(palletId);
  }

  renderList();
}

function closeManualPopup() {
  const popup = document.getElementById("manual-popup");
  if (popup) popup.style.display = "none";

  // reset state
  manualEdit = null;

  // kalau popup kamu dinamis (innerHTML berubah), bisa reset di sini
  // popup.innerHTML = defaultHTML;  <-- opsional
}

async function startManualEdit(palletId, index, field) {
  manualEdit = { palletId, index, field };

  const pallets = await getAll();
  const pallet = pallets.find((p) => p.pallet === palletId);
  const gul = pallet.gulungan[index];

  const err = gul.errorsManual?.[field];

  document.getElementById("manual-popup").style.display = "block";

  if (err) {
    document.getElementById("manual-correct-input").value = err.fixed;
    document.getElementById("manual-popup").innerHTML += `
      <div>Salah: ${err.wrong}</div>
      <button onclick="verifyManualFix()">✔ Sudah benar</button>
    `;
  }
}

async function verifyManualFix() {
  const { palletId, index, field } = manualEdit;

  const pallets = await getAll();
  const pallet = pallets.find((p) => p.pallet === palletId);
  const gul = pallet.gulungan[index];

  delete gul.errorsManual[field];

  const tx = db.transaction("pallets", "readwrite");
  const store = tx.objectStore("pallets");
  store.put(pallet);

  closeManualPopup();
  renderList();
}

async function startManualEdit(palletId, index, field) {
  manualEdit = { palletId, index, field };

  const pallets = await getAll();
  const pallet = pallets.find((p) => p.pallet === palletId);
  const gul = pallet.gulungan[index];

  const err = gul.errorsManual?.[field];

  // buka popup
  // openManualPopup();

  const infoBox = document.getElementById("manual-info");
  const verifyBtn = document.getElementById("manual-verify-btn");
  const input = document.getElementById("manual-correct-input");

  if (!err) {
    // belum pernah dikoreksi → popup kosong
    infoBox.style.display = "none";
    verifyBtn.style.display = "none";
    input.value = "";
  } else {
    // sudah pernah dikoreksi → tampilkan info singkat
    infoBox.style.display = "block";
    infoBox.innerHTML = `Salah: <strong>${err.wrong}</strong>`;

    verifyBtn.style.display = "block";
    input.value = err.fixed;
  }
}

async function applyManualFix() {
  const correct = document.getElementById("manual-correct-input").value.trim();
  const { palletId, index, field } = manualEdit;

  const pallets = await getAll();
  const pallet = pallets.find((p) => p.pallet === palletId);
  const gul = pallet.gulungan[index];

  const wrong = gul[field]; // nilai lama = salah

  // simpan nilai benar
  gul[field] = correct;

  // simpan error manual
  gul.errorsManual = gul.errorsManual || {};
  gul.errorsManual[field] = {
    wrong,
    fixed: correct,
    verified: false,
  };

  // simpan DB
  const tx = db.transaction("pallets", "readwrite");
  tx.objectStore("pallets").put(pallet);

  closeManualPopup();

  // recalc otomatis jika perlu
  if (field === "noGul") await recalcNoGulErrorsForNumber(wrong, correct);
  if (field === "seri") await recalcSeriErrorsForPallet(palletId);

  renderList();
}

async function verifyManualFix() {
  const { palletId, index, field } = manualEdit;

  const pallets = await getAll();
  const pallet = pallets.find((p) => p.pallet === palletId);
  const gul = pallet.gulungan[index];

  delete gul.errorsManual[field];

  const tx = db.transaction("pallets", "readwrite");
  tx.objectStore("pallets").put(pallet);

  closeManualPopup();
  renderList();
}

function groupPallets(pallets) {
  const groups = {};

  pallets.forEach((p) => {
    const prefix = p.pallet[0].toUpperCase(); // A, B, C...
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(p);
  });

  return groups;
}


const form2 = document.getElementById('data-form');
  const radios = form.querySelectorAll('input[type="radio"]');

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value !== '') {
        form.requestSubmit(); // modern & clean
      }
    });
  });