(function () {
  'use strict';

  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbCounter = document.getElementById('lb-counter');
  const btnPrev = document.getElementById('lb-prev');
  const btnNext = document.getElementById('lb-next');
  const btnClose = document.getElementById('lb-close');

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
    if (!data || typeof data !== 'object') {
      showGalleryStatus('Nieprawidłowy format danych galerii (content.json).');
      return;
    }

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
        img.loading = 'lazy';
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

  btnClose.addEventListener('click', () => {
    lightbox.classList.remove('active');
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target !== lbImg && e.target !== btnNext && e.target !== btnPrev) {
      lightbox.classList.remove('active');
    }
  });

  [btnClose, btnPrev, btnNext].forEach(btn => {
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') lightbox.classList.remove('active');
    if (e.key === 'ArrowRight') btnNext.click();
    if (e.key === 'ArrowLeft') btnPrev.click();
  });

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -100px 0px' });

    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('active'));
  }

  // --- Cookie consent + GA4 (Google Consent Mode v2) ---
  const GA_MEASUREMENT_ID = 'G-HR128KBRGS'; 

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied'
  });

  function loadGA4Script() {
    if (window.gtagScriptLoaded) return;
    window.gtagScriptLoaded = true;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(script);

    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
  }

  loadGA4Script();

  const cookieBar = document.getElementById('cookie-bar');
  const cookieAccept = document.getElementById('cookie-accept');
  const cookieDecline = document.getElementById('cookie-decline');
  const CONSENT_KEY = 'cookie-consent';

  if (cookieBar) {
    const consent = localStorage.getItem(CONSENT_KEY);

    if (consent === 'accepted') {
      gtag('consent', 'update', { 
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted' 
      });
    } else if (consent !== 'declined') {
      setTimeout(() => cookieBar.classList.add('visible'), 800);
    }

    if (cookieAccept) {
      cookieAccept.addEventListener('click', () => {
        localStorage.setItem(CONSENT_KEY, 'accepted');
        cookieBar.classList.remove('visible');
        gtag('consent', 'update', { 
			ad_storage: 'granted',
			ad_user_data: 'granted',
			ad_personalization: 'granted',
			analytics_storage: 'granted' 
		  });
      });
    }

    if (cookieDecline) {
      cookieDecline.addEventListener('click', () => {
        localStorage.setItem(CONSENT_KEY, 'declined');
        cookieBar.classList.remove('visible');
      });
    }
  }

})();
