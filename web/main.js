function goToOak() {
  window.location.href = "oak.html";
}

function goHome() {
  window.location.href = "index.html";
}

const scene = document.querySelector(".parallax-scene");
const layers = document.querySelectorAll(".layer");

const springEls = document.querySelectorAll(".season-spring");
const summerEls = document.querySelectorAll(".season-summer");
const autumnEls = document.querySelectorAll(".season-autumn");
const winterEls = document.querySelectorAll(".season-winter");

function applyOpacity(nodes, value) {
  nodes.forEach(n => (n.style.opacity = value));
}

window.addEventListener("scroll", () => {
  const rect = scene.getBoundingClientRect();
  const sceneHeight = scene.offsetHeight - window.innerHeight;

  const scrolled = Math.min(Math.max(-rect.top, 0), sceneHeight);
  const progress = scrolled / sceneHeight;

  // parallax movement
  layers.forEach(layer => {
    const speed = parseFloat(layer.dataset.speed || 0);
    const offset = Math.min(scrolled * speed, 120);
    layer.style.transform = `translateY(${offset}px)`;
  });

  // reset all
  applyOpacity(springEls, 0);
  applyOpacity(summerEls, 0);
  applyOpacity(autumnEls, 0);
  applyOpacity(winterEls, 0);

  // spring -> summer -> autumn -> winter
  if (progress < 0.33) {
    const t = progress / 0.33;
    applyOpacity(springEls, 1 - t);
    applyOpacity(summerEls, t);
  } else if (progress < 0.66) {
    const t = (progress - 0.33) / 0.33;
    applyOpacity(summerEls, 1 - t);
    applyOpacity(autumnEls, t);
  } else {
    const t = (progress - 0.66) / 0.34;
    applyOpacity(autumnEls, 1 - t);
    applyOpacity(winterEls, t);
  }
});