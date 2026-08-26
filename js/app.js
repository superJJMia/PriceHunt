/* ========================================
   PriceHunt - Frontend (API Real)
   ======================================== */

const STORES = {
    amazon: { name: "Amazon", color: "#ff9900", initial: "A" },
    mercadolivre: { name: "Mercado Livre", color: "#ffe600", initial: "ML" },
    magalu: { name: "Magazine Luiza", color: "#0086ff", initial: "ML" },
    americanas: { name: "Americanas", color: "#e41e2b", initial: "AM" },
    casasbahia: { name: "Casas Bahia", color: "#0046a0", initial: "CB" },
    aliexpress: { name: "AliExpress", color: "#e43225", initial: "AE" },
    shopee: { name: "Shopee", color: "#ee4d2d", initial: "SH" }
};

let currentProducts = [];
let currentStoreLinks = [];
let favorites = JSON.parse(localStorage.getItem('pricehunt_favorites') || '[]');
let history = JSON.parse(localStorage.getItem('pricehunt_history') || '[]');
let isLoading = false;

// ========================================
// Theme
// ========================================
function initTheme() {
    if (localStorage.getItem('pricehunt_theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement[isDark ? 'removeAttribute' : 'setAttribute']('data-theme', 'dark');
    localStorage.setItem('pricehunt_theme', isDark ? 'light' : 'dark');
}

// ========================================
// Mobile Nav
// ========================================
function toggleMobileNav() {
    const nav = document.getElementById('mobile-nav');
    const btn = document.querySelector('.hamburger');
    nav.classList.toggle('active');
    btn.classList.toggle('active');
}

function closeMobileNav() {
    document.getElementById('mobile-nav').classList.remove('active');
    document.querySelector('.hamburger').classList.remove('active');
}

// ========================================
// Search
// ========================================
async function performSearch() {
    const input = document.getElementById('search-input');
    const query = input.value.trim();
    if (!query || isLoading) return;
    document.getElementById('search-input-results').value = query;
    await doSearch(query);
}

function performSearchFromResults() {
    const input = document.getElementById('search-input-results');
    const query = input.value.trim();
    if (!query || isLoading) return;
    document.getElementById('search-input').value = query;
    doSearch(query);
}

async function doSearch(query) {
    addToHistory(query);
    showLoadingState(query);

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Erro na busca');
        const data = await response.json();

        currentProducts = data.products || [];
        currentStoreLinks = data.storeLinks || [];

        showResults(query, data);
    } catch (error) {
        console.error('Erro na busca:', error);
        showError('Erro ao buscar produtos. Verifique sua conexao e tente novamente.');
    } finally {
        isLoading = false;
    }
}

function quickSearch(term) {
    document.getElementById('search-input').value = term;
    document.getElementById('search-input-results').value = term;
    performSearch();
}

// ========================================
// Loading / Error
// ========================================
function showLoadingState(query) {
    isLoading = true;
    document.getElementById('search-section').classList.add('hidden');
    document.getElementById('favorites-section').classList.add('hidden');
    document.getElementById('history-section').classList.add('hidden');
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('no-results').classList.add('hidden');
    document.getElementById('price-summary').classList.add('hidden');
    document.getElementById('store-links-bar').innerHTML = '';

    document.getElementById('search-term').textContent = query;
    document.getElementById('search-input-results').value = query;
    document.getElementById('results-count').textContent = 'Buscando em lojas...';

    document.getElementById('products-grid').innerHTML = Array(6).fill(`
        <div class="product-card" style="pointer-events:none;">
            <div class="product-image loading-skeleton" style="height:200px;"></div>
            <div class="product-body">
                <div class="loading-skeleton" style="height:14px; width:80px; margin-bottom:8px;"></div>
                <div class="loading-skeleton" style="height:18px; width:90%; margin-bottom:8px;"></div>
                <div class="loading-skeleton" style="height:14px; width:60%; margin-bottom:12px;"></div>
                <div class="loading-skeleton" style="height:28px; width:120px;"></div>
            </div>
        </div>
    `).join('');
}

function showError(message) {
    document.getElementById('no-results').classList.remove('hidden');
    document.getElementById('no-results').querySelector('h3').textContent = message;
    document.getElementById('no-results').querySelector('p').textContent = 'Tente buscar com outros termos.';
    document.getElementById('products-grid').innerHTML = '';
    document.getElementById('price-summary').classList.add('hidden');
    document.getElementById('store-links-bar').innerHTML = '';
    document.getElementById('results-count').textContent = '0 resultados';
}

// ========================================
// Results Display
// ========================================
function showResults(query, data) {
    document.getElementById('search-section').classList.add('hidden');
    document.getElementById('favorites-section').classList.add('hidden');
    document.getElementById('history-section').classList.add('hidden');
    document.getElementById('results-section').classList.remove('hidden');

    document.getElementById('search-term').textContent = query;

    const products = data.products || [];

    if (products.length === 0) {
        document.getElementById('no-results').classList.remove('hidden');
        document.getElementById('no-results').querySelector('h3').textContent = 'Nenhum resultado encontrado';
        document.getElementById('no-results').querySelector('p').textContent = 'Tente buscar com outros termos.';
        document.getElementById('products-grid').innerHTML = '';
        document.getElementById('price-summary').classList.add('hidden');
        document.getElementById('store-links-bar').innerHTML = '';
        document.getElementById('results-count').textContent = '0 resultados encontrados';
        return;
    }

    document.getElementById('no-results').classList.add('hidden');
    document.getElementById('price-summary').classList.remove('hidden');

    updatePriceSummary(data);
    renderStoreLinks(currentStoreLinks);
    renderResults(products);

    const storesWithResults = Object.entries(data.storeCounts || {}).filter(([, v]) => v > 0).length;
    document.getElementById('results-count').textContent =
        `${products.length} resultado${products.length !== 1 ? 's' : ''} em ${storesWithResults} loja${storesWithResults !== 1 ? 's' : ''} (${(data.searchTime / 1000).toFixed(1)}s)`;
}

function updatePriceSummary(data) {
    const products = data.products || [];
    if (products.length === 0) return;

    const prices = products.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const savings = maxPrice - minPrice;
    const savingsPct = maxPrice > 0 ? ((savings / maxPrice) * 100).toFixed(1) : 0;

    const minProduct = products.find(p => p.price === minPrice);

    document.getElementById('min-price').textContent = formatPrice(minPrice);
    document.getElementById('min-price-store').textContent = minProduct?.storeName || '-';

    document.getElementById('avg-price').textContent = formatPrice(avgPrice);
    document.getElementById('avg-price-range').textContent = `de ${formatPrice(minPrice)} a ${formatPrice(maxPrice)}`;

    document.getElementById('savings').textContent = formatPrice(savings);
    document.getElementById('savings-pct').textContent = `Ate ${savingsPct}% de desconto`;
}

function renderResults(products) {
    const grid = document.getElementById('products-grid');
    const prices = products.map(p => p.price);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

    grid.innerHTML = products.map(product => {
        const store = STORES[product.store] || { name: product.storeName, color: '#888', initial: product.storeName?.charAt(0) || '?' };
        const isLowest = product.price === minPrice && products.length > 1;
        const isFav = favorites.some(f => f.url === product.url);
        const stars = product.rating ? getStarsHtml(product.rating) : '';

        let badges = '';
        if (isLowest) badges += '<span class="badge badge-best">Menor Preco</span>';
        if (product.discount > 5) badges += `<span class="badge badge-promo">-${product.discount}%</span>`;
        if (product.freeShipping) badges += '<span class="badge badge-shipping">Frete Gratis</span>';

        const imgHtml = product.image
            ? `<img src="${product.image}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="product-emoji" style="display:none">\u{1F4E6}</span>`
            : '<span class="product-emoji">\u{1F4E6}</span>';

        return `
            <div class="product-card ${isLowest ? 'lowest-price' : ''}">
                ${badges}
                <div class="product-image">${imgHtml}</div>
                <div class="product-body">
                    <div class="product-store">
                        <div class="store-logo" style="background:${store.color}">${store.initial}</div>
                        <span class="store-name">${store.name}</span>
                    </div>
                    <h3 class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
                    ${stars ? `<div class="product-rating"><span class="stars">${stars}</span><span class="rating-text">${product.rating}${product.reviews ? ` (${product.reviews.toLocaleString('pt-BR')})` : ''}</span></div>` : ''}
                    <div class="product-price-container">
                        ${product.oldPrice ? `<span class="price-old">${formatPrice(product.oldPrice)}</span>` : ''}
                        <span class="price-current">${formatPrice(product.price)}</span>
                    </div>
                    <div class="product-meta">
                        ${product.freeShipping ? '<span class="meta-tag free-shipping">Frete Gratis</span>' : ''}
                        ${product.discount > 0 ? `<span class="meta-tag">-${product.discount}% OFF</span>` : ''}
                    </div>
                    <div class="product-actions">
                        <a class="btn-buy" href="${product.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
                            ${isLowest ? '\u{1F3C6} Melhor Preco' : 'Ver na Loja'}
                        </a>
                        <button class="btn-fav ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite(this, ${escapeJson(product)})">
                            <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function escapeJson(obj) {
    return JSON.stringify(obj).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function getStarsHtml(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += i <= Math.round(rating) ? '\u2605' : '\u2606';
    }
    return html;
}

function formatPrice(value) {
    if (value == null || isNaN(value)) return '-';
    return 'R$ ' + value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Store Links (outside the grid)
// ========================================
function renderStoreLinks(storeLinks) {
    const bar = document.getElementById('store-links-bar');
    if (!storeLinks || storeLinks.length === 0) {
        bar.innerHTML = '';
        return;
    }
    bar.innerHTML = storeLinks.map(store => `
        <a href="${store.url}" target="_blank" rel="noopener" class="store-link-chip">
            <div class="store-logo" style="background:${store.color}">${store.initial}</div>
            <span>${store.name}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
        </a>
    `).join('');
}

// ========================================
// Advanced Search
// ========================================
let advancedOpen = false;

function toggleAdvanced() {
    advancedOpen = !advancedOpen;
    const panel = document.getElementById('advanced-panel');
    const btn = document.querySelector('.toggle-btn');
    panel.classList.toggle('hidden', !advancedOpen);
    btn.classList.toggle('expanded', advancedOpen);
}

function clearFilters() {
    document.getElementById('filter-price-min').value = '';
    document.getElementById('filter-price-max').value = '';
    document.getElementById('filter-store').value = 'all';
    document.getElementById('filter-rating').value = '0';
    document.getElementById('filter-sort').value = 'price-asc';
    document.getElementById('filter-promo').checked = false;
    document.getElementById('filter-freeship').checked = false;
    if (currentProducts.length > 0) renderResults(currentProducts);
}

function getFilteredProducts() {
    let products = [...currentProducts];
    const priceMin = parseFloat(document.getElementById('filter-price-min').value) || 0;
    const priceMax = parseFloat(document.getElementById('filter-price-max').value) || Infinity;
    const store = document.getElementById('filter-store').value;
    const minRating = parseFloat(document.getElementById('filter-rating').value) || 0;
    const promoOnly = document.getElementById('filter-promo').checked;
    const freeShipOnly = document.getElementById('filter-freeship').checked;
    const sortBy = document.getElementById('filter-sort').value;

    products = products.filter(p => {
        if (p.price < priceMin || p.price > priceMax) return false;
        if (store !== 'all' && p.store !== store) return false;
        if (minRating > 0 && (!p.rating || p.rating < minRating)) return false;
        if (promoOnly && (!p.discount || p.discount <= 0)) return false;
        if (freeShipOnly && !p.freeShipping) return false;
        return true;
    });

    switch (sortBy) {
        case 'price-asc': products.sort((a, b) => a.price - b.price); break;
        case 'price-desc': products.sort((a, b) => b.price - a.price); break;
        case 'rating': products.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
        case 'discount': products.sort((a, b) => (b.discount || 0) - (a.discount || 0)); break;
    }
    return products;
}

function applyFiltersAndRender() {
    if (currentProducts.length === 0) return;
    const filtered = getFilteredProducts();

    if (filtered.length === 0) {
        document.getElementById('products-grid').innerHTML = '';
        document.getElementById('no-results').classList.remove('hidden');
        document.getElementById('no-results').querySelector('h3').textContent = 'Nenhum resultado para esses filtros';
        document.getElementById('no-results').querySelector('p').textContent = 'Tente ajustar os filtros.';
        document.getElementById('results-count').textContent = '0 resultados com filtros ativos';
        return;
    }

    document.getElementById('no-results').classList.add('hidden');
    renderResults(filtered);
    document.getElementById('results-count').textContent = `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''} com filtros ativos`;
}

// ========================================
// Favorites (persist full product data)
// ========================================
function toggleFavorite(btnEl, productData) {
    const idx = favorites.findIndex(f => f.url === productData.url);
    if (idx > -1) {
        favorites.splice(idx, 1);
        btnEl.classList.remove('active');
        btnEl.querySelector('svg').setAttribute('fill', 'none');
        showToast('Removido dos favoritos');
    } else {
        favorites.push(productData);
        btnEl.classList.add('active');
        btnEl.querySelector('svg').setAttribute('fill', 'currentColor');
        showToast('Adicionado aos favoritos');
    }
    localStorage.setItem('pricehunt_favorites', JSON.stringify(favorites));
}

function renderFavorites() {
    const grid = document.getElementById('favorites-grid');
    const noFav = document.getElementById('no-favorites');

    if (favorites.length === 0) {
        grid.innerHTML = '';
        noFav.classList.remove('hidden');
        return;
    }

    noFav.classList.add('hidden');
    const minPrice = Math.min(...favorites.map(p => p.price));

    grid.innerHTML = favorites.map(product => {
        const store = STORES[product.store] || { name: product.storeName, color: '#888', initial: product.storeName?.charAt(0) || '?' };
        const isLowest = product.price === minPrice;
        const stars = product.rating ? getStarsHtml(product.rating) : '';

        const imgHtml = product.image
            ? `<img src="${product.image}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="product-emoji" style="display:none">\u{1F4E6}</span>`
            : '<span class="product-emoji">\u{1F4E6}</span>';

        return `
            <div class="product-card ${isLowest ? 'lowest-price' : ''}">
                <div class="product-image">${imgHtml}</div>
                <div class="product-body">
                    <div class="product-store">
                        <div class="store-logo" style="background:${store.color}">${store.initial}</div>
                        <span class="store-name">${store.name}</span>
                    </div>
                    <h3 class="product-name">${escapeHtml(product.name)}</h3>
                    ${stars ? `<div class="product-rating"><span class="stars">${stars}</span><span class="rating-text">${product.rating}</span></div>` : ''}
                    <div class="product-price-container">
                        ${product.oldPrice ? `<span class="price-old">${formatPrice(product.oldPrice)}</span>` : ''}
                        <span class="price-current">${formatPrice(product.price)}</span>
                    </div>
                    <div class="product-actions">
                        <a class="btn-buy" href="${product.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Ver na Loja</a>
                        <button class="btn-fav active" onclick="event.stopPropagation(); removeFavorite('${escapeHtml(product.url)}'); renderFavorites();">
                            <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function removeFavorite(url) {
    favorites = favorites.filter(f => f.url !== url);
    localStorage.setItem('pricehunt_favorites', JSON.stringify(favorites));
    showToast('Removido dos favoritos');
}

// ========================================
// History
// ========================================
function addToHistory(query) {
    history = history.filter(h => h.query !== query);
    history.unshift({ query, date: new Date().toISOString() });
    history = history.slice(0, 50);
    localStorage.setItem('pricehunt_history', JSON.stringify(history));
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const noHist = document.getElementById('no-history');

    if (history.length === 0) {
        list.innerHTML = '';
        noHist.classList.remove('hidden');
        return;
    }

    noHist.classList.add('hidden');
    list.innerHTML = history.map(h => {
        const date = new Date(h.date);
        const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="history-item" onclick="document.getElementById('search-input').value='${h.query.replace(/'/g, "\\'")}'; document.getElementById('search-input-results').value='${h.query.replace(/'/g, "\\'")}'; performSearch();">
                <div class="history-item-left">
                    <div class="history-icon">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                    </div>
                    <span class="history-text">${h.query}</span>
                </div>
                <span class="history-date">${dateStr} ${timeStr}</span>
            </div>
        `;
    }).join('');
}

