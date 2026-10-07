/* =========================================================
   TRADELY APP
   Premium dark trading terminal
   Virtual simulated markets
   Existing HTML / native dialog compatible
   ========================================================= */

const API = "/api";

/* =========================================================
   GLOBAL STATE
   ========================================================= */

let token =
  localStorage.getItem("tradelyToken") || null;

let currentUser = null;

let currentPage = "home";

let activeDepositId =
  localStorage.getItem("tradelyActiveDepositId") || null;

let positions = [];

let markets = [];

let selectedMarket = null;

let selectedDuration = "48H";

let depositPollTimer = null;

let marketRefreshTimer = null;

let loginPhoneInput = null;

let registerPhoneInput = null;

let appInitialized = false;


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   MONEY / DATE HELPERS
   ========================================================= */

function money(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "$0.00";
  }

  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function number(value, decimals = 2) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "0";
  }

  return amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatShortDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatCountdown(value) {
  const target = new Date(value).getTime();

  if (!Number.isFinite(target)) {
    return "—";
  }

  const difference = target - Date.now();

  if (difference <= 0) {
    return "Matured";
  }

  const totalSeconds =
    Math.floor(difference / 1000);

  const days =
    Math.floor(totalSeconds / 86400);

  const hours =
    Math.floor((totalSeconds % 86400) / 3600);

  const minutes =
    Math.floor((totalSeconds % 3600) / 60);

  const seconds =
    totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatPercent(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "0.00%";
  }

  return `${amount >= 0 ? "+" : ""}${amount.toFixed(2)}%`;
}


/* =========================================================
   TOAST / MESSAGE
   ========================================================= */

function showToast(message, type = "info") {
  let toast = $("tradelyToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "tradelyToast";

    toast.style.position = "fixed";
    toast.style.right = "20px";
    toast.style.bottom = "20px";
    toast.style.zIndex = "99999";
    toast.style.maxWidth = "360px";
    toast.style.padding = "13px 16px";
    toast.style.borderRadius = "11px";
    toast.style.border = "1px solid rgba(255,255,255,.10)";
    toast.style.background = "#111827";
    toast.style.color = "#fff";
    toast.style.fontSize = "12px";
    toast.style.fontWeight = "650";
    toast.style.boxShadow = "0 20px 50px rgba(0,0,0,.45)";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition =
      "opacity .18s ease, transform .18s ease";

    document.body.appendChild(toast);
  }

  if (type === "success") {
    toast.style.borderColor =
      "rgba(39,209,127,.25)";
  } else if (type === "error") {
    toast.style.borderColor =
      "rgba(255,93,115,.25)";
  } else {
    toast.style.borderColor =
      "rgba(95,125,245,.25)";
  }

  toast.textContent = message;

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, 3500);
}


/* =========================================================
   API REQUEST
   ========================================================= */

async function apiRequest(path, options = {}) {
  const config = {
    ...options,
    headers: {
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {})
    }
  };

  if (token) {
    config.headers.Authorization =
      `Bearer ${token}`;
  }

  const response = await fetch(
    `${API}${path}`,
    config
  );

  let result = null;

  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (response.status === 401) {
    token = null;
    currentUser = null;

    localStorage.removeItem("tradelyToken");

    if (depositPollTimer) {
      clearInterval(depositPollTimer);
      depositPollTimer = null;
    }

    showAuth();

    throw new Error(
      result.message ||
      result.error ||
      "Your session has expired. Please log in again."
    );
  }

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.error ||
      `Request failed with status ${response.status}`
    );
  }

  return result;
}


/* =========================================================
   AUTH SCREEN
   ========================================================= */

function showAuth() {
  const authScreen = $("authScreen");
  const app = qs(".app");

  if (authScreen) {
    authScreen.style.display = "flex";
  }

  if (app) {
    app.style.display = "none";
  }

  const loginPanel = $("loginPanel");
  const registerPanel = $("registerPanel");

  if (loginPanel && registerPanel) {
    loginPanel.style.display = "block";
    registerPanel.style.display = "none";
  }

  clearAuthMessages();
}

function showApp() {
  const authScreen = $("authScreen");
  const app = qs(".app");

  if (authScreen) {
    authScreen.style.display = "none";
  }

  if (app) {
    app.style.display = "flex";
  }
}

function clearAuthMessages() {
  qsa(".auth-message").forEach(element => {
    element.textContent = "";
    element.classList.remove(
      "error",
      "success"
    );
  });
}

function setAuthMessage(message, type = "error") {
  const elements =
    qsa(".auth-message");

  if (!elements.length) {
    showToast(message, type);
    return;
  }

  const visible =
    elements.find(element => {
      const panel =
        element.closest(".auth-panel");

      return (
        panel &&
        getComputedStyle(panel).display !==
          "none"
      );
    }) || elements[0];

  visible.textContent = message;

  visible.classList.remove(
    "error",
    "success"
  );

  visible.classList.add(type);
}


/* =========================================================
   AUTH PANEL SWITCHING
   ========================================================= */

function showLogin() {
  const loginPanel = $("loginPanel");
  const registerPanel = $("registerPanel");

  if (loginPanel) {
    loginPanel.style.display = "block";
  }

  if (registerPanel) {
    registerPanel.style.display = "none";
  }

  clearAuthMessages();
}

function showRegister() {
  const loginPanel = $("loginPanel");
  const registerPanel = $("registerPanel");

  if (loginPanel) {
    loginPanel.style.display = "none";
  }

  if (registerPanel) {
    registerPanel.style.display = "block";
  }

  clearAuthMessages();
}


/* =========================================================
   PHONE INPUT
   ========================================================= */

function setupPhoneInputs() {
  if (
    typeof window.intlTelInput !==
    "function"
  ) {
    return;
  }

  const loginPhone = $("loginPhone");
  const registerPhone = $("registerPhone");

  const options = {
    initialCountry: "gh",
    separateDialCode: true,
    nationalMode: true,
    preferredCountries: [
      "gh",
      "ng",
      "us",
      "gb"
    ],
    utilsScript:
      "https://cdn.jsdelivr.net/npm/intl-tel-input@26.8.1/dist/js/utils.js"
  };

  if (
    loginPhone &&
    !loginPhone.dataset.itiReady
  ) {
    loginPhoneInput =
      window.intlTelInput(
        loginPhone,
        options
      );

    loginPhone.dataset.itiReady = "true";
  }

  if (
    registerPhone &&
    !registerPhone.dataset.itiReady
  ) {
    registerPhoneInput =
      window.intlTelInput(
        registerPhone,
        options
      );

    registerPhone.dataset.itiReady = "true";
  }
}

function getPhoneValue(
  input,
  instance
) {
  if (!input) {
    return "";
  }

  if (instance) {
    try {
      const number =
        instance.getNumber();

      if (number) {
        return number.trim();
      }
    } catch {
      // Fall through to raw value.
    }
  }

  const raw =
    input.value.trim();

  return raw;
}

function isValidInternationalPhone(
  phone
) {
  return /^\+[1-9]\d{7,14}$/.test(
    String(phone || "").trim()
  );
}


/* =========================================================
   LOGIN
   ========================================================= */

