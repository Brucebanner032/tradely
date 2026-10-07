// =====================================================
// TRADELY APP
// Markets, positions, account, wallet and rewards
// =====================================================

const API = "/api";

let token = localStorage.getItem("tradelyToken") || null;

let currentUser = null;
let currentPage = "home";

let positions = [];
let markets = [];

let selectedMarket = null;
let selectedDuration = "48H";

let activeDepositId =
  localStorage.getItem("tradelyActiveDepositId") || null;

let depositPollTimer = null;

let loginPhoneInput = null;
let registerPhoneInput = null;


// =====================================================
// DOM HELPERS
// =====================================================

function $(id) {
  return document.getElementById(id);
}

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "$0.00";
  }

  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setMessage(element, message, type = "") {
  if (!element) return;

  element.textContent = message || "";
  element.className = "form-message";

  if (type) {
    element.classList.add(type);
  }
}


// =====================================================
// API
// =====================================================

async function apiRequest(path, options = {}) {

  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (response.status === 401) {

    token = null;

    localStorage.removeItem("tradelyToken");
    localStorage.removeItem("tradelyActiveDepositId");

    currentUser = null;

    showAuth();

    throw new Error(
      data.message || "Your session has expired. Please sign in again."
    );
  }

  if (!response.ok) {

    throw new Error(
      data.message ||
      data.error ||
      "Something went wrong. Please try again."
    );
  }

  return data;
}


// =====================================================
// AUTH SCREEN
// =====================================================

function showAuth() {

  const authScreen = $("authScreen");
  const app = document.querySelector(".app");

  if (authScreen) {
    authScreen.style.display = "flex";
  }

  if (app) {
    app.style.display = "none";
  }

  stopDepositPolling();
}

function showApp() {

  const authScreen = $("authScreen");
  const app = document.querySelector(".app");

  if (authScreen) {
    authScreen.style.display = "none";
  }

  if (app) {
    app.style.display = "block";
  }
}


// =====================================================
// PHONE INPUT
// =====================================================

function initializePhoneInputs() {

  if (
    typeof window.intlTelInput !== "function"
  ) {
    return;
  }

  const utilsScript =
    "https://cdn.jsdelivr.net/npm/intl-tel-input@26.8.1/dist/js/utils.js";


  if ($("loginPhone")) {

    loginPhoneInput = window.intlTelInput(
      $("loginPhone"),
      {
        initialCountry: "gh",
        separateDialCode: true,
        nationalMode: true,
        utilsScript
      }
    );

  }


  if ($("registerPhone")) {

    registerPhoneInput = window.intlTelInput(
      $("registerPhone"),
      {
        initialCountry: "gh",
        separateDialCode: true,
        nationalMode: true,
        utilsScript
      }
    );

  }

}


function getPhoneNumber(instance, input) {

  if (instance) {

    try {

      const number = instance.getNumber();

      if (number) {
        return number;
      }

    } catch {
      // Fall through.
    }

  }

  return input?.value?.trim() || "";
}


// =====================================================
// AUTH TOGGLES
// =====================================================

function showLoginPanel() {

  $("loginPanel")?.classList.remove("hidden");
  $("registerPanel")?.classList.add("hidden");

  setMessage($("loginMessage"), "");
  setMessage($("registerMessage"), "");

}


function showRegisterPanel() {

  $("loginPanel")?.classList.add("hidden");
  $("registerPanel")?.classList.remove("hidden");

  setMessage($("loginMessage"), "");
  setMessage($("registerMessage"), "");

}


// =====================================================
// LOGIN
// =====================================================

