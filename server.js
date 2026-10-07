require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = Number(process.env.PORT || 3000);

const APP_URL =
  process.env.APP_URL || ("http://localhost:" + PORT);

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    "ERROR: JWT_SECRET must exist in .env and contain at least 32 characters."
  );
  process.exit(1);
}

app.use(cors());
app.use(express.json());

/* =========================================================
   PATHS
   ========================================================= */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "tradely-data.json");
const DEPOSITS_FILE = path.join(DATA_DIR, "deposits.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const PUBLIC_INDEX = path.join(PUBLIC_DIR, "index.html");
const ROOT_INDEX = path.join(__dirname, "index.html");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* =========================================================
   DEFAULT DATA
   ========================================================= */

const DEFAULT_DATA = {
  users: [],
  positions: [],
  transactions: []
};

const DEFAULT_DEPOSITS = {
  deposits: []
};

/* =========================================================
   FILE HELPERS
   ========================================================= */

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        JSON.stringify(fallback, null, 2),
        "utf8"
      );

      return JSON.parse(JSON.stringify(fallback));
    }

    const raw = fs.readFileSync(file, "utf8");

    if (!raw.trim()) {
      fs.writeFileSync(
        file,
        JSON.stringify(fallback, null, 2),
        "utf8"
      );

      return JSON.parse(JSON.stringify(fallback));
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error("Could not read:", file);
    console.error(error);

    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJson(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

let database = readJson(DATA_FILE, DEFAULT_DATA);

let depositsDatabase = readJson(
  DEPOSITS_FILE,
  DEFAULT_DEPOSITS
);

if (!Array.isArray(database.users)) {
  database.users = [];
}

if (!Array.isArray(database.positions)) {
  database.positions = [];
}

if (!Array.isArray(database.transactions)) {
  database.transactions = [];
}

if (!Array.isArray(depositsDatabase.deposits)) {
  depositsDatabase.deposits = [];
}

function saveDatabase() {
  writeJson(DATA_FILE, database);
}

function saveDeposits() {
  writeJson(DEPOSITS_FILE, depositsDatabase);
}

/* =========================================================
   MARKET DEFINITIONS
   ========================================================= */

const MARKET_DEFINITIONS = [
  {
    id: "tesla",
    name: "Tesla",
    symbol: "TSLA",
    category: "Stocks",
    exchange: "NASDAQ",
    currency: "USD",
    referencePrice: 377,
    priceType: "live",
    isPublic: true
  },

  {
    id: "spacex",
    name: "SpaceX",
    symbol: "SPACEX",
    category: "Private Markets",
    exchange: "Private",
    currency: "USD",
    referencePrice: 1590,
    priceType: "reference",
    isPublic: false
  },

  {
    id: "starlink",
    name: "Starlink",
    symbol: "STARLINK",
    category: "Private Markets",
    exchange: "Private",
    currency: "USD",
    referencePrice: 1000,
    priceType: "reference",
    isPublic: false
  },

  {
    id: "xai",
    name: "xAI",
    symbol: "XAI",
    category: "Private Markets",
    exchange: "Private",
    currency: "USD",
    referencePrice: 754.6,
    priceType: "reference",
    isPublic: false
  },

  {
    id: "neuralink",
    name: "Neuralink",
    symbol: "NEURALINK",
    category: "Private Markets",
    exchange: "Private",
    currency: "USD",
    referencePrice: 500,
    priceType: "reference",
    isPublic: false
  },

  {
    id: "boring-company",
    name: "The Boring Company",
    symbol: "BORING",
    category: "Private Markets",
    exchange: "Private",
    currency: "USD",
    referencePrice: 250,
    priceType: "reference",
    isPublic: false
  },

  {
    id: "x",
    name: "X",
    symbol: "X",
    category: "Private Markets",
    exchange: "Private",
    currency: "USD",
    referencePrice: 200,
    priceType: "reference",
    isPublic: false
  }
];

/* =========================================================
   MARKET PRICING
   ========================================================= */

/*
   Dynamic Tradely market pricing.

   Prices are intentionally higher and continuously move so
   the market cards behave like live market prices.

   Tesla:
   - Uses a dynamic Tradely market price.
   - No Alpha Vantage dependency.
   - Starts around $500.

   Private Elon-related markets:
   - SpaceX
   - Starlink
   - xAI
   - Neuralink
   - The Boring Company
   - X

   Their prices move continuously because private companies
   do not have publicly traded exchange prices.
*/

const MARKET_PRICE_SETTINGS = {
  tesla: {
    base: 500,
    min: 440,
    max: 590,
    volatility: 0.0020
  },

  spacex: {
    base: 2200,
    min: 1900,
    max: 2550,
    volatility: 0.0022
  },

  starlink: {
    base: 1450,
    min: 1250,
    max: 1700,
    volatility: 0.0024
  },

  xai: {
    base: 1250,
    min: 1050,
    max: 1500,
    volatility: 0.0025
  },

  neuralink: {
    base: 900,
    min: 750,
    max: 1100,
    volatility: 0.0027
  },

  "boring-company": {
    base: 650,
    min: 520,
    max: 800,
    volatility: 0.0028
  },

  x: {
    base: 500,
    min: 400,
    max: 625,
    volatility: 0.0025
  }
};

/*
   Every market keeps its own current price.

   This means the price does not simply jump between two
   predetermined numbers. It gradually moves from its
   previous price, just like a continuously changing market.
*/
const marketPriceState = new Map();

function getMarketPriceSettings(market) {
  return (
    MARKET_PRICE_SETTINGS[market.id] || {
      base: Number(
        market.referencePrice || 100
      ),
      min:
        Number(
          market.referencePrice || 100
        ) * 0.85,
      max:
        Number(
          market.referencePrice || 100
        ) * 1.15,
      volatility: 0.002
    }
  );
}

function createMarketPriceState(market) {
  const settings =
    getMarketPriceSettings(market);

  const startingPrice =
    settings.base;

  const state = {
    price: startingPrice,
    lastUpdate: Date.now(),

    /*
       Positive trend = upward pressure.
       Negative trend = downward pressure.
    */
    trend:
      Math.random() >= 0.5
        ? 1
        : -1,

    /*
       Used to prevent the price from staying in one
       direction for too long.
    */
    trendStrength:
      0.00015
  };

  marketPriceState.set(
    market.id,
    state
  );

  return state;
}

function updateMarketPrice(market) {
  const settings =
    getMarketPriceSettings(market);

  let state =
    marketPriceState.get(
      market.id
    );

  if (!state) {
    state =
      createMarketPriceState(
        market
      );
  }

  const now = Date.now();

  /*
     Update approximately every 2.5 seconds.

     Multiple elapsed intervals are processed if the server
     has not received a market request for a while.
  */
  const interval = 2500;

  const elapsed =
    now - state.lastUpdate;

  if (elapsed >= interval) {
    const steps = Math.min(
      Math.floor(
        elapsed / interval
      ),
      20
    );

    for (
      let i = 0;
      i < steps;
      i++
    ) {
      /*
         Random market movement.
      */
      const randomMovement =
        (Math.random() - 0.5) *
        2 *
        settings.volatility;

      /*
         Small directional pressure.
      */
      const directionalMovement =
        state.trend *
        state.trendStrength;

      /*
         Combine normal movement and
         directional movement.
      */
      let movement =
        randomMovement +
        directionalMovement;

      /*
         Occasionally create a slightly stronger
         market move.
      */
      if (
        Math.random() < 0.06
      ) {
        movement +=
          (Math.random() - 0.5) *
          settings.volatility *
          2.5;
      }

      /*
         Apply movement to the previous price.
      */
      state.price =
        state.price *
        (1 + movement);

      /*
         Keep price inside the defined market range.
      */
      if (
        state.price <
        settings.min
      ) {
        state.price =
          settings.min;

        state.trend = 1;
      }

      if (
        state.price >
        settings.max
      ) {
        state.price =
          settings.max;

        state.trend = -1;
      }

      /*
         Randomly change the market direction.
      */
      if (
        Math.random() < 0.12
      ) {
        state.trend *= -1;
      }

      /*
         Slightly vary trend strength so movement
         does not look completely mechanical.
      */
      state.trendStrength =
        0.00010 +
        Math.random() *
          0.00020;
    }

    state.lastUpdate = now;
  }

  return Math.max(
    0.01,
    state.price
  );
}

async function getMarketPrice(market) {
  /*
     All Tradely markets use the same dynamic market
     engine so the displayed price continuously changes.
  */
  return updateMarketPrice(
    market
  );
}

function roundPrice(value) {
  return Math.round(
    Number(value) * 100
  ) / 100;
}

async function buildMarket(market) {
  const price =
    roundPrice(
      await getMarketPrice(
        market
      )
    );

  const settings =
    getMarketPriceSettings(
      market
    );

  /*
     Percentage movement is measured from the market's
     configured starting/base price.
  */
  const previous =
    Number(settings.base);

  const changePercent =
    previous > 0
      ? (
          (price - previous) /
          previous
        ) * 100
      : 0;

  return {
    id: market.id,

    name: market.name,

    symbol: market.symbol,

    category:
      market.category,

    exchange:
      market.exchange,

    currency:
      market.currency,

    price: price,

    changePercent:
      Number(
        changePercent.toFixed(2)
      ),

    tradelyTradable: true
  };
}

async function getAllMarkets() {
  return Promise.all(
    MARKET_DEFINITIONS.map(
      buildMarket
    )
  );
}

async function findMarket(marketId) {
  const definition =
    MARKET_DEFINITIONS.find(
      (market) =>
        market.id ===
        marketId
    );

  if (!definition) {
    return null;
  }

  return await buildMarket(
    definition
  );
}

/* =========================================================
   USER HELPERS
   ========================================================= */

/*
   PHONE NUMBER HANDLING

   Numbers coming from intl-tel-input should normally arrive
   in international E.164 format, for example:

   +233599268723

   This helper also handles:
   0599268723
   059 926 8723
   00 233 599 268 723
   +233 599 268 723

   Ghana local numbers are converted to +233 format.
*/

function normalizePhone(phone) {
  let value = String(phone || "")
    .trim()
    .replace(/[^\d+]/g, "");

  if (!value) {
    return "";
  }

  if (value.startsWith("00")) {
    value = "+" + value.slice(2);
  }

  if (value.startsWith("+")) {
    return value;
  }

  /*
     Ghana local format:
     0599268723
     becomes:
     +233599268723
  */

  if (value.startsWith("0")) {
    return "+233" + value.slice(1);
  }

  return "+" + value;
}

function isValidInternationalPhone(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

function findUserById(id) {
  return database.users.find(
    (user) =>
      String(user.id) === String(id)
  );
}

function findUserByPhone(phone) {
  const normalizedPhone =
    normalizePhone(phone);

  return database.users.find(
    (user) =>
      normalizePhone(user.phone) ===
      normalizedPhone
  );
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: normalizePhone(user.phone),
    balance: Number(user.balance || 0),
    createdAt: user.createdAt
  };
}

/* =========================================================
   AUTH
   ========================================================= */

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      phone: normalizePhone(user.phone)
    },
    JWT_SECRET,
    {
      expiresIn: "30d"
    }
  );
}

