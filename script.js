
"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const $ = id => document.getElementById(id);

// Game state
let running = false;
let gameOver = false;
let paused = false;
let coins = Number(localStorage.getItem("hillCoins")) || 0;
let best = Number(localStorage.getItem("hillBest")) || 0;
let distance = 0;
let fuel = 100;
let cameraX = 0;
let lastTime = 0;
let accumulator = 0;

const STEP = 1 / 60;
const keys = { gas: false, brake: false };

const upgrades = {
  engine: Number(localStorage.getItem("engine")) || 1,
  tire: Number(localStorage.getItem("tire")) || 1,
  tank: Number(localStorage.getItem("tank")) || 1
};

const car = {
  x: 100,
  y: 260,
  vx: 0,
  vy: 0,
  angle: 0,
  angularVelocity: 0,
  width: 68,
  height: 26,
  grounded: false
};

let items = [];
let particles = [];

function terrain(x) {
  return 355
    + Math.sin(x * 0.002) * 105
    + Math.sin(x * 0.006) * 37
    + Math.cos(x * 0.001) * 55
    + Math.sin(x * 0.0003) * 35;
}

function terrainSlope(x) {
  return Math.atan2(terrain(x + 4) - terrain(x - 4), 8);
}

function generateItems() {
  items = [];

  for (let x = 350; x < 100000; x += 220) {
    const isFuel = Math.floor(x / 220) % 7 === 0;

    items.push({
      x,
      y: terrain(x) - 48,
      type: isFuel ? "fuel" : "coin",
      collected: false
    });
  }
}

function maxFuel() {
  return 100 + (upgrades.tank - 1) * 25;
}

function enginePower() {
  return 0.20 + (upgrades.engine - 1) * 0.045;
}

function updateUI() {
  $("coins").textContent = coins;
  $("score").textContent = distance;
  $("fuelText").textContent = Math.ceil(fuel);
  $("fuelBar").style.width = (fuel / maxFuel() * 100) + "%";

  $("engineLevel").textContent = upgrades.engine;
  $("tireLevel").textContent = upgrades.tire;
  $("tankLevel").textContent = upgrades.tank;

  $("upgradeCost").textContent = upgradeCost();
}

function upgradeCost() {
  return 200;
}

// Particle effects
function particle(x, y, color) {
  particles.push({
    x, y,
    vx: (Math.random() - .5) * 3,
    vy: -Math.random() * 3,
    life: 1,
    color
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vy += .04 * dt * 60;
    p.life -= dt * 1.8;

    if (p.life <= 0) particles.splice(i, 1);
  }
}

// Car physics
function update(dt) {
  if (!running || paused || gameOver) return;

  const oldX = car.x;
  const oldY = car.y;

  const groundedBefore = car.grounded;

  if (keys.gas && fuel > 0) {
    fuel -= .75 * dt * 60;
    car.vx += enginePower() * Math.cos(car.angle) * dt * 60;
    car.vy += enginePower() * Math.sin(car.angle) * dt * 60 * .25;
  }

  if (keys.brake) {
    car.vx -= .13 * Math.cos(car.angle) * dt * 60;

    if (!groundedBefore) {
      car.angularVelocity -= .045 * dt * 60;
    }
  }

  // Gravity and friction
  car.vy += .30 * dt * 60;

  const friction = groundedBefore ? .985 : .998;
  car.vx *= Math.pow(friction, dt * 60);
  car.vy *= Math.pow(.999, dt * 60);

  // Maximum speed
  car.vx = Math.max(-5, Math.min(car.vx, 12 + upgrades.engine));

  car.x += car.vx * dt * 60;
  car.y += car.vy * dt * 60;

  // Wheel-ground collision
  const wheelOffset = 25;
  const wheelRadius = 11;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);

  const wheels = [-wheelOffset, wheelOffset].map(offset => ({
    x: car.x + offset * cos + 12 * sin,
    y: car.y + offset * sin - 12 * cos
  }));

  let contacts = [];

  for (const wheel of wheels) {
    const ground = terrain(wheel.x);

    if (wheel.y + wheelRadius > ground) {
      contacts.push({
        penetration: wheel.y + wheelRadius - ground,
        slope: terrainSlope(wheel.x)
      });
    }
  }

  car.grounded = contacts.length > 0;

  if (contacts.length) {
    const penetration = Math.max(...contacts.map(c => c.penetration));

    car.y -= penetration * .48;
    car.vy = Math.min(car.vy, 0);

    const averageSlope =
      contacts.reduce((sum, c) => sum + c.slope, 0) /
      contacts.length;

    const angleDifference = Math.atan2(
      Math.sin(averageSlope - car.angle),
      Math.cos(averageSlope - car.angle)
    );

    car.angularVelocity += angleDifference * .12;
    car.angularVelocity *= .75;
    car.angle += car.angularVelocity;

    if (Math.abs(car.vx) > 2 && Math.random() < .3) {
      particle(car.x - 20, terrain(car.x), "#bdc3c7");
    }
  } else {
    car.angularVelocity *= .99;
    car.angle += car.angularVelocity;
  }

  // Prevent backwards progress
  car.x = Math.max(50, car.x);

  // Distance
  distance = Math.max(0, Math.floor((car.x - 100) / 10));

  // Camera
  cameraX += (car.x - 250 - cameraX) * .08;

  // Collect coins and fuel
  for (const item of items) {
    if (item.collected) continue;

    const dx = car.x - item.x;
    const dy = car.y - item.y;

    if (Math.hypot(dx, dy) < 40) {
      item.collected = true;

      if (item.type === "coin") {
        coins += 10;
      } else {
        fuel = Math.min(maxFuel(), fuel + 30);
      }

      localStorage.setItem("hillCoins", coins);
    }
  }

  updateParticles(dt);

  // Crash detection
  if (
    Math.abs(car.angle) > 2.25 ||
    car.y > canvas.height + 100 ||
    (Math.abs(car.vx) < .02 && fuel <= 0 && car.y >= terrain(car.x) - 35)
  ) {
    endGame();
  }

  updateUI();
}

