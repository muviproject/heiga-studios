/* HEIGA Studios — motion system
   Measured values from Web Reference Lab #1 (AK.REC):
   hero 600ms/letter, stagger 85ms, blur(10px)->0, ease-out strong;
   manifesto words: scroll-linked fade-in-place (no rotation);
   waveform zoom 1.2->1.0 linear;
   vinyls ~56deg/s (6.4s/rev) viewport-gated; drawer instant swap;
   footer wordmark pinned ~750px; gallery drift -150px->0. */
(function(){
  'use strict';
  var EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

  /* ---------- smooth scroll (Lenis via CDN, graceful fallback) ---------- */
  var lenis = null;
  try{
    if (typeof Lenis !== 'undefined'){
      lenis = new Lenis({ smoothWheel:true, lerp:0.09 });
      var rafLenis = function(t){ lenis.raf(t); requestAnimationFrame(rafLenis); };
      requestAnimationFrame(rafLenis);
    }
  }catch(e){ lenis = null; }

  /* ---------- helpers ---------- */
  function clamp(v,a,b){ return Math.min(b, Math.max(a, v)); }
  // progress of element transit through viewport: 0 when its top hits viewport bottom, 1 when its bottom hits viewport top
  function transit(el){
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight || 1;
    return clamp((vh - r.top) / (vh + r.height), 0, 1);
  }
  function splitLetters(el){
    var text = el.textContent;
    el.textContent = '';
    var frag = document.createDocumentFragment();
    for (var i=0;i<text.length;i++){
      var s = document.createElement('span');
      s.className = 'ch';
      s.textContent = text[i] === ' ' ? '\u00A0' : text[i];
      if (text[i] === ' ') s.classList.add('sp');
      frag.appendChild(s);
    }
    el.appendChild(frag);
    return el.querySelectorAll('.ch');
  }

  /* ---------- hero entrance: 600ms/letter, stagger 85ms, delay 200ms ---------- */
  document.querySelectorAll('[data-hero-title] .line').forEach(function(line, li){
    var chars = splitLetters(line);
    chars.forEach(function(ch, i){
      try{
        ch.animate(
          [
            { opacity:0, transform:'translateY(10px)', filter:'blur(10px)' },
            { opacity:1, transform:'translateY(0)',     filter:'blur(0px)'  }
          ],
          { duration:600, delay:200 + li*120 + i*85, easing:EASE, fill:'backwards' }
        );
      }catch(e){
        ch.style.opacity = 1;
      }
    });
  });

  /* ---------- manifesto: time-based letter reveal on viewport entry ---------- */
  var man = document.querySelector('[data-manifesto]');
  if (man){
    var mchars = splitLetters(man);
    var done = false;
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting && !done){
          done = true;
          mchars.forEach(function(ch, i){
            try{
              ch.animate(
                [ { opacity:0, transform:'translateY(0.35em)' },
                  { opacity:1, transform:'translateY(0)' } ],
                { duration:550, delay:i*26, easing:EASE, fill:'forwards' }
              );
            }catch(e){ ch.style.opacity=1; ch.style.transform='none'; }
          });
          io.disconnect();
        }
      });
    }, { threshold:0.25 });
    io.observe(man);
  }

  /* ---------- generic reveals ---------- */
  var rio = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if (en.isIntersecting){ en.target.classList.add('in'); rio.unobserve(en.target); }
    });
  }, { threshold:0.12 });
  document.querySelectorAll('.reveal').forEach(function(el){ rio.observe(el); });

  /* ---------- drawer: instant swap ---------- */
  var drawer = document.getElementById('drawer');
  var scrim  = document.getElementById('scrim');
  function setDrawer(open){
    if(!drawer) return;
    drawer.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (lenis){ open ? lenis.stop() : lenis.start(); }
  }
  document.querySelectorAll('[data-menu-open]').forEach(function(b){ b.addEventListener('click', function(){ setDrawer(true); }); });
  document.querySelectorAll('[data-menu-close]').forEach(function(b){ b.addEventListener('click', function(){ setDrawer(false); }); });
  if (scrim) scrim.addEventListener('click', function(){ setDrawer(false); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') setDrawer(false); });

  /* ---------- services hover: cross-fade images ---------- */
  document.querySelectorAll('.svc').forEach(function(svc){
    var bg = svc.querySelector('.svc-bg');
    if(!bg) return;
    svc.addEventListener('mouseenter', function(){ bg.style.opacity = '1'; });
    svc.addEventListener('mouseleave', function(){ bg.style.opacity = '0'; });
  });

  /* ---------- vinyls: viewport gate (+/-200px margin) ---------- */
  var vio = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      en.target.classList.toggle('paused', !en.isIntersecting);
    });
  }, { rootMargin:'200px 0px' });
  document.querySelectorAll('.vinyl').forEach(function(v){ vio.observe(v); });

  /* ---------- scroll-linked effects (single rAF) ---------- */
  var waveFig = document.querySelector('[data-wave] img');
  var waveWrap = document.querySelector('[data-wave]');
  var strip = document.querySelector('[data-drift]');
  var stripWrap = document.querySelector('.gallery');
  var sats = Array.prototype.slice.call(document.querySelectorAll('.sat'));
  var heroBg = document.querySelector('.hero-bg');
  var heroSec = document.querySelector('.hero');

  /* manifesto: split words (keeping .accent), fade in place tied to scroll */
  var wordsP = document.querySelector('[data-words]');
  var words = [];
  if (wordsP){
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var srcNodes = Array.prototype.slice.call(wordsP.childNodes);
    wordsP.textContent = '';
    srcNodes.forEach(function(n){
      var isAccent = n.nodeType === 1 && n.classList.contains('accent');
      n.textContent.split(/(\s+)/).forEach(function(tok){
        if (!tok) return;
        if (/^\s+$/.test(tok)){ wordsP.appendChild(document.createTextNode(' ')); return; }
        var s = document.createElement('span');
        s.className = 'w' + (isAccent ? ' accent' : '');
        s.textContent = tok;
        s.style.opacity = reduceMotion ? '1' : '0';
        wordsP.appendChild(s);
        words.push(s);
      });
    });
    if (reduceMotion) words = [];
  }

  var ticking = false;
  function update(){
    ticking = false;
    if (waveWrap && waveFig){
      var p = transit(waveWrap);
      var s = 1.2 - 0.2*p;
      waveFig.style.transform = 'scale(' + s.toFixed(4) + ')';
    }
    if (words.length && wordsP){
      /* cada palabra aparece con fade en su lugar a medida que la tarjeta cruza el viewport */
      var wp = transit(wordsP);
      var wn = words.length;
      words.forEach(function(w, i){
        var start = (i / wn) * 0.55;
        w.style.opacity = clamp((wp - start) / 0.45, 0, 1).toFixed(3);
      });
    }
    if (strip && stripWrap){
      var gp = transit(stripWrap);
      strip.style.transform = 'translateX(' + (-150 + 150*gp).toFixed(1) + 'px)';
    }
    if (heroBg && heroSec){
      /* el fondo queda fijo a opacidad plena mientras el hero está en viewport
         (la sección siguiente se desliza cubriéndolo); se oculta al salir para
         no asomar en zonas transparentes posteriores (ej. foot-pin) */
      var y = window.scrollY || window.pageYOffset || 0;
      heroBg.style.visibility = y < heroSec.offsetHeight ? 'visible' : 'hidden';
    }
    if (sats.length){
      var vh = window.innerHeight;
      sats.forEach(function(sat){
        var r = sat.getBoundingClientRect();
        var depth = parseFloat(sat.getAttribute('data-depth') || '0.15');
        var off = (r.top + r.height/2 - vh/2) * depth;
        sat.style.transform = 'translateY(' + off.toFixed(1) + 'px)';
      });
    }
  }
  function requestTick(){ if(!ticking){ ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', requestTick, { passive:true });
  window.addEventListener('resize', requestTick);
  update();

  /* ---------- graceful image fallback (missing assets keep layout) ---------- */
  document.querySelectorAll('img').forEach(function(img){
    img.addEventListener('error', function(){
      img.setAttribute('data-missing','1');
      img.style.opacity = '0';
    });
  });

  /* ---------- blog index search ---------- */
  var q = document.getElementById('blog-search');
  if (q){
    q.addEventListener('input', function(){
      var term = q.value.trim().toLowerCase();
      document.querySelectorAll('.blog-row').forEach(function(row){
        var hay = (row.getAttribute('data-search') || '').toLowerCase();
        row.style.display = (!term || hay.indexOf(term) !== -1) ? '' : 'none';
      });
    });
  }
})();