function authMiddleware(req, res, next) {
  const header =
    req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required."
    });
  }

  const token =
    header.substring(7).trim();

  if (!token) {
    return res.status(401).json({
      message: "Authentication required."
    });
  }

  try {
    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const user =
      findUserById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: "User not found."
      });
    }

    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({
      message:
        "Session expired. Please log in again."
    });
  }
}

/* =========================================================
   ACCOUNT
   ========================================================= */

app.get(
  "/api/account",
  authMiddleware,
  (req, res) => {
    return res.json({
      user: safeUser(req.user)
    });
  }
);

/* =========================================================
   REGISTER
   ========================================================= */

app.post(
  "/api/register",
  async (req, res) => {
    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      const phone =
        normalizePhone(
          req.body.phone
        );

      const password =
        String(
          req.body.password || ""
        );

      if (!name) {
        return res.status(400).json({
          message: "Enter your name."
        });
      }

      if (!isValidInternationalPhone(phone)) {
        return res.status(400).json({
          message:
            "Enter a valid international phone number, for example +233599268723."
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          message:
            "Password must contain at least 6 characters."
        });
      }

      if (findUserByPhone(phone)) {
        return res.status(409).json({
          message:
            "An account with this phone number already exists."
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );

      const user = {
        id: crypto.randomUUID(),
        name,
        phone,
        passwordHash,

        /*
           New accounts always start with $0.00.
        */
        balance: 0,

        createdAt:
          new Date().toISOString()
      };

      database.users.push(user);

      saveDatabase();

      const token =
        createToken(user);

      return res.status(201).json({
        message:
          "Account created successfully.",
        token,
        user: safeUser(user)
      });
    } catch (error) {
      console.error(
        "Register error:",
        error
      );

      return res.status(500).json({
        message:
          "Could not create account."
      });
    }
  }
);

/* =========================================================
   LOGIN
   ========================================================= */

app.post(
  "/api/login",
  async (req, res) => {
    try {
      const phone =
        normalizePhone(
          req.body.phone
        );

      const password =
        String(
          req.body.password || ""
        );

      if (!phone || !password) {
        return res.status(400).json({
          message:
            "Enter your phone number and password."
        });
      }

      const user =
        findUserByPhone(phone);

      if (!user) {
        return res.status(401).json({
          message:
            "Invalid phone number or password."
        });
      }

      const valid =
        await bcrypt.compare(
          password,
          user.passwordHash
        );

      if (!valid) {
        return res.status(401).json({
          message:
            "Invalid phone number or password."
        });
      }

      const token =
        createToken(user);

      return res.json({
        message: "Login successful.",
        token,
        user: safeUser(user)
      });
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      return res.status(500).json({
        message:
          "Could not log in."
      });
    }
  }
);

/* =========================================================
   LOGOUT
   ========================================================= */

app.post(
  "/api/logout",
  authMiddleware,
  (req, res) => {
    return res.json({
      message:
        "Logged out successfully."
    });
  }
);

/* =========================================================
   MARKETS
   ========================================================= */

app.get(
  "/api/markets",
  async (req, res) => {
    try {
      const markets =
        await getAllMarkets();

      return res.json({
        markets
      });
    } catch (error) {
      console.error(
        "Markets error:",
        error
      );

      return res.status(500).json({
        message:
          "Could not load markets."
      });
    }
  }
);

/* =========================================================
   POSITION HELPERS
   ========================================================= */

function addMonths(date, months) {
  const result =
    new Date(date);

  const originalDay =
    result.getDate();

  result.setMonth(
    result.getMonth() + months
  );

  if (
    result.getDate() !==
    originalDay
  ) {
    result.setDate(0);
  }

  return result;
}

function calculateExpiration(
  marketType,
  durationMonths
) {
  const now =
    new Date();

  if (marketType === "short") {
    return new Date(
      now.getTime() +
        48 * 60 * 60 * 1000
    );
  }

  if (
    marketType === "long" &&
    (durationMonths === 2 ||
      durationMonths === 3)
  ) {
    return addMonths(
      now,
      durationMonths
    );
  }

  return null;
}

function getPositionAmount(position) {
  return Number(
    position.amount || 0
  );
}

async function enrichPosition(position) {
  const market =
    await findMarket(
      position.marketId
    );

  if (!market) {
    return {
      ...position,
      valuation: {
        entryValue:
          getPositionAmount(position),
        currentValue:
          getPositionAmount(position),
        profitLoss: 0,
        profitLossPercent: 0
      }
    };
  }

  const entryPrice =
    Number(
      position.entryPrice || 0
    );

  const currentPrice =
    Number(
      market.price || 0
    );

  const amount =
    getPositionAmount(position);

  let currentValue =
    amount;

  if (entryPrice > 0) {
    currentValue =
      amount *
      (currentPrice / entryPrice);
  }

  const profitLoss =
    currentValue - amount;

  const profitLossPercent =
    amount > 0
      ? (profitLoss / amount) *
        100
      : 0;

  return {
    ...position,
    market,
    valuation: {
      entryValue: Number(
        amount.toFixed(2)
      ),
      currentValue: Number(
        currentValue.toFixed(2)
      ),
      profitLoss: Number(
        profitLoss.toFixed(2)
      ),
      profitLossPercent: Number(
        profitLossPercent.toFixed(2)
      )
    }
  };
}

/* =========================================================
   POSITIONS
   ========================================================= */

app.get(
  "/api/positions",
  authMiddleware,
  async (req, res) => {
    try {
      const userPositions =
        database.positions.filter(
          (position) =>
            String(position.userId) ===
            String(req.user.id)
        );

      const enriched =
        await Promise.all(
          userPositions.map(
            enrichPosition
          )
        );

      return res.json({
        positions: enriched
      });
    } catch (error) {
      console.error(
        "Positions error:",
        error
      );

      return res.status(500).json({
        message:
          "Could not load positions."
      });
    }
  }
);

/* =========================================================
   OPEN POSITION
   ========================================================= */

app.post(
  "/api/positions/open",
  authMiddleware,
  async (req, res) => {
    try {
      const marketId =
        String(
          req.body.marketId || ""
        ).trim();

      const marketType =
        String(
          req.body.marketType || ""
        ).trim();

      const amount =
        Number(
          req.body.amount
        );

      const durationMonths =
        req.body.durationMonths ===
          null ||
        req.body.durationMonths ===
          undefined ||
        req.body.durationMonths ===
          ""
          ? null
          : Number(
              req.body.durationMonths
            );

      if (!marketId) {
        return res.status(400).json({
          message:
            "Select a market."
        });
      }

      if (
        marketType !== "short" &&
        marketType !== "long"
      ) {
        return res.status(400).json({
          message:
            "Select a valid duration."
        });
      }

      if (
        !Number.isFinite(amount) ||
        amount < 1
      ) {
        return res.status(400).json({
          message:
            "Enter an amount of at least $1."
        });
      }

      if (
        marketType === "long" &&
        durationMonths !== 2 &&
        durationMonths !== 3
      ) {
        return res.status(400).json({
          message:
            "Choose 2 months or 3 months."
        });
      }

      const market =
        await findMarket(
          marketId
        );

      if (!market) {
        return res.status(404).json({
          message:
            "Market not found."
        });
      }

      if (
        Number(req.user.balance || 0) <
        amount
      ) {
        return res.status(400).json({
          message:
            "Insufficient balance."
        });
      }

      const expiration =
        calculateExpiration(
          marketType,
          durationMonths
        );

      if (!expiration) {
        return res.status(400).json({
          message:
            "Could not calculate expiration."
        });
      }

      const position = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        marketId: market.id,
        marketName: market.name,
        symbol: market.symbol,
        marketType,
        durationMonths,
        amount: Number(
          amount.toFixed(2)
        ),
        entryPrice: Number(
          market.price.toFixed(2)
        ),
        openedAt:
          new Date().toISOString(),
        expiresAt:
          expiration.toISOString(),
        status: "active"
      };

      req.user.balance =
        Number(
          (
            Number(req.user.balance) -
            amount
          ).toFixed(2)
        );

      database.positions.push(
        position
      );

      database.transactions.push({
        id: crypto.randomUUID(),
        userId: req.user.id,
        type: "position_open",
        amount: -amount,
        marketId: market.id,
        positionId: position.id,
        createdAt:
          new Date().toISOString()
      });

      saveDatabase();

      const result =
        await enrichPosition(
          position
        );

      return res.status(201).json({
        message:
          "Position opened successfully.",
        balance: req.user.balance,
        position: result
      });
    } catch (error) {
      console.error(
        "Open position error:",
        error
      );

      return res.status(500).json({
        message:
          "Could not open position."
      });
    }
  }
);