async function handleLogin(event) {

  event.preventDefault();

  const message = $("loginMessage");

  setMessage(message, "Signing in...");

  const phone = getPhoneNumber(
    loginPhoneInput,
    $("loginPhone")
  );

  const password =
    $("loginPassword")?.value?.trim() || "";

  if (!phone || !password) {

    setMessage(
      message,
      "Enter your phone number and password.",
      "error"
    );

    return;
  }

  try {

    const result = await apiRequest(
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
      result.jwt ||
      null;

    if (!token) {
      throw new Error("Login succeeded but no session was returned.");
    }

    localStorage.setItem(
      "tradelyToken",
      token
    );

    $("loginPassword").value = "";

    await initializeApp();

  } catch (error) {

    setMessage(
      message,
      error.message,
      "error"
    );

  }

}


// =====================================================
// REGISTER
// =====================================================

async function handleRegister(event) {

  event.preventDefault();

  const message = $("registerMessage");

  setMessage(message, "Creating your account...");

  const name =
    $("registerName")?.value?.trim() || "";

  const phone = getPhoneNumber(
    registerPhoneInput,
    $("registerPhone")
  );

  const password =
    $("registerPassword")?.value?.trim() || "";

  if (!name || !phone || !password) {

    setMessage(
      message,
      "Complete all fields.",
      "error"
    );

    return;
  }

  if (password.length < 6) {

    setMessage(
      message,
      "Password must contain at least 6 characters.",
      "error"
    );

    return;
  }

  try {

    const result = await apiRequest(
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
      result.jwt ||
      null;

    if (!token) {
      throw new Error(
        "Account created but no session was returned."
      );
    }

    localStorage.setItem(
      "tradelyToken",
      token
    );

    $("registerPassword").value = "";

    await initializeApp();

  } catch (error) {

    setMessage(
      message,
      error.message,
      "error"
    );

  }

}


// =====================================================
// LOGOUT
// =====================================================

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

  } catch {
    // The local session is still cleared below.
  }

  token = null;
  currentUser = null;
  positions = [];
  markets = [];

  localStorage.removeItem("tradelyToken");
  localStorage.removeItem("tradelyActiveDepositId");

  stopDepositPolling();
  stopMarketPriceRefresh();

  showAuth();
}


// =====================================================
// INITIALIZATION
// =====================================================

async function initializeApp() {

  showApp();

  try {

    await loadAccount();

    await Promise.all([
      loadMarkets(),
      loadPositions(),
      loadRewards(),
      loadDepositHistory()
    ]);

       renderEverything();

    showPage(
      currentPage || "home"
    );

    startMarketPriceRefresh();

    if (activeDepositId) {
      await checkActiveDeposit();
      startDepositPolling();
    }

  } catch (error) {

    console.error(
      "Tradely initialization error:",
      error
    );

    if (
      String(error.message || "")
        .toLowerCase()
        .includes("session")
    ) {
      showAuth();
    }

  }

}


// =====================================================
// ACCOUNT
// =====================================================

async function loadAccount() {

  const result = await apiRequest(
    "/account"
  );

  currentUser =
    result.user ||
    result.account ||
    result;

  if (!currentUser) {
    throw new Error("Account information could not be loaded.");
  }

}


function getBalance() {

  if (!currentUser) {
    return 0;
  }

  return Number(
    currentUser.balance ??
    currentUser.cash ??
    currentUser.availableBalance ??
    0
  ) || 0;

}


function updateBalanceDisplays() {

  const balance = getBalance();

  if ($("cash")) {
    $("cash").textContent = money(balance);
  }

  if ($("topbarCash")) {
    $("topbarCash").textContent = money(balance);
  }

  if ($("homeCash")) {
    $("homeCash").textContent = money(balance);
  }

  if ($("portfolioCash")) {
    $("portfolioCash").textContent = money(balance);
  }

  if ($("walletCash")) {
    $("walletCash").textContent = money(balance);
  }

  if ($("tradeBalanceValue")) {
    $("tradeBalanceValue").textContent = money(balance);
  }

  updateProfile();
}


function updateProfile() {

  const name =
    currentUser?.name ||
    currentUser?.fullName ||
    currentUser?.phone ||
    "";

  const firstName =
    name
      .trim()
      .split(/\s+/)[0] || "";

  const initial =
    firstName
      ? firstName.charAt(0).toUpperCase()
      : "T";

  if ($("profileInitial")) {
    $("profileInitial").textContent = initial;
  }

  if ($("homeUserName")) {

    $("homeUserName").textContent =
      firstName
        ? `, ${firstName}`
        : "";

  }

}


