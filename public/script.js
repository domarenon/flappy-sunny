// FlappySunny - script.js

const BASE_BOARD_WIDTH = 360;
const BASE_BOARD_HEIGHT = 640;
const BOARD_ASPECT_RATIO = BASE_BOARD_WIDTH / BASE_BOARD_HEIGHT;

let boardWidth = BASE_BOARD_WIDTH;
let boardHeight = BASE_BOARD_HEIGHT;
let backgroundImg = new Image();
backgroundImg.src = "./Images/flappysunnybg.png";
let inputLocked = false;
let touchLocked = false;
let board;
let context;
let birdImg;
let pipeImages;
let playButtonImg;

let score = 0;
let highScoreData = null;
let formVisible = false;

let GAME_STATE = {
    MENU: "menu",
    PLAYING: "playing",
    GAME_OVER: "gameOver"
};
let currentState = GAME_STATE.MENU;

let playButton = {
    x: boardWidth / 2 - 115.5 / 2,
    y: boardHeight / 2 - 64 / 2,
    width: 115,
    height: 64
};

let logo = {
    x: boardWidth / 2 - 300 / 2,
    y: boardHeight / 4,
    width: 300,
    height: 100
};

let flappyBirdTextImg = new Image();
flappyBirdTextImg.src = "./Images/flappySunnyLogo.png";

let gameOverImg = new Image();
gameOverImg.src = "./Images/flappy-gameover.png";

let bird = {
    x: 50,
    y: boardHeight / 2,
    width: 45,
    height: 45
};

let velocityY = 0;
let velocityX = -3.5;
let gravity = 0.3;
let flapStrength = 6;
let birdY = boardHeight / 2;
let pipeWidth = 35;
let pipeGap = 150;
let pipeArray = [];
let pipeIntervalId;
let previousGapCenterY = null;
let maxGapShift = 400;
let gameStartedAt = null;
let gameEndedAt = null;
let gameSessionId = null;
let isStartingGame = false;
let lastFrameTime = null;
let pendingFlap = false;
let smoothedDeltaSeconds = 1 / 60;
let hasFetchedHighScoreOnGameOver = false;
const MAX_FRAME_DELTA_SECONDS = 1 / 30;
const DELTA_SMOOTHING_FACTOR = 0.15;
const MAX_BIRD_TILT_DEGREES = 30;
const MAX_BIRD_FALL_SPEED_FOR_TILT = 450;