async function loginUser(event) {
  if (event) {
    event.preventDefault();
  }

  const phoneInput = $("loginPhone");
  const passwordInput = $("loginPassword");

  const phone =
    getPhoneValue(
      phoneInput,
      loginPhoneInput
    );

  const password =
    passwordInput
      ? passwordInput.value
      : "";

  if (!phone) {
    setAuthMessage(
      "Please enter your phone number."
    );
    return;
  }

  if (!isValidInternationalPhone(phone)) {
    setAuthMessage(
      "Enter a valid international phone number."
    );
    return;
  }

  if (!password) {
    setAuthMessage(
      "Please enter your password."
    );
    return;
  }

  const button =
    qs(
      "#loginForm button[type='submit'], #loginButton"
    );

  const originalText =
    button
      ? button.textContent
      : "";

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Signing in...";
    }

    const result =
      await apiRequest(
        "/login",
        {
          method: "POST",
          body: JSON.stringify({
            phone,
            password
          })
        }
      );

    token =
      result.token ||
      result.accessToken ||
      null;

    if (!token) {
      throw new Error(
        "Login succeeded but no authentication token was returned."
      );
    }

    localStorage.setItem(
      "tradelyToken",
      token
    );

    currentUser =
      result.user ||
      result.account ||
      null;

    showApp();

    await initializeAuthenticatedApp();

    showToast(
      "Welcome back.",
      "success"
    );
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    setAuthMessage(
      error.message ||
      "Login failed."
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        originalText || "Login";
    }
  }
}


/* =========================================================
   REGISTER
   ========================================================= */

async function registerUser(event) {
  if (event) {
    event.preventDefault();
  }

  const nameInput =
    $("registerName");

  const phoneInput =
    $("registerPhone");

  const passwordInput =
    $("registerPassword");

  const name =
    nameInput
      ? nameInput.value.trim()
      : "";

  const phone =
    getPhoneValue(
      phoneInput,
      registerPhoneInput
    );

  const password =
    passwordInput
      ? passwordInput.value
      : "";

  if (!name) {
    setAuthMessage(
      "Please enter your name."
    );
    return;
  }

  if (!phone) {
    setAuthMessage(
      "Please enter your phone number."
    );
    return;
  }

  if (!isValidInternationalPhone(phone)) {
    setAuthMessage(
      "Enter a valid international phone number."
    );
    return;
  }

  if (password.length < 6) {
    setAuthMessage(
      "Password must be at least 6 characters."
    );
    return;
  }

  const button =
    qs(
      "#registerForm button[type='submit'], #registerButton"
    );

  const originalText =
    button
      ? button.textContent
      : "";

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Creating account...";
    }

    const result =
      await apiRequest(
        "/register",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            phone,
            password
          })
        }
      );

    token =
      result.token ||
      result.accessToken ||
      null;

    if (token) {
      localStorage.setItem(
        "tradelyToken",
        token
      );

      currentUser =
        result.user ||
        result.account ||
        null;

      showApp();

      await initializeAuthenticatedApp();

      showToast(
        "Account created successfully.",
        "success"
      );

      return;
    }

    showLogin();

    const loginPhone =
      $("loginPhone");

    if (
      loginPhone &&
      phone
    ) {
      if (loginPhoneInput) {
        try {
          loginPhoneInput.setNumber(
            phone
          );
        } catch {
          loginPhone.value = phone;
        }
      } else {
        loginPhone.value = phone;
      }
    }

    showToast(
      "Account created. Please log in.",
      "success"
    );
  } catch (error) {
    console.error(
      "Registration error:",
      error
    );

    setAuthMessage(
      error.message ||
      "Registration failed."
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        originalText ||
        "Create Account";
    }
  }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logoutUser() {
  try {
    if (token) {
      await apiRequest(
        "/logout",
        {
          method: "POST"
        }
      );
    }
  } catch (error) {
    console.warn(
      "Logout request failed:",
      error
    );
  }

  token = null;
  currentUser = null;
  positions = [];
  markets = [];
  selectedMarket = null;

  localStorage.removeItem(
    "tradelyToken"
  );

  localStorage.removeItem(
    "tradelyActiveDepositId"
  );

  activeDepositId = null;

  if (depositPollTimer) {
    clearInterval(depositPollTimer);
    depositPollTimer = null;
  }

  if (marketRefreshTimer) {
    clearInterval(marketRefreshTimer);
    marketRefreshTimer = null;
  }

  closeTradeModal();

  showAuth();

  showToast(
    "You have been logged out."
  );
}


/* =========================================================
   ACCOUNT
   ========================================================= */

async function loadAccount() {
  const result =
    await apiRequest(
      "/account"
    );

  currentUser =
    result.user ||
    result.account ||
    result;

  updateBalanceDisplays();

  updateUserNameDisplays();

  return currentUser;
}

function updateUserNameDisplays() {
  if (!currentUser) {
    return;
  }

  const name =
    currentUser.name ||
    currentUser.fullName ||
    currentUser.username ||
    "Trader";

  qsa(
    "[data-user-name]"
  ).forEach(element => {
    element.textContent = name;
  });

  const welcomeName =
    $("welcomeName");

  if (welcomeName) {
    welcomeName.textContent = name;
  }
}

function getBalance() {
  if (!currentUser) {
    return 0;
  }

  const balance =
    Number(
      currentUser.balance ??
      currentUser.cash ??
      0
    );

  return Number.isFinite(balance)
    ? balance
    : 0;
}

function updateBalanceDisplays() {
  const balance =
    getBalance();

  const formatted =
    money(balance);

  const ids = [
    "cash",
    "homeCash",
    "portfolioCash",
    "walletCash",
    "topbarCash"
  ];

  ids.forEach(id => {
    const element = $(id);

    if (element) {
      element.textContent =
        formatted;
    }
  });

  qsa(
    "[data-balance]"
  ).forEach(element => {
    element.textContent =
      formatted;
  });

  const modalBalance =
    $("tradeAvailableBalance");

  if (modalBalance) {
    modalBalance.textContent =
      formatted;
  }

  const walletBalance =
    $("walletBalance");

  if (walletBalance) {
    walletBalance.textContent =
      formatted;
  }
}


/* =========================================================
   MARKETS
   ========================================================= */