// =====================================================
// MARKETS
// =====================================================

async function loadMarkets() {

  const result = await apiRequest(
    "/markets"
  );

  if (Array.isArray(result)) {
    markets = result;
  } else {
    markets =
      result.markets ||
      result.data ||
      [];
  }

  if (!Array.isArray(markets)) {
    markets = [];
  }

}


function normalizeMarket(market) {

  return {
    id:
      market.id ??
      market.marketId ??
      "",

    name:
      market.name ??
      market.title ??
      "Market",

    symbol:
      market.symbol ??
      market.ticker ??
      "",

    category:
      market.category ??
      "Markets",

    exchange:
      market.exchange ??
      market.market ??
      "Market",

    currency:
      market.currency ??
      "USD",

    price:
      Number(
        market.price ??
        market.currentPrice ??
        market.referencePrice ??
        market.value ??
        0
      ) || 0
  };

}


function renderMarkets() {

  const preview = $("marketPreview");
  const list = $("marketList");

  const normalized =
    markets.map(normalizeMarket);


  if (preview) {

    const previewMarkets =
      normalized.slice(0, 6);

    preview.innerHTML =
      previewMarkets.length
        ? previewMarkets
            .map(marketCardHtml)
            .join("")
        : `
          <div class="market-empty">
            No markets are available right now.
          </div>
        `;

  }


  if (list) {

    list.innerHTML =
      normalized.length
        ? normalized
            .map(marketCardHtml)
            .join("")
        : `
          <div class="market-empty">
            No markets are available right now.
          </div>
        `;

  }

}


function marketCardHtml(market) {

  return `
    <article class="market-card">

      <div class="market-card-top">

        <div class="market-name-wrap">

          <h3 class="market-name">
            ${escapeHtml(market.name)}
          </h3>

          <span class="market-symbol">
            ${escapeHtml(market.symbol)}
          </span>

        </div>

        <span class="market-category">
          ${escapeHtml(market.category)}
        </span>

      </div>


      <div class="market-price">

        <span>Current Price</span>

        <strong>
          ${money(market.price)}
        </strong>

      </div>


      <div class="market-meta">

        <span class="market-exchange">
          ${escapeHtml(market.exchange)}
        </span>

        <button
          type="button"
          class="market-open-button"
          onclick="openTradeModal('${escapeHtml(market.id)}')"
        >
          Open Position
        </button>

      </div>

    </article>
  `;
}


// =====================================================
// TRADE MODAL
// =====================================================

function findMarket(marketId) {

  return markets.find(
    market =>
      String(
        market.id ??
        market.marketId
      ) === String(marketId)
  );

}


function openTradeModal(marketId) {

  const market = findMarket(marketId);

  if (!market) {
    return;
  }

  selectedMarket = normalizeMarket(market);

  selectedDuration = "48H";

  const modal = $("tradeModal");

  if (!modal) {
    return;
  }

  $("tradeModalMarket").textContent =
    `${selectedMarket.symbol || selectedMarket.name}`.toUpperCase();

  $("tradeModalTitle").textContent =
    `Open ${selectedMarket.name} Position`;

  $("tradeModalPrice").textContent =
    money(selectedMarket.price);

  $("tradeBalanceValue").textContent =
    money(getBalance());

  $("tradeAmount").value = "";

  $("tradeModalMessage").textContent = "";

  updateDurationButtons();

  updateExpiryInfo();

  if (typeof modal.showModal === "function") {
    modal.showModal();
  } else {
    modal.setAttribute("open", "");
  }

}


function closeTradeModal() {

  const modal = $("tradeModal");

  if (!modal) {
    return;
  }

  if (typeof modal.close === "function") {
    modal.close();
  } else {
    modal.removeAttribute("open");
  }

  selectedMarket = null;

  $("tradeModalMessage").textContent = "";

}