// Drawing background
function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, 500);
  sky.addColorStop(0, "#2980b9");
  sky.addColorStop(1, "#d6f1ff");

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 900, 500);

  // Sun
  ctx.fillStyle = "#ffeaa7";
  ctx.beginPath();
  ctx.arc(740, 85, 38, 0, Math.PI * 2);
  ctx.fill();

  // Clouds
  ctx.fillStyle = "#ffffffaa";

  for (let i = -2; i < 6; i++) {
    const x = ((i * 250 - cameraX * .18) % 1250 + 1250) % 1250;

    ctx.beginPath();
    ctx.arc(x, 110, 24, 0, Math.PI * 2);
    ctx.arc(x + 30, 95, 30, 0, Math.PI * 2);
    ctx.arc(x + 60, 110, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant mountains
  ctx.fillStyle = "#729c9a";

  ctx.beginPath();
  ctx.moveTo(0, 360);

  for (let x = 0; x <= 900; x += 20) {
    const worldX = x + cameraX * .35;
    ctx.lineTo(
      x,
      300 + Math.sin(worldX * .003) * 55
      + Math.sin(worldX * .008) * 25
    );
  }

  ctx.lineTo(900, 500);
  ctx.lineTo(0, 500);
  ctx.fill();
}

// Draw terrain
function drawTerrain() {
  ctx.beginPath();

  ctx.moveTo(0, 500);

  for (let x = 0; x <= 940; x += 5) {
    ctx.lineTo(x, terrain(x + cameraX));
  }

  ctx.lineTo(940, 500);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 300, 0, 500);
  gradient.addColorStop(0, "#65d66f");
  gradient.addColorStop(1, "#176b35");

  ctx.fillStyle = gradient;
  ctx.fill();

  // Grass edge
  ctx.strokeStyle = "#b6f58b";
  ctx.lineWidth = 5;
  ctx.stroke();
}

