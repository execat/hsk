(function(){
  const els = {
    input: document.getElementById('charsInput'),
    grid: document.getElementById('grid'),
    count: document.getElementById('count'),
    empty: document.getElementById('empty'),
    renderBtn: document.getElementById('renderBtn'),
    clearBtn: document.getElementById('clearBtn'),
    rebuildBtn: document.getElementById('rebuildBtn'),
    toTop: document.getElementById('toTop'),
    // controls
    size: document.getElementById('size'),
    padding: document.getElementById('padding'),
    showOutline: document.getElementById('showOutline'),
    speed: document.getElementById('speed'),
    delayBetweenStrokes: document.getElementById('delayBetweenStrokes'),
    delayBetweenLoops: document.getElementById('delayBetweenLoops'),
    dedupe: document.getElementById('dedupe'),
    sort: document.getElementById('sort'),
  };

  let writers = new Map(); // key: element id → writer instance
  let observer;
  let lastChars = [];

  function onlyHan(str){
    // Keep only CJK Unified Ideographs (includes Extension A) + common punctuation like "〇"
    // Using Unicode property escapes if available
    try{
      return Array.from(str.match(/[\p{Script=Han}〇]/gu) || []);
    }catch(e){
      // Fallback for older browsers: basic CJK range
      return Array.from((str.match(/[\u3400-\u9FFF〇]/g)) || []);
    }
  }

  function unique(arr){
    return Array.from(new Set(arr));
  }

  function parseInput(){
    const raw = els.input.value || '';
    let chars = onlyHan(raw);
    if(els.dedupe.checked) chars = unique(chars);
    if(els.sort.checked) chars.sort((a,b)=>a.localeCompare(b,'zh-Hans-u-co-unihan'));
    const max = clamp(parseInt(els.maxChars?.value||'500',10) || 500, 1, 2000);
    if(chars.length > max) chars = chars.slice(0, max);
    return chars;
  }

  function clamp(v,min,max){return Math.min(Math.max(v,min),max)}

  function clearGrid(){
    writers.forEach(w=>{ /* no public cancel, allow GC */ });
    writers.clear();
    if(observer) observer.disconnect();
    els.grid.innerHTML = '';
    els.count.textContent = '';
    els.empty.style.display = '';
  }

  function buildGrid(chars){
    clearGrid();
    lastChars = chars.slice();
    if(chars.length === 0){
      return;
    }
    els.empty.style.display = 'none';
    const size = clamp(parseInt(els.size.value,10) || 150, 96, 220);

    const frag = document.createDocumentFragment();
    chars.forEach((ch, idx)=>{
      const card = document.createElement('div');
      card.className = 'card';
      const box = document.createElement('div');
      const id = `hanzi_${idx}`;
      box.id = id;
      box.className = 'charbox';
      const label = document.createElement('div');
      label.className = 'glyph';
      label.textContent = ch;
      const status = document.createElement('div');
      status.className = 'status';
      status.textContent = 'loading…';
      card.appendChild(box);
      card.appendChild(label);
      card.appendChild(status);
      card.dataset.char = ch;
      card.dataset.size = size;
      frag.appendChild(card);
    });
    els.grid.appendChild(frag);

    els.count.textContent = `${chars.length} character${chars.length===1?'':'s'}`;

    setupObserver();
  }

  function setupObserver(){
    observer = new IntersectionObserver((entries)=>{
      for(const entry of entries){
        if(entry.isIntersecting){
          hydrateCard(entry.target);
          observer.unobserve(entry.target);
        }
      }
    }, {root:null, rootMargin:'300px', threshold:0.05});

    document.querySelectorAll('.card').forEach(card=>observer.observe(card));
  }

  function hydrateCard(card){
    const ch = card.dataset.char;
    const size = parseInt(card.dataset.size,10) || 150;
    const target = card.querySelector('.charbox');
    const statusEl = card.querySelector('.status');

    const opts = {
      width: size,
      height: size,
      padding: clamp(parseInt(els.padding.value,10)||6, 0, 40),
      showOutline: !!els.showOutline.checked,
      strokeAnimationSpeed: clamp(parseFloat(els.speed.value)||1.8, 0.1, 10),
      delayBetweenStrokes: clamp(parseInt(els.delayBetweenStrokes.value,10)||20, 0, 2000),
      delayBetweenLoops: clamp(parseInt(els.delayBetweenLoops.value,10)||1000, 0, 10000),
    };

    try{
      const writer = HanziWriter.create(target, ch, {
        width: opts.width,
        height: opts.height,
        padding: opts.padding,
        showOutline: opts.showOutline,
        strokeAnimationSpeed: opts.strokeAnimationSpeed,
        delayBetweenStrokes: opts.delayBetweenStrokes,
        delayBetweenLoops: opts.delayBetweenLoops,
        onLoadCharDataSuccess: function(){ statusEl.textContent=''; },
        onLoadCharDataError: function(){ statusEl.textContent='no data'; statusEl.classList.add('error'); }
      });
      writer.loopCharacterAnimation();
      writers.set(target.id, writer);
    }catch(e){
      statusEl.textContent = 'error'; statusEl.classList.add('error');
      console.error(e);
    }
  }

  // UI wiring
  els.renderBtn.addEventListener('click', ()=>{
    buildGrid(parseInput());
  });

  els.clearBtn.addEventListener('click', clearGrid);

  els.rebuildBtn.addEventListener('click', ()=>{
    if(lastChars.length) buildGrid(lastChars); else buildGrid(parseInput());
  });

  els.toTop.addEventListener('click', ()=>{
    window.scrollTo({top:0, behavior:'smooth'});
  });

  // Initial build with the example text
  buildGrid(parseInput());
})();