function selectDuration(duration) {

  if (
    !["48H", "2M", "3M"].includes(duration)
  ) {
    return;
  }

  selectedDuration = duration;

  updateDurationButtons();

  updateExpiryInfo();

}


function updateDurationButtons() {

  const buttons = {
    "48H": $("duration48H"),
    "2M": $("duration2M"),
    "3M": $("duration3M")
  };

  Object.entries(buttons).forEach(
    ([duration, button]) => {

      if (!button) {
        return;
      }

      button.classList.toggle(
        "active",
        duration === selectedDuration
      );

    }
  );

}


function getExpiryDate(duration) {

  const date = new Date();

  if (duration === "48H") {

    date.setTime(
      date.getTime() +
      (48 * 60 * 60 * 1000)
    );

  }

  if (duration === "2M") {
    date.setMonth(
      date.getMonth() + 2
    );
  }

  if (duration === "3M") {
    date.setMonth(
      date.getMonth() + 3
    );
  }

  return date;

}


function formatDate(date) {

  return date.toLocaleString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }
  );

}


function updateExpiryInfo() {

  const element =
    $("tradeExpiryInfo");

  if (!element) {
    return;
  }

  const expiry =
    getExpiryDate(selectedDuration);

  if (selectedDuration === "48H") {

    element.textContent =
      `Your position will mature after 48 hours, on ${formatDate(expiry)}.`;

    return;
  }

  if (selectedDuration === "2M") {

    element.textContent =
      `Your position will mature after 2 months, on ${formatDate(expiry)}.`;

    return;
  }

  element.textContent =
    `Your position will mature after 3 months, on ${formatDate(expiry)}.`;

}


async function confirmOpenPosition() {

  if (!selectedMarket) {
    return;
  }

  const amount =
    Number(
      $("tradeAmount")?.value
    );

  const message =
    $("tradeModalMessage");

  const button =
    $("confirmTradeButton");


  if (!Number.isFinite(amount) || amount < 1) {

    message.textContent =
      "Enter an amount of at least $1.";

    message.style.color =
      "var(--red)";

    return;
  }


  if (amount > getBalance()) {

    message.textContent =
      "Insufficient balance.";

    message.style.color =
      "var(--red)";

    return;
  }


  button.disabled = true;

  button.textContent =
    "Opening Position...";

  message.textContent = "";

  try {

    const result =
      await apiRequest(
        "/positions/open",
        {
          method: "POST",
          body: JSON.stringify({
            marketId: selectedMarket.id,
            marketType:
              selectedMarket.category ||
              "Markets",
            durationMonths:
              selectedDuration === "2M"
                ? 2
                : selectedDuration === "3M"
                  ? 3
                  : null,
            duration:
              selectedDuration,
            amount
          })
        }
      );


    if (result.user) {
      currentUser = result.user;
    } else if (result.account) {
      currentUser = result.account;
    } else if (
      result.balance !== undefined
    ) {

      currentUser = {
        ...currentUser,
        balance: result.balance
      };

    }


    await Promise.all([
      loadAccount(),
      loadPositions()
    ]);

    renderEverything();

    message.textContent =
      "Position opened successfully.";

    message.style.color =
      "var(--green)";


    setTimeout(() => {

      closeTradeModal();

      showPage("portfolio");

    }, 700);


  } catch (error) {

    message.textContent =
      error.message;

    message.style.color =
      "var(--red)";

  } finally {

    button.disabled = false;

    button.textContent =
      "Open Position";

  }

}


// =====================================================
// POSITIONS
// =====================================================

async function loadPositions() {

  const result =
    await apiRequest(
      "/positions"
    );

  if (Array.isArray(result)) {

    positions = result;

  } else {

    positions =
      result.positions ||
      result.data ||
      [];

  }

  if (!Array.isArray(positions)) {
    positions = [];
  }

}


