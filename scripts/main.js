/*
  Declaration of global variables
*/

//Product info variables
let productName;
let productPrice;
let productImage;
let activeGameNumber;

//Timeout IDs
let shakeTimeout;
let toastTimeout;
let warningTimeout;

/*
  Global variable constants
*/

//The day Costcodle was launched. Used to find game number each day
const costcodleStartDate = new Date("09/21/2023");
const dailyGameNumber = getGameNumber();
const urlParams = new URLSearchParams(window.location.search);
const isRandomMode = urlParams.get("mode") === "random";
const gameStateStorage = isRandomMode ? sessionStorage : localStorage;
const gameStateStorageKey = isRandomMode ? "randomState" : "state";

//Elements with event listeners to play the game
const input = document.getElementById("guess-input");
const buttonInput = document.getElementById("guess-button");

const infoButton = document.getElementById("info-button");
infoButton.addEventListener("click", switchState);

const statButton = document.getElementById("stat-button");
statButton.addEventListener("click", switchState);

//User stats object
const userStats = JSON.parse(localStorage.getItem("stats")) || {
  numGames: 0,
  numWins: 0,
  winsInNum: [0, 0, 0, 0, 0, 0],
  currentStreak: 0,
  maxStreak: 0,
};

//User game state
let gameState = JSON.parse(gameStateStorage.getItem(gameStateStorageKey)) || {
  gameNumber: -1,
  guesses: [],
  hasWon: false,
};

/*
  Starts playing the game. Called at beginning of execution
*/

playGame();

function playGame() {
  fetchGameData();
}

/*
  Acquiring Game Data
*/

//Fetches the selected game data from the json and starts the game
function fetchGameData() {
  fetch("./games.json")
    .then((response) => response.json())
    .then((json) => {
      activeGameNumber = isRandomMode
        ? getRandomGameNumber(json)
        : dailyGameNumber;

      const game = json[`game-${activeGameNumber}`];
      if (!game) {
        throw new Error(`Game ${activeGameNumber} is unavailable.`);
      }

      productName = game.name;
      productPrice = Number(game.price.replace(/[$,]/g, ""));
      productImage = game.image;

      if (isRandomMode) {
        const randomGameUrl = new URL(window.location.href);
        randomGameUrl.searchParams.set("game", activeGameNumber);
        window.history.replaceState({}, "", randomGameUrl);
      }

      initializeGame();
      initializeModeControls();
    })
    .catch((error) => {
      console.error("Unable to load the game:", error);
      document.getElementById("game-stats").textContent =
        "Unable to load this game. Please try again.";
    });
}

function getRandomGameNumber(games) {
  const requestedGameNumber = Number(urlParams.get("game"));
  if (
    Number.isInteger(requestedGameNumber) &&
    games[`game-${requestedGameNumber}`]
  ) {
    return requestedGameNumber;
  }

  if (games[`game-${gameState.gameNumber}`]) {
    return gameState.gameNumber;
  }

  const availableGameNumbers = Object.keys(games)
    .filter((key) => /^game-\d+$/.test(key))
    .map((key) => Number(key.slice(5)));

  return availableGameNumbers[
    Math.floor(Math.random() * availableGameNumbers.length)
  ];
}

function initializeModeControls() {
  const dailyGameButton = document.getElementById("daily-game-button");
  const randomGameButton = document.getElementById("random-game-button");

  if (isRandomMode) {
    dailyGameButton.classList.remove("hide");
    randomGameButton.textContent = "NEW RANDOM ITEM";
  }

  dailyGameButton.addEventListener("click", () => {
    window.location.assign(window.location.pathname);
  });

  randomGameButton.addEventListener("click", () => {
    sessionStorage.removeItem("randomState");
    window.location.assign(`${window.location.pathname}?mode=random`);
  });
}

/*
  Used to initialize the game board using the current game state
*/

