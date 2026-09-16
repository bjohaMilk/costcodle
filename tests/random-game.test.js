const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const mainScript = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "main.js"),
  "utf8"
);

class MockStorage {
  constructor(initialValues = {}) {
    this.values = new Map(Object.entries(initialValues));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function createElement() {
  const listeners = new Map();
  const classes = new Set();

  return {
    children: [],
    classList: {
      add: (...classNames) => classNames.forEach((name) => classes.add(name)),
      contains: (className) => classes.has(className),
      remove: (...classNames) =>
        classNames.forEach((name) => classes.delete(name)),
    },
    style: {},
    value: "",
    addEventListener(eventName, listener) {
      listeners.set(eventName, listener);
    },
    appendChild(child) {
      this.children.push(child);
    },
    click() {
      listeners.get("click")?.({ currentTarget: this });
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

async function loadGame({
  games,
  search = "",
  localValues = {},
  sessionValues = {},
  randomValue = 0,
}) {
  const elements = new Map();
  const document = {
    createElement,
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createElement());
      }
      return elements.get(id);
    },
  };
  const localStorage = new MockStorage(localValues);
  const sessionStorage = new MockStorage(sessionValues);
  const location = {
    assigned: null,
    href: `http://127.0.0.1:4173/index.html${search}`,
    origin: "http://127.0.0.1:4173",
    pathname: "/index.html",
    search,
    assign(destination) {
      this.assigned = destination;
    },
  };
  const window = {
    history: {
      replaceState(_state, _unused, url) {
        location.replaced = String(url);
      },
    },
    location,
  };
  const math = Object.create(Math);
  math.random = () => randomValue;

  const context = vm.createContext({
    URL,
    URLSearchParams,
    clearTimeout() {},
    console,
    document,
    fetch: async () => ({ json: async () => games }),
    localStorage,
    Math: math,
    navigator: {
      clipboard: { writeText() {} },
      userAgent: "node-test",
    },
    sessionStorage,
    setTimeout(callback) {
      callback();
      return 1;
    },
    window,
  });

  vm.runInContext(mainScript, context);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  return { context, elements, localStorage, location, sessionStorage };
}

const games = {
  "game-1": {
    name: "First product",
    price: "$10.00",
    image: "first.jpg",
  },
  "game-3399": {
    name: "Last product",
    price: "$20.00",
    image: "last.jpg",
  },
};

test("random mode selects from every available game and stores session progress", async () => {
  const { elements, localStorage, location, sessionStorage } = await loadGame({
    games,
    search: "?mode=random",
    randomValue: 0.999,
  });

  assert.match(elements.get("product-info").innerHTML, /Last product/);
  assert.equal(JSON.parse(sessionStorage.getItem("randomState")).gameNumber, 3399);
  assert.equal(localStorage.getItem("state"), null);
  assert.equal(localStorage.getItem("stats"), null);
  assert.match(location.replaced, /mode=random&game=3399/);
});

test("a fixed random link loads that item and does not change daily statistics", async () => {
  const existingStats = JSON.stringify({
    numGames: 5,
    numWins: 4,
    winsInNum: [1, 1, 1, 1, 0, 0],
    currentStreak: 2,
    maxStreak: 3,
  });
  const { context, elements, localStorage, sessionStorage } = await loadGame({
    games,
    localValues: { stats: existingStats },
    search: "?mode=random&game=1",
  });

  context.checkGuess("10.00");

  assert.match(elements.get("product-info").innerHTML, /First product/);
  assert.equal(JSON.parse(sessionStorage.getItem("randomState")).hasWon, true);
  assert.equal(localStorage.getItem("stats"), existingStats);
});

test("random mode restores its current game after a refresh", async () => {
  const randomState = JSON.stringify({
    gameNumber: 1,
    guesses: [{ guess: "5.00", closeness: "guess-far", direction: "&uarr;" }],
    hasWon: false,
  });
  const { elements, sessionStorage } = await loadGame({
    games,
    search: "?mode=random",
    sessionValues: { randomState },
    randomValue: 0.999,
  });

  assert.match(elements.get("product-info").innerHTML, /First product/);
  assert.equal(JSON.parse(sessionStorage.getItem("randomState")).guesses.length, 1);
});

test("mode controls navigate to a fresh random game and back to the daily game", async () => {
  const { elements, location, sessionStorage } = await loadGame({
    games,
    search: "?mode=random&game=1",
  });

  elements.get("random-game-button").click();
  assert.equal(sessionStorage.getItem("randomState"), null);
  assert.equal(location.assigned, "/index.html?mode=random");

  elements.get("daily-game-button").click();
  assert.equal(location.assigned, "/index.html");
});

test("daily mode continues to store progress and update daily statistics", async () => {
  const startDate = new Date("09/21/2023");
  const dailyGameNumber =
    Math.ceil((Date.now() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;
  const dailyGames = {
    [`game-${dailyGameNumber}`]: {
      name: "Today's product",
      price: "$10.00",
      image: "today.jpg",
    },
  };
  const { context, localStorage, sessionStorage } = await loadGame({
    games: dailyGames,
  });

  context.checkGuess("10.00");

  const state = JSON.parse(localStorage.getItem("state"));
  const stats = JSON.parse(localStorage.getItem("stats"));
  assert.equal(state.gameNumber, dailyGameNumber);
  assert.equal(state.hasWon, true);
  assert.equal(stats.numGames, 1);
  assert.equal(stats.numWins, 1);
  assert.equal(sessionStorage.getItem("randomState"), null);
});
