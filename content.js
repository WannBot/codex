// ===== Helper =====
const cleanUrl = (u) =>
  u ? u.split("?")[0].replace(/@resize[^ ]+/g, "") : null;

// deteksi thumbnail video
const isVideoThumb = (div) => {
  if (div.querySelector("video")) return true;
  if (
    div.querySelector(
      "[class*='video'], [class*='Video'], [class*='play'], [class*='Play']"
    )
  ) {
    return true;
  }
  const span = div.querySelector("span");
  if (span && /\d+:\d+/.test(span.textContent.trim())) return true;
  return false;
};

const getMainImageUrls = () => {
  const urls = new Set();

  const collectFromDivs = (nodeList) => {
    nodeList.forEach((div) => {
      if (isVideoThumb(div)) return; // 🔹 skip thumbnail video

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

  // utama
  collectFromDivs(document.querySelectorAll("div.YM40Nc"));
  // fallback ketika gallery terbuka
  collectFromDivs(document.querySelectorAll("div.jA1mTx.d0bVwS"));

  return Array.from(urls);
};

// geser tombol sedikit ke kanan
const LEFT_OFFSET_PX = 20;

function waitForProductPage() {
  const observer = new MutationObserver(() => {
    const target = document.querySelector(".page-product");
    if (target && !document.querySelector("#botresi-download-buttons")) {
      observer.disconnect();
      injectButtons(target);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function injectButtons(target) {
  const container = document.createElement("div");
  container.id = "botresi-download-buttons";
  container.style.display = "flex";
  container.style.gap = "6px";
  container.style.alignItems = "center";
  container.style.justifyContent = "flex-start";
  container.style.margin = "6px 0";
  container.style.padding = "0";
  container.style.background = "transparent";
  container.style.position = "relative";
  container.style.zIndex = "999";
  container.style.marginLeft = LEFT_OFFSET_PX + "px";

  const btnMain = document.createElement("button");
  const btnVarian = document.createElement("button");
  styleBtn(btnMain, "#f05423");
  styleBtn(btnVarian, "#d32f2f");

  const updateCounts = () => {
    const mainCount = getMainImageUrls().length;
    const variantCount = document.querySelectorAll("span.ZivAAW").length;

    btnMain.textContent = `Main images (${mainCount})`;
    btnVarian.textContent = `Variant images (${variantCount})`;
  };

  btnMain.onclick = () => {
    const productName =
      document.querySelector("h1.vR6K3w")?.innerText.trim() ||
      "ProductImages_" + Date.now();
    const mainImages = getMainImageUrls();
    const varianImages = [];

    if (!mainImages.length) {
      alert("Tidak ada main images.");
      return;
    }

    chrome.runtime.sendMessage(
      { action: "downloadImages", productName, mainImages, varianImages },
      () => alert("✅ Mulai download Main Images…")
    );
  };

  btnVarian.onclick = () => {
    const productName =
      document.querySelector("h1.vR6K3w")?.innerText.trim() ||
      "ProductImages_" + Date.now();

    const varianNames = Array.from(
      document.querySelectorAll("span.ZivAAW")
    ).map((el) => el.innerText.trim());

    const varianImages = [];
    const imgs = document.querySelectorAll("img.uXN1L5.nk0Z0T");
    imgs.forEach((img, i) => {
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

    if (!varianImages.length) {
      alert("Tidak ada variant images.");
      return;
    }

    chrome.runtime.sendMessage(
      { action: "downloadImages", productName, mainImages: [], varianImages },
      () => alert("✅ Mulai download Variant Images…")
    );
  };

  const parent =
    document.querySelector(".page-product")?.parentElement ||
    target.parentElement;
  parent.insertBefore(container, parent.firstChild);
  container.appendChild(btnMain);
  container.appendChild(btnVarian);

  updateCounts();
  setInterval(updateCounts, 1500);
}

function styleBtn(btn, color) {
  btn.style.background = color;
  btn.style.border = "none";
  btn.style.padding = "4px 10px";
  btn.style.borderRadius = "4px";
  btn.style.color = "#fff";
  btn.style.cursor = "pointer";
  btn.style.fontWeight = "600";
  btn.style.fontFamily = "Arial, sans-serif";
  btn.style.fontSize = "12px";
  btn.style.lineHeight = "1";
  btn.style.transition = "0.2s";
  btn.onmouseover = () => (btn.style.opacity = "0.85");
  btn.onmouseout = () => (btn.style.opacity = "1");
}

waitForProductPage();
