function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ------------------------------
  // DOWNLOAD REVIEWS (tetap seperti sebelumnya)
  // ------------------------------
  if (msg.action === "downloadReviews") {
    let { reviews, baseName } = msg;
    const root = (baseName || ("Penilaian_" + Date.now())).replace(/[\\/:*?"<>|]+/g, "_");

    startDownloadReviews(reviews, root).then(() => {
      sendResponse({ ok: true, folder: root });
    });
    return true;
  }

  // ------------------------------
  // DOWNLOAD PRODUCT IMAGES (Main + Varian)
  // Sekarang langsung di folder nama produk (bukan folder timestamp)
  // ------------------------------
  if (msg.action === "downloadImages") {
    let { productName, mainImages, varianImages } = msg;
    if (!productName) productName = "ProductImages_" + Date.now();
    const root = sanitize(productName);

    startDownloadProductImages(mainImages, varianImages, root).then(() => {
      sendResponse({ ok: true, folder: root });
    });
    return true;
  }

  return true;
});


// ------------------------------
// Fungsi download reviews
// ------------------------------
async function startDownloadReviews(reviews, root) {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // caption.txt global
  const allText = reviews.map(r => r.text || "").join("\n\n");
  const txtUrl = "data:text/plain;charset=utf-8," + encodeURIComponent(allText);
  await new Promise(res => {
    chrome.downloads.download({
      url: txtUrl,
      filename: `${root}/caption.txt`,
      saveAs: false
    }, () => res());
  });
  await delay(250);

  // Media sequential
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    const folder = `${root}/Review_${i + 1}`;
    const allFolder = `${root}/All Images`;

    if (r.images && r.images.length > 0) {
      for (let j = 0; j < r.images.length; j++) {
        const url = r.images[j];
        const fileName = `img${j + 1}.jpg`;
        await new Promise(res => {
          chrome.downloads.download({
            url,
            filename: `${folder}/${fileName}`,
            saveAs: false
          }, () => res());
        });
        await new Promise(res => {
          chrome.downloads.download({
            url,
            filename: `${allFolder}/review${i + 1}_${fileName}`,
            saveAs: false
          }, () => res());
        });
        await delay(250);
      }
    }

    if (r.videos && r.videos.length > 0) {
      for (let j = 0; j < r.videos.length; j++) {
        const url = r.videos[j];
        const fileName = `vid${j + 1}.mp4`;
        await new Promise(res => {
          chrome.downloads.download({
            url,
            filename: `${folder}/${fileName}`,
            saveAs: false
          }, () => res());
        });
        await new Promise(res => {
          chrome.downloads.download({
            url,
            filename: `${allFolder}/review${i + 1}_${fileName}`,
            saveAs: false
          }, () => res());
        });
        await delay(250);
      }
    }
  }
}


// ------------------------------
// Fungsi download product images (langsung di folder nama produk)
// ------------------------------
async function startDownloadProductImages(mainImages, varianImages, root) {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Main images
  if (mainImages && mainImages.length > 0) {
    for (let i = 0; i < mainImages.length; i++) {
      const url = mainImages[i];
      await new Promise(res => {
        chrome.downloads.download({
          url,
          filename: `${root}/Main Images/main${i + 1}.jpg`,
          saveAs: false
        }, () => res());
      });
      await delay(250);
    }
  }

  // Varian images
  if (varianImages && varianImages.length > 0) {
    for (let i = 0; i < varianImages.length; i++) {
      const obj = varianImages[i];
      await new Promise(res => {
        chrome.downloads.download({
          url: obj.url,
          filename: `${root}/Varian Images/${obj.name}`,
          saveAs: false
        }, () => res());
      });
      await delay(250);
    }
  }
}