function getCanvasPointerPosition(clientX, clientY) {
    const rect = board.getBoundingClientRect();
    const scaleX = board.width / rect.width;
    const scaleY = board.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function isInsidePlayButton(x, y) {
    return (
        x >= playButton.x &&
        x <= playButton.x + playButton.width &&
        y >= playButton.y &&
        y <= playButton.y + playButton.height
    );
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getBirdRotationRadians() {
    const normalizedVelocity = clamp(
        velocityY / MAX_BIRD_FALL_SPEED_FOR_TILT,
        -1,
        1
    );
    const angleDegrees = normalizedVelocity * MAX_BIRD_TILT_DEGREES;
    return angleDegrees * (Math.PI / 180);
}

function drawBird() {
    const centerX = bird.x + bird.width / 2;
    const centerY = bird.y + bird.height / 2;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(getBirdRotationRadians());
    context.drawImage(
        birdImg,
        -bird.width / 2,
        -bird.height / 2,
        bird.width,
        bird.height
    );
    context.restore();
}

function resizeBoard() {
    const previousWidth = boardWidth;
    const previousHeight = boardHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    boardWidth = viewportWidth;
    boardHeight = boardWidth / BOARD_ASPECT_RATIO;

    if (boardHeight > viewportHeight) {
        boardHeight = viewportHeight;
        boardWidth = boardHeight * BOARD_ASPECT_RATIO;
    }

    const scale = boardWidth / BASE_BOARD_WIDTH;
    const widthRatio = previousWidth ? boardWidth / previousWidth : 1;
    const heightRatio = previousHeight ? boardHeight / previousHeight : 1;

    playButton.width = 115 * scale;
    playButton.height = 64 * scale;
    playButton.x = boardWidth / 2 - playButton.width / 2;
    playButton.y = boardHeight / 2 - playButton.height / 2;

    logo.width = 300 * scale;
    logo.height = 100 * scale;
    logo.x = boardWidth / 2 - logo.width / 2;
    logo.y = boardHeight / 4;

    bird.x = currentState === GAME_STATE.PLAYING ? bird.x * widthRatio : 50 * scale;
    bird.y = currentState === GAME_STATE.PLAYING ? bird.y * heightRatio : boardHeight / 2;
    bird.width = 45 * scale;
    bird.height = 45 * scale;
    birdY = boardHeight / 2;

    if (currentState !== GAME_STATE.PLAYING) {
        bird.y = birdY;
    }

    velocityX = -210 * scale;
    gravity = 1080 * scale;
    flapStrength = 360 * scale;
    velocityY *= heightRatio;
    pipeWidth = 35 * scale;
    pipeGap = 150 * scale;

    pipeArray = pipeArray.map((pipe) => ({
        ...pipe,
        x: pipe.x * widthRatio,
        y: pipe.y * heightRatio,
        width: pipeWidth,
        height: pipe.height * heightRatio
    }));

    if (board) {
        board.width = Math.round(boardWidth);
        board.height = Math.round(boardHeight);
        board.style.width = `${Math.round(boardWidth)}px`;
        board.style.height = `${Math.round(boardHeight)}px`;
    }
}

function placePipes() {
    createPipes();
}

function getPipeVariantByHeight(height, maxHeight, variants) {
    const ratio = maxHeight > 0 ? height / maxHeight : 0;

    if (ratio > 0.66) {
        return variants.large;
    }

    if (ratio > 0.33) {
        return variants.medium;
    }

    return variants.small;
}

function createPipes() {
    let maxTopPipeHeight = boardHeight - pipeGap - 50;
    let minTopPipeHeight = 50;
    let topPipeHeight;

    if (previousGapCenterY === null) {
        topPipeHeight = Math.floor(Math.random() * (maxTopPipeHeight - minTopPipeHeight + 1)) + minTopPipeHeight;
    } else {
        const minGapCenterY = minTopPipeHeight + pipeGap / 2;
        const maxGapCenterY = boardHeight - 50 - pipeGap / 2;
        const minAllowedGapCenterY = Math.max(minGapCenterY, previousGapCenterY - maxGapShift);
        const maxAllowedGapCenterY = Math.min(maxGapCenterY, previousGapCenterY + maxGapShift);
        const nextGapCenterY = Math.random() * (maxAllowedGapCenterY - minAllowedGapCenterY) + minAllowedGapCenterY;

        topPipeHeight = Math.round(nextGapCenterY - pipeGap / 2);
    }

    let bottomPipeHeight = boardHeight - topPipeHeight - pipeGap;
    let maxBottomPipeHeight = maxTopPipeHeight;
    previousGapCenterY = topPipeHeight + pipeGap / 2;

    let topPipeImage = getPipeVariantByHeight(topPipeHeight, maxTopPipeHeight, pipeImages.top);
    let bottomPipeImage = getPipeVariantByHeight(bottomPipeHeight, maxBottomPipeHeight, pipeImages.bottom);

    let topPipe = {
        x: boardWidth,
        y: 0,
        width: pipeWidth,
        height: topPipeHeight,
        img: topPipeImage,
        passed: false
    };

    let bottomPipe = {
        x: boardWidth,
        y: topPipeHeight + pipeGap,
        width: pipeWidth,
        height: bottomPipeHeight,
        img: bottomPipeImage,
        passed: false
    };
    pipeArray.push(topPipe, bottomPipe);
}

window.onload = async function () {
    board = document.getElementById("board");
    context = board.getContext("2d");
    resizeBoard();

    birdImg = new Image();
    birdImg.src = "./Images/Sunny.png";

    pipeImages = {
        top: {
            small: new Image(),
            medium: new Image(),
            large: new Image()
        },
        bottom: {
            small: new Image(),
            medium: new Image(),
            large: new Image()
        }
    };
    pipeImages.top.small.src = "./Images/TroncoArriba.png";
    pipeImages.top.medium.src = "./Images/TroncoArribaM.png";
    pipeImages.top.large.src = "./Images/TroncoArribaL.png";
    pipeImages.bottom.small.src = "./Images/TroncoAbajo.png";
    pipeImages.bottom.medium.src = "./Images/TroncoAbajoM.png";
    pipeImages.bottom.large.src = "./Images/TroncoAbajoL.png";

    playButtonImg = new Image();
    playButtonImg.src = "./Images/flappyBirdPlayButton.png";

    await fetchHighScore();
    requestAnimationFrame(update);
};

window.addEventListener("resize", resizeBoard);

async function fetchHighScore() {
    try {
        const res = await fetch("/high-score");
        const data = await res.json();
        highScoreData = data;
    } catch (err) {
        console.error("Failed to load high score:", err);
    }
}

async function createGameSession() {
    const res = await fetch("/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) {
        throw new Error("Failed to create game session.");
    }

    const data = await res.json();
    gameSessionId = data.sessionId;
}

function update(timestamp) {
    requestAnimationFrame(update);
    if (lastFrameTime === null) {
        lastFrameTime = timestamp;
    }

    const rawDeltaSeconds = Math.min((timestamp - lastFrameTime) / 1000, MAX_FRAME_DELTA_SECONDS);
    lastFrameTime = timestamp;
    smoothedDeltaSeconds += (rawDeltaSeconds - smoothedDeltaSeconds) * DELTA_SMOOTHING_FACTOR;

    context.clearRect(0, 0, board.width, board.height);

    if (currentState === GAME_STATE.MENU) {
        renderMenu();
    } else if (currentState === GAME_STATE.PLAYING) {
        updateGame(smoothedDeltaSeconds);
        renderGame();
    } else if (currentState === GAME_STATE.GAME_OVER) {
        renderGameOver();
    }
}

function renderMenu() {
    if (backgroundImg.complete) {
        context.drawImage(backgroundImg, 0, 0, boardWidth, boardHeight);
    }

    if (playButtonImg.complete) {
        context.drawImage(playButtonImg, playButton.x, playButton.y, playButton.width, playButton.height);
    }

    if (flappyBirdTextImg.complete) {
        let scaledWidth = logo.width;
        let scaledHeight = (flappyBirdTextImg.height / flappyBirdTextImg.width) * scaledWidth;
        context.drawImage(flappyBirdTextImg, logo.x, logo.y, scaledWidth, scaledHeight);
    }

    if (highScoreData) {
        context.fillStyle = "white";
        context.font = "18px sans-serif";
        context.textAlign = "center";
        context.fillText(`High Score: ${highScoreData.score} (${highScoreData.name})`, boardWidth / 2, boardHeight - 230);
    }
}

function updateGame(deltaSeconds) {
    if (currentState !== GAME_STATE.PLAYING) {
        return;
    }

    if (pendingFlap) {
        velocityY = -flapStrength;
        pendingFlap = false;
    }

    velocityY += gravity * deltaSeconds;
    bird.y = Math.max(bird.y + velocityY * deltaSeconds, 0);

    if (bird.y > board.height) {
        enterGameOverState();
        return;
    }

    for (let i = 0; i < pipeArray.length; i++) {
        let pipe = pipeArray[i];
        pipe.x += velocityX * deltaSeconds;

        if (!pipe.passed && bird.x > pipe.x + pipe.width) {
            score += 0.5;
            pipe.passed = true;
        }

        if (detectCollision(bird, pipe)) {
            enterGameOverState();
            return;
        }
    }

    while (pipeArray.length > 0 && pipeArray[0].x < -pipeWidth) {
        pipeArray.shift();
    }
}

function renderGame() {
    drawBird();

    for (let i = 0; i < pipeArray.length; i++) {
        let pipe = pipeArray[i];
        context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);
    }

    context.fillStyle = "white";
    context.font = "45px sans-serif";
    context.textAlign = "left";
    context.fillText(Math.floor(score), 5, 45);
}

function renderGameOver() {
    if (gameOverImg.complete) {
        if (!hasFetchedHighScoreOnGameOver) {
            hasFetchedHighScoreOnGameOver = true;
            fetchHighScore();
        }

        let imgWidth = 400;
        let imgHeight = 80;
        let x = (boardWidth - imgWidth) / 2;
        let y = boardHeight / 3;

        context.drawImage(gameOverImg, x, y, imgWidth, imgHeight);

        let scoreText = `Your score: ${Math.floor(score)}`;
        context.fillStyle = "white";
        context.font = "45px sans-serif";
        context.textAlign = "center";
        context.fillText(scoreText, boardWidth / 2, y + imgHeight + 50);

        if (!formVisible && highScoreData && Math.floor(score) > highScoreData.score) {
            formVisible = true;
            showNewRecordForm();
        }

        inputLocked = true;
        touchLocked = true;

        setTimeout(() => {
            inputLocked = false;
        }, 1000);

        setTimeout(() => {
            touchLocked = false;
        }, 1000);
    }
}

function handleKeyDown(e) {
    if (inputLocked) return;

    if (e.code === "Space") {
        if (currentState === GAME_STATE.MENU) {
            startGame();
        } else if (currentState === GAME_STATE.GAME_OVER && !formVisible) {
            resetGame();
            currentState = GAME_STATE.MENU;
        } else if (currentState === GAME_STATE.PLAYING) {
            pendingFlap = true;
        }
    }
}

document.addEventListener("keydown", handleKeyDown);

function enterGameOverState() {
    if (currentState === GAME_STATE.GAME_OVER) {
        return;
    }

    currentState = GAME_STATE.GAME_OVER;
    gameEndedAt = Date.now();
    pendingFlap = false;
    hasFetchedHighScoreOnGameOver = false;

    if (pipeIntervalId) {
        clearInterval(pipeIntervalId);
        pipeIntervalId = null;
    }
}

async function startGame() {
    if (isStartingGame) {
        return;
    }

    isStartingGame = true;

    try {
        await createGameSession();
    } catch (err) {
        console.error("Error creating game session:", err);
        alert("Could not start the game. Please try again.");
        isStartingGame = false;
        return;
    }

    currentState = GAME_STATE.PLAYING;
    resizeBoard();
    lastFrameTime = null;
    pendingFlap = false;
    smoothedDeltaSeconds = 1 / 60;
    bird.y = birdY;
    velocityY = 0;
    pipeArray = [];
    score = 0;
    formVisible = false;
    previousGapCenterY = null;
    gameStartedAt = Date.now();
    gameEndedAt = null;
    hasFetchedHighScoreOnGameOver = false;

    if (pipeIntervalId) {
        clearInterval(pipeIntervalId);
    }

    pipeIntervalId = setInterval(placePipes, 1500);
    isStartingGame = false;
}

function resetGame() {
    bird.y = birdY;
    pipeArray = [];
    score = 0;
    formVisible = false;
    previousGapCenterY = null;
    gameStartedAt = null;
    gameEndedAt = null;
    gameSessionId = null;
    isStartingGame = false;
    lastFrameTime = null;
    pendingFlap = false;
    smoothedDeltaSeconds = 1 / 60;
    hasFetchedHighScoreOnGameOver = false;

    if (pipeIntervalId) {
        clearInterval(pipeIntervalId);
        pipeIntervalId = null;
    }

    const form = document.getElementById("record-form");
    if (form) form.remove();
}

function getGameDurationMs() {
    if (!gameStartedAt) {
        return 0;
    }

    const finishedAt = gameEndedAt || Date.now();
    return Math.max(0, finishedAt - gameStartedAt);
}

function deleteForm() {
    const form = document.querySelector('#record-form');
    form.remove();
}

function detectCollision(a, b) {
    return a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
}

function showNewRecordForm() {
    const container = document.createElement("div");
    container.id = "record-form";
    container.style.position = "absolute";
    container.style.top = "50%";
    container.style.left = "50%";
    container.style.transform = "translate(-50%, -50%)";
    container.style.background = "rgba(0,0,0,0.85)";
    container.style.padding = "20px";
    container.style.borderRadius = "10px";
    container.style.color = "white";
    container.style.textAlign = "center";

    container.innerHTML = `
        <h3>🎉 New Record!</h3>
        <p>Score: ${Math.floor(score)}</p>
        <input type="text" id="record-name" placeholder="Name"/><br/><br/>
        <input type="text" id="record-id" placeholder="Cedula"/><br/><br/>
        <button id="submit-record">Submit</button>
    `;

    document.body.appendChild(container);
    document.getElementById("submit-record").addEventListener("click", async () => {
        const name = document.getElementById("record-name").value.trim();
        const id = document.getElementById("record-id").value.trim();

        if (!name || !id) {
            alert("Name and ID required.");
            return;
        }

        try {
            const res = await fetch("/save-record", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    id,
                    score: Math.floor(score),
                    durationMs: getGameDurationMs(),
                    sessionId: gameSessionId
                })
            });

            if (res.ok) {
                alert("Record saved!");
                formVisible = false;
                deleteForm();
                await fetchHighScore();
                resetGame();
                currentState = GAME_STATE.MENU;
            } else {
                const errorData = await res.json().catch(() => null);
                alert(errorData?.error || "Failed to save record.");
            }
        } catch (err) {
            console.error("Error saving record:", err);
            alert("Error saving record.");
        }
    });
}
