const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json());

// Serve static files inline (works on Vercel serverless)
const cssContent = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');
const jsContent = fs.readFileSync(path.join(__dirname, 'js', 'app.js'), 'utf8');
const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

app.get('/css/style.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.send(cssContent);
});

app.get('/js/app.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(jsContent);
});

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function headers(extra = {}) {
    return { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', ...extra };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, opts = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await axios.get(url, opts);
        } catch (e) {
            if (i === retries) throw e;
            await sleep(1000 * (i + 1));
        }
    }
}

// ========================================
// Amazon Brasil
// ========================================
async function searchAmazon(query) {
    try {
        const { data } = await fetchWithRetry(`https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`, {
            headers: headers(), timeout: 12000
        });
        if (data.includes('captcha') || data.includes('bm-verify')) return [];
        const $ = cheerio.load(data);
        const results = [];

        $('div[data-component-type="s-search-result"]').each((i, el) => {
            const $el = $(el);
            const name = $el.find('h2').text().trim();
            if (!name) return;

            let price = null;
            $el.find('span.a-price').each((j, p) => {
                const $p = $(p);
                if ($p.hasClass('a-text-price')) return;
                const w = $p.find('span.a-price-whole').text().replace(/[^\d]/g, '');
                const f = $p.find('span.a-price-fraction').text().replace(/[^\d]/g, '') || '00';
                if (w && !price) price = parseFloat(`${w}.${f}`);
            });
            if (!price) return;

            let oldPrice = null;
            $el.find('span.a-price.a-text-price').each((j, p) => {
                const $p = $(p);
                const w = $p.find('span.a-price-whole').text().replace(/[^\d]/g, '');
                const f = $p.find('span.a-price-fraction').text().replace(/[^\d]/g, '') || '00';
                if (w && !oldPrice) oldPrice = parseFloat(`${w}.${f}`);
            });

            const href = $el.find('h2').closest('a').attr('href') || $el.find('a[href*="/dp/"]').first().attr('href');
            const img = $el.find('img.s-image').attr('src');
            const ratingText = $el.find('span.a-icon-alt').first().text();
            const rm = ratingText.match(/([\d.,]+)/);
            const rating = rm ? parseFloat(rm[1].replace(',', '.')) : null;
            const freeShipping = $el.text().includes('Frete gratis') || $el.text().includes('gr\u00e1tis');

            results.push({
                name, price,
                oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
                discount: oldPrice && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0,
                store: 'amazon', storeName: 'Amazon',
                url: href ? (href.startsWith('http') ? href : `https://www.amazon.com.br${href}`) : null,
                image: img, rating, freeShipping, condition: 'Novo'
            });
        });

        return results.slice(0, 20);
    } catch (e) {
        console.error('[Amazon]', e.message);
        return [];
    }
}

// ========================================
// Mercado Livre
// ========================================
async function searchMercadoLivre(query) {
    try {
        const { data } = await fetchWithRetry(`https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`, {
            headers: headers(), timeout: 12000
        });
        if (data.includes('suspicious-traffic')) return [];
        const $ = cheerio.load(data);
        const results = [];

        $('ol.ui-search-layout li.ui-search-layout__item, div.poly-card').each((i, el) => {
            const $el = $(el);
            let name = $el.find('h2.poly-component__title, h3.poly-component__title, a.poly-component__title').text().trim();
            if (!name) name = $el.find('h3, h2').first().text().trim();
            if (!name) return;

            let price = null;
            const priceText = $el.find('span.andes-money-amount__fraction').first().text();
            if (priceText) {
                const cleaned = priceText.replace(/\./g, '').replace(',', '.');
                price = parseFloat(cleaned);
            }
            if (!price) return;

            let oldPrice = null;
            const oldPriceText = $el.find('span.andes-price__second-line span.andes-money-amount__fraction').text();
            if (oldPriceText) {
                const cleaned = oldPriceText.replace(/\./g, '').replace(',', '.');
                oldPrice = parseFloat(cleaned);
            }

            const link = $el.find('a').first().attr('href');
            const img = $el.find('img').first().attr('src');
            const freeShipping = $el.text().toLowerCase().includes('frete gr\u00e1tis') || $el.text().toLowerCase().includes('full');

            results.push({
                name, price,
                oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
                discount: oldPrice && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0,
                store: 'mercadolivre', storeName: 'Mercado Livre',
                url: link || null, image: img, rating: null, freeShipping, condition: 'Novo'
            });
        });

        return results.slice(0, 20);
    } catch (e) {
        console.error('[ML]', e.message);
        return [];
    }
}