function initializeGame() {
  //Reset game state and track new game if user last played on a previous day
  if (gameState.gameNumber !== activeGameNumber) {
    if (!isRandomMode && gameState.hasWon === false) {
      userStats.currentStreak = 0;
    }
    gameState.gameNumber = activeGameNumber;
    gameState.guesses = [];
    gameState.hasWon = false;

    if (!isRandomMode) {
      userStats.numGames++;
      localStorage.setItem("stats", JSON.stringify(userStats));
    }
    saveGameState();
  }

  displayProductCard();

  updateGameBoard();

  if (gameState.guesses.length < 6 && !gameState.hasWon) {
    addEventListeners();
  } else {
    convertToShareButton();
  }
}

function convertToShareButton() {
  const containerElem = document.getElementById("input-container");
  const shareButtonElem = document.createElement("button");
  shareButtonElem.setAttribute("id", "share-button");
  containerElem.innerHTML = "";
  shareButtonElem.innerHTML = `Share
  <img src="./assets/share-icon.svg" class="share-icon" />`;
  shareButtonElem.addEventListener("click", copyStats);
  containerElem.appendChild(shareButtonElem);
}

function displayProductCard() {
  //First, update the image container with the new product image
  const imageContainer = document.getElementById("image-container");

  //Create a new image element to dynamically store game image
  const productImageElement = document.createElement("img");
  productImageElement.src = productImage;
  productImageElement.alt = productName;
  productImageElement.setAttribute("id", "product-image");

  //Add created image to the image container
  imageContainer.appendChild(productImageElement);

  //Select product info element and update the html to display product name
  const productInfo = document.getElementById("product-info");
  productInfo.innerHTML = `<center>${productName}</center>`;
}

function updateGameBoard() {
  updateGuessStat();

  gameState.guesses.forEach((guess, index) => displayGuess(guess, index + 1));
}

function updateGuessStat() {
  const guessStats = document.getElementById("game-stats");
  const modeLabel = isRandomMode ? "Random item · " : "";
  if (gameState.hasWon) {
    guessStats.innerHTML = `<center>${modeLabel}You win! Congratulations!🎉</center>`;
    guessStats.innerHTML += `<center>The price was $${productPrice}</center>`;
    return;
  }

  if (gameState.guesses.length === 6) {
    guessStats.innerHTML = `<center>${modeLabel}Better luck next time!</center>`;
    guessStats.innerHTML += `<center>The price was $${productPrice}</center>`;
  } else {
    guessStats.innerHTML = `${modeLabel}Guess: ${gameState.guesses.length + 1}/6`;
  }
}

/*
  Event Listeners
*/

//Text input event listener to submit guess when user presses "Enter"
function inputEventListener(event) {
  if (event.key === "Enter") {
    handleInput();
  }
}

//Button event listener to submit guess when user presses guess button
function buttonEventListener() {
  handleInput();
}

function handleInput() {
  const strippedString = input.value.replaceAll(",", "");
  const guess = Number(strippedString).toFixed(2);

  if (isNaN(guess) || !strippedString) {
    displayWarning();
    return;
  }

  checkGuess(guess);

  input.value = "";

  function displayWarning() {
    clearTimeout(warningTimeout);

    const warningElem = document.getElementById("warning-toast");
    warningElem.classList.remove("hide");
    warningElem.classList.add("animate__flipInX");

    warningTimeout = setTimeout(() => {
      warningElem.classList.remove("animate__flipInX");
      warningElem.classList.add("animate__flipOutX");
      setTimeout(() => {
        warningElem.classList.remove("animate__flipOutX");
        warningElem.classList.add("hide");
      }, 1000);
    }, 2000);
  }
}

