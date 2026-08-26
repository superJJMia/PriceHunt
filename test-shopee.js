async function test() {
    const r = await fetch('https://shopee.com.br/search?keyword=mouse', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html',
            'Accept-Language': 'pt-BR,pt;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
        }
    });
    const html = await r.text();
    console.log('Status:', r.status, 'Size:', html.length);

    // Check for __NEXT_DATA__
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextMatch) {
        try {
            const parsed = JSON.parse(nextMatch[1]);
            console.log('__NEXT_DATA__ found, keys:', Object.keys(parsed.props?.pageProps || {}).slice(0, 10));
        } catch(e) { console.log('__NEXT_DATA__ parse failed'); }
    }

    // Check for window.__INITIAL_STATE__
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (stateMatch) {
        try {
            const parsed = JSON.parse(stateMatch[1]);
            console.log('__INITIAL_STATE__ found, keys:', Object.keys(parsed).slice(0, 10));
        } catch(e) { console.log('__INITIAL_STATE__ parse failed'); }
    }

    // Look for product-like JSON
    const hasProduct = html.includes('itemid') || html.includes('itemid') || html.includes('productid');
    const hasPrice = html.includes('price') && html.includes('name');
    console.log('Has product IDs:', hasProduct);
    console.log('Has price+name:', hasPrice);

    // Check for any data attributes
    const dataAttrs = html.match(/data-(?:product|item|search)[^"]*="[^"]*"/gi) || [];
    console.log('Product data attrs:', dataAttrs.length);

    // Find script tags with data
    const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || [];
    for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i].replace(/<\/?script[^>]*>/g, '');
        if (s.length > 500 && (s.includes('itemid') || s.includes('productid') || s.includes('"items"'))) {
            console.log('\nScript #' + i + ' (' + s.length + ' chars) has product data');
            console.log('  First 500:', s.substring(0, 500));
            break;
        }
    }

    // Check for JSON-LD
    const ldMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    if (ldMatches) {
        console.log('\nJSON-LD blocks:', ldMatches.length);
        for (const m of ldMatches.slice(0, 2)) {
            console.log('  Content:', m.replace(/<\/?script[^>]*>/g, '').substring(0, 200));
        }
    }
}

test();
