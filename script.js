const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lb-img');
const lbCounter = document.getElementById('lb-counter');
const btnPrev = document.getElementById('lb-prev');
const btnNext = document.getElementById('lb-next');

let currentImages = [];
let currentIndex = 0;

function attachGalleryListeners() {
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', function () {
      const galleryData = this.getAttribute('data-gallery');
      if (galleryData) {
        currentImages = galleryData.split(',');
        currentIndex = 0;
        updateLightbox();
        lightbox.classList.add('active');
      }
    });
  });
}
attachGalleryListeners();

const headerEl = document.querySelector('header');

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', function (e) {
    const targetId = this.getAttribute('href');
    if (!targetId || targetId === '#') return;

    const target = document.querySelector(targetId);
    if (!target) return;

    e.preventDefault();
    const headerHeight = headerEl ? headerEl.offsetHeight : 0;
    const targetTop = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10;

    window.scrollTo({ top: targetTop, behavior: 'smooth' });
  });
});

function loadContent(attempt = 1, maxAttempts = 5) {
  fetch('content.json', { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('content.json: HTTP ' + res.status);
      return res.json();
    })
    .then(applyContent)
    .catch(err => {
      console.warn('Błąd wczytywania content.json (próba ' + attempt + '/' + maxAttempts + ').', err);
      if (attempt < maxAttempts) {
        setTimeout(() => loadContent(attempt + 1, maxAttempts), attempt * 1000);
      } else {
        showGalleryStatus('Nie udało się wczytać galerii. Sprawdź połączenie z internetem.', true);
      }
    });
}
loadContent();

window.addEventListener('online', () => {
  const marquee = document.getElementById('marquee');
  if (marquee && marquee.querySelector('.marquee-status')) {
    loadContent();
  }
});

function showGalleryStatus(message, showRetry) {
  const marquee = document.getElementById('marquee');
  if (!marquee) return;

  marquee.innerHTML = '<p class="marquee-status">' + message +
    (showRetry ? ' <a href="#" id="marquee-retry-link" style="color:var(--accent);text-decoration:underline;">Spróbuj ponownie</a>' : '') +
    '</p>';

  const link = document.getElementById('marquee-retry-link');
  if (link) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showGalleryStatus('Wczytuję galerię...');
      loadContent();
    });
  }
}

function applyContent(data) {
  if (data.hero && data.hero.background) {
    const hero = document.getElementById('hero');
    hero.style.background =
      "linear-gradient(to right, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.6) 100%), url('" + data.hero.background + "') center/cover fixed";
  }

  if (data.about) {
    const aboutImg = document.querySelector('.about-photo-img');
    if (aboutImg) {
      if (data.about.photo) aboutImg.src = data.about.photo;
      if (data.about.photoAlt) aboutImg.alt = data.about.photoAlt;
    }
  }

  if (Array.isArray(data.gallery) && data.gallery.length > 0) {
    buildGallery(data.gallery);
  } else {
    showGalleryStatus('Brak zdjęć w content.json (pusta lub brakująca sekcja "gallery").');
  }
}

const brokenThumbs = [];

function loadThumb(img, div, originalSrc, attempt = 1, extTried = false) {
  const maxRetries = 3;

  img.onerror = () => {
    if (attempt <= maxRetries) {
      setTimeout(() => loadThumb(img, div, originalSrc, attempt + 1, extTried), attempt * 700);
    } else if (!extTried) {
      // ostatnia deska ratunku - część zdjęć w content.json bywa podpięta z inną naprawdę istniejącą wersją pliku pod .jpg
      loadThumb(img, div, originalSrc.replace(/\.[a-zA-Z0-9]+$/, ".jpg"), 1, true);
    } else {
      img.classList.add('thumb-error');
      div.classList.add('thumb-broken');
      brokenThumbs.push({ img, div, originalSrc });
    }
  };

  img.onload = () => {
    img.classList.remove('thumb-error');
    div.classList.remove('thumb-broken');
  };

  // parametr retry= wymusza pominięcie zbuforowanego w przeglądarce błędu przy kolejnej próbie tego samego adresu
  img.src = attempt > 1
    ? originalSrc + (originalSrc.includes('?') ? '&' : '?') + 'retry=' + attempt
    : originalSrc;
}

