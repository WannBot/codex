
function setStatus(txt) {
  const el = document.getElementById("status");
  if (el) el.textContent = txt;
}

// =====================================
// Ambil daftar varian dari grup varian pertama
// div.flex.items-center.j7HL5Q (hanya index 0)
// =====================================
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
          if (!blocks.length) {
            return [];
          }

          // Hanya pakai grup pertama (biasanya warna/varian utama)
          const block = blocks[0];

          block.querySelectorAll("button, span, div").forEach((el) => {
            const txt = (el.innerText || "").trim();
            if (!txt) return;
            // skip label umum
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
          setStatus("Status: tidak ada varian ditemukan di grup pertama (j7HL5Q).");
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

        setStatus(
          "Status: varian terdeteksi dari grup pertama: " + data.length + " opsi."
        );
      }
    );
  });
}

// =====================================
// Tampilkan/sembunyikan filter varian tergantung mode
// =====================================
function updateVariantVisibility() {
  const modeInput = document.querySelector("input[name='mode']:checked");
  const mode = modeInput ? modeInput.value : "one";
  const fs = document.getElementById("variantFieldset");
  if (!fs) return;
  // Hanya tampil di mode "all"
  fs.style.display = mode === "all" ? "block" : "none";

  // Sinkronkan tampilan tab aktif
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    const input = tab.querySelector("input[name='mode']");
    if (!input) return;
    if (input.value === mode) tab.classList.add("active");
    else tab.classList.remove("active");
  });
}

// =====================================
// Jalankan pengambilan review di page
// - Mode "one": full page (multi page via pageLimit), tanpa filter varian, tanpa limit 1x per varian
// - Mode "all": multi page via pageLimit, per varian dasar (1x per varian)
// =====================================
function runCollectReviews(baseName, opts) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) {
      setStatus("❌ Tidak ada tab aktif.");
      return;
    }
    const tabId = tabs[0].id;

    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: (opts) => {
          const cleanUrl = (u) =>
            u ? u.split("?")[0].replace(/@resize[^ ]+/g, "") : null;

          const parseVariantFromBlock = (block) => {
            const el = block.querySelector("div.XYk98l");
            if (!el) return "";
            const txt = (el.innerText || "").trim();
            const idx = txt.indexOf("Variasi:");
            if (idx === -1) return "";
            let full = txt.slice(idx + "Variasi:".length).trim();
            // Ambil varian dasar (sebelum koma)
            if (full.includes(",")) {
              full = full.split(",")[0].trim();
            }
            return full;
          };

          const matchVariant = (baseVariant, selectedVariants, mode) => {
            // Mode "one": abaikan filter varian, selalu true
            if (mode === "one") return true;
            if (!selectedVariants || !selectedVariants.length) return true;
            if (!baseVariant) return false;
            return selectedVariants.some((v) =>
              baseVariant.toLowerCase().includes(v.toLowerCase())
            );
          };

          const matchMediaFilter = (mediaCount, target) => {
            if (!target) return true; // no filter
            if (target === 3) {
              // Minimal 3 media: total 3 s/d 6, bebas foto/video
              return mediaCount >= 3 && mediaCount <= 6;
            }
            return true;
          };

          const collectReviewsOnce = (usedBase, mode) => {
            const reviews = [];
            const blocks = document.querySelectorAll(
              ".A7MThp, .product-ratings .shopee-product-rating__main"
            );

            blocks.forEach((block) => {
              const textEl = block.querySelector(".YNedDV");
              const text = textEl ? textEl.innerText.trim() : "";

              const imgs = [];
              block
                .querySelectorAll(
                  "img.rating-media-list__image-wrapper--image"
                )
                .forEach((img) => {
                  if (img.src) imgs.push(cleanUrl(img.src));
                });

              const vids = [];
              block
                .querySelectorAll("video, video source")
                .forEach((v) => {
                  if (v.src) vids.push(cleanUrl(v.src));
                });

              const mediaCount = imgs.length + vids.length;
              const baseVariant = parseVariantFromBlock(block);

              if (!matchVariant(baseVariant, opts.variants, mode)) return;
              if (!matchMediaFilter(mediaCount, opts.mediaCount)) return;

              // Mode "all": 1x per varian dasar
              if (mode === "all" && usedBase && baseVariant && usedBase.has(baseVariant)) {
                return;
              }

              if (text || imgs.length || vids.length) {
                if (mode === "all" && usedBase && baseVariant) {
                  usedBase.add(baseVariant);
                }
                reviews.push({
                  text,
                  // folder pakai varian dasar saja (boleh kosong utk mode one)
                  variant: baseVariant || "",
                  images: imgs,
                  videos: vids,
                });
              }
            });

            return reviews;
          };

          const collectFromAllPages = async () => {
            const allResults = [];
            const mode = opts.mode === "all" ? "all" : "one";
            const usedBase = mode === "all" ? new Set() : null;

            const navSelector =
              "nav.shopee-page-controller.product-ratings__page-controller";
            const getNav = () => document.querySelector(navSelector);

            const nav = getNav();
            if (!nav) {
              // kalau tidak ada pagination, pakai page sekarang saja
              return collectReviewsOnce(usedBase, mode);
            }

            // Kosong = hanya page aktif, isi N = sampai N page
            const maxPages =
              opts.pageLimit && opts.pageLimit > 0 ? opts.pageLimit : 1;

            let pagesProcessed = 0;

            while (pagesProcessed < maxPages) {
              pagesProcessed++;

              const pageReviews = collectReviewsOnce(usedBase, mode);
              if (pageReviews.length > 0) {
                allResults.push(...pageReviews);
              }

              const navNow = getNav();
              if (!navNow) break;

              const nextBtn = navNow.querySelector(
                "button.shopee-icon-button.shopee-icon-button--right"
              );

              if (
                !nextBtn ||
                nextBtn.disabled ||
                nextBtn.getAttribute("aria-disabled") === "true" ||
                nextBtn.classList.contains("disabled")
              ) {
                break; // page terakhir
              }

              nextBtn.click();
              await new Promise((r) => setTimeout(r, 1200));
            }

            return allResults;
          };

          // Kedua mode sekarang:
          // kosong pageLimit = hanya page aktif
          // isi N = maju sampai N page (kalau Next masih ada)
          return collectFromAllPages();
        },
        args: [opts],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          setStatus("❌ " + chrome.runtime.lastError.message);
          return;
        }
        const data = results && results[0] && results[0].result;
        if (!data || !data.length) {
          setStatus("Tidak ada review yang cocok dengan filter.");
          return;
        }

        setStatus(`Mulai download ${data.length} review…`);
        chrome.runtime.sendMessage(
          {
            action: "downloadReviews",
            reviews: data,
            baseName: baseName || null,
          },
          (res) => {
            if (chrome.runtime.lastError) {
              setStatus("❌ " + chrome.runtime.lastError.message);
              return;
            }
            if (!res || !res.ok) {
              setStatus(
                "Gagal memulai download reviews: " +
                  (res && res.message ? res.message : "")
              );
              return;
            }
            setStatus(
              `✅ Selesai trigger download. Folder: ${res.folder} (cek di Downloads).`
            );
          }
        );
      }
    );
  });
}

