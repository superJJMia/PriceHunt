const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function headers(extra = {}) {
    return { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', ...extra };
}

// ========================================
// Amazon Brasil - Scraping direto
// ========================================
async function searchAmazon(query) {
    try {
        const { data } = await axios.get(`https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`, {
            headers: headers(), timeout: 12000
        });
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
// Mercado Livre - Web scraping
// ========================================
async function searchMercadoLivre(query) {
    try {
        const { data } = await axios.get(`https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`, {
            headers: headers(), timeout: 12000
        });
        
        if (data.includes('suspicious-traffic')) return [];
        
        const $ = cheerio.load(data);
        const results = [];

        // ML usa poly-card ou ui-search-layout__item
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
// Busca Agregada
// ========================================
async function searchAllStores(query) {
    console.log(`\n=== Buscando: "${query}" ===`);
    const start = Date.now();

    const [amazonResults, mlResults] = await Promise.allSettled([
        searchAmazon(query),
        searchMercadoLivre(query)
    ]);

    const amazon = amazonResults.status === 'fulfilled' ? amazonResults.value : [];
    const ml = mlResults.status === 'fulfilled' ? mlResults.value : [];

    console.log(`  Amazon: ${amazon.length} itens`);
    console.log(`  Mercado Livre: ${ml.length} itens`);

    // Links diretos para outras lojas
    const q = encodeURIComponent(query);
    const storeLinks = [
        { name: 'Magazine Luiza', url: `https://www.magazineluiza.com.br/busca/${q}/`, color: '#0086ff', initial: 'ML' },
        { name: 'Americanas', url: `https://www.americanas.com.br/busca/${q}`, color: '#e41e2b', initial: 'AM' },
        { name: 'Casas Bahia', url: `https://www.casasbahia.com.br/busca/${q}`, color: '#0046a0', initial: 'CB' },
        { name: 'AliExpress', url: `https://www.aliexpress.com/w/wholesale-${q}.html`, color: '#e43225', initial: 'AE' },
        { name: 'Shopee', url: `https://shopee.com.br/search?keyword=${q}`, color: '#ee4d2d', initial: 'SH' },
    ];

    const allProducts = [...amazon, ...ml];
    allProducts.sort((a, b) => a.price - b.price);

    // Dedup
    const seen = new Set();
    const unique = allProducts.filter(p => {
        const key = `${p.store}:${p.name.substring(0, 40).toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const elapsed = Date.now() - start;
    console.log(`Total: ${unique.length} produtos unicos em ${elapsed}ms\n`);

    return {
        query,
        totalResults: unique.length,
        storeCounts: { 'Amazon': amazon.length, 'Mercado Livre': ml.length },
        storeLinks,
        products: unique,
        minPrice: unique.length > 0 ? unique[0].price : null,
        maxPrice: unique.length > 0 ? unique[unique.length - 1].price : null,
        avgPrice: unique.length > 0
            ? Math.round(unique.reduce((s, p) => s + p.price, 0) / unique.length * 100) / 100
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
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  PriceHunt rodando em http://localhost:${PORT}\n`);
});