/* =========================================================
   SELL POSITION
   ========================================================= */

app.post(
  "/api/positions/:positionId/sell",
  authMiddleware,
  async (req, res) => {
    try {
      const position =
        database.positions.find(
          (item) =>
            item.id ===
              req.params.positionId &&
            String(item.userId) ===
              String(req.user.id)
        );

      if (!position) {
        return res.status(404).json({
          message:
            "Position not found."
        });
      }

      if (position.status !== "active") {
        return res.status(400).json({
          message:
            "This position is already closed."
        });
      }

      const market =
        await findMarket(
          position.marketId
        );

      if (!market) {
        return res.status(404).json({
          message:
            "Market not found."
        });
      }

      const amount =
        Number(position.amount);

      const entryPrice =
        Number(
          position.entryPrice
        );

      const currentPrice =
        Number(
          market.price
        );

      let currentValue =
        amount;

      if (entryPrice > 0) {
        currentValue =
          amount *
          (currentPrice / entryPrice);
      }

      currentValue = Number(
        currentValue.toFixed(2)
      );

      position.status = "closed";

      position.closedAt =
        new Date().toISOString();

      position.closePrice =
        currentPrice;

      position.closeValue =
        currentValue;

      req.user.balance =
        Number(
          (
            Number(req.user.balance) +
            currentValue
          ).toFixed(2)
        );

      database.transactions.push({
        id: crypto.randomUUID(),
        userId: req.user.id,
        type: "position_sell",
        amount: currentValue,
        marketId:
          position.marketId,
        positionId:
          position.id,
        createdAt:
          new Date().toISOString()
      });

      saveDatabase();

      return res.json({
        message:
          "Position sold successfully.",
        balance:
          req.user.balance,
        value:
          currentValue
      });
    } catch (error) {
      console.error(
        "Sell position error:",
        error
      );

      return res.status(500).json({
        message:
          "Could not sell position."
      });
    }
  }
);