function copyStats() {
  let output = isRandomMode
    ? `Costcodle Random #${activeGameNumber}`
    : `Costcodle #${activeGameNumber}`;
  if (!gameState.hasWon) {
    output += ` X/6\n`;
  } else {
    output += ` ${gameState.guesses.length}/6\n`;
  }

  gameState.guesses.forEach((guess) => {
    switch (guess.direction) {
      case "&uarr;":
        output += `⬆️`;
        break;
      case "&darr;":
        output += `⬇️`;
        break;
      case "&check;":
        output += `✅`;
        break;
    }

    switch (guess.closeness) {
      case "guess-far":
        output += `🟥`;
        break;
      case "guess-near":
        output += `🟨`;
        break;
    }
    output += `\n`;
  });

  const shareUrl = isRandomMode
    ? `${window.location.origin}${window.location.pathname}?mode=random&game=${activeGameNumber}`
    : `${window.location.origin}${window.location.pathname}`;

  const isMobile =
    navigator.userAgent.match(/Android/i) ||
    navigator.userAgent.match(/webOS/i) ||
    navigator.userAgent.match(/iPhone/i) ||
    navigator.userAgent.match(/iPad/i) ||
    navigator.userAgent.match(/iPod/i) ||
    navigator.userAgent.match(/BlackBerry/i) ||
    navigator.userAgent.match(/Windows Phone/i) ||
    navigator.userAgent.match(/IEMobile/i) ||
    navigator.userAgent.match(/Opera Mini/i);

  if (isMobile) {
    if (navigator.canShare) {
      navigator
        .share({
          title: "COSTCODLE",
          text: output,
          url: shareUrl,
        })
        .catch((error) => console.error("Share failed:", error));
    }
  } else {
    output += shareUrl;
    navigator.clipboard.writeText(output);
    displayToast();
  }

  function displayToast() {
    clearTimeout(toastTimeout);

    const toastElem = document.getElementById("share-toast");
    toastElem.classList.remove("hide");
    toastElem.classList.add("animate__flipInX");

    toastTimeout = setTimeout(() => {
      toastElem.classList.remove("animate__flipInX");
      toastElem.classList.add("animate__flipOutX");
      setTimeout(() => {
        toastElem.classList.remove("animate__flipOutX");
        toastElem.classList.add("hide");
      }, 1000);
    }, 3000);
  }
}

function addEventListeners() {
  input.addEventListener("keydown", inputEventListener);
  buttonInput.addEventListener("click", buttonEventListener);

  input.addEventListener("focus", () => {
    input.setAttribute("placeholder", "0.00");
  });
  input.addEventListener("blur", () => {
    input.setAttribute("placeholder", "Enter a guess...");
  });
}

function removeEventListeners() {
  buttonInput.setAttribute("disabled", "");
  buttonInput.classList.remove("active");
  input.setAttribute("disabled", "");
  input.setAttribute("placeholder", "Game Over!");
  input.removeEventListener("keydown", inputEventListener);
  buttonInput.removeEventListener("click", buttonEventListener);
}

/*
  Handles the logic of Costocodle
  Creates a guess object based on user guess and checks win condition
*/

function checkGuess(guess) {
  const guessObj = { guess, closeness: "", direction: "" };

  const percentAway = calculatePercent(guess);

  if (Math.abs(percentAway) <= 5) {
    guessObj.closeness = "guess-win";
    gameState.hasWon = true;
  } else {
    shakeBox();
    if (Math.abs(percentAway) <= 25) {
      guessObj.closeness = "guess-near";
    } else {
      guessObj.closeness = "guess-far";
    }
  }

  if (gameState.hasWon) {
    guessObj.direction = "&check;";
  } else if (percentAway < 0) {
    guessObj.direction = "&uarr;";
  } else {
    guessObj.direction = "&darr;";
  }

  gameState.guesses.push(guessObj);
  saveGameState();

  displayGuess(guessObj);

  if (gameState.hasWon) {
    gameWon();
  } else if (gameState.guesses.length === 6) {
    gameLost();
  }
}

/*
  Displays guess object from either game state or a new guess
*/

function displayGuess(guess, index = gameState.guesses.length) {
  const guessContainer = document.getElementById(index);
  const guessValueContainer = document.createElement("div");
  const infoContainer = document.createElement("div");

  guessValueContainer.classList.add(
    "guess-value-container",
    "animate__flipInX"
  );

  infoContainer.classList.add("guess-direction-container", "animate__flipInX");

  guessValueContainer.innerHTML = `$${guess.guess}`;

  infoContainer.classList.add(guess.closeness);
  infoContainer.innerHTML = guess.direction;

  guessContainer.classList.add("animate__flipOutX");

  setTimeout(() => {
    guessContainer.classList.add("transparent-background");
    guessContainer.appendChild(guessValueContainer);
    guessContainer.appendChild(infoContainer);
  }, 500);

  updateGuessStat();
}

