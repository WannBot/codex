const SENDERBLAST_API_BASES = [
  "https://api.senderblast.com",
  "https://senderblast.com",
  "https://www.senderblast.com",
  "https://app.senderblast.com",
];
const SENDERBLAST_API_KEY = "Kaco5VheOmopSiQ6j5ohkcNjtt1gMvQyi7s";

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;

  if (msg.action === "downloadReviews") {
    try {
      const { reviews, targetNumber, senderNumber, apiBaseUrl } = msg;

      (async () => {
        if (!targetNumber) {
          sendResponse({ ok: false, message: "Nomor target WhatsApp belum diisi." });
          return;
        }

        const waResult = await sendReviewsToWhatsapp(reviews || [], targetNumber, senderNumber, apiBaseUrl);

        if (waResult.total > 0 && waResult.success === 0) {
          const errText = waResult.errors && waResult.errors.length
            ? waResult.errors[0]
            : "Semua request WhatsApp gagal.";
          sendResponse({ ok: false, message: errText, whatsapp: waResult });
          return;
        }

        sendResponse({ ok: true, whatsapp: waResult, mode: "whatsapp_only" });
      })().catch((err) => {
        console.error("WhatsApp send error:", err);
        sendResponse({ ok: false, message: String(err) });
      });
    } catch (e) {
      console.error("Background error:", e);
      sendResponse({ ok: false, message: String(e) });
    }
    return true;
  }
});

async function postSenderBlast(path, payload, apiBaseUrl = "") {
  const errors = [];

  const normalized = normalizeApiBaseUrl(apiBaseUrl);
  const bases = normalized
    ? [normalized, ...SENDERBLAST_API_BASES.filter((b) => b !== normalized)]
    : SENDERBLAST_API_BASES;

  for (const base of bases) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SENDERBLAST_API_KEY}`,
          "X-API-KEY": SENDERBLAST_API_KEY,
          "apikey": SENDERBLAST_API_KEY,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        errors.push(`${url} -> HTTP ${res.status}: ${text}`);
        continue;
      }

      return data;
    } catch (err) {
      errors.push(`${url} -> ${String(err)}`);
    }
  }

  throw new Error(`SenderBlast request gagal. ${errors.join(" | ")}`);
}

function normalizeApiBaseUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");
  return `https://${raw}`.replace(/\/$/, "");
}

function compactReviewText(r) {
  let text = String(r.text || "").replace(/\r?\n/g, " ").replace(/\\n/gi, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) text = "(tanpa teks)";
  return text;
}

function buildMessagePayload(targetNumber, message, senderNumber = "") {
  return {
    api_key: SENDERBLAST_API_KEY,
    sender: senderNumber || undefined,
    number: targetNumber,
    message,
  };
}

function buildMediaPayload(targetNumber, mediaUrl, senderNumber = "", mediaKind = "image") {
  return {
    api_key: SENDERBLAST_API_KEY,
    sender: senderNumber || undefined,
    number: targetNumber,
    mediaType: mediaKind,
    url: mediaUrl,
    caption: "",
  };
}

async function sendReviewsToWhatsapp(reviews, targetNumber, senderNumber = "", apiBaseUrl = "") {
  if (!Array.isArray(reviews) || !reviews.length) {
    return { success: 0, total: 0, errors: [] };
  }

  const result = { success: 0, total: 0, errors: [] };

  const sendMessage = async (message) => {
    result.total += 1;
    try {
      await postSenderBlast("/api/v1/send-message", buildMessagePayload(targetNumber, message, senderNumber), apiBaseUrl);
      result.success += 1;
    } catch (e) {
      result.errors.push(String(e));
    }
  };

  const sendMedia = async (mediaUrl, mediaKind = "image") => {
    result.total += 1;
    try {
      await postSenderBlast("/api/v1/send-media", buildMediaPayload(targetNumber, mediaUrl, senderNumber, mediaKind), apiBaseUrl);
      result.success += 1;
    } catch (e) {
      result.errors.push(String(e));
    }
  };

  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i] || {};
    const caption = compactReviewText(r);

    // 1) Kirim semua media dulu: video lalu gambar (tanpa caption agar tidak dobel).
    const videoList = Array.isArray(r.videos) ? r.videos.filter(Boolean) : [];
    for (let j = 0; j < videoList.length; j++) {
      await sendMedia(videoList[j], "video");
    }

    const imageList = Array.isArray(r.images) ? r.images.filter(Boolean) : [];
    for (let j = 0; j < imageList.length; j++) {
      await sendMedia(imageList[j], "image");
    }

    // 2) Setelah media terkirim, kirim caption via send-message.
    await sendMessage(caption);
  }

  return result;
}

async function startDownloadReviews(reviews, root) {
  if (!Array.isArray(reviews) || !reviews.length) {
    throw new Error("Tidak ada review yang dikirim ke background.");
  }

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const allText = reviews
    .map((r, idx) => {
      const no = String(idx + 1).padStart(3, "0");
      const variant = r.variant && String(r.variant).trim()
        ? ` [Varian: ${r.variant}]`
        : "";

      let text = String(r.text || "");
      text = text.replace(/\r?\n/g, " ");
      text = text.replace(/\\n/gi, " ");
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

  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    const idx = String(i + 1).padStart(3, "0");
    const variantName = r.variant ? sanitize(String(r.variant)) : "";
    const folderName = variantName
      ? `${idx} - ${variantName}`
      : `${idx} - Review`;
    const folder = `${root}/${folderName}`;
    const allFolder = `${root}/All Images`;

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