function getPositionMarket(position) {

  const marketId =
    position.marketId ??
    position.market?.id;

  const found =
    markets.find(
      market =>
        String(
          market.id ??
          market.marketId
        ) === String(marketId)
    );

  return found
    ? normalizeMarket(found)
    : {
        id: marketId || "",
        name:
          position.marketName ||
          position.market?.name ||
          "Market",
        symbol:
          position.symbol ||
          position.market?.symbol ||
          "",
        price:
          Number(
            position.currentPrice ??
            position.market?.price ??
            0
          ) || 0
      };

}


function getPositionStatus(position) {

  return String(
    position.status ||
    "active"
  ).toLowerCase();

}


function getPositionAmount(position) {

  return Number(
    position.amount ??
    position.investedAmount ??
    position.value ??
    position.principal ??
    0
  ) || 0;

}


function getPositionCurrentValue(position) {

  const valuation =
    position.valuation ||
    {};

  return Number(
    valuation.currentValue ??
    position.currentValue ??
    position.value ??
    getPositionAmount(position)
  ) || 0;

}


function getPositionExpiry(position) {

  return (
    position.expiresAt ||
    position.expiry ||
    position.maturityDate ||
    position.maturesAt ||
    null
  );

}


function renderPortfolio() {

  const list =
    $("portfolioList");

  if (!list) {
    return;
  }

  const active =
    positions.filter(
      position =>
        getPositionStatus(position) ===
        "active"
    );


  const total =
    active.reduce(
      (sum, position) =>
        sum +
        getPositionCurrentValue(position),
      0
    );


  if ($("portfolioTotal")) {
    $("portfolioTotal").textContent =
      money(total);
  }

  if ($("homePortfolio")) {
    $("homePortfolio").textContent =
      money(total);
  }

  if ($("homePositions")) {
    $("homePositions").textContent =
      String(active.length);
  }


  if (!active.length) {

    list.innerHTML = `
      <div class="portfolio-empty">

        <div class="portfolio-empty-icon">
          ◈
        </div>

        <h3>No positions yet</h3>

        <p>
          Open a position from the Markets page to see it here.
        </p>

      </div>
    `;

    return;
  }


  list.innerHTML =
    active
      .map(positionCardHtml)
      .join("");

}


function positionCardHtml(position) {

  const market =
    getPositionMarket(position);

  const amount =
    getPositionAmount(position);

  const currentValue =
    getPositionCurrentValue(position);

  const expiry =
    getPositionExpiry(position);

  const duration =
    position.duration ||
    (
      position.durationMonths === 2
        ? "2 Months"
        : position.durationMonths === 3
          ? "3 Months"
          : "48 Hours"
    );


  const positionId =
    position.id ??
    position.positionId ??
    "";


  return `
    <article class="position-card">

      <div class="position-top">

        <div>

          <h3 class="position-name">
            ${escapeHtml(market.name)}
          </h3>

          <span class="position-symbol">
            ${escapeHtml(market.symbol)}
          </span>

        </div>

        <span class="position-status">
          Active
        </span>

      </div>


      <div class="position-details">

        <div class="position-detail">

          <span>Amount</span>

          <strong>
            ${money(amount)}
          </strong>

        </div>


        <div class="position-detail">

          <span>Current Value</span>

          <strong>
            ${money(currentValue)}
          </strong>

        </div>


        <div class="position-detail">

          <span>Duration</span>

          <strong>
            ${escapeHtml(duration)}
          </strong>

        </div>


        <div class="position-detail">

          <span>Maturity</span>

          <strong>
            ${
              expiry
                ? escapeHtml(
                    formatDate(
                      new Date(expiry)
                    )
                  )
                : "—"
            }
          </strong>

        </div>

      </div>


      <div class="position-actions">

        <button
          type="button"
          class="sell-button"
          onclick="sellPosition('${escapeHtml(positionId)}')"
        >
          Sell Position
        </button>

      </div>

    </article>
  `;

}