/* =========================================================
   CLOSE POSITION
   ========================================================= */

app.post(
  "/api/positions/:positionId/close",
  authMiddleware,
  async (req, res) => {
    req.params.positionId =
      String(
        req.params.positionId
      );

    return closePosition(
      req,
      res
    );
  }
);

async function closePosition(req, res) {
  try {
    const position =
      database.positions.find(
        (item) =>
          item.id ===
            req.params.positionId &&
          String(item.userId) ===
            String(req.user.id)
      );

    if (!position) {
      return res.status(404).json({
        message:
          "Position not found."
      });
    }

    if (position.status !== "active") {
      return res.status(400).json({
        message:
          "This position is already closed."
      });
    }

    const market =
      await findMarket(
        position.marketId
      );

    if (!market) {
      return res.status(404).json({
        message:
          "Market not found."
      });
    }

    const amount =
      Number(position.amount);

    const entryPrice =
      Number(
        position.entryPrice
      );

    const currentPrice =
      Number(
        market.price
      );

    let currentValue =
      amount;

    if (entryPrice > 0) {
      currentValue =
        amount *
        (currentPrice / entryPrice);
    }

    currentValue = Number(
      currentValue.toFixed(2)
    );

    position.status = "closed";

    position.closedAt =
      new Date().toISOString();

    position.closePrice =
      currentPrice;

    position.closeValue =
      currentValue;

    req.user.balance =
      Number(
        (
          Number(req.user.balance) +
          currentValue
        ).toFixed(2)
      );

    database.transactions.push({
      id: crypto.randomUUID(),
      userId: req.user.id,
      type: "position_close",
      amount: currentValue,
      marketId:
        position.marketId,
      positionId:
        position.id,
      createdAt:
        new Date().toISOString()
    });

    saveDatabase();

    return res.json({
      message:
        "Position closed successfully.",
      balance:
        req.user.balance,
      value:
        currentValue
    });
  } catch (error) {
    console.error(
      "Close position error:",
      error
    );

    return res.status(500).json({
      message:
        "Could not close position."
    });
  }
}

