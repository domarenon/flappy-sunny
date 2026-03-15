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
let topPipeImg;
let bottomPipeImg;
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
let birdY = boardHeight / 2;
let pipeWidth = 35;
let pipeGap = 150;
let pipeArray = [];
let pipeIntervalId;

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

    velocityX = -3.5 * scale;
    gravity = 0.3 * scale;
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

function createPipes() {
    let maxTopPipeHeight = boardHeight - pipeGap - 50;
    let topPipeHeight = Math.floor(Math.random() * maxTopPipeHeight);
    let bottomPipeHeight = boardHeight - topPipeHeight - pipeGap;

    let topPipe = {
        x: boardWidth,
        y: 0,
        width: pipeWidth,
        height: topPipeHeight,
        img: topPipeImg,
        passed: false
    };

    let bottomPipe = {
        x: boardWidth,
        y: topPipeHeight + pipeGap,
        width: pipeWidth,
        height: bottomPipeHeight,
        img: bottomPipeImg,
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

    topPipeImg = new Image();
    topPipeImg.src = "./Images/TroncoArriba.png";

    bottomPipeImg = new Image();
    bottomPipeImg.src = "./Images/TroncoAbajo.png";

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

function update() {
    requestAnimationFrame(update);
    context.clearRect(0, 0, board.width, board.height);

    if (currentState === GAME_STATE.MENU) {
        renderMenu();
    } else if (currentState === GAME_STATE.PLAYING) {
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

function renderGame() {
    velocityY += gravity;
    bird.y = Math.max(bird.y + velocityY, 0);
    context.drawImage(birdImg, bird.x, bird.y, bird.width, bird.height);

    if (bird.y > board.height) {
        currentState = GAME_STATE.GAME_OVER;
    }

    for (let i = 0; i < pipeArray.length; i++) {
        let pipe = pipeArray[i];
        pipe.x += velocityX;

        context.drawImage(pipe.img, pipe.x, pipe.y, pipe.width, pipe.height);

        if (!pipe.passed && bird.x > pipe.x + pipe.width) {
            score += 0.5;
            pipe.passed = true;
        }

        if (detectCollision(bird, pipe)) {
            currentState = GAME_STATE.GAME_OVER;
        }
    }

    while (pipeArray.length > 0 && pipeArray[0].x < -pipeWidth) {
        pipeArray.shift();
    }

    context.fillStyle = "white";
    context.font = "45px sans-serif";
    context.textAlign = "left";
    context.fillText(Math.floor(score), 5, 45);
}

function renderGameOver() {
    if (gameOverImg.complete) {
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
            velocityY = -6;
        }
    }
}

document.addEventListener("keydown", handleKeyDown);

function startGame() {
    currentState = GAME_STATE.PLAYING;
    resizeBoard();
    bird.y = birdY;
    velocityY = 0;
    pipeArray = [];
    score = 0;
    formVisible = false;

    if (pipeIntervalId) {
        clearInterval(pipeIntervalId);
    }

    pipeIntervalId = setInterval(placePipes, 1500);
}

function resetGame() {
    bird.y = birdY;
    pipeArray = [];
    score = 0;
    formVisible = false;
    const form = document.getElementById("record-form");
    if (form) form.remove();
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
        <input type="text" id="record-name" placeholder="Your name"/><br/><br/>
        <input type="text" id="record-id" placeholder="Your ID"/><br/><br/>
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
                body: JSON.stringify({ name, id, score: Math.floor(score) })
            });

            if (res.ok) {
                alert("Record saved!");
                formVisible = false;
                deleteForm();
                await fetchHighScore();
                resetGame();
                currentState = GAME_STATE.MENU;
            } else {
                alert("Failed to save record.");
            }
        } catch (err) {
            console.error("Error saving record:", err);
            alert("Error saving record.");
        }
    });
}