async function loadMarkets() {
  const containers = [
    $("marketPreview"),
    $("marketList")
  ].filter(Boolean);

  containers.forEach(container => {
    if (
      !container.children.length
    ) {
      container.innerHTML =
        `<div class="loading">Loading markets...</div>`;
    }
  });

  try {
    const result =
      await apiRequest(
        "/markets"
      );

    markets =
      Array.isArray(result)
        ? result
        : (
          result.markets ||
          result.data ||
          []
        );

    if (!Array.isArray(markets)) {
      markets = [];
    }

    renderMarkets();

    return markets;
  } catch (error) {
    console.error(
      "Market loading error:",
      error
    );

    containers.forEach(container => {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Markets unavailable</h3>
          <p>${escapeHtml(
            error.message ||
            "Unable to load markets."
          )}</p>
        </div>
      `;
    });

    return [];
  }
}
async function loadMarkets() {
  const result = await apiRequest("/markets");

  if (Array.isArray(result)) {
    markets = result;
  } else {
    markets = result.markets || result.data || [];
  }

  if (!Array.isArray(markets)) {
    markets = [];
  }
}


// =========================================================
// LIVE MARKET PRICE REFRESH
// =========================================================

async function refreshMarketPrices() {
  try {
    await loadMarkets();
    renderMarkets();

    if (currentPage === "portfolio") {
      await loadPositions();
      renderPortfolio();
    }
  } catch (error) {
    console.error("Market price refresh failed:", error);
  }
}

function startMarketPriceRefresh() {
  stopMarketPriceRefresh();

  marketRefreshTimer = setInterval(
    refreshMarketPrices,
    3000
  );
}

function stopMarketPriceRefresh() {
  if (marketRefreshTimer) {
    clearInterval(marketRefreshTimer);
    marketRefreshTimer = null;
  }
}

function marketPrice(market) {
  const candidates = [
    market.currentPrice,
    market.price,
    market.snapshot?.price,
    market.quote?.price,
    market.referencePrice
  ];

  for (const value of candidates) {
    const numberValue =
      Number(value);

    if (
      Number.isFinite(numberValue)
    ) {
      return numberValue;
    }
  }

  return 0;
}

function marketChange(market) {
  const candidates = [
    market.changePercent,
    market.changePct,
    market.percentChange,
    market.change?.percent,
    market.snapshot?.changePercent
  ];

  for (const value of candidates) {
    const numberValue =
      Number(value);

    if (
      Number.isFinite(numberValue)
    ) {
      return numberValue;
    }
  }

  return 0;
}

function marketDescription(market) {
  if (market.description) {
    return market.description;
  }

  if (market.isPublic) {
    return `${market.name} is a public-market reference with simulated Tradely position trading.`;
  }

  return `${market.name} is a private-market reference used for virtual simulated trading on Tradely.`;
}

function renderMarkets() {
  const preview =
    $("marketPreview");

  const list =
    $("marketList");

  if (preview) {
    const previewMarkets =
      markets.slice(0, 3);

    preview.innerHTML =
      previewMarkets.length
        ? previewMarkets
            .map(marketCard)
            .join("")
        : `
          <div class="empty-state">
            <h3>No markets available</h3>
            <p>Markets will appear here when they are available.</p>
          </div>
        `;
  }

  if (list) {
    list.innerHTML =
      markets.length
        ? markets
            .map(marketCard)
            .join("")
        : `
          <div class="empty-state">
            <h3>No markets available</h3>
            <p>There are currently no markets to display.</p>
          </div>
        `;
  }

  setupMarketButtons();
}

function marketCard(market) {
  const id =
    market.id || "";

  const name =
    market.name ||
    market.symbol ||
    "Market";

  const symbol =
    market.symbol ||
    name.toUpperCase();

  const price =
    marketPrice(market);

  const change =
    marketChange(market);

  const positive =
    change >= 0;

  const category =
    market.category ||
    (
      market.isPublic
        ? "Public Market"
        : "Private Market"
    );

  return `
    <article class="market-card">

      <div class="market-card-top">
        <div>
          <div class="market-symbol">
            ${escapeHtml(symbol)}
          </div>

          <div class="market-name">
            ${escapeHtml(name)}
          </div>
        </div>

        <div class="market-price">
          ${money(price)}
        </div>
      </div>

      <div class="market-description">
        ${escapeHtml(
          marketDescription(market)
        )}
      </div>

      <div class="market-change ${
        positive
          ? "positive"
          : "negative"
      }">
        ${
          positive ? "+" : ""
        }${change.toFixed(2)}%
      </div>

      <div class="market-simulated">
        VIRTUAL MARKET · NO REAL OWNERSHIP
      </div>

      <div class="market-actions">
        <button
          type="button"
          class="trade-open-button"
          data-open-market="${escapeHtml(id)}"
        >
          Open Position
        </button>
      </div>

    </article>
  `;
}

function setupMarketButtons() {
  qsa(
    "[data-open-market]"
  ).forEach(button => {
    if (
      button.dataset.bound === "true"
    ) {
      return;
    }

    button.dataset.bound = "true";

    button.addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();

        const marketId =
          button.dataset.openMarket;

        openMarketModal(marketId);
      }
    );
  });
}


/* =========================================================
   MARKET LOOKUP
   ========================================================= */

function findMarket(marketId) {
  return markets.find(
    market =>
      String(market.id) ===
      String(marketId)
  );
}


/* =========================================================
   NATIVE TRADE DIALOG
   ========================================================= */

function getTradeModal() {
  return $("tradeModal");
}

function openMarketModal(marketOrId) {
  const market =
    typeof marketOrId === "object"
      ? marketOrId
      : findMarket(marketOrId);

  if (!market) {
    showToast(
      "Market could not be found.",
      "error"
    );
    return;
  }

  selectedMarket = market;

  selectedDuration = "48H";

  const modal =
    getTradeModal();

  if (!modal) {
    showToast(
      "Trading window is unavailable. Please refresh the page.",
      "error"
    );

    console.error(
      "Tradely: #tradeModal was not found."
    );

    return;
  }

  fillTradeModal(
    selectedMarket
  );

  document.body.style.overflow =
    "hidden";

  try {
    if (
      typeof modal.showModal ===
      "function"
    ) {
      if (!modal.open) {
        modal.showModal();
      }
    } else {
      modal.style.display = "flex";
      modal.classList.add("active");
    }
  } catch (error) {
    console.error(
      "Unable to open trade modal:",
      error
    );

    modal.style.display = "flex";
    modal.classList.add("active");
  }
}

function fillTradeModal(market) {
  const title =
    $("tradeModalTitle");

  const marketElement =
    $("tradeModalMarket");

  const price =
    $("tradeModalPrice");

  const priceLabel =
    $("tradeModalPriceLabel");

  const available =
    $("tradeAvailableBalance");

  const amount =
    $("tradeAmount");

  const message =
    $("tradeModalMessage");

  const expiry =
    $("tradeExpiryInfo");

  const confirm =
    $("confirmTradeButton");

  const symbol =
    market.symbol ||
    market.name ||
    "";

  const currentPrice =
    marketPrice(market);

  if (title) {
    title.textContent =
      `Open ${market.name || symbol}`;
  }

  if (marketElement) {
    marketElement.textContent =
      `${symbol} · ${
        market.category ||
        "Virtual Market"
      }`;
  }

  if (price) {
    price.textContent =
      money(currentPrice);
  }

  if (priceLabel) {
    priceLabel.textContent =
      market.referenceLabel ||
      "Indicative market price";
  }

  if (available) {
    available.textContent =
      money(getBalance());
  }

  if (amount) {
    amount.value = "";
    amount.min = "1";
    amount.max =
      String(
        Math.max(
          0,
          getBalance()
        )
      );
  }

  if (message) {
    message.textContent = "";
    message.classList.remove(
      "error",
      "success"
    );
  }

  if (confirm) {
    confirm.disabled =
      getBalance() < 1;

    confirm.textContent =
      "Buy / Open Position";
  }

  updateDurationButtons();

  updateDurationInfo();

  if (expiry) {
    expiry.textContent =
      getDurationDescription(
        selectedDuration
      );
  }
}

function updateDurationButtons() {
  const buttonMap = {
    "48H": [
      "duration48H",
      "durationShort"
    ],
    "2M": [
      "duration2M",
      "durationLong2"
    ],
    "3M": [
      "duration3M",
      "durationLong3"
    ]
  };

  Object.entries(
    buttonMap
  ).forEach(
    ([duration, ids]) => {
      ids.forEach(id => {
        const button = $(id);

        if (button) {
          button.classList.toggle(
            "active",
            selectedDuration ===
              duration
          );
        }
      });
    }
  );

  qsa(
    "[data-duration]"
  ).forEach(button => {
    const duration =
      normalizeDuration(
        button.dataset.duration
      );

    button.classList.toggle(
      "active",
      duration ===
        selectedDuration
    );
  });
}

function normalizeDuration(value) {
  const normalized =
    String(value || "")
      .trim()
      .toUpperCase();

  if (
    normalized === "SHORT" ||
    normalized === "48H" ||
    normalized === "48"
  ) {
    return "48H";
  }

  if (
    normalized === "LONG2" ||
    normalized === "2M" ||
    normalized === "2"
  ) {
    return "2M";
  }

  if (
    normalized === "LONG3" ||
    normalized === "3M" ||
    normalized === "3"
  ) {
    return "3M";
  }

  return "48H";
}

function selectDuration(duration) {
  selectedDuration =
    normalizeDuration(duration);

  updateDurationButtons();

  updateDurationInfo();
}

function getDurationDescription(
  duration
) {
  const now =
    new Date();

  if (duration === "48H") {
    const expiry =
      new Date(
        now.getTime() +
        48 * 60 * 60 * 1000
      );

    return `Short Term · Exactly 48 hours · Expires ${formatDate(expiry)}`;
  }

  if (duration === "2M") {
    const expiry =
      addCalendarMonths(
        now,
        2
      );

    return `Long Term · 2 months · Matures ${formatDate(expiry)}`;
  }

  const expiry =
    addCalendarMonths(
      now,
      3
    );

  return `Long Term · 3 months · Matures ${formatDate(expiry)}`;
}

function addCalendarMonths(
  date,
  months
) {
  const result =
    new Date(date);

  const originalDay =
    result.getDate();

  result.setDate(1);

  result.setMonth(
    result.getMonth() + months
  );

  const lastDay =
    new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0
    ).getDate();

  result.setDate(
    Math.min(
      originalDay,
      lastDay
    )
  );

  return result;
}

function updateDurationInfo() {
  const info =
    $("tradeExpiryInfo") ||
    $("positionDurationInfo");

  if (info) {
    info.textContent =
      getDurationDescription(
        selectedDuration
      );
  }
}


/* =========================================================
   MODAL CLOSE
   ========================================================= */

function closeTradeModal() {
  const modal =
    getTradeModal();

  if (!modal) {
    return;
  }

  try {
    if (
      typeof modal.close ===
      "function" &&
      modal.open
    ) {
      modal.close();
    }
  } catch {
    // Ignore native dialog close errors.
  }

  modal.classList.remove(
    "active"
  );

  modal.style.display = "";

  document.body.style.overflow =
    "";

  selectedMarket = null;
}


/* =========================================================
   OPEN POSITION
   ========================================================= */

async function confirmOpenPosition() {
  const modal =
    getTradeModal();

  if (!selectedMarket) {
    showModalMessage(
      "Please select a market first.",
      "error"
    );
    return;
  }

  const amountInput =
    $("tradeAmount");

  const confirmButton =
    $("confirmTradeButton");

  const amount =
    amountInput
      ? Number(amountInput.value)
      : 0;

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    showModalMessage(
      "Enter an amount greater than $0.",
      "error"
    );
    return;
  }

  if (amount < 1) {
    showModalMessage(
      "Minimum position amount is $1.",
      "error"
    );
    return;
  }

  const balance =
    getBalance();

  if (amount > balance) {
    showModalMessage(
      "Insufficient virtual balance.",
      "error"
    );
    return;
  }

  let marketType =
    "short";

  let durationMonths =
    null;

  if (selectedDuration === "2M") {
    marketType = "long";
    durationMonths = 2;
  }

  if (selectedDuration === "3M") {
    marketType = "long";
    durationMonths = 3;
  }

  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent =
      "Opening Position...";
  }

  showModalMessage(
    "Opening virtual position...",
    ""
  );

  try {
    const result =
      await apiRequest(
        "/positions/open",
        {
          method: "POST",
          body: JSON.stringify({
            marketId:
              selectedMarket.id,
            marketType,
            durationMonths,
            amount
          })
        }
      );

    if (
      result.balance !==
      undefined
    ) {
      currentUser = {
        ...(currentUser || {}),
        balance:
          Number(result.balance)
      };
    } else {
      await loadAccount();
    }

    updateBalanceDisplays();

    await loadMarkets();

    await loadPositions();

    closeTradeModal();

    showToast(
      "Position opened successfully.",
      "success"
    );

    showPage(
      "portfolio"
    );
  } catch (error) {
    console.error(
      "Open position error:",
      error
    );

    showModalMessage(
      error.message ||
      "Unable to open position.",
      "error"
    );
  } finally {
    if (confirmButton) {
      confirmButton.disabled =
        getBalance() < 1;

      confirmButton.textContent =
        "Buy / Open Position";
    }
  }
}

function showModalMessage(
  message,
  type = ""
) {
  const messageElement =
    $("tradeModalMessage") ||
    $("positionModalMessage");

  if (!messageElement) {
    if (message) {
      showToast(
        message,
        type || "info"
      );
    }

    return;
  }

  messageElement.textContent =
    message;

  messageElement.classList.remove(
    "error",
    "success"
  );

  if (type) {
    messageElement.classList.add(
      type
    );
  }
}


/* =========================================================
   POSITIONS
   ========================================================= */

async function loadPositions() {
  const list =
    $("portfolioList");

  if (list) {
    list.innerHTML =
      `<div class="loading">Loading positions...</div>`;
  }

  try {
    const result =
      await apiRequest(
        "/positions"
      );

    positions =
      Array.isArray(result)
        ? result
        : (
          result.positions ||
          result.data ||
          []
        );

    renderPositions();

    updateHomePositionSummary();

    return positions;
  } catch (error) {
    console.error(
      "Position loading error:",
      error
    );

    if (list) {
      list.innerHTML = `
        <div class="empty-state">
          <h3>Unable to load positions</h3>
          <p>${escapeHtml(
            error.message ||
            "Please try again."
          )}</p>
        </div>
      `;
    }

    return [];
  }
}

function getPositionCurrentValue(
  position
) {
  const valuation =
    position.valuation ||
    {};

  const candidates = [
    valuation.currentValue,
    position.currentValue,
    position.value,
    position.amount
  ];

  for (const value of candidates) {
    const numberValue =
      Number(value);

    if (
      Number.isFinite(numberValue)
    ) {
      return numberValue;
    }
  }

  return 0;
}

function getPositionInvested(
  position
) {
  const candidates = [
    position.amount,
    position.invested,
    position.investment,
    position.entryValue
  ];

  for (const value of candidates) {
    const numberValue =
      Number(value);

    if (
      Number.isFinite(numberValue)
    ) {
      return numberValue;
    }
  }

  return 0;
}

function getPositionEntryPrice(
  position
) {
  const candidates = [
    position.entryPrice,
    position.entry?.price,
    position.openPrice,
    position.snapshot?.price
  ];

  for (const value of candidates) {
    const numberValue =
      Number(value);

    if (
      Number.isFinite(numberValue)
    ) {
      return numberValue;
    }
  }

  return 0;
}

function getPositionCurrentPrice(
  position
) {
  const valuation =
    position.valuation ||
    {};

  const candidates = [
    valuation.currentPrice,
    position.currentPrice,
    position.marketPrice,
    position.price
  ];

  for (const value of candidates) {
    const numberValue =
      Number(value);

    if (
      Number.isFinite(numberValue)
    ) {
      return numberValue;
    }
  }

  return getPositionEntryPrice(
    position
  );
}

function positionProfitLoss(
  position
) {
  const invested =
    getPositionInvested(
      position
    );

  const value =
    getPositionCurrentValue(
      position
    );

  return value - invested;
}

function positionProfitPercent(
  position
) {
  const invested =
    getPositionInvested(
      position
    );

  if (invested <= 0) {
    return 0;
  }

  return (
    positionProfitLoss(
      position
    ) /
    invested
  ) * 100;
}

function renderPositions() {
  const list =
    $("portfolioList");

  if (!list) {
    return;
  }

  const activePositions =
    positions.filter(
      position =>
        String(
          position.status ||
          "active"
        ).toLowerCase() ===
        "active"
    );

  if (!activePositions.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>No positions yet</h3>
        <p>
          Open a virtual market position to see it here.
        </p>
      </div>
    `;

    updatePortfolioSummary();

    return;
  }

  list.innerHTML =
    activePositions
      .map(positionCard)
      .join("");

  updatePortfolioSummary();
}

function positionCard(position) {
  const market =
    findMarket(
      position.marketId
    );

  const marketName =
    position.marketName ||
    position.name ||
    market?.name ||
    position.marketId ||
    "Market";

  const symbol =
    position.symbol ||
    market?.symbol ||
    marketName
      .toUpperCase();

  const invested =
    getPositionInvested(
      position
    );

  const currentValue =
    getPositionCurrentValue(
      position
    );

  const entryPrice =
    getPositionEntryPrice(
      position
    );

  const currentPrice =
    getPositionCurrentPrice(
      position
    );

  const pnl =
    positionProfitLoss(
      position
    );

  const pnlPercent =
    positionProfitPercent(
      position
    );

  const status =
    String(
      position.status ||
      "active"
    ).toLowerCase();

  const maturity =
    position.expiresAt ||
    position.maturityAt ||
    position.expires ||
    position.endDate;

  const durationLabel =
    getPositionDurationLabel(
      position
    );

  const positive =
    pnl >= 0;

  const positionId =
    position.id ||
    position.positionId ||
    "";

  return `
    <article class="position-card">

      <div class="position-top">

        <div>
          <div class="market-symbol">
            ${escapeHtml(symbol)}
          </div>

          <h3>
            ${escapeHtml(marketName)}
          </h3>
        </div>

        <span class="position-status ${
          status === "active"
            ? "active"
            : "matured"
        }">
          ${escapeHtml(
            status.toUpperCase()
          )}
        </span>

      </div>

      <div class="position-details">

        <div>
          <span>Invested</span>
          <strong>
            ${money(invested)}
          </strong>
        </div>

        <div>
          <span>Entry Price</span>
          <strong>
            ${money(entryPrice)}
          </strong>
        </div>

        <div>
          <span>Current Price</span>
          <strong>
            ${money(currentPrice)}
          </strong>
        </div>

        <div>
          <span>Duration</span>
          <strong>
            ${escapeHtml(
              durationLabel
            )}
          </strong>
        </div>

      </div>

      <div class="position-value">

        <div>
          <span>Current Value</span>
          <strong>
            ${money(currentValue)}
          </strong>
        </div>

        <div>
          <span>P/L</span>
          <strong class="${
            positive
              ? "positive"
              : "negative"
          }">
            ${
              positive
                ? "+"
                : ""
            }${money(pnl)}
          </strong>
        </div>

      </div>

      ${
        maturity
          ? `
            <div class="position-progress">
              <div class="position-countdown">
                Maturity
                <strong>
                  ${formatCountdown(
                    maturity
                  )}
                </strong>
              </div>

              <div class="position-matured-info">
                ${formatDate(
                  maturity
                )}
              </div>
            </div>
          `
          : ""
      }

      <div class="position-change ${
        positive
          ? "positive"
          : "negative"
      }">
        ${formatPercent(
          pnlPercent
        )}
      </div>

      ${
        status === "active" &&
        positionId
          ? `
            <button
              type="button"
              class="primary-button"
              style="margin-top:14px;"
              data-sell-position="${escapeHtml(
                positionId
              )}"
            >
              Sell / Close Position
            </button>
          `
          : ""
      }

    </article>
  `;
}