/* =========================================================
   REWARDS
   ========================================================= */

const REWARDS = [
  {
    id: "starter",
    name: "Starter Boost",
    price: 5,
    value: 7
  },

  {
    id: "trader",
    name: "Trader Boost",
    price: 10,
    value: 15
  },

  {
    id: "pro",
    name: "Pro Boost",
    price: 25,
    value: 40
  },

  {
    id: "elite",
    name: "Elite Boost",
    price: 50,
    value: 85
  }
];

app.get(
  "/api/rewards",
  authMiddleware,
  (req, res) => {
    return res.json({
      rewards: REWARDS
    });
  }
);

app.post(
  "/api/rewards/buy",
  authMiddleware,
  (req, res) => {
    try {
      const rewardId =
        String(
          req.body.rewardId || ""
        ).trim();

      const reward =
        REWARDS.find(
          (item) =>
            item.id === rewardId
        );

      if (!reward) {
        return res.status(404).json({
          message:
            "Reward not found."
        });
      }

      if (
        Number(req.user.balance) <
        reward.price
      ) {
        return res.status(400).json({
          message:
            "Insufficient balance."
        });
      }

      req.user.balance =
        Number(
          (
            Number(req.user.balance) -
            reward.price +
            reward.value
          ).toFixed(2)
        );

      database.transactions.push({
        id: crypto.randomUUID(),
        userId: req.user.id,
        type: "reward",
        rewardId: reward.id,
        amount: reward.value,
        price: reward.price,
        createdAt:
          new Date().toISOString()
      });

      saveDatabase();

      return res.json({
        message:
          "Reward purchased successfully.",
        balance:
          req.user.balance,
        reward
      });
    } catch (error) {
      console.error(
        "Reward error:",
        error
      );

      return res.status(500).json({
        message:
          "Could not purchase reward."
      });
    }
  }
);

