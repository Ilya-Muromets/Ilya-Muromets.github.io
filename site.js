/* Before/after reveal.
 *
 * Pointer devices do the reveal in CSS via :hover; this file only starts and
 * stops the <video> clips so they are not all decoding at once.
 *
 * Touch devices never satisfy :hover, so the reveal is driven by scroll
 * position instead: a card flips to its "after" state while it sits in the
 * middle band of the viewport. */
(function () {
  'use strict';

  var cards = Array.prototype.slice.call(
    document.querySelectorAll('.project, .intro-photo')
  );
  if (!cards.length) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function play(card) {
    if (reduceMotion) return;
    var v = card.querySelector('video');
    if (!v || !v.paused) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () { /* autoplay refused; poster stays */ });
  }

  function pause(card) {
    var v = card.querySelector('video');
    if (v && !v.paused) v.pause();
  }

  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* Videos ship as preload="none" so a page load costs zero video bytes, but
   * that makes the first hover wait on a network fetch. Warm each clip up once
   * it is near the viewport, so hovering starts it instantly. */
  function warm(card) {
    var v = card.querySelector('video');
    if (!v || v.dataset.warmed) return;
    v.dataset.warmed = '1';
    v.preload = 'auto';
    v.load();
  }

  if ('IntersectionObserver' in window) {
    var warmer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        warm(entry.target);
        warmer.unobserve(entry.target);
      });
    }, { rootMargin: '300px 0px' });
    cards.forEach(function (card) {
      if (card.querySelector('video')) warmer.observe(card);
    });
  } else {
    cards.forEach(warm);
  }

  if (canHover) {
    cards.forEach(function (card) {
      card.addEventListener('mouseenter', function () { warm(card); play(card); });
      card.addEventListener('mouseleave', function () { pause(card); });
    });
    return;
  }

  if (!('IntersectionObserver' in window)) {
    // No observer: reveal everything rather than hiding the "after" frames.
    cards.forEach(function (card) { card.classList.add('is-revealed'); play(card); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        warm(entry.target);
        play(entry.target);
      } else {
        entry.target.classList.remove('is-revealed');
        pause(entry.target);
      }
    });
  }, {
    // Leaves a band across the middle 30% of the viewport as the trigger zone.
    rootMargin: '-35% 0px -35% 0px',
    threshold: 0
  });

  cards.forEach(function (card) { observer.observe(card); });
})();
