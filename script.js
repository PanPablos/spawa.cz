(function () {
  'use strict';

  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbCounter = document.getElementById('lb-counter');
  const btnPrev = document.getElementById('lb-prev');
  const btnNext = document.getElementById('lb-next');
  const btnClose = document.getElementById('lb-close');
  const marqueeEl = document.getElementById('marquee');

  const CONTENT_URL = 'content.json';
  const FETCH_TIMEOUT = 10000;
  const MAX_ATTEMPTS = 5;
  const DEFAULT_ALT = 'Uchwyt ze stali nierdzewnej';

  let galleryItems = [];
  let currentImages = [];
  let currentIndex = 0;
  let currentAlt = '';
  let lastFocus = null;

  let contentLoaded = false;
  let loading = false;
  let retryTimer = null;

  function toJpg(src) {
    return src.replace(/\.[a-z0-9]+$/i, '.jpg');
  }

  function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    return fetch(url, { cache: 'no-cache', signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
        return res.text();
      })
      .then(text => {
        try {
          return JSON.parse(text);
        } catch (err) {
          err.badJson = true;
          throw err;
        }
      })
      .finally(() => clearTimeout(timer));
  }

  function loadContent(attempt = 1) {
    if (loading) return;
    loading = true;
    clearTimeout(retryTimer);

    fetchJson(CONTENT_URL).then(data => {
      loading = false;
      applyContent(data);
    }, err => {
      loading = false;

      if (err.badJson) {
        console.error('content.json ma błąd składni:', err.message);
        showStatus('marquee', 'Nieprawidłowy format danych galerii (content.json).');
        showStatus('testimonials-marquee', 'Nieprawidłowy format danych opinii (content.json).');
        return;
      }

      console.warn('Błąd wczytywania content.json (próba ' + attempt + '/' + MAX_ATTEMPTS + ').', err);

      if (attempt < MAX_ATTEMPTS) {
        retryTimer = setTimeout(() => loadContent(attempt + 1), attempt * 1000);
      } else {
        showStatus('marquee', 'Nie udało się wczytać galerii. Sprawdź połączenie z internetem.', true);
        showStatus('testimonials-marquee', 'Nie udało się wczytać opinii. Sprawdź połączenie z internetem.', true);
      }
    });
  }

  loadContent();

  window.addEventListener('online', () => {
    if (!contentLoaded) loadContent();
  });

  function showStatus(targetId, message, showRetry) {
    const wrap = document.getElementById(targetId);
    if (!wrap) return;

    const status = document.createElement('p');
    status.className = 'marquee-status';
    status.textContent = message;

    if (showRetry) {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Spróbuj ponownie';
      link.addEventListener('click', e => {
        e.preventDefault();
        showStatus('marquee', 'Wczytuję galerię...');
        showStatus('testimonials-marquee', 'Wczytuję opinie...');
        loadContent();
      });
      status.append(' ', link);
    }

    wrap.replaceChildren(status);
  }

  function applyContent(data) {
    contentLoaded = true;

    if (!data || typeof data !== 'object') {
      showStatus('marquee', 'Nieprawidłowy format danych galerii (content.json).');
      showStatus('testimonials-marquee', 'Nieprawidłowy format danych opinii (content.json).');
      return;
    }

    if (data.hero && data.hero.background) {
      const hero = document.getElementById('hero');
      if (hero) {
        hero.style.backgroundImage =
          "linear-gradient(to right, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.6) 100%), url('" + data.hero.background + "')";
      }
    }

    if (data.about) {
      const aboutImg = document.querySelector('.about-photo-img');
      if (aboutImg) {
        if (data.about.photo && aboutImg.getAttribute('src') !== data.about.photo) aboutImg.src = data.about.photo;
        if (data.about.photoAlt) aboutImg.alt = data.about.photoAlt;
      }
    }

    if (Array.isArray(data.gallery) && data.gallery.length > 0) {
      buildGallery(data.gallery);
    } else {
      showStatus('marquee', 'Brak zdjęć w content.json (pusta lub brakująca sekcja "gallery").');
    }

    if (Array.isArray(data.testimonials) && data.testimonials.length > 0) {
      buildTestimonials(data.testimonials);
    } else {
      showStatus('testimonials-marquee', 'Brak opinii w content.json (pusta lub brakująca sekcja "testimonials").');
    }
  }

  const brokenThumbs = [];

  function loadThumb(img, div, originalSrc, attempt = 1, extTried = false) {
    const maxRetries = 3;

    img.onerror = () => {
      if (attempt <= maxRetries) {
        setTimeout(() => loadThumb(img, div, originalSrc, attempt + 1, extTried), attempt * 700);
      } else if (!extTried && toJpg(originalSrc) !== originalSrc) {
        loadThumb(img, div, toJpg(originalSrc), 1, true);
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
    if (!marqueeEl) return;

    galleryItems = items.filter(item => item && item.thumb);
    marqueeEl.replaceChildren();

    for (let copy = 0; copy < 2; copy++) {
      const row = document.createElement('div');
      row.className = 'marquee-content';
      if (copy) row.setAttribute('aria-hidden', 'true');

      galleryItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.dataset.index = index;
        div.setAttribute('role', 'button');
        div.tabIndex = copy ? -1 : 0;

        const img = document.createElement('img');
        img.alt = item.alt || DEFAULT_ALT;
        img.decoding = 'async';
        img.loading = 'lazy';
        img.width = 380;
        img.height = 260;
        loadThumb(img, div, item.thumb);

        div.appendChild(img);
        row.appendChild(div);
      });

      marqueeEl.appendChild(row);
    }
  }

  if (marqueeEl) {
    marqueeEl.addEventListener('click', e => {
      const item = e.target.closest('.gallery-item');
      if (item) openGallery(Number(item.dataset.index));
    });

    marqueeEl.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('.gallery-item');
      if (!item) return;
      e.preventDefault();
      openGallery(Number(item.dataset.index));
    });
  }

  function initials(name) {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function buildTestimonials(items) {
    const wrap = document.getElementById('testimonials-marquee');
    if (!wrap) return;

    wrap.replaceChildren();

    for (let copy = 0; copy < 2; copy++) {
      const row = el('div', 'marquee-content');
      if (copy) row.setAttribute('aria-hidden', 'true');

      items.forEach(item => {
        const card = el('div', 'testimonial-card');

        const stars = el('div', 'testimonial-stars', '★'.repeat(item.stars || 5));
        stars.setAttribute('aria-hidden', 'true');

        const avatar = el('div', 'testimonial-avatar', initials(item.name || ''));
        avatar.setAttribute('aria-hidden', 'true');

        const meta = el('div');
        meta.append(
          el('div', 'testimonial-name', item.name),
          el('div', 'testimonial-source', item.source ? 'Opinia z ' + item.source : '')
        );

        const author = el('div', 'testimonial-author');
        author.append(avatar, meta);

        card.append(stars, el('p', 'testimonial-text', item.text), author);
        row.appendChild(card);
      });

      wrap.appendChild(row);
    }
  }

  function openGallery(index) {
    const item = galleryItems[index];
    if (!item) return;

    currentImages = Array.isArray(item.images) && item.images.length > 0 ? item.images : [item.thumb];
    currentAlt = item.alt || DEFAULT_ALT;
    currentIndex = 0;
    lastFocus = document.activeElement;

    updateLightbox();
    lightbox.classList.add('active');
    btnClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
  }

  function updateLightbox() {
    const many = currentImages.length > 1;
    lbCounter.textContent = (currentIndex + 1) + ' / ' + currentImages.length;
    lbImg.alt = currentAlt;
    btnPrev.style.display = many ? 'block' : 'none';
    btnNext.style.display = many ? 'block' : 'none';
    loadLightboxImage(currentImages[currentIndex]);
    preloadNeighbors();
  }

  let lbLoadToken = 0;
  let lbTimeoutId = null;

  function showLightboxError(token) {
    if (token !== lbLoadToken) return;
    clearTimeout(lbTimeoutId);
    lightbox.classList.remove('lb-loading');
    lightbox.classList.add('lb-error-state');
  }

  function loadLightboxImage(src) {
    const token = ++lbLoadToken;
    const fallback = toJpg(src);
    let triedFallback = false;
    clearTimeout(lbTimeoutId);

    lightbox.classList.remove('lb-error-state');
    lightbox.classList.add('lb-loading');
    lbImg.classList.add('lb-hidden');

    const loader = new Image();

    loader.onload = () => {
      if (token !== lbLoadToken) return;
      clearTimeout(lbTimeoutId);
      lbImg.src = loader.src;
      lbImg.classList.remove('lb-hidden');
      lightbox.classList.remove('lb-loading');
    };

    loader.onerror = () => {
      if (!triedFallback && fallback !== src) {
        triedFallback = true;
        loader.src = fallback;
      } else {
        showLightboxError(token);
      }
    };

    lbTimeoutId = setTimeout(() => showLightboxError(token), 15000);

    loader.src = src;
  }

  function preloadNeighbors() {
    const total = currentImages.length;
    if (total <= 1) return;

    [currentImages[(currentIndex + 1) % total], currentImages[(currentIndex - 1 + total) % total]]
      .forEach(src => {
        const pre = new Image();
        pre.src = src;
      });
  }

  btnNext.addEventListener('click', e => {
    e.stopPropagation();
    currentIndex = (currentIndex + 1) % currentImages.length;
    updateLightbox();
  });

  btnPrev.addEventListener('click', e => {
    e.stopPropagation();
    currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
    updateLightbox();
  });

  btnClose.addEventListener('click', e => {
    e.stopPropagation();
    closeLightbox();
  });

  lightbox.addEventListener('click', e => {
    if (e.target !== lbImg) closeLightbox();
  });

  [btnClose, btnPrev, btnNext].forEach(btn => {
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('active')) return;

    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') btnNext.click();
    if (e.key === 'ArrowLeft') btnPrev.click();

    if (e.key === 'Tab') {
      const focusable = [btnClose, btnPrev, btnNext].filter(btn => btn.style.display !== 'none');
      const pos = focusable.indexOf(document.activeElement);
      const step = e.shiftKey ? -1 : 1;
      e.preventDefault();
      focusable[(pos + step + focusable.length) % focusable.length].focus();
    }
  });

  document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach(link => {
    link.addEventListener('click', () => {
      if (typeof window.gtag_report_conversion === 'function') {
        window.gtag_report_conversion();
      }
    });
  });

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -100px 0px' });

    document.querySelectorAll('.reveal').forEach(node => revealObserver.observe(node));
  } else {
    document.querySelectorAll('.reveal').forEach(node => node.classList.add('active'));
  }

  const sparksEl = document.querySelector('.sparks');
  const heroSection = document.getElementById('hero');
  if (sparksEl && heroSection && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      entries.forEach(entry => {
        sparksEl.classList.toggle('is-paused', !entry.isIntersecting);
      });
    }).observe(heroSection);
  }

  const GA_MEASUREMENT_ID = 'G-HR128KBRGS';
  const ADS_ID = 'AW-18402849725';
  const CONSENT_KEY = 'cookie-consent';
  const CONSENT_GRANTED = {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted'
  };

  function readConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch (e) {
      return null;
    }
  }

  function saveConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {}
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  const consent = readConsent();

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied'
  });

  if (consent === 'accepted') gtag('consent', 'update', CONSENT_GRANTED);

  const gaScript = document.createElement('script');
  gaScript.async = true;
  gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
  document.head.appendChild(gaScript);

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
  gtag('config', ADS_ID);

  const cookieBar = document.getElementById('cookie-bar');
  const cookieAccept = document.getElementById('cookie-accept');
  const cookieDecline = document.getElementById('cookie-decline');

  if (cookieBar) {
    if (consent !== 'accepted' && consent !== 'declined') {
      setTimeout(() => cookieBar.classList.add('visible'), 800);
    }

    if (cookieAccept) {
      cookieAccept.addEventListener('click', () => {
        saveConsent('accepted');
        cookieBar.classList.remove('visible');
        gtag('consent', 'update', CONSENT_GRANTED);
      });
    }

    if (cookieDecline) {
      cookieDecline.addEventListener('click', () => {
        saveConsent('declined');
        cookieBar.classList.remove('visible');
      });
    }
  }

})();
