function goToOak() {
  window.location.href = "oak.html"
}

function goHome() {
  window.location.href = "index.html"
}

// dropdown toggle
const btn = document.querySelector(".dropdown-btn")
const dropdown = document.querySelector(".dropdown")

if (btn) {
  btn.addEventListener("click", () => {
    dropdown.classList.toggle("show")
  })
}