function getPositionDurationLabel(
  position
) {
  const marketType =
    String(
      position.marketType ||
      position.type ||
      ""
    ).toLowerCase();

  const durationMonths =
    Number(
      position.durationMonths
    );

  if (
    marketType === "short" ||
    position.duration === "48H"
  ) {
    return "48 hours";
  }

  if (
    durationMonths === 2
  ) {
    return "2 months";
  }

  if (
    durationMonths === 3
  ) {
    return "3 months";
  }

  if (position.duration) {
    return String(
      position.duration
    );
  }

  return "Virtual";
}

function updatePortfolioSummary() {
  const activePositions =
    positions.filter(
      position =>
        String(
          position.status ||
          "active"
        ).toLowerCase() ===
        "active"
    );

  let totalValue = 0;

  activePositions.forEach(
    position => {
      totalValue +=
        getPositionCurrentValue(
          position
        );
    }
  );

  const totalElement =
    $("portfolioValue");

  if (totalElement) {
    totalElement.textContent =
      money(totalValue);
  }

  const countElement =
    $("portfolioPositions");

  if (countElement) {
    countElement.textContent =
      String(
        activePositions.length
      );
  }

  const cashElement =
    $("portfolioCash");

  if (cashElement) {
    cashElement.textContent =
      money(getBalance());
  }
}