// ========================================
// Buscape
// ========================================
async function searchBuscape(query) {
    try {
        const url = query.includes(' ')
            ? `https://www.buscape.com.br/search?q=${encodeURIComponent(query)}`
            : `https://www.buscape.com.br/${encodeURIComponent(query)}`;
        const { data } = await fetchWithRetry(url, {
            headers: headers(), timeout: 15000
        });
        if (data.includes('captcha') || data.includes('bm-verify')) return [];
        const $ = cheerio.load(data);
        const results = [];

        $('article[data-testid="product-card"]').each((i, el) => {
            const $el = $(el);
            const name = $el.find('[data-testid="product-card::name"]').text().trim();
            if (!name) return;

            let price = null;
            const priceText = $el.find('[data-testid="product-card::price"] strong').text().trim();
            if (priceText) {
                const cleaned = priceText.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
                price = parseFloat(cleaned);
            }
            if (!price) return;

            const href = $el.find('[data-testid="product-card::card"]').attr('href') || '';
            const url = href.startsWith('http') ? href : `https://www.buscape.com.br${href}`;
            const img = $el.find('[data-testid="product-card::image"] img').attr('src') || '';
            const ratingText = $el.find('[data-testid="product-card::rating"]').text().trim();
            const rm = ratingText.match(/([\d.,]+)/);
            const rating = rm ? parseFloat(rm[1].replace(',', '.')) : null;

            results.push({
                name, price,
                oldPrice: null, discount: 0,
                store: 'buscape', storeName: 'Buscape',
                url, image: img, rating,
                freeShipping: false, condition: 'Novo'
            });
        });

        return results.slice(0, 20);
    } catch (e) {
        console.error('[Buscape]', e.message);
        return [];
    }
}

// ========================================
// Zoom
// ========================================
async function searchZoom(query) {
    try {
        const { data } = await fetchWithRetry(`https://www.zoom.com.br/search?q=${encodeURIComponent(query)}`, {
            headers: headers(), timeout: 15000
        });
        if (data.includes('captcha') || data.includes('bm-verify')) return [];
        const $ = cheerio.load(data);
        const results = [];

        $('article[data-testid="product-card"]').each((i, el) => {
            const $el = $(el);
            const name = $el.find('[data-testid="product-card::name"]').text().trim();
            if (!name) return;

            let price = null;
            const priceText = $el.find('[data-testid="product-card::price"] strong').text().trim();
            if (priceText) {
                const cleaned = priceText.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
                price = parseFloat(cleaned);
            }
            if (!price) return;

            const href = $el.find('[data-testid="product-card::card"]').attr('href') || '';
            const url = href.startsWith('http') ? href : `https://www.zoom.com.br${href}`;
            const img = $el.find('[data-testid="product-card::image"] img').attr('src') || '';
            const ratingText = $el.find('[data-testid="product-card::rating"]').text().trim();
            const rm = ratingText.match(/([\d.,]+)/);
            const rating = rm ? parseFloat(rm[1].replace(',', '.')) : null;

            results.push({
                name, price,
                oldPrice: null, discount: 0,
                store: 'zoom', storeName: 'Zoom',
                url, image: img, rating,
                freeShipping: false, condition: 'Novo'
            });
        });

        return results.slice(0, 20);
    } catch (e) {
        console.error('[Zoom]', e.message);
        return [];
    }
}

// ========================================
// Americanas (VTEX API)
// ========================================
async function searchAmericanas(query) {
    try {
        const url = `https://www.americanas.com.br/api/catalog_system/pub/products/search/${encodeURIComponent(query)}?_from=0&_to=19`;
        const { data } = await fetchWithRetry(url, {
            headers: headers({ 'Accept': 'application/json' }),
            timeout: 15000
        });
        if (!Array.isArray(data)) return [];
        const results = [];

        for (const p of data) {
            const name = p.productName || '';
            if (!name) continue;

            const item = p.items?.[0];
            const seller = item?.sellers?.[0];
            const offer = seller?.commertialOffer;
            const price = offer?.Price;
            const listPrice = offer?.ListPrice;

            if (!price || price === 0) continue;

            const img = item?.images?.[0]?.imageUrl || '';
            const link = p.link || '';

            results.push({
                name, price,
                oldPrice: listPrice && listPrice > price ? listPrice : null,
                discount: listPrice && listPrice > price ? Math.round((1 - price / listPrice) * 100) : 0,
                store: 'americanas', storeName: 'Americanas',
                url: link.startsWith('http') ? link : `https://www.americanas.com.br${link}`,
                image: img, rating: null,
                freeShipping: false, condition: 'Novo'
            });
        }

        return results.slice(0, 20);
    } catch (e) {
        console.error('[Americanas]', e.message);
        return [];
    }
}