// =====================================
// Event: Download Reviews
// =====================================
function setupDownloadButton() {
  const btn = document.getElementById("downloadReviews");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const baseNameInput = document.getElementById("basename");
    const baseName = baseNameInput ? baseNameInput.value.trim() || null : null;

    const modeInput = document.querySelector("input[name='mode']:checked");
    const mode = modeInput ? modeInput.value : "one";

    const mediaSelect = document.getElementById("mediaCount");
    const mediaVal = mediaSelect ? mediaSelect.value : "";
    const mediaCount = mediaVal ? parseInt(mediaVal, 10) : null;

    const variantContainer = document.getElementById("variantList");
    const selectedVariants = variantContainer
      ? Array.from(
          variantContainer.querySelectorAll("input[type='checkbox']:checked")
        ).map((cb) => cb.value)
      : [];

    const pageLimitEl = document.getElementById("pageLimit");
    const pageLimitVal = pageLimitEl ? pageLimitEl.value : "";
    const pageLimit = pageLimitVal ? parseInt(pageLimitVal, 10) : null;

    setStatus("Mengumpulkan review…");
    btn.disabled = true;

    const opts = {
      mode,
      mediaCount,
      variants: selectedVariants,
      pageLimit,
    };

    runCollectReviews(baseName, opts);

    setTimeout(() => {
      btn.disabled = false;
    }, 3000);
  });
}

// =====================================
// Init
// =====================================
document.addEventListener("DOMContentLoaded", () => {
  setStatus("Status: membaca varian dari grup pertama (j7HL5Q)...");
  loadVariants();
  setupDownloadButton();

  // Mode radios -> control variant visibility + tab active style
  document.querySelectorAll("input[name='mode']").forEach((r) => {
    r.addEventListener("change", updateVariantVisibility);
  });
  updateVariantVisibility();
});