async function sellPosition(positionId) {

  if (!positionId) {
    return;
  }

  const confirmed =
    window.confirm(
      "Sell this position now?"
    );

  if (!confirmed) {
    return;
  }

  try {

    const result =
      await apiRequest(
        `/positions/${encodeURIComponent(positionId)}/sell`,
        {
          method: "POST"
        }
      );


    if (result.user) {
      currentUser = result.user;
    } else if (result.account) {
      currentUser = result.account;
    } else if (
      result.balance !== undefined
    ) {

      currentUser = {
        ...currentUser,
        balance: result.balance
      };

    }


    await Promise.all([
      loadAccount(),
      loadPositions()
    ]);

    renderEverything();

  } catch (error) {

    window.alert(
      error.message
    );

  }

}


// =====================================================
// REWARDS
// =====================================================

let rewards = [];


async function loadRewards() {

  const result =
    await apiRequest(
      "/rewards"
    );

  if (Array.isArray(result)) {

    rewards = result;

  } else {

    rewards =
      result.rewards ||
      result.data ||
      [];

  }

  if (!Array.isArray(rewards)) {
    rewards = [];
  }

}


function renderRewards() {

  const list =
    $("rewardsList");

  if (!list) {
    return;
  }


  if (!rewards.length) {

    list.innerHTML = `
      <div class="market-empty">
        No rewards are available right now.
      </div>
    `;

    return;
  }


  list.innerHTML =
    rewards
      .map(reward => {

        const id =
          reward.id ??
          reward.rewardId ??
          "";

        const name =
          reward.name ??
          reward.title ??
          "Reward";

        const price =
          Number(
            reward.price ??
            reward.cost ??
            0
          ) || 0;

        const value =
          Number(
            reward.value ??
            reward.amount ??
            reward.rewardValue ??
            0
          ) || 0;


        return `
          <article class="reward-card">

            <div class="reward-icon">
              ✦
            </div>

            <h3>
              ${escapeHtml(name)}
            </h3>

            <p>
              Add ${money(value)} to your balance
              for ${money(price)}.
            </p>

            <div class="reward-price">

              <strong>
                ${money(price)}
              </strong>

              <span>
                purchase
              </span>

            </div>

            <button
              type="button"
              class="reward-buy-button"
              onclick="buyReward('${escapeHtml(id)}')"
            >
              Get Reward
            </button>

          </article>
        `;

      })
      .join("");

}


async function buyReward(rewardId) {

  if (!rewardId) {
    return;
  }

  const message =
    $("bonusMessage");

  setMessage(
    message,
    "Processing reward..."
  );


  try {

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


    if (result.user) {
      currentUser = result.user;
    } else if (result.account) {
      currentUser = result.account;
    } else if (
      result.balance !== undefined
    ) {

      currentUser = {
        ...currentUser,
        balance: result.balance
      };

    }


    await loadAccount();

    updateBalanceDisplays();

    setMessage(
      message,
      "Reward added successfully.",
      "success"
    );


  } catch (error) {

    setMessage(
      message,
      error.message,
      "error"
    );

  }

}


// =====================================================
// DEPOSITS
// =====================================================

async function createDeposit(event) {

  event.preventDefault();

  const message =
    $("walletMessage");

  const amount =
    Number(
      $("amount")?.value
    );

  const network =
    $("depositNetwork")?.value;


  if (!Number.isFinite(amount) || amount < 500) {

    setMessage(
      message,
      "Minimum deposit is 500 USDT.",
      "error"
    );

    return;
  }


  if (
    network !== "TRC20" &&
    network !== "BEP20"
  ) {

    setMessage(
      message,
      "Select a valid network.",
      "error"
    );

    return;
  }


  setMessage(
    message,
    "Creating deposit..."
  );


  try {

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


    if (!activeDepositId) {
      throw new Error(
        "The deposit could not be created."
      );
    }


    localStorage.setItem(
      "tradelyActiveDepositId",
      activeDepositId
    );


    renderDepositDetails(
      deposit,
      network,
      amount
    );


    setMessage(
      message,
      "Deposit created. Send USDT to the address shown below.",
      "success"
    );


    await loadDepositHistory();

    startDepositPolling();


  } catch (error) {

    setMessage(
      message,
      error.message,
      "error"
    );

  }

}


