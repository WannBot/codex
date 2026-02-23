(() => {
  const STYLE_ID = "rd-review-checkbox-style";
  const CHECKBOX_CLASS = "rd-review-checkbox";
  const WRAP_CLASS = "rd-review-checkbox-wrap";

  function storageKey() {
    return `rd_selected_reviews::${location.origin}${location.pathname}`;
  }

  function loadSelectedMap() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveSelectedMap(map) {
    localStorage.setItem(storageKey(), JSON.stringify(map || {}));
  }

  function cleanUrl(u) {
    return u ? u.split("?")[0].replace(/@resize[^ ]+/g, "") : null;
  }

  function getReviewBlocks() {
    return Array.from(
      document.querySelectorAll(
        ".A7MThp, .product-ratings .shopee-product-rating__main"
      )
    );
  }

  function parseVariantFromBlock(block) {
    const el = block.querySelector("div.XYk98l");
    if (!el) return "";
    const txt = (el.innerText || "").trim();
    const idx = txt.indexOf("Variasi:");
    if (idx === -1) return "";
    let full = txt.slice(idx + "Variasi:".length).trim();
    if (full.includes(",")) full = full.split(",")[0].trim();
    return full;
  }

  function parseDate(block) {
    const dateEl = block.querySelector(".shopee-product-rating__time");
    return dateEl ? (dateEl.innerText || "").trim() : "";
  }

  function parseUser(block) {
    const userEl =
      block.querySelector(".shopee-product-rating__author-name") ||
      block.querySelector("a.black82") ||
      block.querySelector(".shopee-product-rating__author") ||
      block.querySelector("a");
    return userEl ? (userEl.innerText || "").trim() : "";
  }

  function extractReview(block) {
    const textEl = block.querySelector(".YNedDV");
    const text = textEl ? (textEl.innerText || "").trim() : "";

    const images = [];
    block.querySelectorAll("img").forEach((img) => {
      const src = cleanUrl(img.src);
      if (src && !images.includes(src)) images.push(src);
    });

    const videos = [];
    block.querySelectorAll("video").forEach((video) => {
      const src = cleanUrl(video.src);
      if (src && !videos.includes(src)) videos.push(src);
    });

    return {
      user: parseUser(block),
      date: parseDate(block),
      text,
      variant: parseVariantFromBlock(block),
      images,
      videos,
    };
  }

  function buildReviewKey(review) {
    const firstMedia = review.images[0] || review.videos[0] || "";
    const textSig = (review.text || "").replace(/\s+/g, " ").trim().slice(0, 80);
    return [review.user, review.date, review.variant, textSig, firstMedia].join("||");
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${WRAP_CLASS} {
        display: inline-flex;
        align-items: flex-start;
        justify-content: center;
        width: 24px;
        margin-right: 8px;
        padding-top: 2px;
      }
      .${CHECKBOX_CLASS} {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: #111827;
      }
    `;
    document.head.appendChild(style);
  }

  function injectCheckboxes() {
    ensureStyles();
    const selectedMap = loadSelectedMap();

    getReviewBlocks().forEach((block) => {
      if (block.querySelector(`.${CHECKBOX_CLASS}`)) return;

      const review = extractReview(block);
      const reviewKey = buildReviewKey(review);

      const wrap = document.createElement("span");
      wrap.className = WRAP_CLASS;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = CHECKBOX_CLASS;
      cb.dataset.reviewKey = reviewKey;
      cb.checked = Boolean(selectedMap[reviewKey]);

      cb.addEventListener("change", () => {
        const mapNow = loadSelectedMap();
        const latestReview = extractReview(block);
        const key = cb.dataset.reviewKey;
        if (!key) return;

        if (cb.checked) {
          mapNow[key] = latestReview;
        } else {
          delete mapNow[key];
        }
        saveSelectedMap(mapNow);
      });

      wrap.appendChild(cb);

      const profileAnchor =
        block.querySelector(".shopee-product-rating__avatar") ||
        block.querySelector(".avatar") ||
        block.firstElementChild;

      if (profileAnchor && profileAnchor.parentElement) {
        profileAnchor.parentElement.insertBefore(wrap, profileAnchor);
      } else {
        block.insertBefore(wrap, block.firstChild);
      }
    });
  }

  function syncCheckedReviewsSnapshot() {
    const mapNow = loadSelectedMap();
    let changed = false;

    getReviewBlocks().forEach((block) => {
      const cb = block.querySelector(`.${CHECKBOX_CLASS}`);
      if (!cb || !cb.dataset.reviewKey || !cb.checked) return;
      mapNow[cb.dataset.reviewKey] = extractReview(block);
      changed = true;
    });

    if (changed) saveSelectedMap(mapNow);
  }

  function collectSelectedReviews() {
    syncCheckedReviewsSnapshot();
    const map = loadSelectedMap();
    return Object.values(map || {});
  }

  function clearSelectedReviews() {
    saveSelectedMap({});
    document.querySelectorAll(`.${CHECKBOX_CLASS}`).forEach((cb) => {
      cb.checked = false;
    });
  }

  function getSelectedCount() {
    return Object.keys(loadSelectedMap()).length;
  }

  function startObserver() {
    if (window.__rdReviewObserverStarted) return;
    window.__rdReviewObserverStarted = true;

    const observer = new MutationObserver(() => {
      injectCheckboxes();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.__reviewDownloader = {
    injectCheckboxes,
    collectSelectedReviews,
    clearSelectedReviews,
    getSelectedCount,
  };

  // Reset pilihan saat halaman direfresh
  clearSelectedReviews();
  injectCheckboxes();
  startObserver();
})();
