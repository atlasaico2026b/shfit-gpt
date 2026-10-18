/* ATLAS SHIFT — Advanced visual interaction engine */
(function () {
  'use strict';

  var AtlasVisual = {
    pointer: { x: 0.5, y: 0.35 },
    raf: 0,
    lastEvent: null,

    init: function () {
      if (this.initialized) return;
      this.initialized = true;
      this.bindPointer();
      this.bindPressEffects();
      this.bindDashboardInteractions();
      this.bindViewportEffects();
      this.setPointer(0.5, 0.35);
    },

    setPointer: function (x, y) {
      this.pointer.x = Math.max(0, Math.min(1, x));
      this.pointer.y = Math.max(0, Math.min(1, y));
      var root = document.documentElement;
      root.style.setProperty('--pointer-x', (this.pointer.x * 100).toFixed(2) + '%');
      root.style.setProperty('--pointer-y', (this.pointer.y * 100).toFixed(2) + '%');
    },

    bindPointer: function () {
      var self = this;
      document.addEventListener('pointermove', function (event) {
        self.lastEvent = event;
        if (self.raf) return;
        self.raf = requestAnimationFrame(function () {
          self.raf = 0;
          self.updatePointer(self.lastEvent);
        });
      }, { passive: true });

      window.addEventListener('blur', function () {
        self.setPointer(0.5, 0.35);
        self.clearCardEffects();
      }, { passive: true });
    },

    updatePointer: function (event) {
      this.setPointer(event.clientX / Math.max(1, window.innerWidth), event.clientY / Math.max(1, window.innerHeight));

      var card = event.target && event.target.closest ? event.target.closest('.dash-window') : null;
      if (!card) return;

      var rect = card.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      var mx = (event.clientX - rect.left) / rect.width;
      var my = (event.clientY - rect.top) / rect.height;
      var tiltEnabled = window.matchMedia && window.matchMedia('(pointer:fine)').matches;

      card.style.setProperty('--mx', Math.max(0, Math.min(1, mx)) * 100 + '%');
      card.style.setProperty('--my', Math.max(0, Math.min(1, my)) * 100 + '%');

      if (tiltEnabled && !card.classList.contains('dragging')) {
        var rotateY = (mx - 0.5) * 5;
        var rotateX = (0.5 - my) * 5;
        card.style.setProperty('--tilt-x', rotateX.toFixed(2) + 'deg');
        card.style.setProperty('--tilt-y', rotateY.toFixed(2) + 'deg');
      }
    },

    clearCardEffects: function () {
      document.querySelectorAll('.dash-window').forEach(function (card) {
        card.style.removeProperty('--tilt-x');
        card.style.removeProperty('--tilt-y');
      });
    },

    bindPressEffects: function () {
      var self = this;
      document.addEventListener('pointerdown', function (event) {
        var target = event.target.closest && event.target.closest('.button, .nav-item, .period-option, .dashboard-settings-link, .icon-button');
        if (!target || target.disabled) return;

        target.classList.remove('atlas-press');
        void target.offsetWidth;
        target.classList.add('atlas-press');

        var rect = target.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height) * 1.6;
        var ripple = document.createElement('span');
        ripple.className = 'atlas-ripple';
        ripple.setAttribute('aria-hidden', 'true');
        ripple.style.width = size + 'px';
        ripple.style.height = size + 'px';
        ripple.style.left = event.clientX - rect.left - size / 2 + 'px';
        ripple.style.top = event.clientY - rect.top - size / 2 + 'px';

        if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
        target.appendChild(ripple);

        window.setTimeout(function () {
          if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
        }, 650);
        window.setTimeout(function () {
          target.classList.remove('atlas-press');
        }, 300);
      }, { passive: true });
    },

    bindDashboardInteractions: function () {
      var observer = new MutationObserver(function () {
        AtlasVisual.enhanceDashboardCards();
      });

      var root = document.getElementById('view-root') || document.body;
      observer.observe(root, { childList: true, subtree: true });
      this.enhanceDashboardCards();
    },

    enhanceDashboardCards: function () {
      document.querySelectorAll('.dash-window').forEach(function (card) {
        if (card.dataset.visualEnhanced === '1') return;
        card.dataset.visualEnhanced = '1';

        card.addEventListener('pointerenter', function () {
          card.classList.add('visual-hover');
        }, { passive: true });

        card.addEventListener('pointerleave', function () {
          card.classList.remove('visual-hover');
          card.style.removeProperty('--tilt-x');
          card.style.removeProperty('--tilt-y');
        }, { passive: true });

        card.addEventListener('pointerdown', function () {
          if (!card.classList.contains('dragging')) card.classList.add('visual-pressed');
        }, { passive: true });

        card.addEventListener('pointerup', function () {
          card.classList.remove('visual-pressed');
        }, { passive: true });
      });
    },

    bindViewportEffects: function () {
      var self = this;
      var resizeTimer = 0;
      window.addEventListener('resize', function () {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          self.clearCardEffects();
          self.setPointer(self.pointer.x, self.pointer.y);
        }, 120);
      }, { passive: true });
    }
  };

  function start() {
    AtlasVisual.init();
    window.ATLAS_VISUAL = AtlasVisual;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