function renderDepositDetails(
  deposit,
  fallbackNetwork,
  fallbackAmount
) {

  const details =
    $("depositDetails");

  if (!details) {
    return;
  }

  details.classList.remove(
    "hidden"
  );


  const network =
    deposit.network ||
    deposit.chain ||
    fallbackNetwork ||
    "TRC20";


  const amount =
    Number(
      deposit.amount ??
      fallbackAmount ??
      0
    );


  const address =
    deposit.address ||
    deposit.depositAddress ||
    deposit.walletAddress ||
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


  $("depositNetworkDisplay").textContent =
    network;

  $("depositAmountDisplay").textContent =
    money(amount);

  $("depositAddress").textContent =
    address;

  $("depositId").textContent =
    id;


  updateDepositStatus(
    status
  );

}


function updateDepositStatus(status) {

  const element =
    $("depositStatus");

  if (!element) {
    return;
  }

  const normalized =
    String(status || "pending")
      .toLowerCase();


  let label = "Pending";
  let className = "pending";


  if (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "confirmed" ||
    normalized === "success" ||
    normalized === "paid"
  ) {

    label = "Completed";
    className = "completed";

  } else if (
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "expired"
  ) {

    label = "Failed";
    className = "failed";

  }


  element.textContent =
    label;

  element.className =
    `status-badge ${className}`;

}


async function checkActiveDeposit() {

  if (!activeDepositId) {
    return;
  }

  try {

    const result =
      await apiRequest(
        `/deposit/status/${encodeURIComponent(activeDepositId)}`
      );


    const deposit =
      result.deposit ||
      result.data ||
      result;


    renderDepositDetails(
      deposit,
      deposit.network ||
        deposit.chain ||
        $("depositNetwork")?.value ||
        "TRC20",
      deposit.amount ||
        0
    );


    const status =
      String(
        deposit.status ||
        ""
      ).toLowerCase();


    if (
      status === "completed" ||
      status === "complete" ||
      status === "confirmed" ||
      status === "success" ||
      status === "paid"
    ) {

      await loadAccount();

      updateBalanceDisplays();

      stopDepositPolling();

      localStorage.removeItem(
        "tradelyActiveDepositId"
      );

      activeDepositId = null;

      await loadDepositHistory();

    }

  } catch (error) {

    console.error(
      "Deposit status check failed:",
      error
    );

  }

}


function startDepositPolling() {

  stopDepositPolling();

  if (!activeDepositId) {
    return;
  }

  depositPollTimer =
    setInterval(
      checkActiveDeposit,
      10000
    );

}


function stopDepositPolling() {

  if (depositPollTimer) {

    clearInterval(
      depositPollTimer
    );

    depositPollTimer = null;

  }

}


async function loadDepositHistory() {

  const history =
    $("depositHistory");

  if (!history) {
    return;
  }


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


    if (!deposits.length) {

      history.innerHTML = `
        <div class="deposit-history-empty">
          No deposits yet.
        </div>
      `;

      return;
    }


    history.innerHTML =
      deposits
        .slice()
        .reverse()
        .map(deposit => {

          const amount =
            Number(
              deposit.amount || 0
            );

          const network =
            deposit.network ||
            deposit.chain ||
            "USDT";

          const status =
            String(
              deposit.status ||
              "pending"
            ).toLowerCase();


          let statusClass =
            "pending";

          let statusText =
            "Pending";


          if (
            status === "completed" ||
            status === "complete" ||
            status === "confirmed" ||
            status === "success" ||
            status === "paid"
          ) {

            statusClass =
              "completed";

            statusText =
              "Completed";

          } else if (
            status === "failed" ||
            status === "cancelled" ||
            status === "expired"
          ) {

            statusClass =
              "failed";

            statusText =
              "Failed";

          }


          return `
            <div class="deposit-history-item">

              <div class="deposit-history-top">

                <strong>
                  ${money(amount)}
                </strong>

                <span class="status-badge ${statusClass}">
                  ${statusText}
                </span>

              </div>

              <small>
                USDT · ${escapeHtml(network)}
              </small>

            </div>
          `;

        })
        .join("");


  } catch (error) {

    console.error(
      "Could not load deposit history:",
      error
    );

  }

}