function clearHistory() {
    history = [];
    localStorage.setItem('pricehunt_history', JSON.stringify(history));
    renderHistory();
    showToast('Historico limpo');
}

// ========================================
// Navigation
// ========================================
function showSection(section) {
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll(`.nav-link[onclick*="${section}"], .mobile-nav-link[onclick*="${section}"]`).forEach(l => l.classList.add('active'));

    document.getElementById('search-section').classList.add('hidden');
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('favorites-section').classList.add('hidden');
    document.getElementById('history-section').classList.add('hidden');

    switch (section) {
        case 'search':
            document.getElementById('search-section').classList.remove('hidden');
            if (currentProducts.length > 0) {
                document.getElementById('results-section').classList.remove('hidden');
            }
            break;
        case 'favorites':
            document.getElementById('favorites-section').classList.remove('hidden');
            renderFavorites();
            break;
        case 'history':
            document.getElementById('history-section').classList.remove('hidden');
            renderHistory();
            break;
    }
}

function goHome() {
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('.nav-link').classList.add('active');
    document.getElementById('search-section').classList.remove('hidden');
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('favorites-section').classList.add('hidden');
    document.getElementById('history-section').classList.add('hidden');
}

// ========================================
// Toast
// ========================================
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ========================================
// Keyboard Shortcuts
// ========================================
document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        const searchVisible = !document.getElementById('search-section').classList.contains('hidden');
        document.getElementById(searchVisible ? 'search-input' : 'search-input-results').focus();
    }
});

// ========================================
// Init
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    document.querySelectorAll('.filter-select, .filter-input, .filter-checkbox').forEach(el => {
        el.addEventListener('change', applyFiltersAndRender);
    });
});