// Coins and fuel
function drawItems() {
  for (const item of items) {
    if (item.collected) continue;

    const screenX = item.x - cameraX;

    if (screenX < -50 || screenX > 950) continue;

    ctx.save();

    if (item.type === "coin") {
      ctx.fillStyle = "#f1c40f";
      ctx.strokeStyle = "#fff0a0";
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.arc(screenX, item.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#9b6500";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("$", screenX, item.y + 4);
    } else {
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(screenX - 9, item.y - 12, 18, 24);

      ctx.fillStyle = "#fff";
      ctx.fillRect(screenX - 4, item.y - 5, 8, 10);
      ctx.fillRect(screenX - 4, item.y - 16, 8, 5);
    }

    ctx.restore();
  }
}

// Draw car
function drawCar() {
  ctx.save();

  ctx.translate(car.x - cameraX, car.y);
  ctx.rotate(car.angle);

  // Shadow
  ctx.fillStyle = "#0004";
  ctx.fillRect(-35, 9, 70, 7);

  // Wheels
  for (const x of [-25, 25]) {
    ctx.fillStyle = "#171717";
    ctx.beginPath();
    ctx.arc(x, 12, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#777";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#bdc3c7";
    ctx.beginPath();
    ctx.arc(x, 12, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(-35, -12, 70, 22);

  // Cabin
  ctx.fillStyle = "#e74c3c";
  ctx.fillRect(-22, -31, 43, 20);

  // Window
  ctx.fillStyle = "#bde8f5";
  ctx.fillRect(-17, -27, 15, 12);
  ctx.fillRect(3, -27, 12, 12);

  // Driver
  ctx.fillStyle = "#f1c40f";
  ctx.beginPath();
  ctx.arc(-2, -17, 7, 0, Math.PI * 2);
  ctx.fill();

  // Headlight
  ctx.fillStyle = "#fff3a0";
  ctx.fillRect(30, -6, 7, 7);

  ctx.restore();
}

// Draw particles
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;

    ctx.beginPath();
    ctx.arc(p.x - cameraX, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();
  drawTerrain();
  drawItems();
  drawParticles();
  drawCar();
}

// Main game loop
function loop(timestamp) {
  const elapsed = Math.min((timestamp - lastTime) / 1000 || 0, .05);
  lastTime = timestamp;

  if (running && !paused && !gameOver) {
    accumulator += elapsed;

    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
  }

  draw();
  requestAnimationFrame(loop);
}

function startGame() {
  if (running) return;

  $("startScreen").classList.add("hidden");
  $("gameOver").classList.add("hidden");

  running = true;
  paused = false;
  gameOver = false;

  lastTime = performance.now();
  accumulator = 0;
}

function endGame() {
  if (gameOver) return;

  gameOver = true;
  running = false;
  keys.gas = false;
  keys.brake = false;

  best = Math.max(best, distance);

  localStorage.setItem("hillBest", best);
  localStorage.setItem("hillCoins", coins);

  $("finalScore").textContent = distance;
  $("gameOver").classList.remove("hidden");
}

function restartGame() {
  car.x = 100;
  car.y = 260;
  car.vx = 0;
  car.vy = 0;
  car.angle = 0;
  car.angularVelocity = 0;
  car.grounded = false;

  fuel = maxFuel();
  distance = 0;
  cameraX = 0;

  particles = [];
  generateItems();
  updateUI();

  running = false;
  gameOver = false;
  paused = false;

  $("gameOver").classList.add("hidden");
  startGame();
}

// Pause
$("pauseBtn").addEventListener("click", () => {
  if (!running || gameOver) return;

  paused = !paused;
  $("pauseBtn").textContent = paused ? "▶" : "Ⅱ";

  keys.gas = false;
  keys.brake = false;
});

// Buttons
$("startBtn").addEventListener("click", startGame);
$("restartBtn").addEventListener("click", restartGame);

// Keyboard
window.addEventListener("keydown", e => {
  if (e.code === "ArrowRight" || e.code === "KeyD") {
    keys.gas = true;
    e.preventDefault();
  }

  if (e.code === "ArrowLeft" || e.code === "KeyA") {
    keys.brake = true;
    e.preventDefault();
  }

  if (e.code === "Space") {
    e.preventDefault();

    if (!running) startGame();
    else if (!gameOver) {
      paused = !paused;
      $("pauseBtn").textContent = paused ? "▶" : "Ⅱ";
    }
  }
});

window.addEventListener("keyup", e => {
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.gas = false;
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.brake = false;
});

function bindControl(id, key) {
  const button = $(id);

  button.addEventListener("pointerdown", e => {
    e.preventDefault();
    keys[key] = true;
    button.setPointerCapture(e.pointerId);
  });

  const release = e => {
    e.preventDefault();
    keys[key] = false;
  };

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", () => {
    keys[key] = false;
  });
}

bindControl("gasBtn", "gas");
bindControl("brakeBtn", "brake");

// Upgrade system
function buyUpgrade(type) {
  if (upgrades[type] >= 10) {
    alert("সর্বোচ্চ আপগ্রেড লেভেল পৌঁছে গেছ!");
    return;
  }

  const cost = upgradeCost();

  if (coins < cost) {
    alert("পর্যাপ্ত কয়েন নেই! আরও কয়েন সংগ্রহ করো।");
    return;
  }

  coins -= cost;
  upgrades[type]++;

  localStorage.setItem(type, upgrades[type]);
  localStorage.setItem("hillCoins", coins);

  if (type === "tank") {
    fuel = Math.min(maxFuel(), fuel + 25);
  }

  updateUI();
}

$("engineBtn").addEventListener("click", () => buyUpgrade("engine"));
$("tireBtn").addEventListener("click", () => buyUpgrade("tire"));
$("fuelBtn").addEventListener("click", () => buyUpgrade("tank"));

// Initial setup
fuel = maxFuel();
generateItems();
updateUI();

requestAnimationFrame(loop);
