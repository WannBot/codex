function setStatus(txt) {
  const el = document.getElementById("status");
  if (el) el.textContent = txt;
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
    const baseNameInput = document.getElementById("basename");
    const baseName = baseNameInput ? baseNameInput.value.trim() || null : null;

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
            baseName,
          },
          (res) => {
            if (chrome.runtime.lastError) {
              setStatus("❌ " + chrome.runtime.lastError.message);
              downloadBtn.disabled = false;
              return;
            }
            if (!res || !res.ok) {
              setStatus(
                "Gagal memulai download reviews: " +
                  (res && res.message ? res.message : "")
              );
              downloadBtn.disabled = false;
              return;
            }

            clearSelectedOnPage(tabId, () => {
              setStatus(
                `✅ Download ${reviews.length} review dimulai dan checklist sudah di-reset. Folder: ${res.folder}.`
              );
              downloadBtn.disabled = false;
            });
          }
        );
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setStatus("Centang review langsung di halaman Shopee (kiri profil), lalu klik Start Download.");
  loadVariants();
  setupButtons();

  document.querySelectorAll("input[name='mode']").forEach((r) => {
    r.addEventListener("change", updateVariantVisibility);
  });
  updateVariantVisibility();
});