function updateHomePositionSummary() {
  const activePositions =
    positions.filter(
      position =>
        String(
          position.status ||
          "active"
        ).toLowerCase() ===
        "active"
    );

  const homePositions =
    $("homePositions");

  if (homePositions) {
    homePositions.textContent =
      String(
        activePositions.length
      );
  }

  let totalValue = 0;

  activePositions.forEach(
    position => {
      totalValue +=
        getPositionCurrentValue(
          position
        );
    }
  );

  const homePortfolio =
    $("homePortfolio");

  if (homePortfolio) {
    homePortfolio.textContent =
      money(totalValue);
  }
}


/* =========================================================
   SELL / CLOSE POSITION
   ========================================================= */

async function sellPosition(
  positionId
) {
  if (!positionId) {
    return;
  }

  const position =
    positions.find(
      item =>
        String(
          item.id ||
          item.positionId
        ) ===
        String(positionId)
    );

  const marketName =
    position?.marketName ||
    position?.name ||
    position?.symbol ||
    "this position";

  const confirmed =
    window.confirm(
      `Sell / close ${marketName}?`
    );

  if (!confirmed) {
    return;
  }

  try {
    const result =
      await apiRequest(
        `/positions/${encodeURIComponent(
          positionId
        )}/sell`,
        {
          method: "POST"
        }
      );

    if (
      result.balance !==
      undefined
    ) {
      currentUser = {
        ...(currentUser || {}),
        balance:
          Number(result.balance)
      };
    } else {
      await loadAccount();
    }

    updateBalanceDisplays();

    await loadMarkets();

    await loadPositions();

    showToast(
      "Position closed successfully.",
      "success"
    );
  } catch (error) {
    console.error(
      "Sell position error:",
      error
    );

    showToast(
      error.message ||
      "Unable to close position.",
      "error"
    );
  }
}


/* =========================================================
   DEPOSIT
   ========================================================= */