/* =========================================================
   CRYPTO DEPOSITS
   ========================================================= */

const CRYPTO_NETWORKS = {
  TRC20: {
    name: "USDT TRC20",
    address:
      "TMaegWWAYEG8ShSZQD3n5VgG6Jn7znwUew"
  },

  BEP20: {
    name: "USDT BEP20",
    address:
      "0xF76764334Ceb9bAe00c64b7b4fB81095b02721e7"
  }
};

const MIN_DEPOSIT = 500;

app.post(
  "/api/deposit/create",
  authMiddleware,
  (req, res) => {
    try {
      const amount =
        Number(
          req.body.amount
        );

      const network =
        String(
          req.body.network || ""
        ).toUpperCase();

      if (
        !Number.isFinite(amount) ||
        amount < MIN_DEPOSIT
      ) {
        return res.status(400).json({
          message:
            "Minimum deposit is 500 USDT."
        });
      }

      if (
        !CRYPTO_NETWORKS[network]
      ) {
        return res.status(400).json({
          message:
            "Select TRC20 or BEP20."
        });
      }

      const deposit = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        amount: Number(
          amount.toFixed(2)
        ),
        currency: "USDT",
        network,
        address:
          CRYPTO_NETWORKS[
            network
          ].address,
        status: "pending",
        createdAt:
          new Date().toISOString()
      };

      depositsDatabase.deposits.push(
        deposit
      );

      saveDeposits();

      return res.status(201).json({
        message:
          "Deposit created successfully.",
        deposit
      });
    } catch (error) {
      console.error(
        "Deposit creation error:",
        error
      );

      return res.status(500).json({
        message:
          "Could not create deposit."
      });
    }
  }
);