async function copyDepositAddress() {

  const address =
    $("depositAddress")?.textContent?.trim();

  if (
    !address ||
    address === "—"
  ) {
    return;
  }


  try {

    await navigator.clipboard.writeText(
      address
    );

    const button =
      document.querySelector(
        ".copy-button"
      );

    if (!button) {
      return;
    }

    const original =
      button.textContent;

    button.textContent =
      "Copied";

    setTimeout(() => {
      button.textContent =
        original;
    }, 1500);

  } catch {

    window.prompt(
      "Copy this address:",
      address
    );

  }

}


// =====================================================
// PAGE NAVIGATION
// =====================================================

function showPage(page) {

  const validPages = [
    "home",
    "markets",
    "portfolio",
    "wallet",
    "bonuses"
  ];

  if (!validPages.includes(page)) {
    page = "home";
  }

  currentPage = page;


  document
    .querySelectorAll(".page")
    .forEach(element => {

      element.classList.toggle(
        "active-page",
        element.id === `page-${page}`
      );

    });


  document
    .querySelectorAll(
      ".nav-item, .mobile-nav-item"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    });


  const titles = {
    home: "Home",
    markets: "Markets",
    portfolio: "Portfolio",
    wallet: "Wallet",
    bonuses: "Rewards"
  };


  if ($("pageTitle")) {

    $("pageTitle").textContent =
      titles[page] || "Home";

  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


// =====================================================
// RENDER EVERYTHING
// =====================================================

function renderEverything() {

  updateBalanceDisplays();

  updateProfile();

  renderMarkets();

  renderPortfolio();

  renderRewards();

}


// =====================================================
// EVENT LISTENERS
// =====================================================

function setupEventListeners() {

  $("loginForm")?.addEventListener(
    "submit",
    handleLogin
  );

  $("registerForm")?.addEventListener(
    "submit",
    handleRegister
  );

  $("depositForm")?.addEventListener(
    "submit",
    createDeposit
  );


  $("showRegisterButton")?.addEventListener(
    "click",
    showRegisterPanel
  );

  $("showLoginButton")?.addEventListener(
    "click",
    showLoginPanel
  );


  document
    .querySelectorAll(
      ".nav-item, .mobile-nav-item"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          showPage(
            button.dataset.page
          );

        }
      );

    });


  $("mobileMenuButton")?.addEventListener(
    "click",
    () => {

      const sidebar =
        document.querySelector(
          ".sidebar"
        );

      if (!sidebar) {
        return;
      }

      sidebar.classList.toggle(
        "mobile-visible"
      );

    }
  );


  document
    .querySelector(
      ".sidebar"
    )
    ?.addEventListener(
      "click",
      event => {

        if (
          event.target.closest(
            ".nav-item"
          )
        ) {

          document
            .querySelector(
              ".sidebar"
            )
            ?.classList.remove(
              "mobile-visible"
            );

        }

      }
    );


  $("tradeModal")?.addEventListener(
    "click",
    event => {

      const modal =
        $("tradeModal");

      if (
        event.target === modal
      ) {
        closeTradeModal();
      }

    }
  );

}


// =====================================================
// START
// =====================================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    initializePhoneInputs();

    setupEventListeners();


    if (!token) {

      showAuth();

      return;

    }


    try {

      await initializeApp();

    } catch (error) {

      console.error(
        "Startup error:",
        error
      );

      showAuth();

    }

  }
);