async function createDeposit(event) {
  if (event) {
    event.preventDefault();
  }

  const amountInput =
    $("amount");

  const networkInput =
    $("depositNetwork");

  const amount =
    amountInput
      ? Number(amountInput.value)
      : 0;

  const network =
    networkInput
      ? networkInput.value
      : "";

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    setWalletMessage(
      "Enter a valid deposit amount.",
      "error"
    );
    return;
  }

  if (amount < 500) {
    setWalletMessage(
      "Minimum crypto deposit is 500 USDT.",
      "error"
    );
    return;
  }

  if (
    network !== "TRC20" &&
    network !== "BEP20"
  ) {
    setWalletMessage(
      "Select TRC20 or BEP20.",
      "error"
    );
    return;
  }

  const button =
    qs(
      "#depositForm button[type='submit'], #createDepositButton"
    );

  const originalText =
    button
      ? button.textContent
      : "";

  try {
    if (button) {
      button.disabled = true;
      button.textContent =
        "Creating Deposit...";
    }

    /*
      IMPORTANT:
      Backend route is:
      POST /api/deposit/create

      API prefix is already /api,
      therefore frontend path is /deposit/create.
    */
    const result =
      await apiRequest(
        "/deposit/create",
        {
          method: "POST",
          body: JSON.stringify({
            amount,
            network
          })
        }
      );

    const deposit =
      result.deposit ||
      result.data ||
      result;

    activeDepositId =
      deposit.id ||
      deposit.depositId ||
      result.depositId ||
      null;

    if (activeDepositId) {
      localStorage.setItem(
        "tradelyActiveDepositId",
        activeDepositId
      );
    }

    renderDepositDetails(
      deposit
    );

    setWalletMessage(
      "Deposit created. Send the exact amount to the displayed address.",
      "success"
    );

    if (activeDepositId) {
      startDepositPolling();
    }
  } catch (error) {
    console.error(
      "Create deposit error:",
      error
    );

    setWalletMessage(
      error.message ||
      "Unable to create deposit.",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        originalText ||
        "Create Deposit";
    }
  }
}

function renderDepositDetails(
  deposit
) {
  const details =
    $("depositDetails");

  if (!details) {
    return;
  }

  const amount =
    deposit.amount ??
    deposit.expectedAmount ??
    0;

  const network =
    deposit.network ||
    deposit.chain ||
    "—";

  const address =
    deposit.address ||
    deposit.depositAddress ||
    deposit.paymentAddress ||
    "—";

  const id =
    deposit.id ||
    deposit.depositId ||
    activeDepositId ||
    "—";

  const status =
    deposit.status ||
    "pending";

  details.style.display =
    "block";

  details.innerHTML = `
    <div class="deposit-detail">
      <span>Status</span>
      <strong id="depositStatus">
        ${escapeHtml(
          String(status).toUpperCase()
        )}
      </strong>
    </div>

    <div class="deposit-detail">
      <span>Amount</span>
      <strong>
        ${escapeHtml(
          number(amount, 2)
        )} USDT
      </strong>
    </div>

    <div class="deposit-detail">
      <span>Network</span>
      <strong>
        ${escapeHtml(network)}
      </strong>
    </div>

    <div class="deposit-address-row">
      <div>
        <span>Deposit Address</span>
        <strong class="deposit-address">
          ${escapeHtml(address)}
        </strong>
      </div>

      <button
        type="button"
        data-copy="${escapeHtml(address)}"
      >
        Copy
      </button>
    </div>

    <div class="deposit-detail">
      <span>Deposit ID</span>
      <strong>
        ${escapeHtml(id)}
      </strong>
    </div>
  `;

  setupCopyButtons();
}

async function checkDepositStatus() {
  if (!activeDepositId) {
    return null;
  }

  try {
    const result =
      await apiRequest(
        `/deposit/status/${encodeURIComponent(
          activeDepositId
        )}`
      );

    const deposit =
      result.deposit ||
      result.data ||
      result;

    updateDepositStatus(
      deposit
    );

    return deposit;
  } catch (error) {
    console.warn(
      "Deposit status check failed:",
      error
    );

    return null;
  }
}

function updateDepositStatus(
  deposit
) {
  if (!deposit) {
    return;
  }

  const status =
    String(
      deposit.status ||
      ""
    ).toLowerCase();

  const statusElement =
    $("depositStatus");

  if (statusElement) {
    statusElement.textContent =
      status
        ? status.toUpperCase()
        : "PENDING";
  }

  if (
    status === "confirmed" ||
    status === "completed" ||
    status === "credited" ||
    status === "success"
  ) {
    showToast(
      "Crypto deposit confirmed.",
      "success"
    );

    activeDepositId = null;

    localStorage.removeItem(
      "tradelyActiveDepositId"
    );

    if (depositPollTimer) {
      clearInterval(
        depositPollTimer
      );

      depositPollTimer = null;
    }

    loadAccount()
      .catch(error => {
        console.warn(
          "Account refresh after deposit failed:",
          error
        );
      });

    return;
  }

  if (status === "failed") {
    showToast(
      "Crypto deposit verification failed.",
      "error"
    );
  }
}

function startDepositPolling() {
  if (depositPollTimer) {
    clearInterval(
      depositPollTimer
    );
  }

  checkDepositStatus();

  depositPollTimer =
    setInterval(
      checkDepositStatus,
      15000
    );
}

async function loadDeposits() {
  try {
    const result =
      await apiRequest(
        "/deposits"
      );

    const deposits =
      Array.isArray(result)
        ? result
        : (
          result.deposits ||
          result.data ||
          []
        );

    if (
      !activeDepositId &&
      deposits.length
    ) {
      const pending =
        deposits.find(
          deposit => {
            const status =
              String(
                deposit.status ||
                ""
              ).toLowerCase();

            return [
              "pending",
              "waiting",
              "confirming",
              "processing"
            ].includes(status);
          }
        );

      if (pending) {
        activeDepositId =
          pending.id ||
          pending.depositId ||
          null;

        if (activeDepositId) {
          localStorage.setItem(
            "tradelyActiveDepositId",
            activeDepositId
          );

          renderDepositDetails(
            pending
          );

          startDepositPolling();
        }
      }
    }

    return deposits;
  } catch (error) {
    console.warn(
      "Deposit list unavailable:",
      error
    );

    return [];
  }
}

function setWalletMessage(
  message,
  type = ""
) {
  const element =
    $("walletMessage");

  if (!element) {
    if (message) {
      showToast(
        message,
        type || "info"
      );
    }

    return;
  }

  element.textContent =
    message;

  element.classList.remove(
    "error",
    "success"
  );

  if (type) {
    element.classList.add(
      type
    );
  }
}


/* =========================================================
   COPY BUTTONS
   ========================================================= */

function setupCopyButtons() {
  qsa(
    "[data-copy]"
  ).forEach(button => {
    if (
      button.dataset.copyBound ===
      "true"
    ) {
      return;
    }

    button.dataset.copyBound =
      "true";

    button.addEventListener(
      "click",
      async () => {
        const value =
          button.dataset.copy ||
          "";

        if (!value) {
          return;
        }

        try {
          await navigator.clipboard.writeText(
            value
          );

          const original =
            button.textContent;

          button.textContent =
            "Copied";

          setTimeout(() => {
            button.textContent =
              original;
          }, 1200);
        } catch {
          showToast(
            "Unable to copy address.",
            "error"
          );
        }
      }
    );
  });
}


/* =========================================================
   REWARDS
   ========================================================= */

const FALLBACK_REWARDS = [
  {
    id: "starter-boost",
    name: "Starter Boost",
    price: 5,
    value: 7
  },
  {
    id: "trader-boost",
    name: "Trader Boost",
    price: 10,
    value: 15
  },
  {
    id: "pro-boost",
    name: "Pro Boost",
    price: 25,
    value: 40
  },
  {
    id: "elite-boost",
    name: "Elite Boost",
    price: 50,
    value: 85
  }
];

