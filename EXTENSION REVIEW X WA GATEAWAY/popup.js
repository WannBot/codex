const TARGET_STORAGE_KEY = "waTargetNumber";
const SENDER_STORAGE_KEY = "waSenderNumber";
const API_BASE_STORAGE_KEY = "waApiBaseUrl";

function setStatus(txt) {
  const el = document.getElementById("status");
  if (el) el.textContent = txt;
}

function setTargetInputEditable(editable) {
  const input = document.getElementById("waTarget");
  const saveBtn = document.getElementById("saveWaTarget");
  const editBtn = document.getElementById("editWaTarget");
  if (!input || !saveBtn || !editBtn) return;

  input.disabled = !editable;
  saveBtn.style.display = editable ? "inline-flex" : "none";
  editBtn.style.display = editable ? "none" : "inline-flex";
}

function loadTargetNumber() {
  chrome.storage.local.get([TARGET_STORAGE_KEY], (data) => {
    const input = document.getElementById("waTarget");
    if (!input) return;

    const value = data && data[TARGET_STORAGE_KEY] ? String(data[TARGET_STORAGE_KEY]) : "";
    input.value = value;
    setTargetInputEditable(!value);
  });
}

function setupTargetButtons() {
  const input = document.getElementById("waTarget");
  const saveBtn = document.getElementById("saveWaTarget");
  const editBtn = document.getElementById("editWaTarget");
  if (!input || !saveBtn || !editBtn) return;

  saveBtn.addEventListener("click", () => {
    const value = input.value.trim();
    if (!value) {
      setStatus("Nomor target wajib diisi sebelum disimpan.");
      return;
    }

    chrome.storage.local.set({ [TARGET_STORAGE_KEY]: value }, () => {
      setStatus("✅ Nomor target WhatsApp tersimpan.");
      setTargetInputEditable(false);
    });
  });

  editBtn.addEventListener("click", () => {
    setTargetInputEditable(true);
    input.focus();
  });

  const saveSenderBtn = document.getElementById("saveWaSender");
  if (saveSenderBtn) saveSenderBtn.addEventListener("click", saveSenderNumberFromInput);

  const saveApiBtn = document.getElementById("saveApiBase");
  if (saveApiBtn) saveApiBtn.addEventListener("click", saveApiBaseUrlFromInput);
}

function getSavedTargetNumber(cb) {
  chrome.storage.local.get([TARGET_STORAGE_KEY], (data) => {
    const value = data && data[TARGET_STORAGE_KEY] ? String(data[TARGET_STORAGE_KEY]).trim() : "";
    cb(value);
  });
}

function loadSenderNumber() {
  chrome.storage.local.get([SENDER_STORAGE_KEY], (data) => {
    const input = document.getElementById("waSender");
    if (!input) return;
    input.value = data && data[SENDER_STORAGE_KEY] ? String(data[SENDER_STORAGE_KEY]) : "";
  });
}

function getSavedSenderNumber(cb) {
  chrome.storage.local.get([SENDER_STORAGE_KEY], (data) => {
    const value = data && data[SENDER_STORAGE_KEY] ? String(data[SENDER_STORAGE_KEY]).trim() : "";
    cb(value);
  });
}

function saveSenderNumberFromInput() {
  const input = document.getElementById("waSender");
  if (!input) return;
  const value = input.value.trim();
  chrome.storage.local.set({ [SENDER_STORAGE_KEY]: value }, () => {
    setStatus("✅ Nomor sender tersimpan.");
  });
}

function loadApiBaseUrl() {
  chrome.storage.local.get([API_BASE_STORAGE_KEY], (data) => {
    const input = document.getElementById("waApiBaseUrl");
    if (!input) return;
    input.value = data && data[API_BASE_STORAGE_KEY] ? String(data[API_BASE_STORAGE_KEY]) : "";
  });
}