/*
  Helper function to compute guess accuracy
*/

function calculatePercent(guess) {
  return ((guess * 100) / (productPrice * 100)) * 100 - 100;
}

/* 
  End state function to handle win/loss conditions
*/

function gameWon() {
  if (!isRandomMode) {
    userStats.numWins++;
    userStats.currentStreak++;
    userStats.winsInNum[gameState.guesses.length - 1]++;
    if (userStats.currentStreak > userStats.maxStreak) {
      userStats.maxStreak = userStats.currentStreak;
    }
    localStorage.setItem("stats", JSON.stringify(userStats));
  }
  gameState.hasWon = true;

  saveGameState();
  removeEventListeners();
  convertToShareButton();
}

function gameLost() {
  if (!isRandomMode) {
    userStats.currentStreak = 0;
    localStorage.setItem("stats", JSON.stringify(userStats));
  }

  removeEventListeners();
  convertToShareButton();
}

function saveGameState() {
  gameStateStorage.setItem(gameStateStorageKey, JSON.stringify(gameState));
}

/*
  DOM manipulation functions for overlays and animations
*/

function switchState(event) {
  const overlayBtnClicked = event.currentTarget.dataset.overlay;
  const overlayElem = document.getElementById(overlayBtnClicked);
  const title = document.getElementById("title");

  if (title.classList.contains("info-title")) {
    title.classList.remove("info-title");
  }

  if (overlayElem.style.display === "flex") {
    title.innerHTML = `COSTCO<span class="costco-blue">DLE</span>`;
    overlayElem.style.display = "none";
    return;
  }

  if (overlayBtnClicked === "info-overlay") {
    document.getElementById("stats-overlay").style.display = "none";
    renderInfo();
  } else {
    document.getElementById("info-overlay").style.display = "none";
    renderStats();
  }

  function renderInfo() {
    title.innerHTML = `HOW TO <span class="costco-blue">PLAY</span>`;
    if (!title.classList.contains("info-title")) {
      title.classList.add("info-title");
    }
    overlayElem.style.display = "flex";
  }

  function renderStats() {
    title.innerHTML = `GAME <span class="costco-blue">STATS</span>`;

    renderStatistics();
    graphDistribution();

    overlayElem.style.display = "flex";

    function renderStatistics() {
      const numWinsElem = document.getElementById("number-wins");
      numWinsElem.innerHTML = `${userStats.numGames}`;

      const winPercentElem = document.getElementById("win-percent");
      if (userStats.numGames === 0) {
        winPercentElem.innerHTML = `0`;
      } else {
        winPercentElem.innerHTML = `${Math.round(
          (userStats.numWins / userStats.numGames) * 100
        )}`;
      }

      const currentStreakElem = document.getElementById("current-streak");
      currentStreakElem.innerHTML = `${userStats.currentStreak}`;

      const maxStreakElem = document.getElementById("max-streak");
      maxStreakElem.innerHTML = `${userStats.maxStreak}`;
    }

    function graphDistribution() {
      console.log("here");
      userStats.winsInNum.forEach((value, index) => {
        const graphElem = document.getElementById(`graph-${index + 1}`);
        if (userStats.numWins === 0) {
          graphElem.style = `width: 5%`;
        } else {
          graphElem.style = `width: ${
            Math.floor((value / userStats.numWins) * 0.95 * 100) + 5
          }%`;
        }
        graphElem.innerHTML = `${value}`;
      });
    }
  }
}

function shakeBox() {
  clearTimeout(shakeTimeout);
  const infoCard = document.getElementById("info-card");
  if (infoCard.classList.contains("animate__headShake")) {
    infoCard.classList.remove("animate__headShake");
  }
  shakeTimeout = setTimeout(
    () => infoCard.classList.add("animate__headShake"),
    100
  );
}

/*
  Finds current game number based off of Costcodle start date
*/

function getGameNumber() {
  const currDate = new Date();
  let timeDifference = currDate.getTime() - costcodleStartDate.getTime();
  let dayDifference = timeDifference / (1000 * 3600 * 24);

  return Math.ceil(dayDifference) + 1;
}

