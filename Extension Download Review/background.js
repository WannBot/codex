function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) {
    return;
  }

  if (msg.action === "downloadReviews") {
    try {
      let { reviews, baseName } = msg;
      const root = sanitize(baseName || ("Penilaian_" + Date.now()));

      startDownloadReviews(reviews || [], root)
        .then(() => {
          sendResponse({ ok: true, folder: root });
        })
        .catch((err) => {
          console.error("Download error:", err);
          sendResponse({ ok: false, message: String(err) });
        });
    } catch (e) {
      console.error("Background error:", e);
      sendResponse({ ok: false, message: String(e) });
    }
    // penting: biar sendResponse async tetap jalan
    return true;
  }
});

// =====================================
// Download helper
// =====================================
async function startDownloadReviews(reviews, root) {
  if (!Array.isArray(reviews) || !reviews.length) {
    throw new Error("Tidak ada review yang dikirim ke background.");
  }

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ====== PERBAIKAN caption.txt ======
  // Format:
  // #001 [Varian: Hijau]
  // Jasa angkutnya cepet bgt ...
  // ----------------------------------------
  const allText = reviews
    .map((r, idx) => {
      const no = String(idx + 1).padStart(3, "0");
      const variant = r.variant && String(r.variant).trim()
        ? ` [Varian: ${r.variant}]`
        : "";

      let text = String(r.text || "");

      // Hilangkan linebreak asli -> spasi
      text = text.replace(/\r?\n/g, " ");
      // Hilangkan literal "\n" yang nongol di tengah kalimat
      text = text.replace(/\\n/gi, " ");
      // Rapikan spasi berlebih
      text = text.replace(/\s+/g, " ").trim();
      if (!text) text = "(tanpa teks)";

      return `#${no}${variant}\n${text}`;
    })
    .join("\n\n----------------------------------------\n\n");

  const txtUrl =
    "data:text/plain;charset=utf-8," + encodeURIComponent(allText);

  await new Promise((res, rej) => {
    chrome.downloads.download(
      {
        url: txtUrl,
        filename: `${root}/caption.txt`,
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          rej(chrome.runtime.lastError);
        } else {
          res(downloadId);
        }
      }
    );
  });
  await delay(250);

  // ====== Download gambar & video seperti biasa ======
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    const idx = String(i + 1).padStart(3, "0");
    const variantName = r.variant ? sanitize(String(r.variant)) : "";
    const folderName = variantName
      ? `${idx} - ${variantName}`
      : `${idx} - Review`;
    const folder = `${root}/${folderName}`;
    const allFolder = `${root}/All Images`;

    // Images
    if (Array.isArray(r.images) && r.images.length > 0) {
      for (let j = 0; j < r.images.length; j++) {
        const url = r.images[j];
        if (!url) continue;
        const fileName = `img${j + 1}.jpg`;

        await new Promise((res) => {
          chrome.downloads.download(
            {
              url,
              filename: `${folder}/${fileName}`,
              saveAs: false,
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn("Download img error:", chrome.runtime.lastError);
              }
              res(null);
            }
          );
        });

        await new Promise((res) => {
          chrome.downloads.download(
            {
              url,
              filename: `${allFolder}/review${i + 1}_${fileName}`,
              saveAs: false,
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn("Download img all error:", chrome.runtime.lastError);
              }
              res(null);
            }
          );
        });

        await delay(250);
      }
    }

    // Videos
    if (Array.isArray(r.videos) && r.videos.length > 0) {
      for (let j = 0; j < r.videos.length; j++) {
        const url = r.videos[j];
        if (!url) continue;
        const fileName = `vid${j + 1}.mp4`;

        await new Promise((res) => {
          chrome.downloads.download(
            {
              url,
              filename: `${folder}/${fileName}`,
              saveAs: false,
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn("Download vid error:", chrome.runtime.lastError);
              }
              res(null);
            }
          );
        });

        await new Promise((res) => {
          chrome.downloads.download(
            {
              url,
              filename: `${allFolder}/review${i + 1}_${fileName}`,
              saveAs: false,
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn("Download vid all error:", chrome.runtime.lastError);
              }
              res(null);
            }
          );
        });

        await delay(250);
      }
    }
  }
}