/* =========================================================
   DEPOSIT STATUS
   ========================================================= */

app.get(
  "/api/deposit/status/:depositId",
  authMiddleware,
  (req, res) => {
    const deposit =
      depositsDatabase.deposits.find(
        (item) =>
          item.id ===
            req.params.depositId &&
          String(item.userId) ===
            String(req.user.id)
      );

    if (!deposit) {
      return res.status(404).json({
        message:
          "Deposit not found."
      });
    }

    return res.json({
      deposit
    });
  }
);

/* =========================================================
   DEPOSIT HISTORY
   ========================================================= */

app.get(
  "/api/deposits",
  authMiddleware,
  (req, res) => {
    const userDeposits =
      depositsDatabase.deposits
        .filter(
          (item) =>
            String(item.userId) ===
            String(req.user.id)
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        );

    return res.json({
      deposits: userDeposits
    });
  }
);

/* =========================================================
   PAYMENT STATUS
   ========================================================= */

app.get(
  "/api/payment/status",
  authMiddleware,
  (req, res) => {
    return res.json({
      enabled: true,
      networks: [
        "TRC20",
        "BEP20"
      ],
      minimumDeposit:
        MIN_DEPOSIT
    });
  }
);

/* =========================================================
   DEPOSIT COMPLETE
   ========================================================= */

