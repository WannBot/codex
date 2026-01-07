function setStatus(txt) {
  document.getElementById("status").textContent = txt;
}

function runInPage(tabId, action, baseName, opts) {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      func: (action, opts) => {
        const cleanUrl = (u) =>
          u ? u.split("?")[0].replace(/@resize[^ ]+/g, "") : null;

        // =====================================================================
        // AUTO CLICK GALLERY + MAIN IMAGES (SKIP VIDEO THUMBNAIL)
        // =====================================================================

        // deteksi apakah cell adalah thumbnail video
        const isVideoThumb = (div) => {
          // ada <video>
          if (div.querySelector("video")) return true;

          // ada class mengandung "video" / "play"
          if (
            div.querySelector(
              "[class*='video'], [class*='Video'], [class*='play'], [class*='Play']"
            )
          ) {
            return true;
          }

          // ada teks durasi, misal "0:28"
          const span = div.querySelector("span");
          if (span && /\d+:\d+/.test(span.textContent.trim())) return true;

          return false;
        };

        // klik otomatis gambar utama untuk buka gallery
        const openGalleryIfNeeded = async () => {
          const gridNow = document.querySelectorAll("div.jA1mTx.d0bVwS");
          if (gridNow.length > 4) return; // sudah ada banyak gambar, tidak perlu klik

          const trigger =
            document.querySelector("div.YM40Nc") ||
            document.querySelector(".product-image__wrapper");
          if (trigger) {
            trigger.click();
            await new Promise((r) => setTimeout(r, 800)); // tunggu gallery load
          }
        };

        const getMainImageUrls = async () => {
          const urls = new Set();

          // pastikan gallery kebuka
          await openGalleryIfNeeded();

          const collectFromDivs = (nodeList) => {
            nodeList.forEach((div) => {
              if (isVideoThumb(div)) return; // 🔹 skip kalau ini thumbnail video

              const img = div.querySelector("img");
              if (img && img.src) {
                const u = cleanUrl(img.src);
                if (u) urls.add(u);
                return;
              }
              const bg = getComputedStyle(div).backgroundImage;
              if (bg && bg !== "none") {
                const m = bg.match(/url\((\"|')?(.*?)(\"|')?\)/);
                if (m && m[2]) {
                  const u = cleanUrl(m[2]);
                  if (u) urls.add(u);
                }
              }
            });
          };

          // ambil dari grid popup gallery
          collectFromDivs(document.querySelectorAll("div.jA1mTx.d0bVwS"));

          // fallback: dari YM40Nc di page utama
          collectFromDivs(document.querySelectorAll("div.YM40Nc"));

          return Array.from(urls);
        };

        // =====================================================================
        // AMBIL REVIEW
        // =====================================================================
        const collectReviews = () => {
          const reviews = [];
          document
            .querySelectorAll(
              ".A7MThp, .product-ratings .shopee-product-rating__main"
            )
            .forEach((block) => {
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
              if (opts.min2 && !opts.all && mediaCount < 2) return;

              if (text || imgs.length || vids.length) {
                reviews.push({ text, images: imgs, videos: vids });
              }
            });
          return reviews;
        };

        // =====================================================================
        // AMBIL MAIN & VARIAN IMAGES
        // =====================================================================
        const collectProductImages = async () => {
          const productName =
            document.querySelector("h1.vR6K3w")?.innerText.trim() ||
            "ProductImages_" + Date.now();

          const varianNames = Array.from(
            document.querySelectorAll("span.ZivAAW")
          ).map((el) => el.innerText.trim());

          let mainImages = [];
          let varianImages = [];

          if (opts.mainImg) {
            mainImages = await getMainImageUrls();
          }

          if (opts.varianImg) {
            const nodes = document.querySelectorAll("img.uXN1L5.nk0Z0T");
            nodes.forEach((img, i) => {
              if (img.src) {
                const prefix = String(i + 1).padStart(2, "0");
                const safeName = (
                  varianNames[i] || `varian${i + 1}`
                ).replace(/[\\/:*?"<>|]+/g, "_");
                varianImages.push({
                  url: cleanUrl(img.src),
                  name: `${prefix} - ${safeName}.jpg`,
                });
              }
            });
          }

          return { productName, mainImages, varianImages };
        };

        // =====================================================================
        // ROUTER ACTION
        // =====================================================================
        if (action === "collectReviews") return collectReviews();

        if (action === "scrollAndCollect") {
          return new Promise(async (resolve) => {
            let lastHeight = 0;
            for (let i = 0; i < 20; i++) {
              window.scrollTo(0, document.body.scrollHeight);
              await new Promise((r) => setTimeout(r, 600));
              if (document.body.scrollHeight === lastHeight) break;
              lastHeight = document.body.scrollHeight;
            }
            window.scrollTo(0, 0);
            resolve(collectReviews());
          });
        }

        if (action === "collectImages") {
          return collectProductImages(); // Promise akan dikembalikan ke popup
        }
      },
      args: [action, opts],
    },
    (results) => {
      if (chrome.runtime.lastError) {
        setStatus("❌ " + chrome.runtime.lastError.message);
        return;
      }
      const data = results && results[0] && results[0].result;
      if (!data) {
        setStatus("Tidak ada data ditemukan.");
        return;
      }

      if (action === "collectReviews") {
        setStatus(`Mulai download ${data.length} review…`);
        chrome.runtime.sendMessage({
          action: "downloadReviews",
          reviews: data,
          baseName,
        });
      } else if (action === "scrollAndCollect") {
        setStatus(`Ditemukan ${data.length} review.`);
      } else if (action === "collectImages") {
        setStatus("Mulai download product images…");
        chrome.runtime.sendMessage({ action: "downloadImages", ...data });
      }
    }
  );
}

document.getElementById("scan").addEventListener("click", () => {
  setStatus("Scanning…");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    runInPage(tabs[0].id, "scrollAndCollect", null, {
      min2: false,
      all: true,
    });
  });
});

document
  .getElementById("downloadReviews")
  .addEventListener("click", () => {
    const baseName = document.getElementById("basename").value || null;
    const min2 = document.getElementById("min2").checked;
    const all = document.getElementById("all").checked;

    setStatus("Mengumpulkan review…");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      runInPage(tabs[0].id, "collectReviews", baseName, { min2, all });
    });
  });

document.getElementById("downloadImages").addEventListener("click", () => {
  const mainImg = document.getElementById("mainImg").checked;
  const varianImg = document.getElementById("varianImg").checked;

  if (!mainImg && !varianImg) {
    setStatus("❌ Pilih minimal satu opsi (Main atau Varian Images).");
    return;
  }

  setStatus("Mengumpulkan product images…");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    runInPage(tabs[0].id, "collectImages", null, { mainImg, varianImg });
  });
});
