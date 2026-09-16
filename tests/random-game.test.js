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
    dataset: {},
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
    dispatch(eventName, event = {}) {
      listeners.get(eventName)?.(event);
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
  assert.equal(JSON.parse(localStorage.getItem("randomStats")).numGames, 1);
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
  const randomState = JSON.parse(sessionStorage.getItem("randomState"));
  assert.equal(randomState.hasWon, true);
  assert.equal(randomState.winMessage, "Great job, Sean!");
  assert.match(elements.get("game-stats").innerHTML, /Great job, Sean!/);
  assert.doesNotMatch(elements.get("game-stats").innerHTML, /You win/);
  assert.equal(localStorage.getItem("stats"), existingStats);
  const randomStats = JSON.parse(localStorage.getItem("randomStats"));
  assert.equal(randomStats.numGames, 1);
  assert.equal(randomStats.numWins, 1);
  assert.equal(randomStats.currentStreak, 1);
  assert.equal(randomStats.winsInNum[0], 1);
});

test("a winning message remains the same after refresh", async () => {
  const randomState = JSON.stringify({
    gameNumber: 1,
    guesses: [{ guess: "10.00", closeness: "guess-win", direction: "&check;" }],
    hasWon: true,
    winMessage: "Right on the money, Sean!",
  });
  const randomStats = JSON.stringify({
    numGames: 1,
    numWins: 1,
    winsInNum: [1, 0, 0, 0, 0, 0],
    currentStreak: 1,
    maxStreak: 1,
  });
  const { elements, sessionStorage } = await loadGame({
    games,
    localValues: { randomStats },
    search: "?mode=random&game=1",
    sessionValues: { randomState },
    randomValue: 0,
  });

  assert.match(
    elements.get("game-stats").innerHTML,
    /Right on the money, Sean!/
  );
  assert.equal(
    JSON.parse(sessionStorage.getItem("randomState")).winMessage,
    "Right on the money, Sean!"
  );
});