async function loadRewards() {
  const list =
    $("rewardsList");

  if (!list) {
    return;
  }

  list.innerHTML =
    `<div class="loading">Loading rewards...</div>`;

  try {
    const result =
      await apiRequest(
        "/rewards"
      );

    const rewards =
      Array.isArray(result)
        ? result
        : (
          result.rewards ||
          result.data ||
          FALLBACK_REWARDS
        );

    renderRewards(
      rewards.length
        ? rewards
        : FALLBACK_REWARDS
    );
  } catch (error) {
    console.warn(
      "Rewards endpoint unavailable, using local reward definitions:",
      error
    );

    renderRewards(
      FALLBACK_REWARDS
    );
  }
}

function renderRewards(
  rewards
) {
  const list =
    $("rewardsList");

  if (!list) {
    return;
  }

  list.innerHTML =
    rewards
      .map(reward => {
        const id =
          reward.id ||
          reward.rewardId ||
          "";

        const name =
          reward.name ||
          reward.title ||
          "Reward";

        const price =
          Number(
            reward.price ??
            reward.cost ??
            0
          );

        const value =
          Number(
            reward.value ??
            reward.amount ??
            reward.credit ??
            0
          );

        return `
          <article class="reward-card">

            <div>
              <h3>
                ${escapeHtml(name)}
              </h3>

              <p>
                Pay ${money(price)}
                and receive ${money(value)}
                in virtual balance.
              </p>
            </div>

            <button
              type="button"
              class="reward-button"
              data-buy-reward="${escapeHtml(
                id
              )}"
              data-reward-price="${price}"
            >
              Buy · ${money(price)}
            </button>

          </article>
        `;
      })
      .join("");

  setupRewardButtons();
}

function setupRewardButtons() {
  qsa(
    "[data-buy-reward]"
  ).forEach(button => {
    if (
      button.dataset.rewardBound ===
      "true"
    ) {
      return;
    }

    button.dataset.rewardBound =
      "true";

    button.addEventListener(
      "click",
      () => {
        buyReward(
          button.dataset.buyReward
        );
      }
    );
  });
}

async function buyReward(
  rewardId
) {
  if (!rewardId) {
    return;
  }

  const button =
    qs(
      `[data-buy-reward="${CSS.escape(
        rewardId
      )}"]`
    );

  const originalText =
    button
      ? button.textContent
      : "";

  try {
    if (button) {
      button.disabled = true;
      button.textContent =
        "Processing...";
    }

    const result =
      await apiRequest(
        "/rewards/buy",
        {
          method: "POST",
          body: JSON.stringify({
            rewardId
          })
        }
      );

    if (
      result.balance !==
      undefined
    ) {
      currentUser = {
        ...(currentUser || {}),
        balance:
          Number(result.balance)
      };
    } else {
      await loadAccount();
    }

    updateBalanceDisplays();

    updateHomePositionSummary();

    setBonusMessage(
      result.message ||
      "Reward purchased successfully.",
      "success"
    );

    showToast(
      result.message ||
      "Reward purchased successfully.",
      "success"
    );
  } catch (error) {
    console.error(
      "Reward purchase error:",
      error
    );

    setBonusMessage(
      error.message ||
      "Unable to purchase reward.",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        originalText ||
        "Buy";
    }
  }
}

function setBonusMessage(
  message,
  type = ""
) {
  const element =
    $("bonusMessage");

  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.classList.remove(
    "error",
    "success"
  );

  if (type) {
    element.classList.add(
      type
    );
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function showPage(page) {
  const requestedPage =
    String(page || "home");

  let pageElement =
    $(`${requestedPage}Page`);

  if (!pageElement) {
    pageElement =
      $(`page-${requestedPage}`);
  }

  const pageAliases = {
    home: [
      "home"
    ],
    markets: [
      "markets",
      "trade"
    ],
    portfolio: [
      "portfolio"
    ],
    wallet: [
      "wallet"
    ],
    bonuses: [
      "bonuses",
      "rewards"
    ]
  };

  let targetId =
    requestedPage;

  if (
    pageAliases[requestedPage]
  ) {
    const found =
      pageAliases[
        requestedPage
      ].find(id => {
        return $(
          `${id}Page`
        ) ||
          $(
            `#${id}`
          );
      });

    if (found) {
      targetId = found;
    }
  }

  const pages =
    qsa(".page");

  let foundPage = null;

  pages.forEach(pageNode => {
    const id =
      pageNode.id || "";

    const normalized =
      id
        .replace(/Page$/i, "")
        .replace(/^page-/i, "");

    const aliases =
      pageAliases[
        requestedPage
      ] || [];

    const shouldShow =
      normalized ===
        requestedPage ||
      aliases.includes(
        normalized
      ) ||
      id === targetId;

    pageNode.classList.toggle(
      "active",
      shouldShow
    );

    pageNode.style.display =
      shouldShow
        ? "block"
        : "none";

    if (shouldShow) {
      foundPage =
        pageNode;
    }
  });

  currentPage =
    requestedPage;

  updateNavigationState(
    requestedPage
  );

  updatePageTitle(
    requestedPage
  );

  if (
    requestedPage ===
      "markets" ||
    requestedPage ===
      "trade"
  ) {
    loadMarkets();
  }

  if (
    requestedPage ===
    "portfolio"
  ) {
    loadPositions();
  }

  if (
    requestedPage ===
    "wallet"
  ) {
    loadAccount();
    loadDeposits();
  }

  if (
    requestedPage ===
    "bonuses"
  ) {
    loadRewards();
  }

  return foundPage;
}

function updateNavigationState(
  page
) {
  qsa(
    "[data-page]"
  ).forEach(button => {
    const target =
      button.dataset.page;

    const isActive =
      target === page ||
      (
        page === "markets" &&
        target === "trade"
      ) ||
      (
        page === "trade" &&
        target === "markets"
      ) ||
      (
        page === "bonuses" &&
        target === "rewards"
      );

    button.classList.toggle(
      "active",
      isActive
    );
  });

  qsa(
    ".sidebar-nav button, .mobile-nav button, .bottom-nav button"
  ).forEach(button => {
    const onclick =
      button.getAttribute(
        "onclick"
      ) || "";

    const match =
      onclick.match(
        /showPage\(['"]([^'"]+)['"]\)/
      );

    if (!match) {
      return;
    }

    const target =
      match[1];

    const isActive =
      target === page ||
      (
        page === "markets" &&
        target === "trade"
      ) ||
      (
        page === "trade" &&
        target === "markets"
      ) ||
      (
        page === "bonuses" &&
        target === "rewards"
      );

    button.classList.toggle(
      "active",
      isActive
    );
  });
}

function updatePageTitle(
  page
) {
  const titles = {
    home: "Home",
    markets: "Markets",
    trade: "Markets",
    portfolio: "Portfolio",
    wallet: "Wallet",
    bonuses: "Rewards",
    rewards: "Rewards"
  };

  const title =
    titles[page] ||
    "Tradely";

  const pageTitle =
    $("pageTitle");

  if (pageTitle) {
    pageTitle.textContent =
      title;
  }
}


/* =========================================================
   NAVIGATION EVENT SETUP
   ========================================================= */

function setupNavigation() {
  qsa(
    "[data-page]"
  ).forEach(button => {
    if (
      button.dataset.navBound ===
      "true"
    ) {
      return;
    }

    button.dataset.navBound =
      "true";

    button.addEventListener(
      "click",
      event => {
        event.preventDefault();

        showPage(
          button.dataset.page
        );
      }
    );
  });

  qsa(
    ".sidebar-nav button, .mobile-nav button, .bottom-nav button"
  ).forEach(button => {
    if (
      button.dataset.navBound ===
      "true"
    ) {
      return;
    }

    const onclick =
      button.getAttribute(
        "onclick"
      ) || "";

    const match =
      onclick.match(
        /showPage\(['"]([^'"]+)['"]\)/
      );

    if (!match) {
      return;
    }

    button.dataset.navBound =
      "true";

    button.addEventListener(
      "click",
      event => {
        event.preventDefault();

        showPage(
          match[1]
        );
      }
    );

    button.removeAttribute(
      "onclick"
    );
  });
}


/* =========================================================
   HOME BUTTONS
   ========================================================= */

function setupHomeButtons() {
  qsa(
    "[data-go-page]"
  ).forEach(button => {
    if (
      button.dataset.goPageBound ===
      "true"
    ) {
      return;
    }

    button.dataset.goPageBound =
      "true";

    button.addEventListener(
      "click",
      () => {
        showPage(
          button.dataset.goPage
        );
      }
    );
  });
}


/* =========================================================
   MODAL EVENTS
   ========================================================= */

function setupModalEvents() {
  const modal =
    getTradeModal();

  if (!modal) {
    return;
  }

  if (
    modal.dataset.eventsBound !==
    "true"
  ) {
    modal.dataset.eventsBound =
      "true";

    modal.addEventListener(
      "cancel",
      event => {
        event.preventDefault();
        closeTradeModal();
      }
    );

    modal.addEventListener(
      "close",
      () => {
        document.body.style.overflow =
          "";
      }
    );

    modal.addEventListener(
      "click",
      event => {
        if (
          event.target ===
          modal
        ) {
          closeTradeModal();
        }
      }
    );
  }

  qsa(
    "[data-duration]",
    modal
  ).forEach(button => {
    if (
      button.dataset.durationBound ===
      "true"
    ) {
      return;
    }

    button.dataset.durationBound =
      "true";

    button.addEventListener(
      "click",
      () => {
        selectDuration(
          button.dataset.duration
        );
      }
    );
  });

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key ===
        "Escape"
      ) {
        if (
          modal.open ||
          modal.classList.contains(
            "active"
          )
        ) {
          closeTradeModal();
        }
      }
    }
  );
}


