/* ════════════════════════════════════════════════════════════════
   VILLA RHODE — Script principal (scroll-driven)

   Stack :
   - Lenis  : smooth scroll
   - GSAP   : moteur d'animation
   - ScrollTrigger : tout ce qui est piloté par le scroll

   Effets :
     · Barre de progression globale (haut de page)
     · Vidéo héro scrubbée par le scroll dans le hero
     · Parallax sur images marquées [data-parallax]
     · Reveal au scroll
     · Compteurs animés (chiffres clés)
     · Section ESPACES en scroll horizontal pinné (style Apple)
     · Vidéo cinématique scrubbée plein écran (section Film)
     · Galerie + lightbox
   ──────────────────────────────────────────────────────────────── */

window.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ───── 0 · Préférences utilisateur + détection mobile ─────
     Sur mobile, l'écriture de video.currentTime à chaque frame est très
     coûteuse (le décodeur hoquète). On bascule donc les vidéos en autoplay
     loop simple, et on simplifie certaines animations.
  */
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  const prefersReducedMotion = mq('(prefers-reduced-motion: reduce)');
  const isMobile = mq('(max-width: 880px)') || mq('(pointer: coarse)');

  /* ───── 1 · LENIS smooth scroll + GSAP tick sync ───── */
  let lenis = null;

  /* Lenis : uniquement sur desktop. Sur mobile, le scroll natif est déjà
     fluide et Lenis crée plus de problèmes (touch interference) qu'il n'en
     résout. Le scroll natif suffit largement. */
  if (typeof Lenis !== 'undefined' && !prefersReducedMotion && !isMobile) {
    lenis = new Lenis({
      lerp: 0.10,
      smoothWheel: true,
      wheelMultiplier: 1,
    });

    // GSAP ScrollTrigger doit suivre Lenis : on relaie le tick
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      // fallback : rAF natif
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  } else if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  const hasGSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

  /* ───── 2 · NAV : état scrolled ───── */
  const nav = document.querySelector('[data-nav]');
  const onScrollNav = () => {
    if (!nav) return;
    const y = window.scrollY || document.documentElement.scrollTop;
    nav.classList.toggle('is-scrolled', y > 80);
  };
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ───── 3 · BARRE DE PROGRESSION globale ───── */
  const progressEl = document.querySelector('[data-progress]');
  if (progressEl) {
    const updateProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? (window.scrollY / max) * 100 : 0;
      progressEl.style.width = p + '%';
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
  }

  /* ───── 4 · REVEAL au scroll ───── */
  if (hasGSAP && !prefersReducedMotion) {
    gsap.utils.toArray('.reveal').forEach((el) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 1.1,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
          },
        }
      );
    });
  } else {
    // fallback : IO
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('is-in')),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  }

  /* ───── 5 · PARALLAX sur images marquées ─────
     Chaque [data-parallax="0.2"] se déplace verticalement à une fraction
     de la course de scroll de sa section parente. */
  /* Parallax : DESKTOP UNIQUEMENT.
     Sur mobile, chaque scrub est un calcul à chaque frame de scroll qui
     ralentit le scroll natif et déclenche le "stop and go" iOS. */
  if (hasGSAP && !prefersReducedMotion && !isMobile) {
    gsap.utils.toArray('[data-parallax]').forEach((el) => {
      const speed = parseFloat(el.dataset.parallax) || 0.2;
      const trigger = el.closest('section') || el.parentElement;

      gsap.fromTo(
        el,
        { yPercent: -speed * 40 },
        {
          yPercent: speed * 40,
          ease: 'none',
          scrollTrigger: {
            trigger,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.5,
          },
        }
      );
    });
  }

  /* ───── HELPER · setupScrubVideo ─────
     Fixe les bugs classiques du scrub vidéo :
       - throttle des écritures currentTime (évite le hoquet du décodeur)
       - utilise gsap.ticker (frame-aligné, pas de rAF concurrent)
       - skip écriture si delta < 1 frame (~33ms à 30fps)
       - gère le ready state proprement (loadedmetadata + canplay)
       - pas de scrub GSAP intermédiaire : on lit la progression directement
  */
  const setupScrubVideo = (section, video, opts = {}) => {
    if (!section || !video || !hasGSAP || prefersReducedMotion) return;

    /* Mobile : on remplace le scrub par un autoplay loop, MAIS
       on délègue le play/pause à l'IntersectionObserver global (plus bas).
       Ça permet de ne décoder qu'une seule vidéo à la fois — sinon le
       téléphone est saturé par 6 vidéos qui essaient de jouer. */
    if (isMobile) {
      video.muted = true;
      video.loop = true;
      video.setAttribute('loop', '');
      video.setAttribute('playsinline', '');
      // Pas de play() ici : l'observer s'en charge quand la vidéo entre en vue.
      // Pour l'indicateur de progression visuel, on remplit depuis le scroll
      if (opts.onUpdate && hasGSAP) {
        ScrollTrigger.create({
          trigger: section,
          start: opts.start || 'top bottom',
          end:   opts.end   || 'bottom top',
          scrub: 0.4,
          onUpdate: (self) => opts.onUpdate(self.progress),
        });
      }
      return;
    }

    let dur = 0;
    let targetTime = 0;
    let lastWrite = -1;
    let progress = 0;
    const smooth = opts.smooth != null ? opts.smooth : 0.18;
    const minDelta = 1 / 30;            // 1 frame à 30fps : seuil d'écriture

    /* boucle frame-aligné (gsap.ticker, donc synchro avec ScrollTrigger) */
    const tickFn = () => {
      if (!dur) return;
      // lerp doux du currentTime vers la cible
      const cur = video.currentTime;
      const delta = targetTime - cur;

      // si vraiment proche, on ne touche pas
      if (Math.abs(delta) < 0.01) return;

      const next = cur + delta * smooth;

      // throttle : on n'écrit que si on bouge d'au moins 1 frame
      if (Math.abs(next - lastWrite) >= minDelta) {
        try {
          video.currentTime = next;
          lastWrite = next;
        } catch (_) { /* state transient */ }
      }
    };

    /* on attache au ticker GSAP : 1 seule frame par tick, partagée avec Lenis */
    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      gsap.ticker.add(tickFn);
    };

    const onReady = () => {
      dur = video.duration || 0;
      if (!dur) return;
      // "prime" : play silencieux puis pause, autorise les écritures currentTime
      const p = video.play();
      const finalize = () => { try { video.pause(); } catch (_) {} attach(); };
      if (p && typeof p.then === 'function') p.then(finalize).catch(finalize);
      else finalize();

      ScrollTrigger.create({
        trigger: section,
        start: opts.start || 'top bottom',
        end:   opts.end   || 'bottom top',
        scrub: false,                 // PAS de scrub GSAP : on prend la progression brute
        onUpdate: (self) => {
          progress = self.progress;
          targetTime = progress * dur;
          if (opts.onUpdate) opts.onUpdate(progress);
        },
        invalidateOnRefresh: true,
      });
    };

    /* on attend canplay pour avoir la durée réelle ET un buffer minimal */
    if (video.readyState >= 2) onReady();
    else {
      const handler = () => onReady();
      video.addEventListener('loadedmetadata', handler, { once: true });
      video.addEventListener('canplay', handler, { once: true });
    }
  };

  /* ───── 6 · HERO — vidéo scrubbée par le scroll ───── */
  const hero = document.querySelector('[data-hero]');
  const heroVideo = document.querySelector('[data-hero-video]');
  const heroContent = document.querySelector('[data-hero-content]');

  if (hero && heroVideo) {
    setupScrubVideo(hero, heroVideo, {
      start: 'top top',
      end: 'bottom top',
      smooth: 0.18,
    });

    // contenu héro : parallax + fade au scroll (desktop uniquement)
    if (heroContent && hasGSAP && !prefersReducedMotion && !isMobile) {
      gsap.to(heroContent, {
        yPercent: -20,
        opacity: 0.4,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.5,
        },
      });
    }
  }

  /* ───── 6b · FILM STRIPS — transitions vidéo scrubbées + infos animées ───── */
  document.querySelectorAll('[data-strip]').forEach((section) => {
    const v = section.querySelector('[data-strip-video]');
    if (!v) return;

    // Vidéo scrubbée (helper gère lerp interne)
    setupScrubVideo(section, v, {
      start: 'top bottom',
      end: 'bottom top',
      smooth: 0.16,
    });

    if (hasGSAP && !prefersReducedMotion) {
      // Petit scale, scrub léger — desktop uniquement (scrub = jank sur iOS)
      if (!isMobile) {
        gsap.fromTo(
          v,
          { scale: 1.10 },
          {
            scale: 1.02,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 0.5,
            },
          }
        );
      }

      // Animation des blocs d'info : entrée stagger, sortie en bout de section
      const infoEls = section.querySelectorAll('[data-strip-anim]');
      if (infoEls.length) {
        gsap.fromTo(
          infoEls,
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.9,
            ease: 'expo.out',
            stagger: 0.06,
            scrollTrigger: {
              trigger: section,
              start: 'top 60%',
              toggleActions: 'play none none reverse',
            },
          }
        );

        gsap.to(infoEls, {
          y: -12,
          opacity: 0,
          ease: 'power1.in',
          duration: 0.5,
          stagger: 0.03,
          scrollTrigger: {
            trigger: section,
            start: 'bottom 60%',
            toggleActions: 'play none none reverse',
          },
        });
      }
    }
  });

  /* ───── 6c · PHOTOS animées en scroll-driven ─────
     Chaque [data-photo-anim] reçoit 2 couches scrubbées :
       1) clip-path qui s'ouvre du bas (mask reveal)
       2) scale 1.18 → 1 sur la traversée du viewport
     Scrub modéré (0.5–0.8) pour que ça suive sans retard.
  */
  /* Animations photos : DESKTOP UNIQUEMENT.
     Sur mobile, on remplace par un simple fade-in via reveal class déjà géré.
  */
  if (hasGSAP && !prefersReducedMotion && !isMobile) {
    gsap.utils.toArray('[data-photo-anim]').forEach((wrap) => {
      const img = wrap.querySelector('img');
      if (!img) return;

      gsap.fromTo(
        wrap,
        { clipPath: 'inset(0% 0% 20% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          ease: 'none',
          scrollTrigger: {
            trigger: wrap,
            start: 'top 85%',
            end: 'top 40%',
            scrub: 0.5,
          },
        }
      );

      gsap.fromTo(
        img,
        { scale: 1.18 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: wrap,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.8,
          },
        }
      );
    });
  }

  /* ───── 7 · COMPTEURS animés (chiffres clés) ───── */
  document.querySelectorAll('[data-count-to]').forEach((el) => {
    const target = parseInt(el.dataset.countTo, 10) || 0;
    const format = el.dataset.countFormat;

    const fmt = (n) => {
      if (format === 'thousands' && n >= 1000) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      }
      return String(n);
    };

    if (hasGSAP) {
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target,
        duration: 1.6,
        ease: 'expo.out',
        snap: { v: 1 },
        onUpdate: () => { el.textContent = fmt(Math.round(obj.v)); },
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
    } else {
      el.textContent = fmt(target);
    }
  });

  /* ───── 8 · SCRUB VIDEO (section Film, vidéo cinématique pinnée) ───── */
  const scrubSection = document.querySelector('[data-scrub]');
  const scrubVideo = document.querySelector('[data-scrub-video]');
  const scrubBar = document.querySelector('[data-scrub-progress]');

  if (scrubSection && scrubVideo) {
    setupScrubVideo(scrubSection, scrubVideo, {
      start: 'top top',
      end: 'bottom bottom',
      smooth: 0.16,
      onUpdate: (p) => { if (scrubBar) scrubBar.style.transform = `scaleX(${p})`; },
    });

    if (hasGSAP && !prefersReducedMotion) {
      gsap.fromTo(
        scrubVideo,
        { scale: 1.06 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: scrubSection,
            start: 'top top',
            end: '+=40%',
            scrub: 0.5,
          },
        }
      );
    }
  }

  /* ───── 9 · ESPACES — scroll horizontal pinné ───── */
  const spacesSection = document.querySelector('[data-spaces]');
  const spacesTrack = document.querySelector('[data-spaces-track]');
  const spacesBar = document.querySelector('[data-spaces-bar]');
  const spacesCurrent = document.querySelector('[data-spaces-current]');
  const spaceCards = spacesTrack ? spacesTrack.querySelectorAll('.space') : [];

  if (spacesSection && spacesTrack && hasGSAP) {
    // matchMedia : on n'active le pin que sur desktop
    const mm = gsap.matchMedia();

    mm.add('(min-width: 881px)', () => {
      const pin = spacesSection.querySelector('.spaces__pin');
      if (!pin) return;

      // distance horizontale à parcourir
      const getDistance = () =>
        spacesTrack.scrollWidth - window.innerWidth + 80;

      const tween = gsap.to(spacesTrack, {
        x: () => -getDistance(),
        ease: 'none',
        scrollTrigger: {
          trigger: pin,
          pin: true,
          anticipatePin: 1,
          start: 'top top',
          end: () => `+=${getDistance()}`,
          scrub: 0.5,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            // mise à jour du HUD
            if (spacesBar) spacesBar.style.transform = `scaleX(${self.progress})`;
            if (spacesCurrent && spaceCards.length) {
              const idx = Math.min(
                spaceCards.length - 1,
                Math.floor(self.progress * spaceCards.length + 0.0001)
              );
              const num = String(idx + 1).padStart(2, '0');
              if (spacesCurrent.textContent !== num) spacesCurrent.textContent = num;
            }
          },
        },
      });

      // mini-effet : chaque carte se "soulève" légèrement quand elle est centrée
      spaceCards.forEach((card) => {
        gsap.fromTo(
          card.querySelector('.space__media img'),
          { scale: 1.12 },
          {
            scale: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: card,
              containerAnimation: tween,
              start: 'left center',
              end: 'right center',
              scrub: true,
            },
          }
        );
      });

      return () => { tween.kill(); };
    });
  }

  /* ───── 10 · GALERIE — génération + reveal + lightbox ───── */
  const galleryEl = document.querySelector('[data-gallery]');

  // Galerie Maison Erpicum (Percke) — 9 photos signature de l'architecte (erpicum.org)
  // + 17 photos commerciales Christie's (8715417_*).
  const galleryItems = [
    // ── Photos officielles Bruno Erpicum (erpicum.org/architecture/percke-1/) ──
    // Les 2 premières gardent leur disposition d'ouverture (xl + md, 2 rangées).
    { src: 'assets/images/erpicum-org-01.jpg', span: 'xl', alt: 'Percke — vue principale (Bruno Erpicum)' },
    { src: 'assets/images/erpicum-org-02.jpg', span: 'md', alt: 'Percke — détail architecture' },
    // Toutes les autres en sm — grille 3 par ligne, plus posée.
    { src: 'assets/images/erpicum-org-03.jpg', span: 'sm', alt: 'Percke — volumes en porte-à-faux' },
    { src: 'assets/images/erpicum-org-04.jpg', span: 'sm', alt: 'Percke — détail' },
    { src: 'assets/images/erpicum-org-05.jpg', span: 'sm', alt: 'Percke — détail' },
    { src: 'assets/images/erpicum-org-06.jpg', span: 'sm', alt: 'Percke — espace intérieur' },
    { src: 'assets/images/erpicum-org-07.jpg', span: 'sm', alt: 'Percke — perspective architecturale' },
    { src: 'assets/images/erpicum-org-08.jpg', span: 'sm', alt: 'Percke — détail' },
    { src: 'assets/images/erpicum-org-09.jpg', span: 'sm', alt: 'Percke — coupe verticale' },

    // ── Photos éditoriales L'Éventail / Immobilière Le Lion ──
    { src: 'assets/images/eventail-01.jpg', span: 'sm', alt: 'Percke — vue éditoriale 1' },
    { src: 'assets/images/eventail-02.jpg', span: 'sm', alt: 'Percke — vue éditoriale 2' },
    { src: 'assets/images/eventail-03.jpg', span: 'sm', alt: 'Percke — vue éditoriale 3' },
    { src: 'assets/images/eventail-04.jpg', span: 'sm', alt: 'Percke — vue éditoriale 4' },
    { src: 'assets/images/eventail-05.jpg', span: 'sm', alt: 'Percke — vue éditoriale 5' },
    { src: 'assets/images/eventail-06.jpg', span: 'sm', alt: 'Percke — vue éditoriale 6' },
    { src: 'assets/images/eventail-07.jpg', span: 'sm', alt: 'Percke — vue éditoriale 7' },
    { src: 'assets/images/eventail-08.jpg', span: 'sm', alt: 'Percke — vue éditoriale 8' },
    { src: 'assets/images/eventail-09.jpg', span: 'sm', alt: 'Percke — vue éditoriale 9' },

    // ── Photos commerciales Christie's (réf. 12-0193) ──
    { src: 'assets/images/8715417_1_20260122143307.jpg',  span: 'sm', alt: 'Façade jardin' },
    { src: 'assets/images/8715417_2_20260122143307.jpg',  span: 'sm', alt: 'Vue aérienne' },
    { src: 'assets/images/8715417_3_20260122143308.jpg',  span: 'sm', alt: 'Façade depuis la haie' },
    { src: 'assets/images/8715417_4_20260122143308.jpg',  span: 'sm', alt: 'Mezzanine' },
    { src: 'assets/images/8715417_5_20260122143308.jpg',  span: 'sm', alt: 'Terrasse panoramique' },
    { src: 'assets/images/8715417_6_20260122143308.jpg',  span: 'sm', alt: 'Piscine extérieure' },
    { src: 'assets/images/8715417_7_20260122143308.jpg',  span: 'sm', alt: 'Hall béton' },
    { src: 'assets/images/8715417_8_20260122143308.jpg',  span: 'sm', alt: 'Cuisine' },
    { src: 'assets/images/8715417_9_20260122143309.jpg',  span: 'sm', alt: 'Volume vide' },
    { src: 'assets/images/8715417_10_20260122143309.jpg', span: 'sm', alt: 'Dressing' },
    { src: 'assets/images/8715417_11_20260122143309.jpg', span: 'sm', alt: 'Détail extérieur' },
    { src: 'assets/images/8715417_12_20260122143310.jpg', span: 'sm', alt: 'Détail piscine' },
    { src: 'assets/images/8715417_13_20260122143310.jpg', span: 'sm', alt: 'Piscine intérieure' },
    { src: 'assets/images/8715417_14_20260122143310.jpg', span: 'sm', alt: 'Porte-à-faux sur la piscine' },
    { src: 'assets/images/8715417_15_20260122143310.jpg', span: 'sm', alt: 'Détail jardin' },
    { src: 'assets/images/8715417_16_20260122143311.jpg', span: 'sm', alt: 'Façade vue large' },
    { src: 'assets/images/8715417_17_20260122143311.jpg', span: 'sm', alt: 'Spa & hammam' },
  ];
  const imgPath = (item) => item.src;

  if (galleryEl) {
    // Met à jour le compteur affiché dans le header
    const galleryCountEl = document.querySelector('[data-gallery-count]');
    if (galleryCountEl) galleryCountEl.textContent = String(galleryItems.length);

    const frag = document.createDocumentFragment();
    galleryItems.forEach((item, i) => {
      const fig = document.createElement('figure');
      fig.className = `gallery__item gallery__item--${item.span}`;
      fig.dataset.galleryIndex = String(i);
      const img = document.createElement('img');
      img.src = imgPath(item);
      img.alt = item.alt;
      img.loading = 'lazy';
      fig.appendChild(img);
      frag.appendChild(fig);
    });
    galleryEl.appendChild(frag);

    if (hasGSAP && !prefersReducedMotion) {
      gsap.utils.toArray('.gallery__item').forEach((el, i) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 36 },
          {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'expo.out',
            delay: (i % 3) * 0.06,
            scrollTrigger: { trigger: el, start: 'top 92%', once: true },
          }
        );

        // Parallax sur les vignettes — désactivé sur mobile (18 ScrollTriggers
        // simultanés feraient lagger le scroll, sans gain visuel).
        if (!isMobile) {
          gsap.fromTo(
            el.querySelector('img'),
            { yPercent: -6 },
            {
              yPercent: 6,
              ease: 'none',
              scrollTrigger: {
                trigger: el,
                start: 'top bottom',
                end: 'bottom top',
                scrub: 0.6,
              },
            }
          );
        }
      });
    } else {
      galleryEl.querySelectorAll('.gallery__item').forEach((el) => el.classList.add('is-in'));
    }

    /* — LIGHTBOX — */
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
      <button class="lightbox__close" aria-label="Fermer">×</button>
      <button class="lightbox__nav lightbox__nav--prev" aria-label="Précédent">‹</button>
      <img class="lightbox__img" alt="" />
      <button class="lightbox__nav lightbox__nav--next" aria-label="Suivant">›</button>
    `;
    document.body.appendChild(lightbox);

    const lbImg = lightbox.querySelector('.lightbox__img');
    let lbIndex = 0;

    const openLB = (i) => {
      lbIndex = i;
      lbImg.src = imgPath(galleryItems[i]);
      lbImg.alt = galleryItems[i].alt;
      lightbox.classList.add('is-open');
      if (lenis) lenis.stop();
      else document.body.style.overflow = 'hidden';
    };
    const closeLB = () => {
      lightbox.classList.remove('is-open');
      if (lenis) lenis.start();
      else document.body.style.overflow = '';
    };
    const navLB = (dir) => {
      lbIndex = (lbIndex + dir + galleryItems.length) % galleryItems.length;
      lbImg.src = imgPath(galleryItems[lbIndex]);
      lbImg.alt = galleryItems[lbIndex].alt;
    };

    galleryEl.addEventListener('click', (e) => {
      const fig = e.target.closest('.gallery__item');
      if (!fig) return;
      openLB(parseInt(fig.dataset.galleryIndex, 10));
    });
    lightbox.querySelector('.lightbox__close').addEventListener('click', closeLB);
    lightbox.querySelector('.lightbox__nav--prev').addEventListener('click', () => navLB(-1));
    lightbox.querySelector('.lightbox__nav--next').addEventListener('click', () => navLB(1));
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLB(); });
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape')      closeLB();
      else if (e.key === 'ArrowLeft')  navLB(-1);
      else if (e.key === 'ArrowRight') navLB(1);
    });
  }

  /* ───── 11 · CONTACT FORM ───── */
  const form = document.querySelector('.contact__form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const subject = encodeURIComponent('Demande de visite — Villa Rhode (Réf. 12-0301)');
      const body = encodeURIComponent(
        `Nom : ${data.get('name') || ''}\n` +
        `E-mail : ${data.get('email') || ''}\n` +
        `Téléphone : ${data.get('phone') || ''}\n\n` +
        `${data.get('message') || ''}`
      );
      window.location.href = `mailto:contact@christiesrealestatebelgium.be?subject=${subject}&body=${body}`;
    });
  }

  /* ───── 12 · Liens ancres : on délègue à Lenis si présent ───── */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -20, duration: 1.2 });
      else target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  });

  /* ───── 13 · RAIL DE CHAPITRES & ÉTIQUETTE FLOTTANTE ─────
     - Met en surbrillance le chapitre actif
     - Met à jour l'étiquette flottante (bas-gauche)
     - Inverse les couleurs (clair/sombre) quand on traverse une section sombre */
  const rail = document.querySelector('[data-rail]');
  const chapterPill = document.querySelector('[data-chapter]');
  const chapterNum = document.querySelector('[data-chapter-num]');
  const chapterLab = document.querySelector('[data-chapter-lab]');
  const sections = Array.from(document.querySelectorAll('[data-section]'));

  // mapping pour l'étiquette flottante (nouvel ordre narratif)
  const chapterMap = {
    top:          { num: '00', lab: 'Index' },
    architecture: { num: '01', lab: 'Architecture' },
    mesures:      { num: '02', lab: 'Mesures' },
    espaces:      { num: '03', lab: 'Espaces' },
    film:         { num: '04', lab: 'Film' },
    galerie:      { num: '05', lab: 'Galerie' },
    localisation: { num: '06', lab: 'Localisation' },
    contact:      { num: '07', lab: 'Visite' },
  };

  // sections au fond foncé : on inverse la couleur du rail/étiquette
  const darkSections = new Set(['film', 'contact']);

  /* Détection des fonds sombres (strips vidéo + statement dark + contact + scrub)
     pour basculer rail/étiquette en mode "on-dark". */
  const darkBackgrounds = document.querySelectorAll(
    '.strip, .stmt--dark, .scrub, .contact'
  );

  const isOverDark = () => {
    const mid = window.innerHeight * 0.5;
    for (const el of darkBackgrounds) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) return true;
    }
    return false;
  };

  if (rail || chapterPill) {
    let currentKey = 'top';

    const setActive = (key) => {
      if (currentKey !== key) {
        currentKey = key;

        if (rail) {
          rail.querySelectorAll('.rail__item').forEach((li) => {
            li.classList.toggle('is-active', li.dataset.railTarget === key);
          });
        }

        if (chapterPill && chapterMap[key]) {
          chapterNum.textContent = chapterMap[key].num;
          chapterLab.textContent = chapterMap[key].lab;
        }
      }

      // basculement clair/sombre indépendant du chapitre :
      // se base sur la présence d'un bloc à fond sombre au centre de l'écran
      const onDark = isOverDark() || darkSections.has(key);
      if (rail) rail.classList.toggle('on-dark', onDark);
      if (chapterPill) chapterPill.classList.toggle('on-dark', onDark);
    };

    // détermine la section dont le centre est le plus proche du milieu de l'écran
    const updateActive = () => {
      const mid = window.innerHeight * 0.4;
      let closest = sections[0];
      let closestDist = Infinity;
      sections.forEach((sec) => {
        const r = sec.getBoundingClientRect();
        // on considère qu'une section est "active" si son top est passé en haut
        // et son bottom n'est pas encore sorti
        if (r.top <= mid && r.bottom >= mid) {
          const d = Math.abs(r.top - mid);
          if (d < closestDist) { closestDist = d; closest = sec; }
        }
      });
      const key = closest && closest.dataset.section ? closest.dataset.section : 'top';
      setActive(key);

      // visibilité du rail/étiquette : on les cache au tout début (hero)
      const scrolled = window.scrollY > window.innerHeight * 0.6;
      if (rail) rail.classList.toggle('is-visible', scrolled);
      if (chapterPill) chapterPill.classList.toggle('is-visible', scrolled);
    };

    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
  }

  /* ───── 13b · MOBILE : play/pause des vidéos par IntersectionObserver ─────
     Sur mobile, lire 6 vidéos en parallèle est impossible. On joue uniquement
     la vidéo qui est dans le viewport (avec un buffer de 50% au-dessus/en-dessous).
     Quand elle sort, on la met en pause + on libère le buffer (currentTime = 0).
     Résultat : un seul décodeur actif à la fois → fluidité retrouvée.
  */
  if (isMobile) {
    const allVideos = document.querySelectorAll('video');

    const videoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const v = entry.target;
          if (entry.isIntersecting) {
            // démarre la lecture (muet, en boucle)
            v.muted = true;
            v.loop = true;
            const p = v.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } else {
            // sort de l'écran : pause pour libérer le décodeur
            v.pause();
          }
        });
      },
      { threshold: 0.15, rootMargin: '20% 0px 20% 0px' }
    );

    allVideos.forEach((v) => {
      // s'assure des attributs essentiels iOS
      v.muted = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      videoObserver.observe(v);
    });

    /* Sur iOS, position:sticky dans un parent avec overflow-x: hidden
       casse parfois. On force le contexte de sticky proprement.
       Le fix CSS principal est dans style.css ; ici on aide en évitant
       les transforms parents qui briseraient le sticky. */
  }

  /* ───── 14 · Refresh ScrollTrigger sur événements clés ─────
     Sans ces refresh, les triggers calés sur des sections en bas de page
     peuvent être faux tant que les fonts/images ne sont pas chargées.
  */
  if (hasGSAP) {
    // après chargement complet (toutes les images, fonts, vidéos metadata)
    window.addEventListener('load', () => ScrollTrigger.refresh());

    // après chargement des fonts (impacte les hauteurs de titre)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => ScrollTrigger.refresh());
    }

    // après chargement de chaque image lazy (la grille galerie change de hauteur)
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      if (img.complete) return;
      img.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
    });

    // resize debounced
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 200);
    });
  }
});