test("random mode restores its current game after a refresh", async () => {
  const randomState = JSON.stringify({
    gameNumber: 1,
    guesses: [{ guess: "5.00", closeness: "guess-far", direction: "&uarr;" }],
    hasWon: false,
  });
  const randomStats = JSON.stringify({
    numGames: 1,
    numWins: 0,
    winsInNum: [0, 0, 0, 0, 0, 0],
    currentStreak: 0,
    maxStreak: 0,
  });
  const { elements, localStorage, sessionStorage } = await loadGame({
    games,
    localValues: { randomStats },
    search: "?mode=random",
    sessionValues: { randomState },
    randomValue: 0.999,
  });

  assert.match(elements.get("product-info").innerHTML, /First product/);
  assert.equal(JSON.parse(sessionStorage.getItem("randomState")).guesses.length, 1);
  assert.equal(localStorage.getItem("randomStats"), randomStats);
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

test("the game number control opens a specific valid game", async () => {
  const { elements, location, sessionStorage } = await loadGame({
    games,
    search: "?mode=random&game=1",
  });

  elements.get("game-number-input").value = "3399";
  elements.get("play-game-button").click();

  assert.equal(sessionStorage.getItem("randomState"), null);
  assert.equal(location.assigned, "/index.html?mode=random&game=3399");
});

test("the game number control rejects unavailable games", async () => {
  const { elements, location } = await loadGame({
    games,
    search: "?mode=random&game=1",
  });

  elements.get("game-number-input").value = "3400";
  elements.get("play-game-button").click();

  assert.equal(location.assigned, null);
  assert.equal(elements.get("game-number-error").classList.contains("hide"), false);
  assert.equal(
    elements.get("game-number-error").textContent,
    "Enter a game number between 1 and 3399."
  );
  assert.equal(elements.get("game-number-input").min, 1);
  assert.equal(elements.get("game-number-input").max, 3399);
});

test("existing random progress is migrated into random statistics", async () => {
  const randomState = JSON.stringify({
    gameNumber: 1,
    guesses: [{ guess: "10.00", closeness: "guess-win", direction: "&check;" }],
    hasWon: true,
  });
  const { localStorage } = await loadGame({
    games,
    search: "?mode=random&game=1",
    sessionValues: { randomState },
  });

  const randomStats = JSON.parse(localStorage.getItem("randomStats"));
  assert.equal(randomStats.numGames, 1);
  assert.equal(randomStats.numWins, 1);
  assert.equal(randomStats.winsInNum[0], 1);
  const history = JSON.parse(localStorage.getItem("gameHistory"));
  assert.equal(history.length, 1);
  assert.equal(history[0].result, "won");
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

test("random losses update random stats without changing daily stats", async () => {
  const dailyStats = JSON.stringify({
    numGames: 3,
    numWins: 3,
    winsInNum: [3, 0, 0, 0, 0, 0],
    currentStreak: 3,
    maxStreak: 3,
  });
  const { context, localStorage } = await loadGame({
    games,
    localValues: { stats: dailyStats },
    search: "?mode=random&game=1",
  });

  for (let guessNumber = 0; guessNumber < 6; guessNumber++) {
    context.checkGuess("1.00");
  }

  const randomStats = JSON.parse(localStorage.getItem("randomStats"));
  assert.equal(randomStats.numGames, 1);
  assert.equal(randomStats.numWins, 0);
  assert.equal(randomStats.currentStreak, 0);
  assert.equal(localStorage.getItem("stats"), dailyStats);
  const history = JSON.parse(localStorage.getItem("gameHistory"));
  assert.equal(history.length, 1);
  assert.equal(history[0].gameNumber, 1);
  assert.equal(history[0].productName, "First product");
  assert.equal(history[0].mode, "random");
  assert.equal(history[0].result, "lost");
  assert.equal(history[0].guesses, 6);
});

test("the stats overlay renders statistics for the active mode", async () => {
  const randomStats = JSON.stringify({
    numGames: 4,
    numWins: 3,
    winsInNum: [1, 2, 0, 0, 0, 0],
    currentStreak: 2,
    maxStreak: 3,
  });
  const randomState = JSON.stringify({
    gameNumber: 1,
    guesses: [],
    hasWon: false,
  });
  const { elements } = await loadGame({
    games,
    localValues: { randomStats },
    search: "?mode=random&game=1",
    sessionValues: { randomState },
  });

  elements.get("stat-button").dataset.overlay = "stats-overlay";
  elements.get("stat-button").click();

  assert.match(elements.get("title").innerHTML, /RANDOM/);
  assert.equal(elements.get("number-wins").innerHTML, "4");
  assert.equal(elements.get("win-percent").innerHTML, "75");
  assert.equal(elements.get("current-streak").innerHTML, "2");
  assert.equal(elements.get("max-streak").innerHTML, "3");
  assert.equal(elements.get("graph-1").innerHTML, "1");
  assert.equal(elements.get("graph-2").innerHTML, "2");
});

test("game history renders completed games with replay controls", async () => {
  const gameHistory = JSON.stringify([
    {
      gameNumber: 3399,
      productName: "Last product",
      mode: "random",
      result: "won",
      guesses: 2,
      completedAt: "2026-09-15T12:00:00.000Z",
    },
  ]);
  const randomState = JSON.stringify({
    gameNumber: 1,
    guesses: [],
    hasWon: false,
  });
  const { elements, location } = await loadGame({
    games,
    localValues: { gameHistory },
    search: "?mode=random&game=1",
    sessionValues: { randomState },
  });

  elements.get("stat-button").dataset.overlay = "stats-overlay";
  elements.get("stat-button").click();

  const historyRows = elements.get("game-history").children;
  assert.equal(historyRows.length, 1);
  assert.equal(historyRows[0].children[0].textContent, "#3399");
  assert.match(historyRows[0].children[1].textContent, /Last product/);

  historyRows[0].children[0].click();
  assert.equal(location.assigned, "/index.html?mode=random&game=3399");
});