function getSavedApiBaseUrl(cb) {
  chrome.storage.local.get([API_BASE_STORAGE_KEY], (data) => {
    const value = data && data[API_BASE_STORAGE_KEY] ? String(data[API_BASE_STORAGE_KEY]).trim() : "";
    cb(value);
  });
}

function saveApiBaseUrlFromInput() {
  const input = document.getElementById("waApiBaseUrl");
  if (!input) return;
  const value = input.value.trim();
  chrome.storage.local.set({ [API_BASE_STORAGE_KEY]: value }, () => {
    setStatus("✅ API Base URL tersimpan.");
  });
}

function loadVariants() {
  const container = document.getElementById("variantList");
  if (!container) return;
  container.innerHTML = "";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) {
      setStatus("❌ Tidak ada tab aktif.");
      return;
    }
    const tabId = tabs[0].id;

    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          const variants = new Set();
          const blocks = document.querySelectorAll("div.flex.items-center.j7HL5Q");
          if (!blocks.length) return [];

          const block = blocks[0];
          block.querySelectorAll("button, span, div").forEach((el) => {
            const txt = (el.innerText || "").trim();
            if (!txt) return;
            if (/^(Variasi|Pilih|Model|Ukuran|Warna|Size)/i.test(txt)) return;
            variants.add(txt);
          });

          return Array.from(variants);
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          setStatus("❌ " + chrome.runtime.lastError.message);
          return;
        }

        const data = results && results[0] && results[0].result;
        if (!data || !data.length) {
          const info = document.createElement("div");
          info.textContent = "Tidak terdeteksi varian dari grup pertama (j7HL5Q).";
          info.style.fontSize = "11px";
          info.style.color = "#9ca3af";
          container.appendChild(info);
          return;
        }

        data.forEach((v) => {
          const label = document.createElement("label");
          label.className = "variant-item";

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = v;

          const span = document.createElement("span");
          span.textContent = v;

          label.appendChild(cb);
          label.appendChild(span);
          container.appendChild(label);
        });
      }
    );
  });
}

function updateVariantVisibility() {
  const modeInput = document.querySelector("input[name='mode']:checked");
  const mode = modeInput ? modeInput.value : "one";
  const fs = document.getElementById("variantFieldset");
  if (!fs) return;
  fs.style.display = mode === "all" ? "block" : "none";

  document.querySelectorAll(".tab").forEach((tab) => {
    const input = tab.querySelector("input[name='mode']");
    if (!input) return;
    tab.classList.toggle("active", input.value === mode);
  });
}

function getSelectedVariants() {
  const variantContainer = document.getElementById("variantList");
  return variantContainer
    ? Array.from(
        variantContainer.querySelectorAll("input[type='checkbox']:checked")
      ).map((cb) => cb.value)
    : [];
}

function collectSelectedFromPage(tabId, opts, cb) {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      func: (opts) => {
        const api = window.__reviewDownloader;
        if (!api || typeof api.collectSelectedReviews !== "function") {
          return { error: "Checkbox review belum aktif di halaman. Reload tab lalu coba lagi." };
        }

        const selected = api.collectSelectedReviews();
        const selectedVariants = opts.variants || [];
        const mode = opts.mode || "one";
        const mediaTarget = opts.mediaCount || null;

        const matchVariant = (baseVariant) => {
          if (mode === "one") return true;
          if (!selectedVariants.length) return true;
          if (!baseVariant) return false;
          return selectedVariants.some((v) =>
            String(baseVariant).toLowerCase().includes(String(v).toLowerCase())
          );
        };

        const matchMediaFilter = (review) => {
          if (!mediaTarget) return true;
          const mediaCount = (review.images?.length || 0) + (review.videos?.length || 0);
          if (mediaTarget === 3) return mediaCount >= 3 && mediaCount <= 6;
          return true;
        };

        const filtered = selected.filter(
          (r) => matchVariant(r.variant) && matchMediaFilter(r)
        );

        return { data: filtered, selectedCount: selected.length };
      },
      args: [opts],
    },
    (results) => {
      if (chrome.runtime.lastError) {
        cb({ error: chrome.runtime.lastError.message });
        return;
      }
      const res = results && results[0] && results[0].result;
      cb(res || { error: "Gagal membaca data review terpilih." });
    }
  );
}

