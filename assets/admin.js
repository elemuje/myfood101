(() => {
  const $ = id => document.getElementById(id);
  const { escape: esc, naira, request, picture } = Food101;
  let catalog = null, editingId = null, deletingId = null, chosenPicture = null, busy = false;
  function status(id, message, success = false) { $(id).textContent = message; $(id).classList.toggle('success', success); }
  function showLogin(message = '') { $('dashboard').hidden = true; $('login').hidden = false; status('loginStatus', message); }
  async function load() {
    catalog = await request('/api/products');
    const options = catalog.categories.filter(c => c.id !== 'all').map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('');
    $('productCategory').innerHTML = options;
    const previous = $('categoryFilter').value;
    $('categoryFilter').innerHTML = '<option value="all">All categories</option>' + options;
    $('categoryFilter').value = previous;
    $('productCount').textContent = catalog.products.length;
    $('categoryCount').textContent = catalog.categories.length - 1;
    render();
  }
  function render() {
    const search = $('search').value.trim().toLowerCase(); const category = $('categoryFilter').value;
    const products = catalog.products.filter(p => (category === 'all' || p.cat === category) && `${p.name} ${p.desc}`.toLowerCase().includes(search));
    $('productList').innerHTML = products.length ? products.map(p => `<article class="product-row"><div class="product-info"><img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer"><div><h3>${esc(p.name)}</h3><p>${esc(catalog.categories.find(c => c.id === p.cat)?.label || '')}</p></div></div><div class="product-price">${naira(p.price)}</div><div class="product-actions"><button class="button quiet" data-edit="${p.id}" aria-label="Edit ${esc(p.name)}">Edit</button><button class="button quiet delete" data-delete="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button></div></article>`).join('') : '<div class="empty">No products found. Try another search or add your first product.</div>';
    $('productList').querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.src = 'images/food101-logo.jpg'; }, { once: true }));
    $('resultCount').textContent = `${products.length} of ${catalog.products.length} products`;
  }
  function edit(id = null) {
    if (!catalog || busy) return;
    editingId = id; chosenPicture = null;
    const p = catalog.products.find(p => p.id === id);
    $('productForm').reset();
    $('editorTitle').textContent = p ? 'Edit product' : 'Add a product';
    $('productName').value = p?.name || ''; $('productPrice').value = p?.price || '';
    $('productCategory').value = p?.cat || 'rice'; $('productDescription').value = p?.desc || '';
    $('productImageUrl').value = p?.img || ''; $('picturePreview').src = p?.img || 'images/food101-logo.jpg';
    status('editorStatus', ''); $('editor').showModal();
  }
  async function save(products, image) {
    const value = await request('/api/products', { method: 'PUT', headers: { 'X-Food101-Admin': '1' }, body: JSON.stringify({ products, revision: catalog.revision, ...(image ? { picture: image } : {}) }) });
    catalog = value; $('productCount').textContent = catalog.products.length; render();
  }
  function handleError(error, target) {
    status(target, error.message);
    if (error.status === 401) { $('editor').close(); $('deleteDialog').close(); showLogin('Your session expired. Please sign in again.'); }
    if (error.status === 409) status('dashboardStatus', 'Someone changed the menu. Close the editor and use Refresh to load the latest products.');
  }
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('loginSubmit').disabled = true; status('loginStatus', 'Signing in…');
    try {
      await request('/api/session', { method: 'POST', body: JSON.stringify({ username: $('username').value, password: $('password').value }) });
      $('password').value = ''; $('login').hidden = true; $('dashboard').hidden = false;
      try { await load(); status('dashboardStatus', ''); } catch (error) { status('dashboardStatus', error.message); }
    } catch (error) { status('loginStatus', error.message); }
    finally { $('loginSubmit').disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    try { await request('/api/session', { method: 'DELETE' }); catalog = null; showLogin(); }
    catch (error) { status('dashboardStatus', error.message); }
  });
  $('search').addEventListener('input', () => catalog && render()); $('categoryFilter').addEventListener('change', () => catalog && render());
  $('reload').addEventListener('click', async () => {
    if (busy) return; $('reload').disabled = true;
    try { await load(); status('dashboardStatus', 'Products refreshed.', true); }
    catch (error) { handleError(error, 'dashboardStatus'); }
    finally { $('reload').disabled = false; }
  });
  $('addProduct').addEventListener('click', () => edit());
  $('productList').addEventListener('click', e => {
    const editButton = e.target.closest('[data-edit]'), deleteButton = e.target.closest('[data-delete]');
    if (editButton) edit(Number(editButton.dataset.edit));
    if (deleteButton && !busy) {
      deletingId = Number(deleteButton.dataset.delete); $('deleteName').textContent = catalog.products.find(p => p.id === deletingId).name;
      status('deleteStatus', ''); $('deleteDialog').showModal();
    }
  });
  ['closeEditor', 'cancelEditor'].forEach(id => $(id).addEventListener('click', () => !busy && $('editor').close()));
  $('cancelDelete').addEventListener('click', () => !busy && $('deleteDialog').close());
  ['editor', 'deleteDialog'].forEach(id => $(id).addEventListener('cancel', e => { if (busy) e.preventDefault(); }));
  $('productPicture').addEventListener('change', async () => {
    chosenPicture = null; const file = $('productPicture').files[0]; if (!file) return;
    $('saveProduct').disabled = true; status('editorStatus', 'Preparing your picture…');
    try { chosenPicture = await picture(file); $('picturePreview').src = `data:${chosenPicture.mime};base64,${chosenPicture.data}`; status('editorStatus', 'Picture ready.', true); }
    catch (error) { $('productPicture').value = ''; status('editorStatus', error.message); }
    finally { $('saveProduct').disabled = false; }
  });
  $('productImageUrl').addEventListener('change', () => { if (!chosenPicture && /^(https:\/\/|images\/)/.test($('productImageUrl').value)) $('picturePreview').src = $('productImageUrl').value; });
  $('productForm').addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const id = editingId || Date.now() * 1000 + crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
    const p = { id, name: $('productName').value.trim(), price: Number($('productPrice').value), cat: $('productCategory').value, desc: $('productDescription').value.trim(), img: $('productImageUrl').value.trim() || (chosenPicture ? 'images/food101-logo.jpg' : '') };
    if (!p.img) { status('editorStatus', 'Upload a picture or paste a picture URL.'); return; }
    busy = true; $('saveProduct').disabled = true; status('editorStatus', 'Saving your product…');
    try {
      const products = editingId ? catalog.products.map(item => item.id === id ? p : item) : [...catalog.products, p];
      await save(products, chosenPicture && { ...chosenPicture, productId: id });
      $('editor').close(); status('dashboardStatus', `${p.name} saved. Your website menu has been updated.`, true);
    } catch (error) { handleError(error, 'editorStatus'); }
    finally { busy = false; $('saveProduct').disabled = false; }
  });
  $('confirmDelete').addEventListener('click', async () => {
    if (busy) return; busy = true; $('confirmDelete').disabled = true; status('deleteStatus', 'Removing product…');
    try { await save(catalog.products.filter(p => p.id !== deletingId)); $('deleteDialog').close(); status('dashboardStatus', 'Product removed from the website menu.', true); }
    catch (error) { handleError(error, 'deleteStatus'); }
    finally { busy = false; $('confirmDelete').disabled = false; }
  });
  (async () => {
    try {
      const session = await request('/api/session');
      if (session.authenticated) { $('dashboard').hidden = false; try { await load(); } catch (error) { status('dashboardStatus', error.message); } }
      else showLogin(session.configured ? '' : 'Admin sign-in is being configured. Please try again shortly.');
    } catch (error) { showLogin(error.message); }
    finally { $('boot').hidden = true; }
  })();
})();