// ========================================
// Relevancia - filtra produtos que nao combinam com a busca
// ========================================
function relevanceScore(query, productName) {
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const nameTokens = productName.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
    const nameLower = productName.toLowerCase();
    const queryLower = query.toLowerCase();

    // Match exato da query inteira = maximo
    if (nameLower.includes(queryLower)) return 100;

    let score = 0;
    let requiredTokens = 0;

    for (const qt of queryTokens) {
        const isNumeric = /^\d+$/.test(qt);
        if (isNumeric) requiredTokens++;

        const exactMatch = nameTokens.some(nt => nt === qt);
        const partialMatch = !exactMatch && nameTokens.some(nt => nt.includes(qt) || qt.includes(nt));

        if (exactMatch) {
            score += isNumeric ? 30 : 10;
        } else if (partialMatch) {
            score += isNumeric ? 5 : 3;
        }
    }

    // Se tem tokens numericos na query, pelo menos 1 deve bater exato
    if (requiredTokens > 0) {
        const numericTokens = queryTokens.filter(t => /^\d+$/.test(t));
        const hasExactNumeric = numericTokens.some(qt =>
            nameTokens.some(nt => nt === qt)
        );
        if (!hasExactNumeric && requiredTokens > 0) return 0;
    }

    return Math.min(score, 99);
}

function filterByRelevance(products, query) {
    return products.filter(p => {
        const score = relevanceScore(query, p.name);
        p._relevance = score;
        return score >= 15;
    });
}

// ========================================
// Busca Agregada - Sequencial com delay
// ========================================
async function searchAllStores(query) {
    console.log(`\n=== Buscando: "${query}" ===`);
    const start = Date.now();

    // Amazon + ML em paralelo (ja bloqueados, nao importa)
    const [amazonResults, mlResults] = await Promise.allSettled([
        searchAmazon(query),
        searchMercadoLivre(query)
    ]);
    const amazon = amazonResults.status === 'fulfilled' ? amazonResults.value : [];
    const ml = mlResults.status === 'fulfilled' ? mlResults.value : [];

    console.log(`  Amazon: ${amazon.length} | ML: ${ml.length}`);

    // Buscape primeiro, delay, Zoom, delay, Americanas
    const buscape = await searchBuscape(query);
    console.log(`  Buscape: ${buscape.length}`);

    await sleep(800);

    const zoom = await searchZoom(query);
    console.log(`  Zoom: ${zoom.length}`);

    await sleep(800);

    const americanas = await searchAmericanas(query);
    console.log(`  Americanas: ${americanas.length}`);

    const q = encodeURIComponent(query);
    const storeLinks = [
        { name: 'Mercado Livre', url: `https://lista.mercadolivre.com.br/${q}`, color: '#ffe600', initial: 'ML' },
        { name: 'Magazine Luiza', url: `https://www.magazineluiza.com.br/busca/${q}/`, color: '#0086ff', initial: 'MZ' },
        { name: 'Americanas', url: `https://www.americanas.com.br/busca/${q}`, color: '#e41e2b', initial: 'AM' },
        { name: 'Casas Bahia', url: `https://www.casasbahia.com.br/busca/${q}`, color: '#0046a0', initial: 'CB' },
        { name: 'AliExpress', url: `https://www.aliexpress.com/w/wholesale-${q}.html`, color: '#e43225', initial: 'AE' },
        { name: 'Shopee', url: `https://shopee.com.br/search?keyword=${q}`, color: '#ee4d2d', initial: 'SH' },
    ];

    const allProducts = [...amazon, ...ml, ...buscape, ...zoom, ...americanas];
    allProducts.sort((a, b) => a.price - b.price);

    // Cross-store dedup: keep the cheapest per product name
    const seen = new Map();
    const unique = allProducts.filter(p => {
        const nameKey = p.name.substring(0, 50).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(nameKey)) return false;
        seen.set(nameKey, p);
        return true;
    });

    // Filtrar por relevancia com a query
    const relevant = filterByRelevance(unique, query);
    relevant.sort((a, b) => (b._relevance || 0) - (a._relevance || 0) || a.price - b.price);
    relevant.forEach(p => delete p._relevance);

    const elapsed = Date.now() - start;
    console.log(`Total: ${relevant.length} produtos relevantes em ${elapsed}ms\n`);

    return {
        query,
        totalResults: relevant.length,
        storeCounts: {
            'Amazon': amazon.length,
            'Mercado Livre': ml.length,
            'Buscape': buscape.length,
            'Zoom': zoom.length,
            'Americanas': americanas.length
        },
        storeLinks,
        products: relevant,
        minPrice: relevant.length > 0 ? relevant[0].price : null,
        maxPrice: relevant.length > 0 ? relevant[relevant.length - 1].price : null,
        avgPrice: relevant.length > 0
            ? Math.round(relevant.reduce((s, p) => s + p.price, 0) / relevant.length * 100) / 100
            : null,
        searchTime: elapsed
    };
}

// ========================================
// API
// ========================================
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: 'Parametro "q" obrigatorio' });
    }
    try {
        const results = await searchAllStores(query.trim());
        res.json(results);
    } catch (e) {
        console.error('Erro geral:', e.message);
        res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
});

app.get('/{*path}', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
});

if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(PORT, () => {
        console.log(`\n  PriceHunt rodando em http://localhost:${PORT}\n`);
    });
}