/* =========================================================
   POSITION BUTTON EVENTS
   ========================================================= */

function setupPositionButtons() {
  document.addEventListener(
    "click",
    event => {
      const sellButton =
        event.target.closest(
          "[data-sell-position]"
        );

      if (!sellButton) {
        return;
      }

      const positionId =
        sellButton.dataset
          .sellPosition;

      sellPosition(
        positionId
      );
    }
  );
}


/* =========================================================
   FORM EVENT SETUP
   ========================================================= */

function setupForms() {
  const loginForm =
    $("loginForm");

  if (
    loginForm &&
    loginForm.dataset.bound !==
      "true"
  ) {
    loginForm.dataset.bound =
      "true";

    loginForm.addEventListener(
      "submit",
      loginUser
    );
  }

  const registerForm =
    $("registerForm");

  if (
    registerForm &&
    registerForm.dataset.bound !==
      "true"
  ) {
    registerForm.dataset.bound =
      "true";

    registerForm.addEventListener(
      "submit",
      registerUser
    );
  }

  const depositForm =
    $("depositForm");

  if (
    depositForm &&
    depositForm.dataset.bound !==
      "true"
  ) {
    depositForm.dataset.bound =
      "true";

    depositForm.addEventListener(
      "submit",
      createDeposit
    );
  }

  const logoutButtons =
    qsa(
      "[data-logout]"
    );

  logoutButtons.forEach(button => {
    if (
      button.dataset.logoutBound ===
      "true"
    ) {
      return;
    }

    button.dataset.logoutBound =
      "true";

    button.addEventListener(
      "click",
      event => {
        event.preventDefault();
        logoutUser();
      }
    );
  });
}


/* =========================================================
   INLINE HTML COMPATIBILITY
   ========================================================= */

function exposeGlobalFunctions() {
  window.showLogin =
    showLogin;

  window.showRegister =
    showRegister;

  window.loginUser =
    loginUser;

  window.registerUser =
    registerUser;

  window.logoutUser =
    logoutUser;

  window.showPage =
    showPage;

  window.openMarketModal =
    openMarketModal;

  window.closeTradeModal =
    closeTradeModal;

  window.selectDuration =
    selectDuration;

  window.confirmOpenPosition =
    confirmOpenPosition;

  window.createDeposit =
    createDeposit;

  window.checkDepositStatus =
    checkDepositStatus;

  window.buyReward =
    buyReward;

  window.sellPosition =
    sellPosition;
}


/* =========================================================
   TOP BAR BALANCE SYNC
   ========================================================= */

function setupBalanceSync() {
  if (
    window.tradelyBalanceInterval
  ) {
    clearInterval(
      window.tradelyBalanceInterval
    );
  }

  window.tradelyBalanceInterval =
    setInterval(() => {
      updateBalanceDisplays();
    }, 1000);
}


/* =========================================================
   MARKET REFRESH
   ========================================================= */

function setupMarketRefresh() {
  if (marketRefreshTimer) {
    clearInterval(
      marketRefreshTimer
    );
  }

  /*
    Refresh market snapshots periodically.
    This keeps the cards looking like live
    market cards without creating real trades.
  */
  marketRefreshTimer =
    setInterval(() => {
      if (!token) {
        return;
      }

      loadMarkets()
        .catch(error => {
          console.warn(
            "Market refresh failed:",
            error
          );
        });
    }, 60000);
}


/* =========================================================
   POSITION COUNTDOWN REFRESH
   ========================================================= */

function setupPositionCountdown() {
  if (
    window.tradelyPositionInterval
  ) {
    clearInterval(
      window.tradelyPositionInterval
    );
  }

  window.tradelyPositionInterval =
    setInterval(() => {
      if (
        currentPage ===
        "portfolio"
      ) {
        renderPositions();
      }
    }, 1000);
}


/* =========================================================
   INITIALIZE AUTHENTICATED APP
   ========================================================= */

async function initializeAuthenticatedApp() {
  if (!token) {
    showAuth();
    return;
  }

  try {
    await loadAccount();

    showApp();

    await Promise.all([
      loadMarkets(),
      loadPositions()
    ]);

    await loadDeposits();

    showPage(
      currentPage || "home"
    );

    updateBalanceDisplays();

    updateUserNameDisplays();
  } catch (error) {
    console.error(
      "App initialization error:",
      error
    );

    /*
      A bad/stale token should not leave
      the user staring at a broken app.
    */
    token = null;
    currentUser = null;

    localStorage.removeItem(
      "tradelyToken"
    );

    showAuth();

    setAuthMessage(
      error.message ||
      "Please log in again."
    );
  }
}


/* =========================================================
   DOM INITIALIZATION
   ========================================================= */

async function init() {
  if (appInitialized) {
    return;
  }

  appInitialized = true;

  exposeGlobalFunctions();

  setupForms();

  setupNavigation();

  setupHomeButtons();

  setupModalEvents();

  setupPositionButtons();

  setupPhoneInputs();

  setupBalanceSync();

  setupPositionCountdown();

  setupCopyButtons();

  setupMarketRefresh();

  /*
    Allow inline HTML duration buttons
    to work even if app.js loads before
    the intl phone script finishes.
  */
  setTimeout(() => {
    setupPhoneInputs();
  }, 500);

  /*
    If there is no token, show auth.
  */
  if (!token) {
    showAuth();
    return;
  }

  /*
    If there is a token, validate it by
    loading the account.
  */
  await initializeAuthenticatedApp();
}


/* =========================================================
   START
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
} else {
  init();
}