app.post(
  "/api/deposit/complete",
  authMiddleware,
  (req, res) => {
    return res.status(400).json({
      message:
        "Deposits are confirmed after payment verification."
    });
  }
);

/* =========================================================
   POSITION MATURITY
   ========================================================= */

async function processMaturedPositions() {
  try {
    const now =
      Date.now();

    let changed = false;

    for (
      const position of
      database.positions
    ) {
      if (
        position.status !==
        "active"
      ) {
        continue;
      }

      const expiresAt =
        new Date(
          position.expiresAt
        ).getTime();

      if (
        !Number.isFinite(expiresAt) ||
        expiresAt > now
      ) {
        continue;
      }

      const user =
        findUserById(
          position.userId
        );

      if (!user) {
        continue;
      }

      const market =
        await findMarket(
          position.marketId
        );

      if (!market) {
        continue;
      }

      const amount =
        Number(
          position.amount
        );

      const entryPrice =
        Number(
          position.entryPrice
        );

      const currentPrice =
        Number(
          market.price
        );

      let currentValue =
        amount;

      if (entryPrice > 0) {
        currentValue =
          amount *
          (currentPrice /
            entryPrice);
      }

      currentValue = Number(
        currentValue.toFixed(2)
      );

      position.status =
        "closed";

      position.closedAt =
        new Date().toISOString();

      position.closePrice =
        currentPrice;

      position.closeValue =
        currentValue;

      position.closedReason =
        "matured";

      user.balance =
        Number(
          (
            Number(user.balance) +
            currentValue
          ).toFixed(2)
        );

      database.transactions.push({
        id: crypto.randomUUID(),
        userId: user.id,
        type: "position_maturity",
        amount: currentValue,
        marketId:
          position.marketId,
        positionId:
          position.id,
        createdAt:
          new Date().toISOString()
      });

      changed = true;
    }

    if (changed) {
      saveDatabase();
    }
  } catch (error) {
    console.error(
      "Maturity worker error:",
      error
    );
  }
}

setInterval(
  processMaturedPositions,
  30 * 1000
);

/* =========================================================
   FRONTEND
   ========================================================= */

function getFrontendIndex() {
  if (
    fs.existsSync(
      PUBLIC_INDEX
    )
  ) {
    return PUBLIC_INDEX;
  }

  if (
    fs.existsSync(
      ROOT_INDEX
    )
  ) {
    return ROOT_INDEX;
  }

  return null;
}

if (
  fs.existsSync(
    PUBLIC_DIR
  )
) {
  app.use(
    express.static(
      PUBLIC_DIR
    )
  );
}

app.get(
  "/",
  (req, res) => {
    const index =
      getFrontendIndex();

    if (!index) {
      return res.status(404).send(
        "Tradely frontend not found."
      );
    }

    return res.sendFile(index);
  }
);

app.get(
  /^\/(?!api(?:\/|$)).*/,
  (req, res) => {
    const index =
      getFrontendIndex();

    if (!index) {
      return res.status(404).send(
        "Tradely frontend not found."
      );
    }

    return res.sendFile(index);
  }
);

/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      message:
        "Internal server error."
    });
  }
);

/* =========================================================
   START SERVER
   ========================================================= */

if (require.main === module) {
  app.listen(
    PORT,
    () => {
      console.log(
        "=============================================="
      );

      console.log(
        "Tradely running at " +
          APP_URL
      );

      console.log(
        "Frontend: " +
          (getFrontendIndex() ||
            "not found")
      );

      console.log(
        "Markets: " +
          MARKET_DEFINITIONS.length
      );

      console.log(
        "Crypto deposits: TRC20 + BEP20"
      );

      console.log(
        "=============================================="
      );
    }
  );
}

module.exports = app;