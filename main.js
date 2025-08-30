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
    showDetails: document.getElementById('showDetails'),
  };

  let writers = new Map(); // key: element id → writer instance
  let observer;
  let lastChars = [];
  
  // Character data storage
  let charDictionary = new Map(); // character → definition data
  let charGraphics = new Map();   // character → stroke data
  let dataLoaded = false;

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

  // Data loading functions
  async function loadCharacterData(){
    if(dataLoaded) return;
    
    try {
      // Load dictionary data
      const dictResponse = await fetch('dictionary.txt');
      const dictText = await dictResponse.text();
      dictText.split('\n').forEach(line => {
        if(line.trim()) {
          try {
            const data = JSON.parse(line);
            if(data.character) {
              charDictionary.set(data.character, data);
            }
          } catch(e) {
            // Skip malformed lines
          }
        }
      });

      // Load graphics data  
      const graphicsResponse = await fetch('graphics.txt');
      const graphicsText = await graphicsResponse.text();
      graphicsText.split('\n').forEach(line => {
        if(line.trim()) {
          try {
            const data = JSON.parse(line);
            if(data.character) {
              charGraphics.set(data.character, data);
            }
          } catch(e) {
            // Skip malformed lines
          }
        }
      });
      
      dataLoaded = true;
      console.log(`Loaded ${charDictionary.size} dictionary entries and ${charGraphics.size} graphics entries`);
    } catch(error) {
      console.error('Failed to load character data:', error);
    }
  }

  function createDetailedInfo(char) {
    const dictData = charDictionary.get(char);
    if (!dictData) return null;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'detailed-info';
    
    // Character header with pinyin
    const header = document.createElement('div');
    header.className = 'char-header';
    header.innerHTML = `
      <span class="char-pinyin">[${(dictData.pinyin || []).join(', ')}]</span>
    `;
    infoDiv.appendChild(header);

    // Definition
    if (dictData.definition) {
      const defDiv = document.createElement('div');
      defDiv.className = 'char-definition';
      defDiv.textContent = dictData.definition;
      infoDiv.appendChild(defDiv);
    }

    // Radical
    if (dictData.radical) {
      const radicalSection = document.createElement('div');
      radicalSection.className = 'char-section';
      radicalSection.innerHTML = `
        <div class="char-section-title">Radical</div>
        <span class="char-radical">${dictData.radical}</span>
      `;
      infoDiv.appendChild(radicalSection);
    }

    // Decomposition
    if (dictData.decomposition && dictData.decomposition !== '？') {
      const decompSection = document.createElement('div');
      decompSection.className = 'char-section';
      decompSection.innerHTML = `
        <div class="char-section-title">Decomposition</div>
        <span class="char-decomp">${dictData.decomposition}</span>
      `;
      infoDiv.appendChild(decompSection);
    }

    // Etymology
    if (dictData.etymology) {
      const etymSection = document.createElement('div');
      etymSection.className = 'char-section';
      etymSection.innerHTML = `
        <div class="char-section-title">Etymology</div>
        <div class="char-etymology">${dictData.etymology.type || 'ideographic'}</div>
      `;
      if (dictData.etymology.hint) {
        const hintDiv = document.createElement('div');
        hintDiv.className = 'char-hint';
        hintDiv.textContent = `Hint: ${dictData.etymology.hint}`;
        etymSection.appendChild(hintDiv);
      }
      infoDiv.appendChild(etymSection);
    }

    return infoDiv;
  }

  function getPinyin(char) {
    const dictData = charDictionary.get(char);
    if (dictData && dictData.pinyin && dictData.pinyin.length > 0) {
      return dictData.pinyin; // Return all pinyin pronunciations
    }
    return null;
  }

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
      
      // Always add pinyin if data is available
      if (dataLoaded) {
        const pinyinArray = getPinyin(ch);
        if (pinyinArray) {
          const pinyinContainer = document.createElement('div');
          pinyinContainer.className = 'pinyin-container';
          
          pinyinArray.forEach(pinyin => {
            const pinyinEl = document.createElement('div');
            pinyinEl.className = 'pinyin';
            pinyinEl.textContent = pinyin;
            pinyinContainer.appendChild(pinyinEl);
          });
          
          card.appendChild(pinyinContainer);
        }
      }
      
      // Add detailed info if option is enabled and data is available
      if (els.showDetails.checked && dataLoaded) {
        const detailedInfo = createDetailedInfo(ch);
        if (detailedInfo) {
          detailedInfo.classList.add('show');
          card.appendChild(detailedInfo);
        }
      }
      
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
  els.renderBtn.addEventListener('click', async ()=>{
    // Load data for pinyin display (always) or detailed info (if enabled)
    if (!dataLoaded) {
      els.renderBtn.textContent = 'Loading data...';
      els.renderBtn.disabled = true;
      await loadCharacterData();
      els.renderBtn.textContent = 'Render list';
      els.renderBtn.disabled = false;
    }
    buildGrid(parseInput());
  });

  els.clearBtn.addEventListener('click', clearGrid);

  els.rebuildBtn.addEventListener('click', ()=>{
    if(lastChars.length) buildGrid(lastChars); else buildGrid(parseInput());
  });

  els.toTop.addEventListener('click', ()=>{
    window.scrollTo({top:0, behavior:'smooth'});
  });

  // Handle detailed info toggle
  els.showDetails.addEventListener('change', ()=>{
    const detailedInfos = document.querySelectorAll('.detailed-info');
    detailedInfos.forEach(info => {
      if (els.showDetails.checked) {
        info.classList.add('show');
      } else {
        info.classList.remove('show');
      }
    });
  });

  // Initial build with the example text
  buildGrid(parseInput());
})();