window.addEventListener('online', () => {
  while (brokenThumbs.length) {
    const { img, div, originalSrc } = brokenThumbs.pop();
    img.classList.remove('thumb-error');
    div.classList.remove('thumb-broken');
    loadThumb(img, div, originalSrc);
  }
});

function buildGallery(items) {
  const marquee = document.getElementById('marquee');
  if (!marquee) return;
  marquee.innerHTML = '';

  // dwa identyczne pasy obok siebie dają efekt nieskończonej karuzeli w CSS (patrz .marquee-content w media query dla telefonu)
  for (let copy = 0; copy < 2; copy++) {
    const row = document.createElement('div');
    row.className = 'marquee-content';

    items.forEach(item => {
      if (!item.thumb) return;
      const gallery = Array.isArray(item.images) && item.images.length > 0
        ? item.images
        : [item.thumb];

      const div = document.createElement('div');
      div.className = 'gallery-item';
      div.setAttribute('data-gallery', gallery.join(','));

      const img = document.createElement('img');
      img.alt = item.alt || '';
      img.decoding = 'async';
      img.width = 380;
      img.height = 260;
      loadThumb(img, div, item.thumb);

      div.appendChild(img);
      row.appendChild(div);
    });

    marquee.appendChild(row);
  }

  attachGalleryListeners();
}

function updateLightbox() {
  const src = currentImages[currentIndex].trim();
  lbCounter.innerText = (currentIndex + 1) + " / " + currentImages.length;
  btnPrev.style.display = currentImages.length > 1 ? 'block' : 'none';
  btnNext.style.display = currentImages.length > 1 ? 'block' : 'none';
  loadLightboxImage(src);
  preloadNeighbors();
}

let lbLoadToken = 0;
let lbTimeoutId = null;

function loadLightboxImage(src) {
  // token zabezpiecza przed sytuacją, w której user zdąży kliknąć dalej zanim poprzednie zdjęcie się doładuje
  const token = ++lbLoadToken;
  clearTimeout(lbTimeoutId);

  lightbox.classList.remove('lb-error-state');
  lightbox.classList.add('lb-loading');
  lbImg.classList.add('lb-hidden');

  const loader = new Image();

  loader.onload = () => {
    if (token !== lbLoadToken) return;
    clearTimeout(lbTimeoutId);
    lbImg.src = src;
    lbImg.classList.remove('lb-hidden');
    lightbox.classList.remove('lb-loading');
  };

  loader.onerror = () => {
    if (!loader.dataset.retried) {
      loader.dataset.retried = "true";
      loader.src = loader.src.replace(/\.[a-zA-Z0-9]+$/, ".jpg");
    } else {
      if (token !== lbLoadToken) return;
      clearTimeout(lbTimeoutId);
      lightbox.classList.remove('lb-loading');
      lightbox.classList.add('lb-error-state');
    }
  };

  lbTimeoutId = setTimeout(() => {
    if (token !== lbLoadToken) return;
    lightbox.classList.remove('lb-loading');
    lightbox.classList.add('lb-error-state');
  }, 15000);

  loader.src = src;
}

function preloadNeighbors() {
  if (currentImages.length <= 1) return;
  const nextSrc = currentImages[(currentIndex + 1) % currentImages.length].trim();
  const prevSrc = currentImages[(currentIndex - 1 + currentImages.length) % currentImages.length].trim();

  [nextSrc, prevSrc].forEach(src => {
    const pre = new Image();
    pre.src = src;
  });
}

btnNext.addEventListener('click', (e) => {
  e.stopPropagation();
  currentIndex = (currentIndex + 1) % currentImages.length;
  updateLightbox();
});

btnPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
  updateLightbox();
});

document.getElementById('lb-close').addEventListener('click', () => {
  lightbox.classList.remove('active');
});

lightbox.addEventListener('click', (e) => {
  if (e.target !== lbImg && e.target !== btnNext && e.target !== btnPrev) {
    lightbox.classList.remove('active');
  }
});

function reveal() {
  var reveals = document.querySelectorAll(".reveal");
  for (var i = 0; i < reveals.length; i++) {
    var windowHeight = window.innerHeight;
    var elementTop = reveals[i].getBoundingClientRect().top;
    if (elementTop < windowHeight - 100) { reveals[i].classList.add("active"); }
  }
}
window.addEventListener("scroll", reveal);
reveal();
