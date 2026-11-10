(async () => {

    const WHATSAPP = '2348145066282';
    // Direct Google CDN URL (skips the rate-limited drive.google.com/thumbnail redirect)
    const DRIVE = id => `https://lh3.googleusercontent.com/d/${id}=w1000`;
    const naira = n => '₦' + n.toLocaleString('en-NG');



    let CATEGORIES, MENU, connected = false;
    const escapeHTML = Food101.escape;
    async function getCatalog() {
      try { const data = await Food101.request('/api/products'); connected = true; return data; }
      catch (error) {
        if (connected) throw error;
        const response = await fetch('data/products.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('The menu could not be loaded. Please try again.');
        return response.json();
      }
    }
    const initial = await getCatalog();
    CATEGORIES = initial.categories; MENU = initial.products;
    async function refreshCatalog() {
      const next = await Food101.request('/api/products'); connected = true; CATEGORIES = next.categories; MENU = next.products;
      const removed = Object.keys(cart).filter(id => !MENU.some(p => p.id === +id));
      removed.forEach(id => delete cart[id]);
      renderFilters(); renderMenu(); renderGallery(); updateCart();
      if (removed.length) showToast('Some items are no longer available and were removed from your cart.');
    }

    // ---------- state ----------
    const cart = {}; // id -> qty
    let activeCat = 'all';

    // ---------- menu render ----------
    const grid = document.getElementById('menuGrid');
    const filters = document.getElementById('filters');

    function cardHTML(item) {
      const catLabel = (CATEGORIES.find(c => c.id === item.cat) || {}).label || '';
      return `
        <article class="menu-card" data-cat="${item.cat}">
          <div class="img-wrap relative aspect-[4/3] overflow-hidden">
            <img src="${escapeHTML(item.img)}" alt="${escapeHTML(item.name)}" loading="lazy" referrerpolicy="no-referrer"
                 class="card-img h-full w-full object-cover"
                 onload="this.parentElement.classList.add('loaded')"
                 onerror="this.parentElement.classList.add('loaded');this.style.display='none';this.parentElement.classList.add('img-fallback');this.parentElement.dataset.label=this.alt" />
            <span class="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-black/55 backdrop-blur-sm text-brand-yellow border border-brand-yellow/40 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full">${escapeHTML(catLabel)}</span>
            <span class="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 bg-brand-yellow text-brand-ink text-[11px] sm:text-[12px] font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full shadow">${naira(item.price)}</span>
          </div>
          <div class="p-3 sm:p-4 flex flex-col flex-1">
            <div class="flex-1">
              <h3 class="font-semibold text-[13px] sm:text-[15px] leading-snug text-white">${escapeHTML(item.name)}</h3>
              <p class="mt-1 text-sm text-white/50 line-clamp-2 hidden sm:block">${escapeHTML(item.desc)}</p>
            </div>
            <button data-add="${item.id}" class="mt-3 sm:mt-4 btn-primary w-full justify-center !py-2 sm:!py-2.5 !px-2 text-xs sm:text-sm">
              Add to Cart
            </button>
          </div>
        </article>`;
    }

    function renderMenu() {
      const items = activeCat === 'all' ? MENU : MENU.filter(m => m.cat === activeCat);
      grid.innerHTML = items.length ? items.map(cardHTML).join('') : '<p class="col-span-full py-10 text-center text-white/60">No products available in this category yet.</p>';
      revealObserve();
    }

    function renderFilters() {
      filters.innerHTML = CATEGORIES.map(c =>
        `<button class="chip ${c.id === activeCat ? 'active' : ''}" data-cat="${c.id}">${c.label}</button>`
      ).join('');
    }

    filters.addEventListener('click', e => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      activeCat = btn.dataset.cat;
      renderFilters();
      renderMenu();
    });

    grid.addEventListener('click', e => {
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      addToCart(+btn.dataset.add);
    });

    // ---------- gallery ----------
    function renderGallery() {
    const galleryPicks = [1, 9, 20, 18, 11, 31, 24, 27];
    const picks = galleryPicks.map(id => MENU.find(m => m.id === id)).filter(Boolean);
    MENU.forEach(p => { if (picks.length < 8 && !picks.some(item => item.id === p.id)) picks.push(p); });
    document.getElementById('gallery-grid').innerHTML = picks.map((it, i) => {
      const span = i % 5 === 0 ? 'row-span-2' : '';
      return `<div class="img-wrap relative overflow-hidden rounded-2xl ${span} aspect-square group">
        <img src="${escapeHTML(it.img)}" alt="${escapeHTML(it.name)}" loading="lazy" referrerpolicy="no-referrer"
             class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
             onload="this.parentElement.classList.add('loaded')"
             onerror="this.parentElement.classList.add('loaded','img-fallback');this.style.display='none';this.parentElement.dataset.label=this.alt" />
        <span class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">${escapeHTML(it.name)}</span>
      </div>`;
    }).join('');

    }

    // ---------- cart ----------
    const cartBadge = document.getElementById('cartBadge');
    const cartItemsEl = document.getElementById('cartItems');
    const cartTotalEl = document.getElementById('cartTotal');
    const orderSummary = document.getElementById('orderSummary');
    const orderTotalEl = document.getElementById('orderTotal');

    function cartCount() { return Object.values(cart).reduce((a, b) => a + b, 0); }
    function cartTotal() { return Object.entries(cart).reduce((sum, [id, q]) => sum + MENU.find(m => m.id === +id).price * q, 0); }

    function addToCart(id) {
      cart[id] = (cart[id] || 0) + 1;
      updateCart();
      const item = MENU.find(m => m.id === id);
      showToast(`${item.name} added`);
    }
    function changeQty(id, d) {
      cart[id] = (cart[id] || 0) + d;
      if (cart[id] <= 0) delete cart[id];
      updateCart();
    }
    function removeItem(id) { delete cart[id]; updateCart(); }

    function updateCart() {
      const count = cartCount();
      cartBadge.textContent = count;
      cartBadge.style.transform = count ? 'scale(1)' : 'scale(0)';

      // drawer
      if (!count) {
        cartItemsEl.innerHTML = `<div class="h-full min-h-[40vh] flex flex-col items-center justify-center text-center text-white/45">
          <span class="text-5xl">🛒</span>
          <p class="mt-4 font-medium">Your cart is empty</p>
          <p class="text-sm">Add some delicious meals to get started.</p>
        </div>`;
      } else {
        cartItemsEl.innerHTML = Object.entries(cart).map(([id, q]) => {
          const m = MENU.find(x => x.id === +id);
          return `<div class="flex gap-3 items-center">
            <div class="img-wrap h-16 w-16 rounded-xl overflow-hidden flex-none">
              <img src="${escapeHTML(m.img)}" alt="${escapeHTML(m.name)}" referrerpolicy="no-referrer" class="h-full w-full object-cover" onload="this.parentElement.classList.add('loaded')" onerror="this.parentElement.classList.add('loaded')" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-sm truncate">${escapeHTML(m.name)}</p>
              <p class="text-brand-red font-semibold text-sm">${naira(m.price)}</p>
              <div class="mt-1 flex items-center gap-2">
                <button class="qty-btn" data-dec="${id}">−</button>
                <span class="w-6 text-center text-sm font-semibold">${q}</span>
                <button class="qty-btn" data-inc="${id}">+</button>
                <button class="ml-auto text-xs text-white/45 hover:text-brand-red" data-rem="${id}">Remove</button>
              </div>
            </div>
          </div>`;
        }).join('');
      }
      cartTotalEl.textContent = naira(cartTotal());

      // order summary (checkout form)
      if (!count) {
        orderSummary.innerHTML = `<p class="text-white/45">No items yet — add meals from the menu above.</p>`;
      } else {
        orderSummary.innerHTML = Object.entries(cart).map(([id, q]) => {
          const m = MENU.find(x => x.id === +id);
          return `<div class="flex justify-between gap-2"><span class="text-white/65">${escapeHTML(m.name)} × ${q}</span><span class="font-medium">${naira(m.price * q)}</span></div>`;
        }).join('');
      }
      orderTotalEl.textContent = naira(cartTotal());
    }

    cartItemsEl.addEventListener('click', e => {
      const inc = e.target.closest('[data-inc]'); const dec = e.target.closest('[data-dec]'); const rem = e.target.closest('[data-rem]');
      if (inc) changeQty(+inc.dataset.inc, 1);
      if (dec) changeQty(+dec.dataset.dec, -1);
      if (rem) removeItem(+rem.dataset.rem);
    });

    // ---------- cart drawer open/close ----------
    const overlay = document.getElementById('cartOverlay');
    const drawer = document.getElementById('cartDrawer');
    function openCart() { overlay.classList.remove('opacity-0', 'pointer-events-none'); drawer.classList.remove('translate-x-full'); document.body.style.overflow = 'hidden'; }
    function closeCart() { overlay.classList.add('opacity-0', 'pointer-events-none'); drawer.classList.add('translate-x-full'); document.body.style.overflow = ''; }
    document.getElementById('cartBtn').addEventListener('click', openCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    overlay.addEventListener('click', closeCart);
    document.getElementById('goToCheckout').addEventListener('click', closeCart);
    document.getElementById('openCartFromForm').addEventListener('click', openCart);

    // ---------- toast ----------
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    let toastTimer;
    function showToast(msg) {
      toastMsg.textContent = msg;
      toast.classList.remove('translate-y-24', 'opacity-0');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 1800);
    }

    // ---------- checkout via WhatsApp ----------
    document.getElementById('orderForm').addEventListener('submit', async e => {
      e.preventDefault();
      const submit = e.target.querySelector('button[type="submit"]');
      if (submit.disabled) return;
      // Open during the user gesture so mobile popup blockers allow WhatsApp.
      const popup = window.open('about:blank', '_blank');
      if (popup) popup.opener = null;
      submit.disabled = true;
      try {
        const previousTotal = cartTotal();
        await refreshCatalog();
        if (!cartCount()) { if (popup) popup.close(); showToast('Your cart is empty'); openCart(); return; }
        if (previousTotal !== cartTotal()) { if (popup) popup.close(); showToast('Menu prices changed. Please review your updated total and send your order again.'); return; }
        const f = e.target.elements, type = f.type.value;
        const lines = Object.entries(cart).map(([id, q], i) => {
          const m = MENU.find(x => x.id === +id);
          return `${i + 1}. ${m.name} x${q} — ${naira(m.price * q)}`;
        });
        let msg = '*New Order — Food 101*\n\n' + lines.join('\n');
        msg += `\n\n*Total: ${naira(cartTotal())}*`;
        msg += `\n\n*Name:* ${f.name.value || '-'}\n*Phone:* ${f.phone.value || '-'}`;
        msg += `\n*Order type:* ${type}\n*Branch:* ${f.branch.value}`;
        if (type === 'Delivery') msg += `\n*Address:* ${f.address.value || '-'}`;
        if (f.notes.value) msg += `\n*Notes:* ${f.notes.value}`;
        const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
        if (popup) popup.location.href = url; else window.location.href = url;
      } catch (error) { if (popup) popup.close(); showToast('We could not check the latest prices. Please try again.'); }
      finally { submit.disabled = false; }
    });

    // toggle address field on order type
    document.getElementById('fType').addEventListener('change', e => {
      document.getElementById('addressWrap').style.display = e.target.value === 'Pickup' ? 'none' : '';
    });

    // ---------- mobile menu ----------
    const mobileMenu = document.getElementById('mobileMenu');
    document.getElementById('menuBtn').addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
    mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileMenu.classList.add('hidden')));

    // navbar shadow on scroll
    const nav = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) nav.classList.add('shadow-md'); else nav.classList.remove('shadow-md');
    });

    // ---------- reveal on scroll ----------
    let io;
    function revealObserve() {
      if (!io) io = new IntersectionObserver((entries) => {
        entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { threshold: 0.12 });
      document.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
    }

    // ---------- hero live showcase (photo + label crossfade in sync) ----------
    (function () {
      const stage = document.getElementById('heroStage');
      const label = document.getElementById('heroRotator');
      if (!stage || !label) return;
      const slides = Array.prototype.slice.call(stage.querySelectorAll('.hero-slide'));
      if (slides.length < 2) return;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return; // honour reduced-motion: keep the first dish static
      const names = slides.map(s => s.getAttribute('data-name') || s.alt || '');
      let i = 0;
      setInterval(() => {
        const next = (i + 1) % slides.length;
        slides[i].classList.remove('is-active');
        slides[next].classList.add('is-active');
        label.style.opacity = '0';
        label.style.transform = 'translateY(6px)';
        setTimeout(() => {
          label.textContent = names[next];
          label.style.opacity = '1';
          label.style.transform = 'translateY(0)';
        }, 250);
        i = next;
      }, 3200);
    })();

    // ---------- init ----------
    document.getElementById('year').textContent = new Date().getFullYear();
    renderFilters();
    renderMenu();
    renderGallery();
    updateCart();
    revealObserve();
    window.addEventListener('focus', () => refreshCatalog().catch(() => {}));
  
})().catch(error => {
  console.error('Food101 menu:', error.message);
  document.getElementById('menuGrid').innerHTML = '<p class="col-span-full py-10 text-center">The menu could not load. Please refresh or order on WhatsApp.</p>';
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
});