function clearSelectedOnPage(tabId, cb) {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      func: () => {
        const api = window.__reviewDownloader;
        if (!api || typeof api.clearSelectedReviews !== "function") {
          return { ok: false };
        }
        api.clearSelectedReviews();
        return { ok: true };
      },
    },
    () => {
      cb?.();
    }
  );
}

function setupButtons() {
  const downloadBtn = document.getElementById("downloadReviews");
  if (!downloadBtn) return;

  downloadBtn.addEventListener("click", () => {
    getSavedTargetNumber((targetNumber) => {
      getSavedSenderNumber((senderNumber) => {
        getSavedApiBaseUrl((apiBaseUrl) => {
          if (!targetNumber) {
            setStatus("Simpan dulu nomor target WhatsApp di Pengaturan.");
            return;
          }

          const modeInput = document.querySelector("input[name='mode']:checked");
          const mode = modeInput ? modeInput.value : "one";

          const mediaSelect = document.getElementById("mediaCount");
          const mediaVal = mediaSelect ? mediaSelect.value : "";
          const mediaCount = mediaVal ? parseInt(mediaVal, 10) : null;

          const opts = {
            mode,
            mediaCount,
            variants: getSelectedVariants(),
          };

          setStatus("Mengambil review yang dicentang dari halaman…");
          downloadBtn.disabled = true;

          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs.length) {
              setStatus("❌ Tidak ada tab aktif.");
              downloadBtn.disabled = false;
              return;
            }

            const tabId = tabs[0].id;
            collectSelectedFromPage(tabId, opts, (result) => {
              if (!result || result.error) {
                setStatus("❌ " + (result?.error || "Gagal mengambil data."));
                downloadBtn.disabled = false;
                return;
              }

              const reviews = result.data || [];
              if (!reviews.length) {
                setStatus(
                  `Tidak ada review terpilih yang cocok filter. Total tersimpan: ${result.selectedCount || 0}.`
                );
                downloadBtn.disabled = false;
                return;
              }

              chrome.runtime.sendMessage(
                {
                  action: "downloadReviews",
                  reviews,
                  targetNumber,
                  senderNumber,
                  apiBaseUrl,
                },
                (res) => {
                  if (chrome.runtime.lastError) {
                    setStatus(" " + chrome.runtime.lastError.message);
                    downloadBtn.disabled = false;
                    return;
                  }
                  if (!res || !res.ok) {
                    setStatus(
                      "Gagal memulai proses: " +
                        (res && res.message ? res.message : "")
                    );
                    downloadBtn.disabled = false;
                    return;
                  }

                  clearSelectedOnPage(tabId, () => {
                    let waInfo = "";
                    if (res.whatsapp) {
                      const firstErr = Array.isArray(res.whatsapp.errors) && res.whatsapp.errors.length
                        ? ` Error: ${res.whatsapp.errors[0]}`
                        : "";
                      waInfo = ` WA: ${res.whatsapp.success}/${res.whatsapp.total} request sukses.${firstErr}`;
                    }
                    setStatus(
                      `✅ Kirim WhatsApp ${reviews.length} review dimulai, checklist di-reset.${waInfo}`
                    );
                    downloadBtn.disabled = false;
                  });
                }
              );
            });
          });
        });
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setStatus("Centang review di halaman Shopee, simpan pengaturan WhatsApp, lalu klik Start Download.");
  loadVariants();
  loadTargetNumber();
  loadSenderNumber();
  loadApiBaseUrl();
  setupTargetButtons();
  setupButtons();

  document.querySelectorAll("input[name='mode']").forEach((r) => {
    r.addEventListener("change", updateVariantVisibility);
  });
  updateVariantVisibility();
});
