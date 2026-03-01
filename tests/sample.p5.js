// P5.js Sample — Perlin Noise Flow Field

let cols, rows;
const scl = 20;
let zoff = 0;
const particles = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  cols = floor(width / scl);
  rows = floor(height / scl);
  colorMode(HSB, 360, 100, 100, 100);
  background(220, 20, 10);

  for (let i = 0; i < 800; i++) {
    particles.push(new Particle());
  }
}

function draw() {
  background(220, 20, 10, 8);

  const field = [];
  let yoff = 0;
  for (let y = 0; y < rows; y++) {
    let xoff = 0;
    for (let x = 0; x < cols; x++) {
      const angle = noise(xoff, yoff, zoff) * TWO_PI * 4;
      const v = p5.Vector.fromAngle(angle);
      v.setMag(1);
      field[x + y * cols] = v;
      xoff += 0.1;
    }
    yoff += 0.1;
  }
  zoff += 0.003;

  for (const p of particles) {
    p.follow(field);
    p.update();
    p.edges();
    p.show();
  }
}

class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.maxspeed = 4;
    this.hue = random(180, 280);
    this.alpha = random(40, 80);
  }

  follow(field) {
    const x = floor(this.pos.x / scl);
    const y = floor(this.pos.y / scl);
    const idx = constrain(x + y * cols, 0, field.length - 1);
    const force = field[idx];
    this.acc.add(force);
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxspeed);
    this.pos.add(this.vel);
    this.acc.mult(0);
  }

  edges() {
    if (this.pos.x > width)  this.pos.x = 0;
    if (this.pos.x < 0)      this.pos.x = width;
    if (this.pos.y > height) this.pos.y = 0;
    if (this.pos.y < 0)      this.pos.y = height;
  }

  show() {
    stroke(this.hue, 80, 100, this.alpha);
    strokeWeight(1.5);
    point(this.pos.x, this.pos.y);
  }
}
